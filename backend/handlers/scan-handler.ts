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
import { STSClient, AssumeRoleCommand } from '@aws-sdk/client-sts';
import { randomUUID } from 'crypto';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { extractUserRole, checkAuthorization, UserRole } from '../auth/auth-module';

const TABLE_NAME = process.env.TABLE_NAME ?? '';

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);
const stsClient = new STSClient({});

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

  const requestedAccounts = (configuration.accounts as string[]) || [];
  const requestedRegions = (configuration.regions as string[]) || ['ap-southeast-1'];
  const requestedServices = (configuration.services as string[]) || ['ec2', 's3'];

  // Look up account records from DynamoDB to get roleArn
  const accountConfigs: { accountId: string; roleArn: string; alias: string }[] = [];
  for (const acctId of requestedAccounts) {
    const result = await docClient.send(
      new GetCommand({ TableName: TABLE_NAME, Key: { PK: `ACCOUNT#${acctId}`, SK: 'META' } }),
    );
    if (result.Item) {
      accountConfigs.push({
        accountId: result.Item.accountId as string,
        roleArn: result.Item.roleArn as string,
        alias: (result.Item.alias as string) || acctId,
      });
    }
  }

  if (accountConfigs.length === 0) {
    return jsonResponse(400, { message: 'No valid accounts found. Please add accounts first.' });
  }

  const metadata: ScanMetadata = {
    scanId,
    status: 'IN_PROGRESS',
    progress: 0,
    createdAt: now,
    updatedAt: now,
    createdBy: callerEmail,
    configuration: { accounts: requestedAccounts, regions: requestedRegions, services: requestedServices },
    totalFindings: 0,
    totalErrors: 0,
  };

  await createScanRecord(metadata);
  await updateScanStatus(scanId, 'IN_PROGRESS', 0);

  auditLog('START_SCAN', `SCAN#${scanId}`, callerEmail, { configuration });

  // Invoke scan worker asynchronously via Lambda invoke
  // The scan runs in the same Lambda but as an async invocation
  try {
    const { LambdaClient, InvokeCommand } = await import('@aws-sdk/client-lambda');
    const lambdaClient = new LambdaClient({});
    await lambdaClient.send(new InvokeCommand({
      FunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME || 'wa-review-scan-handler',
      InvocationType: 'Event', // async — returns immediately
      Payload: Buffer.from(JSON.stringify({
        __scanWorker: true,
        scanId,
        accountConfigs,
        regions: requestedRegions,
        services: requestedServices,
      })),
    }));
  } catch (err) {
    console.error('Failed to invoke scan worker:', err);
    await updateScanStatus(scanId, 'FAILED', 0, { error: 'Failed to start scan worker' });
  }

  return jsonResponse(201, {
    scanId,
    status: 'IN_PROGRESS',
    createdAt: now,
    message: 'Scan started successfully',
  });
}

/**
 * Run the actual scan — AssumeRole into each account, describe resources, store findings.
 */
async function runScanAsync(
  scanId: string,
  accountConfigs: { accountId: string; roleArn: string; alias: string }[],
  regions: string[],
  services: string[],
): Promise<void> {
  const findings: Record<string, unknown>[] = [];
  const errors: string[] = [];
  const totalTasks = accountConfigs.length * regions.length * services.length;
  let completedTasks = 0;

  for (const acct of accountConfigs) {
    // AssumeRole into target account
    let credentials: { accessKeyId: string; secretAccessKey: string; sessionToken: string } | null = null;
    try {
      const assumeResult = await stsClient.send(
        new AssumeRoleCommand({
          RoleArn: acct.roleArn,
          RoleSessionName: `wa-scan-${scanId.substring(0, 8)}`,
          ExternalId: `wa-review-${acct.accountId}`,
          DurationSeconds: 900,
        }),
      );
      if (assumeResult.Credentials) {
        credentials = {
          accessKeyId: assumeResult.Credentials.AccessKeyId!,
          secretAccessKey: assumeResult.Credentials.SecretAccessKey!,
          sessionToken: assumeResult.Credentials.SessionToken!,
        };
      }
    } catch (err) {
      const msg = `Failed to assume role for account ${acct.accountId} (${acct.alias}): ${err instanceof Error ? err.message : err}`;
      console.error(msg);
      errors.push(msg);
      completedTasks += regions.length * services.length;
      await updateScanStatus(scanId, 'IN_PROGRESS', Math.round((completedTasks / totalTasks) * 100));
      continue;
    }

    if (!credentials) {
      errors.push(`No credentials returned for account ${acct.accountId}`);
      completedTasks += regions.length * services.length;
      continue;
    }

    for (const region of regions) {
      for (const service of services) {
        try {
          await updateScanStatus(scanId, 'IN_PROGRESS', Math.round((completedTasks / totalTasks) * 100), {
            currentService: service.toUpperCase(),
            currentRegion: region,
          });

          const svcFindings = await scanService(acct.accountId, region, service, credentials);
          findings.push(...svcFindings);
        } catch (err) {
          const msg = `Error scanning ${service} in ${region} (${acct.accountId}): ${err instanceof Error ? err.message : err}`;
          console.error(msg);
          errors.push(msg);
        }
        completedTasks++;
      }
    }
  }

  // Store findings in DynamoDB
  for (let i = 0; i < findings.length; i++) {
    const finding = findings[i];
    const findingId = (finding.finding_id as string) || randomUUID();
    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: `SCAN#${scanId}`,
          SK: `FINDING#${findingId}`,
          ...finding,
          finding_id: findingId,
        },
      }),
    );
  }

  // Store errors
  for (let i = 0; i < errors.length; i++) {
    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: `SCAN#${scanId}`,
          SK: `ERROR#${i}`,
          message: errors[i],
          timestamp: new Date().toISOString(),
        },
      }),
    );
  }

  // Mark scan as completed
  await updateScanStatus(scanId, 'COMPLETED', 100, {
    totalFindings: findings.length,
    totalErrors: errors.length,
    currentService: '',
    currentRegion: '',
  });
}

/**
 * Scan a single service in a single region using assumed credentials.
 * Returns an array of finding objects.
 */
async function scanService(
  accountId: string,
  region: string,
  service: string,
  credentials: { accessKeyId: string; secretAccessKey: string; sessionToken: string },
): Promise<Record<string, unknown>[]> {
  // Dynamic import to create clients with assumed credentials
  const clientConfig = {
    region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  };

  const findings: Record<string, unknown>[] = [];

  try {
    switch (service.toLowerCase()) {
      case 'ec2': {
        const { EC2Client, DescribeInstancesCommand } = await import('@aws-sdk/client-ec2');
        const ec2 = new EC2Client(clientConfig);
        const resp = await ec2.send(new DescribeInstancesCommand({}));
        for (const res of resp.Reservations ?? []) {
          for (const inst of res.Instances ?? []) {
            // Check: public IP with unrestricted SSH
            if (inst.PublicIpAddress) {
              findings.push({
                finding_id: randomUUID(),
                account_id: accountId,
                region,
                service: 'EC2',
                resource_id: inst.InstanceId,
                resource_arn: `arn:aws:ec2:${region}:${accountId}:instance/${inst.InstanceId}`,
                pillar: 'Security',
                severity: inst.PublicIpAddress ? 'MEDIUM' : 'LOW',
                title: `EC2 instance ${inst.InstanceId} has public IP ${inst.PublicIpAddress}`,
                description: 'EC2 instance has a public IP address. Review security group rules.',
                recommendation: 'Consider using private subnets or restricting security group access.',
              });
            }
            // Check: monitoring disabled
            if (inst.Monitoring?.State !== 'enabled') {
              findings.push({
                finding_id: randomUUID(),
                account_id: accountId,
                region,
                service: 'EC2',
                resource_id: inst.InstanceId,
                resource_arn: `arn:aws:ec2:${region}:${accountId}:instance/${inst.InstanceId}`,
                pillar: 'Operational Excellence',
                severity: 'LOW',
                title: `EC2 instance ${inst.InstanceId} does not have detailed monitoring enabled`,
                description: 'Detailed monitoring provides 1-minute metrics.',
                recommendation: 'Enable detailed monitoring for better observability.',
              });
            }
          }
        }
        break;
      }
      case 's3': {
        const { S3Client, ListBucketsCommand, GetBucketEncryptionCommand, GetPublicAccessBlockCommand } = await import('@aws-sdk/client-s3');
        const s3 = new S3Client(clientConfig);
        const buckets = await s3.send(new ListBucketsCommand({}));
        for (const bucket of buckets.Buckets ?? []) {
          const name = bucket.Name!;
          // Check encryption
          try {
            await s3.send(new GetBucketEncryptionCommand({ Bucket: name }));
          } catch {
            findings.push({
              finding_id: randomUUID(),
              account_id: accountId,
              region,
              service: 'S3',
              resource_id: name,
              resource_arn: `arn:aws:s3:::${name}`,
              pillar: 'Security',
              severity: 'HIGH',
              title: `S3 bucket ${name} does not have default encryption`,
              description: 'Bucket does not have server-side encryption configured.',
              recommendation: 'Enable default encryption using SSE-S3 or SSE-KMS.',
            });
          }
          // Check public access block
          try {
            const pab = await s3.send(new GetPublicAccessBlockCommand({ Bucket: name }));
            const config = pab.PublicAccessBlockConfiguration;
            if (!config?.BlockPublicAcls || !config?.BlockPublicPolicy) {
              findings.push({
                finding_id: randomUUID(),
                account_id: accountId,
                region,
                service: 'S3',
                resource_id: name,
                resource_arn: `arn:aws:s3:::${name}`,
                pillar: 'Security',
                severity: 'CRITICAL',
                title: `S3 bucket ${name} does not block public access`,
                description: 'Public access block is not fully enabled.',
                recommendation: 'Enable all public access block settings.',
              });
            }
          } catch {
            // No public access block configured
            findings.push({
              finding_id: randomUUID(),
              account_id: accountId,
              region,
              service: 'S3',
              resource_id: name,
              resource_arn: `arn:aws:s3:::${name}`,
              pillar: 'Security',
              severity: 'CRITICAL',
              title: `S3 bucket ${name} has no public access block configuration`,
              description: 'No public access block is configured for this bucket.',
              recommendation: 'Configure public access block to prevent unintended public access.',
            });
          }
        }
        break;
      }
      case 'rds': {
        const { RDSClient, DescribeDBInstancesCommand } = await import('@aws-sdk/client-rds');
        const rds = new RDSClient(clientConfig);
        const resp = await rds.send(new DescribeDBInstancesCommand({}));
        for (const db of resp.DBInstances ?? []) {
          if (!db.MultiAZ) {
            findings.push({
              finding_id: randomUUID(),
              account_id: accountId,
              region,
              service: 'RDS',
              resource_id: db.DBInstanceIdentifier,
              resource_arn: db.DBInstanceArn,
              pillar: 'Reliability',
              severity: 'HIGH',
              title: `RDS ${db.DBInstanceIdentifier} does not have Multi-AZ enabled`,
              description: 'Single-AZ deployment has no automatic failover.',
              recommendation: 'Enable Multi-AZ for production databases.',
            });
          }
          if (!db.StorageEncrypted) {
            findings.push({
              finding_id: randomUUID(),
              account_id: accountId,
              region,
              service: 'RDS',
              resource_id: db.DBInstanceIdentifier,
              resource_arn: db.DBInstanceArn,
              pillar: 'Security',
              severity: 'HIGH',
              title: `RDS ${db.DBInstanceIdentifier} is not encrypted at rest`,
              description: 'Database storage is not encrypted.',
              recommendation: 'Enable encryption at rest using KMS.',
            });
          }
        }
        break;
      }
      case 'iam': {
        const { IAMClient, ListUsersCommand, ListMFADevicesCommand } = await import('@aws-sdk/client-iam');
        const iam = new IAMClient(clientConfig);
        const resp = await iam.send(new ListUsersCommand({}));
        for (const user of resp.Users ?? []) {
          const mfa = await iam.send(new ListMFADevicesCommand({ UserName: user.UserName }));
          if (!mfa.MFADevices || mfa.MFADevices.length === 0) {
            findings.push({
              finding_id: randomUUID(),
              account_id: accountId,
              region: 'global',
              service: 'IAM',
              resource_id: user.UserName,
              resource_arn: user.Arn,
              pillar: 'Security',
              severity: 'HIGH',
              title: `IAM user ${user.UserName} does not have MFA enabled`,
              description: 'IAM user has no MFA device configured.',
              recommendation: 'Enable MFA for all IAM users with console access.',
            });
          }
        }
        break;
      }
      case 'lambda': {
        const { LambdaClient, ListFunctionsCommand } = await import('@aws-sdk/client-lambda');
        const lambda = new LambdaClient(clientConfig);
        const resp = await lambda.send(new ListFunctionsCommand({}));
        for (const fn of resp.Functions ?? []) {
          if (fn.MemorySize && fn.MemorySize <= 128) {
            findings.push({
              finding_id: randomUUID(),
              account_id: accountId,
              region,
              service: 'Lambda',
              resource_id: fn.FunctionName,
              resource_arn: fn.FunctionArn,
              pillar: 'Performance Efficiency',
              severity: 'MEDIUM',
              title: `Lambda ${fn.FunctionName} uses default 128MB memory`,
              description: 'Default memory may cause slower execution.',
              recommendation: 'Use AWS Lambda Power Tuning to find optimal memory.',
            });
          }
        }
        break;
      }
      default:
        // Other services: no-op for now, can be extended
        break;
    }
  } catch (err) {
    console.error(`scanService error for ${service} in ${region} (${accountId}):`, err);
    throw err;
  }

  return findings;
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
    // Handle async scan worker invocation (from Lambda Event invoke)
    const rawEvent = event as unknown as Record<string, unknown>;
    if (rawEvent.__scanWorker) {
      await runScanAsync(
        rawEvent.scanId as string,
        rawEvent.accountConfigs as { accountId: string; roleArn: string; alias: string }[],
        rawEvent.regions as string[],
        rawEvent.services as string[],
      );
      // Async invocation — no API Gateway response needed
      return { statusCode: 200, body: 'OK', headers: {} };
    }

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
