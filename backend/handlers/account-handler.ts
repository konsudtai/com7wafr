/**
 * Account Handler — CRUD /accounts endpoints
 *
 * Endpoints:
 * - POST   /accounts          — Add new account (Admin only)
 * - GET    /accounts          — List all accounts (Admin + Viewer)
 * - PUT    /accounts/{id}     — Update account (Admin only)
 * - DELETE /accounts/{id}     — Remove account (Admin only)
 * - POST   /accounts/{id}/verify — Verify connectivity (Admin only)
 *
 * DynamoDB key pattern: PK=ACCOUNT#{account_id}, SK=META
 *
 * Environment variables: TABLE_NAME
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  DeleteCommand,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { STSClient, AssumeRoleCommand } from '@aws-sdk/client-sts';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { extractUserRole, checkAuthorization } from '../auth/auth-module';

const TABLE_NAME = process.env.TABLE_NAME ?? '';

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);
const stsClient = new STSClient({});

// --- Types ---

interface AccountRecord {
  accountId: string;
  roleArn: string;
  alias: string;
  createdAt: string;
  updatedAt: string;
  lastVerified?: string;
  connectionStatus?: 'CONNECTED' | 'FAILED' | 'UNKNOWN';
}

// --- Helpers ---

function jsonResponse(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    },
    body: JSON.stringify(body),
  };
}

function extractClaims(event: APIGatewayProxyEvent): Record<string, unknown> {
  return (event.requestContext?.authorizer?.claims as Record<string, unknown>) ?? {};
}

/**
 * Validate that the request has valid JWT claims from Cognito Authorizer.
 * API Gateway validates the JWT before Lambda is invoked, but this is a
 * defensive check in case claims are missing or empty.
 */
function validateRequest(event: APIGatewayProxyEvent): APIGatewayProxyResult | null {
  const claims = extractClaims(event);
  if (!claims || Object.keys(claims).length === 0) {
    return jsonResponse(401, { message: 'Unauthorized: missing or invalid authentication' });
  }
  return null;
}

/**
 * Audit log helper — logs write operations (POST, PUT, DELETE) for CloudWatch capture.
 */
function auditLog(action: string, resource: string, callerEmail: string, detail?: Record<string, unknown>): void {
  console.log(JSON.stringify({
    audit: true,
    timestamp: new Date().toISOString(),
    action,
    resource,
    callerEmail,
    ...(detail ? { detail } : {}),
  }));
}

function extractAccountId(event: APIGatewayProxyEvent): string | undefined {
  return event.pathParameters?.id;
}

/**
 * Validate IAM role ARN format: arn:aws:iam::<12-digit>:role/<name>
 */
function isValidRoleArn(arn: string): boolean {
  return /^arn:aws:iam::\d{12}:role\/.+$/.test(arn);
}

/**
 * Validate AWS account ID: exactly 12 digits.
 */
function isValidAccountId(id: string): boolean {
  return /^\d{12}$/.test(id);
}

// --- DynamoDB Operations ---

async function getAccountRecord(accountId: string): Promise<AccountRecord | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `ACCOUNT#${accountId}`, SK: 'META' },
    }),
  );
  if (!result.Item) return null;
  return result.Item as unknown as AccountRecord;
}

async function putAccountRecord(record: AccountRecord): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `ACCOUNT#${record.accountId}`,
        SK: 'META',
        ...record,
      },
    }),
  );
}

async function deleteAccountRecord(accountId: string): Promise<void> {
  await docClient.send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { PK: `ACCOUNT#${accountId}`, SK: 'META' },
    }),
  );
}

async function listAllAccounts(): Promise<AccountRecord[]> {
  const result = await docClient.send(
    new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'begins_with(PK, :prefix) AND SK = :sk',
      ExpressionAttributeValues: {
        ':prefix': 'ACCOUNT#',
        ':sk': 'META',
      },
    }),
  );
  return (result.Items ?? []) as unknown as AccountRecord[];
}

/**
 * Test assume role connectivity for an account.
 * Returns true if assume role succeeds, false otherwise.
 */
async function testAssumeRole(roleArn: string, accountId: string): Promise<{ success: boolean; error?: string }> {
  try {
    await stsClient.send(
      new AssumeRoleCommand({
        RoleArn: roleArn,
        RoleSessionName: 'wa-review-verify',
        ExternalId: `wa-review-${accountId}`,
        DurationSeconds: 900,
      }),
    );
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: message };
  }
}

// --- Endpoint Handlers ---

/**
 * POST /accounts — Add new account (Admin only).
 * Body: { accountId, roleArn, alias }
 */
async function createAccount(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const authError = validateRequest(event);
  if (authError) return authError;

  const claims = extractClaims(event);
  const userRole = extractUserRole(claims);

  if (!checkAuthorization(userRole, '/accounts', 'POST')) {
    return jsonResponse(403, { message: 'Forbidden: Admin role required' });
  }

  if (!event.body) {
    return jsonResponse(400, { message: 'Request body is required' });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(event.body);
  } catch {
    return jsonResponse(400, { message: 'Invalid JSON in request body' });
  }

  const accountId = body.accountId as string | undefined;
  const roleArn = body.roleArn as string | undefined;
  const alias = body.alias as string | undefined;

  if (!accountId || !roleArn || !alias) {
    return jsonResponse(400, { message: 'Missing required fields: accountId, roleArn, alias' });
  }

  if (!isValidAccountId(accountId)) {
    return jsonResponse(400, { message: 'Invalid accountId: must be exactly 12 digits' });
  }

  if (!isValidRoleArn(roleArn)) {
    return jsonResponse(400, {
      message: 'Invalid roleArn: must match pattern arn:aws:iam::<12-digit>:role/<name>',
    });
  }

  // Check for duplicate account ID
  const existing = await getAccountRecord(accountId);
  if (existing) {
    return jsonResponse(409, { message: `Account ${accountId} already exists` });
  }

  const now = new Date().toISOString();
  const record: AccountRecord = {
    accountId,
    roleArn,
    alias,
    createdAt: now,
    updatedAt: now,
    connectionStatus: 'UNKNOWN',
  };

  await putAccountRecord(record);

  auditLog('CREATE_ACCOUNT', `ACCOUNT#${accountId}`, (claims['email'] as string) ?? 'unknown', { alias, roleArn });

  return jsonResponse(201, { message: 'Account created successfully', account: record });
}

/**
 * DELETE /accounts/{id} — Remove account (Admin only).
 */
async function deleteAccount(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const authError = validateRequest(event);
  if (authError) return authError;

  const claims = extractClaims(event);
  const userRole = extractUserRole(claims);

  if (!checkAuthorization(userRole, '/accounts', 'DELETE')) {
    return jsonResponse(403, { message: 'Forbidden: Admin role required' });
  }

  const accountId = extractAccountId(event);
  if (!accountId) {
    return jsonResponse(400, { message: 'Missing account ID in path' });
  }

  const existing = await getAccountRecord(accountId);
  if (!existing) {
    return jsonResponse(404, { message: `Account ${accountId} not found` });
  }

  await deleteAccountRecord(accountId);

  auditLog('DELETE_ACCOUNT', `ACCOUNT#${accountId}`, (claims['email'] as string) ?? 'unknown');

  return jsonResponse(200, { message: `Account ${accountId} deleted successfully` });
}

/**
 * PUT /accounts/{id} — Update account (Admin only).
 * Body: { roleArn?, alias? }
 */
async function updateAccount(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const authError = validateRequest(event);
  if (authError) return authError;

  const claims = extractClaims(event);
  const userRole = extractUserRole(claims);

  if (!checkAuthorization(userRole, '/accounts', 'PUT')) {
    return jsonResponse(403, { message: 'Forbidden: Admin role required' });
  }

  const accountId = extractAccountId(event);
  if (!accountId) {
    return jsonResponse(400, { message: 'Missing account ID in path' });
  }

  if (!event.body) {
    return jsonResponse(400, { message: 'Request body is required' });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(event.body);
  } catch {
    return jsonResponse(400, { message: 'Invalid JSON in request body' });
  }

  const newRoleArn = body.roleArn as string | undefined;
  const newAlias = body.alias as string | undefined;

  if (!newRoleArn && !newAlias) {
    return jsonResponse(400, { message: 'At least one of roleArn or alias must be provided' });
  }

  if (newRoleArn && !isValidRoleArn(newRoleArn)) {
    return jsonResponse(400, {
      message: 'Invalid roleArn: must match pattern arn:aws:iam::<12-digit>:role/<name>',
    });
  }

  const existing = await getAccountRecord(accountId);
  if (!existing) {
    return jsonResponse(404, { message: `Account ${accountId} not found` });
  }

  const now = new Date().toISOString();
  const updateExprParts: string[] = ['updatedAt = :now'];
  const exprValues: Record<string, unknown> = { ':now': now };

  if (newRoleArn) {
    updateExprParts.push('roleArn = :roleArn');
    exprValues[':roleArn'] = newRoleArn;
  }
  if (newAlias) {
    updateExprParts.push('alias = :alias');
    exprValues[':alias'] = newAlias;
  }

  await docClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: `ACCOUNT#${accountId}`, SK: 'META' },
      UpdateExpression: `SET ${updateExprParts.join(', ')}`,
      ExpressionAttributeValues: exprValues,
    }),
  );

  auditLog('UPDATE_ACCOUNT', `ACCOUNT#${accountId}`, (claims['email'] as string) ?? 'unknown', { newRoleArn, newAlias });

  return jsonResponse(200, {
    message: `Account ${accountId} updated successfully`,
    account: {
      ...existing,
      ...(newRoleArn ? { roleArn: newRoleArn } : {}),
      ...(newAlias ? { alias: newAlias } : {}),
      updatedAt: now,
    },
  });
}

/**
 * GET /accounts — List all accounts (Admin + Viewer).
 */
async function listAccounts(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const authError = validateRequest(event);
  if (authError) return authError;

  const claims = extractClaims(event);
  const userRole = extractUserRole(claims);

  if (!checkAuthorization(userRole, '/accounts', 'GET')) {
    return jsonResponse(403, { message: 'Forbidden' });
  }

  const accounts = await listAllAccounts();

  return jsonResponse(200, { accounts });
}

/**
 * POST /accounts/{id}/verify — Verify account connectivity (Admin only).
 * Tests assume role to the target account.
 */
async function verifyAccount(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const authError = validateRequest(event);
  if (authError) return authError;

  const claims = extractClaims(event);
  const userRole = extractUserRole(claims);

  if (!checkAuthorization(userRole, '/accounts', 'POST')) {
    return jsonResponse(403, { message: 'Forbidden: Admin role required' });
  }

  const accountId = extractAccountId(event);
  if (!accountId) {
    return jsonResponse(400, { message: 'Missing account ID in path' });
  }

  const existing = await getAccountRecord(accountId);
  if (!existing) {
    return jsonResponse(404, { message: `Account ${accountId} not found` });
  }

  const result = await testAssumeRole(existing.roleArn, accountId);
  const now = new Date().toISOString();
  const connectionStatus = result.success ? 'CONNECTED' : 'FAILED';

  // Update connection status in DynamoDB
  await docClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: `ACCOUNT#${accountId}`, SK: 'META' },
      UpdateExpression: 'SET connectionStatus = :status, lastVerified = :now, updatedAt = :now',
      ExpressionAttributeValues: {
        ':status': connectionStatus,
        ':now': now,
      },
    }),
  );

  if (result.success) {
    return jsonResponse(200, {
      message: `Account ${accountId} connectivity verified successfully`,
      connectionStatus: 'CONNECTED',
      lastVerified: now,
    });
  }

  return jsonResponse(200, {
    message: `Account ${accountId} connectivity verification failed`,
    connectionStatus: 'FAILED',
    lastVerified: now,
    error: result.error,
  });
}

// --- Router ---

function resolveRoute(event: APIGatewayProxyEvent): string {
  const method = event.httpMethod;
  const resource = event.resource ?? '';

  if (method === 'POST' && resource === '/accounts') return 'CREATE_ACCOUNT';
  if (method === 'GET' && resource === '/accounts') return 'LIST_ACCOUNTS';
  if (method === 'PUT' && resource === '/accounts/{id}') return 'UPDATE_ACCOUNT';
  if (method === 'DELETE' && resource === '/accounts/{id}') return 'DELETE_ACCOUNT';
  if (method === 'POST' && resource === '/accounts/{id}/verify') return 'VERIFY_ACCOUNT';

  return 'UNKNOWN';
}

/**
 * Lambda entry point — routes API Gateway proxy events to the correct handler.
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const route = resolveRoute(event);

    switch (route) {
      case 'CREATE_ACCOUNT':
        return await createAccount(event);
      case 'LIST_ACCOUNTS':
        return await listAccounts(event);
      case 'UPDATE_ACCOUNT':
        return await updateAccount(event);
      case 'DELETE_ACCOUNT':
        return await deleteAccount(event);
      case 'VERIFY_ACCOUNT':
        return await verifyAccount(event);
      default:
        return jsonResponse(404, { message: 'Not found' });
    }
  } catch (error) {
    console.error('Account handler error:', error);
    return jsonResponse(500, { message: 'Internal server error' });
  }
}
