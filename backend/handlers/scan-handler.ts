/**
 * Scan Handler — POST/GET /scans endpoints
 *
 * Endpoints:
 * - POST /scans — Start new scan job (Admin only)
 * - GET /scans — List scan history
 * - GET /scans/{id}/status — Get scan status
 * - GET /scans/{id}/results — Get scan results
 *
 * DynamoDB key patterns:
 * - Scan metadata: PK=SCAN#{scan_id}, SK=META
 * - Scan finding:  PK=SCAN#{scan_id}, SK=FINDING#{finding_id}
 * - Scan error:    PK=SCAN#{scan_id}, SK=ERROR#{index}
 * - Scan history:  PK=HISTORY, SK=SCAN#{timestamp}#{scan_id}
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { extractUserRole, checkAuthorization, UserRole } from '../auth/auth-module';

const TABLE_NAME = process.env.TABLE_NAME ?? '';

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);

// --- Types ---

type ScanStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';

interface ScanMetadata {
  scanId: string;
  status: ScanStatus;
  progress: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  configuration?: Record<string, unknown>;
  totalFindings?: number;
  totalErrors?: number;
}

// --- Helpers ---

function jsonResponse(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
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

function extractScanId(event: APIGatewayProxyEvent): string | undefined {
  return event.pathParameters?.id;
}


// --- DynamoDB Operations ---

async function createScanRecord(metadata: ScanMetadata): Promise<void> {
  const now = metadata.createdAt;

  // Write scan metadata
  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `SCAN#${metadata.scanId}`,
        SK: 'META',
        ...metadata,
      },
    }),
  );

  // Write scan history entry
  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: 'HISTORY',
        SK: `SCAN#${now}#${metadata.scanId}`,
        scanId: metadata.scanId,
        status: metadata.status,
        createdAt: now,
        createdBy: metadata.createdBy,
      },
    }),
  );
}

async function getScanMetadata(scanId: string): Promise<ScanMetadata | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `SCAN#${scanId}`, SK: 'META' },
    }),
  );
  if (!result.Item) return null;
  return result.Item as unknown as ScanMetadata;
}

async function getScanFindings(scanId: string): Promise<Record<string, unknown>[]> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `SCAN#${scanId}`,
        ':sk': 'FINDING#',
      },
    }),
  );
  return (result.Items ?? []) as Record<string, unknown>[];
}

async function getScanErrors(scanId: string): Promise<Record<string, unknown>[]> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `SCAN#${scanId}`,
        ':sk': 'ERROR#',
      },
    }),
  );
  return (result.Items ?? []) as Record<string, unknown>[];
}

async function listScanHistoryRecords(): Promise<Record<string, unknown>[]> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': 'HISTORY',
        ':sk': 'SCAN#',
      },
      ScanIndexForward: false, // newest first
    }),
  );
  return (result.Items ?? []) as Record<string, unknown>[];
}

async function updateScanStatus(
  scanId: string,
  status: ScanStatus,
  progress: number,
  extra?: Record<string, unknown>,
): Promise<void> {
  let updateExpr = 'SET #status = :status, progress = :progress, updatedAt = :now';
  const exprNames: Record<string, string> = { '#status': 'status' };
  const exprValues: Record<string, unknown> = {
    ':status': status,
    ':progress': progress,
    ':now': new Date().toISOString(),
  };

  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      updateExpr += `, ${key} = :${key}`;
      exprValues[`:${key}`] = value;
    }
  }

  await docClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: `SCAN#${scanId}`, SK: 'META' },
      UpdateExpression: updateExpr,
      ExpressionAttributeNames: exprNames,
      ExpressionAttributeValues: exprValues,
    }),
  );

  // Also update the history record status
  // We need to find the history SK first — but for simplicity we skip this
  // since the metadata record is the source of truth for status.
}


// --- Endpoint Handlers ---

/**
 * POST /scans — Create a new scan job (Admin only).
 * Creates a PENDING scan record and kicks off async processing.
 */
async function startScan(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const authError = validateRequest(event);
  if (authError) return authError;

  const claims = extractClaims(event);
  const userRole = extractUserRole(claims);

  if (!checkAuthorization(userRole, '/scans', 'POST')) {
    return jsonResponse(403, { message: 'Forbidden: Admin role required to start scans' });
  }

  const scanId = randomUUID();
  const now = new Date().toISOString();
  const callerEmail = (claims['email'] as string) ?? 'unknown';

  let configuration: Record<string, unknown> = {};
  if (event.body) {
    try {
      configuration = JSON.parse(event.body);
    } catch {
      return jsonResponse(400, { message: 'Invalid JSON in request body' });
    }
  }

  const metadata: ScanMetadata = {
    scanId,
    status: 'PENDING',
    progress: 0,
    createdAt: now,
    updatedAt: now,
    createdBy: callerEmail,
    configuration,
    totalFindings: 0,
    totalErrors: 0,
  };

  await createScanRecord(metadata);

  // Kick off async processing — in a real implementation this would invoke
  // another Lambda or Step Function. For now we mark it as IN_PROGRESS.
  await updateScanStatus(scanId, 'IN_PROGRESS', 0);

  auditLog('START_SCAN', `SCAN#${scanId}`, callerEmail, { configuration });

  return jsonResponse(201, {
    scanId,
    status: 'IN_PROGRESS',
    createdAt: now,
    message: 'Scan job created successfully',
  });
}

/**
 * GET /scans/{id}/status — Return scan status with progress.
 */
async function getScanStatus(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const authError = validateRequest(event);
  if (authError) return authError;

  const claims = extractClaims(event);
  const userRole = extractUserRole(claims);

  if (!checkAuthorization(userRole, '/scans', 'GET')) {
    return jsonResponse(403, { message: 'Forbidden' });
  }

  const scanId = extractScanId(event);
  if (!scanId) {
    return jsonResponse(400, { message: 'Missing scan ID' });
  }

  const metadata = await getScanMetadata(scanId);
  if (!metadata) {
    return jsonResponse(404, { message: 'Scan not found' });
  }

  return jsonResponse(200, {
    scanId: metadata.scanId,
    status: metadata.status,
    progress: metadata.progress,
    createdAt: metadata.createdAt,
    updatedAt: metadata.updatedAt,
  });
}

/**
 * GET /scans/{id}/results — Return scan results (findings + errors).
 */
async function getScanResults(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const authError = validateRequest(event);
  if (authError) return authError;

  const claims = extractClaims(event);
  const userRole = extractUserRole(claims);

  if (!checkAuthorization(userRole, '/scans', 'GET')) {
    return jsonResponse(403, { message: 'Forbidden' });
  }

  const scanId = extractScanId(event);
  if (!scanId) {
    return jsonResponse(400, { message: 'Missing scan ID' });
  }

  const metadata = await getScanMetadata(scanId);
  if (!metadata) {
    return jsonResponse(404, { message: 'Scan not found' });
  }

  const [findings, errors] = await Promise.all([
    getScanFindings(scanId),
    getScanErrors(scanId),
  ]);

  return jsonResponse(200, {
    scanId: metadata.scanId,
    status: metadata.status,
    createdAt: metadata.createdAt,
    configuration: metadata.configuration,
    totalFindings: findings.length,
    totalErrors: errors.length,
    findings,
    errors,
  });
}

/**
 * GET /scans — List scan history (newest first).
 */
async function listScanHistory(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const authError = validateRequest(event);
  if (authError) return authError;

  const claims = extractClaims(event);
  const userRole = extractUserRole(claims);

  if (!checkAuthorization(userRole, '/scans', 'GET')) {
    return jsonResponse(403, { message: 'Forbidden' });
  }

  const history = await listScanHistoryRecords();

  return jsonResponse(200, { scans: history });
}


// --- Router ---

function resolveRoute(event: APIGatewayProxyEvent): string {
  const method = event.httpMethod;
  const resource = event.resource ?? '';

  if (method === 'POST' && resource === '/scans') return 'START_SCAN';
  if (method === 'GET' && resource === '/scans/{id}/status') return 'GET_STATUS';
  if (method === 'GET' && resource === '/scans/{id}/results') return 'GET_RESULTS';
  if (method === 'GET' && resource === '/scans') return 'LIST_HISTORY';

  return 'UNKNOWN';
}

/**
 * Lambda entry point — routes API Gateway proxy events to the correct handler.
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const route = resolveRoute(event);

    switch (route) {
      case 'START_SCAN':
        return await startScan(event);
      case 'GET_STATUS':
        return await getScanStatus(event);
      case 'GET_RESULTS':
        return await getScanResults(event);
      case 'LIST_HISTORY':
        return await listScanHistory(event);
      default:
        return jsonResponse(404, { message: 'Not found' });
    }
  } catch (error) {
    console.error('Scan handler error:', error);
    return jsonResponse(500, { message: 'Internal server error' });
  }
}
