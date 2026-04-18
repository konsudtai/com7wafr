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

  // Scan cost recommendations (RI, Savings Plans) — once per account, not per region/service
  for (const acct of accountConfigs) {
    try {
      await updateScanStatus(scanId, 'IN_PROGRESS', 95, {
        currentService: 'Cost Explorer',
        currentRegion: acct.accountId,
      });

      let credentials: { accessKeyId: string; secretAccessKey: string; sessionToken: string } | null = null;
      try {
        const assumeResult = await stsClient.send(
          new AssumeRoleCommand({
            RoleArn: acct.roleArn,
            RoleSessionName: `wa-cost-${scanId.substring(0, 8)}`,
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
      } catch {
        // Already logged in main scan loop
      }

      if (credentials) {
        const costFindings = await scanCostRecommendations(acct.accountId, credentials);
        findings.push(...costFindings);
      }
    } catch (err) {
      errors.push(`Cost Explorer error for ${acct.accountId}: ${err instanceof Error ? err.message : err}`);
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
                check_id: 'ec2-001',
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
                check_id: 'ec2-003',
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
              check_id: 's3-002',
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
                check_id: 's3-001',
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
              check_id: 's3-001',
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
              check_id: 'rds-001',
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
              check_id: 'rds-002',
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
              check_id: 'iam-003',
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
              check_id: 'lambda-001',
              title: `Lambda ${fn.FunctionName} uses default 128MB memory`,
              description: 'Default memory may cause slower execution.',
              recommendation: 'Use AWS Lambda Power Tuning to find optimal memory.',
            });
          }
        }
        break;
      }
      case 'cloudtrail': {
        const { CloudTrailClient, DescribeTrailsCommand, GetTrailStatusCommand } = await import('@aws-sdk/client-cloudtrail');
        const ct = new CloudTrailClient(clientConfig);
        const resp = await ct.send(new DescribeTrailsCommand({}));
        for (const trail of resp.trailList ?? []) {
          if (!trail.IsMultiRegionTrail) {
            findings.push({ finding_id: randomUUID(), account_id: accountId, region, service: 'CloudTrail', resource_id: trail.Name, resource_arn: trail.TrailARN, pillar: 'Security', severity: 'HIGH', check_id: 'cloudtrail-001', title: `CloudTrail ${trail.Name} is not multi-region`, description: 'Trail does not capture API activity across all regions.', recommendation: 'Enable multi-region trail.' });
          }
          if (!trail.KmsKeyId) {
            findings.push({ finding_id: randomUUID(), account_id: accountId, region, service: 'CloudTrail', resource_id: trail.Name, resource_arn: trail.TrailARN, pillar: 'Security', severity: 'MEDIUM', check_id: 'cloudtrail-002', title: `CloudTrail ${trail.Name} not encrypted with KMS`, description: 'Trail logs are not encrypted with a KMS key.', recommendation: 'Configure KMS encryption for CloudTrail.' });
          }
          if (!trail.LogFileValidationEnabled) {
            findings.push({ finding_id: randomUUID(), account_id: accountId, region, service: 'CloudTrail', resource_id: trail.Name, resource_arn: trail.TrailARN, pillar: 'Security', severity: 'MEDIUM', check_id: 'cloudtrail-003', title: `CloudTrail ${trail.Name} log file validation disabled`, description: 'Log file validation is not enabled.', recommendation: 'Enable log file validation.' });
          }
        }
        break;
      }
      case 'cloudwatch': {
        const { CloudWatchLogsClient, DescribeLogGroupsCommand } = await import('@aws-sdk/client-cloudwatch-logs');
        const cw = new CloudWatchLogsClient(clientConfig);
        const resp = await cw.send(new DescribeLogGroupsCommand({ limit: 50 }));
        for (const lg of resp.logGroups ?? []) {
          if (!lg.retentionInDays) {
            findings.push({ finding_id: randomUUID(), account_id: accountId, region, service: 'CloudWatch', resource_id: lg.logGroupName, resource_arn: lg.arn, pillar: 'Operational Excellence', severity: 'MEDIUM', check_id: 'cloudwatch-001', title: `Log group ${lg.logGroupName} has no retention policy`, description: 'Log group will retain logs indefinitely, increasing costs.', recommendation: 'Set a retention policy.' });
          }
        }
        break;
      }
      case 'config': {
        const { ConfigServiceClient, DescribeConfigurationRecordersCommand, DescribeConfigurationRecorderStatusCommand } = await import('@aws-sdk/client-config-service');
        const cfg = new ConfigServiceClient(clientConfig);
        try {
          const recorders = await cfg.send(new DescribeConfigurationRecordersCommand({}));
          const statuses = await cfg.send(new DescribeConfigurationRecorderStatusCommand({}));
          const isRecording = statuses.ConfigurationRecordersStatus?.some(s => s.recording) ?? false;
          if (!isRecording || (recorders.ConfigurationRecorders?.length ?? 0) === 0) {
            findings.push({ finding_id: randomUUID(), account_id: accountId, region, service: 'Config', resource_id: 'AWS Config', pillar: 'Security', severity: 'HIGH', check_id: 'config-001', title: `AWS Config is not enabled in ${region}`, description: 'AWS Config is not recording resource configurations.', recommendation: 'Enable AWS Config in this region.' });
          }
        } catch { /* Config not available */ }
        break;
      }
      case 'kms': {
        const { KMSClient, ListKeysCommand, DescribeKeyCommand, GetKeyRotationStatusCommand } = await import('@aws-sdk/client-kms');
        const kms = new KMSClient(clientConfig);
        const keys = await kms.send(new ListKeysCommand({ Limit: 100 }));
        for (const key of keys.Keys ?? []) {
          try {
            const desc = await kms.send(new DescribeKeyCommand({ KeyId: key.KeyId }));
            if (desc.KeyMetadata?.KeyManager !== 'CUSTOMER') continue;
            if (desc.KeyMetadata?.KeyState !== 'Enabled') continue;
            try {
              const rotation = await kms.send(new GetKeyRotationStatusCommand({ KeyId: key.KeyId }));
              if (!rotation.KeyRotationEnabled) {
                findings.push({ finding_id: randomUUID(), account_id: accountId, region, service: 'KMS', resource_id: key.KeyId, resource_arn: desc.KeyMetadata?.Arn, pillar: 'Security', severity: 'MEDIUM', check_id: 'kms-001', title: `KMS key ${key.KeyId} rotation not enabled`, description: 'Automatic key rotation is not enabled.', recommendation: 'Enable automatic key rotation.' });
              }
            } catch { /* rotation check failed */ }
          } catch { /* describe failed */ }
        }
        break;
      }
      case 'vpc': {
        const { EC2Client: VPCClient, DescribeVpcsCommand, DescribeFlowLogsCommand, DescribeSecurityGroupsCommand } = await import('@aws-sdk/client-ec2');
        const vpc = new VPCClient(clientConfig);
        const vpcs = await vpc.send(new DescribeVpcsCommand({}));
        for (const v of vpcs.Vpcs ?? []) {
          const flowLogs = await vpc.send(new DescribeFlowLogsCommand({ Filter: [{ Name: 'resource-id', Values: [v.VpcId!] }] }));
          if (!flowLogs.FlowLogs?.length) {
            findings.push({ finding_id: randomUUID(), account_id: accountId, region, service: 'VPC', resource_id: v.VpcId, pillar: 'Security', severity: 'MEDIUM', check_id: 'vpc-001', title: `VPC ${v.VpcId} has no flow logs`, description: 'VPC flow logs are not enabled.', recommendation: 'Enable VPC flow logs.' });
          }
        }
        // Check default security groups
        const sgs = await vpc.send(new DescribeSecurityGroupsCommand({ Filters: [{ Name: 'group-name', Values: ['default'] }] }));
        for (const sg of sgs.SecurityGroups ?? []) {
          if ((sg.IpPermissions?.length ?? 0) > 0 || (sg.IpPermissionsEgress?.length ?? 0) > 0) {
            findings.push({ finding_id: randomUUID(), account_id: accountId, region, service: 'VPC', resource_id: sg.GroupId, pillar: 'Security', severity: 'HIGH', check_id: 'vpc-002', title: `Default SG ${sg.GroupId} has rules`, description: 'Default security group should have no rules.', recommendation: 'Remove all rules from default security group.' });
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
 * Scan Cost Explorer for actual spend, RI and Savings Plan recommendations.
 */
async function scanCostRecommendations(
  accountId: string,
  credentials: { accessKeyId: string; secretAccessKey: string; sessionToken: string },
): Promise<Record<string, unknown>[]> {
  const findings: Record<string, unknown>[] = [];
  const ceCfg = {
    region: 'us-east-1',
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  };

  try {
    const {
      CostExplorerClient,
      GetCostAndUsageCommand,
      GetReservationPurchaseRecommendationCommand,
      GetSavingsPlansPurchaseRecommendationCommand,
    } = await import('@aws-sdk/client-cost-explorer');
    const ce = new CostExplorerClient(ceCfg);

    // --- 1. Actual Cost and Usage (last 30 days by service) ---
    try {
      const now = new Date();
      const end = now.toISOString().split('T')[0];
      const start = new Date(now.getTime() - 30 * 86400000).toISOString().split('T')[0];

      const costResp = await ce.send(new GetCostAndUsageCommand({
        TimePeriod: { Start: start, End: end },
        Granularity: 'MONTHLY',
        Metrics: ['UnblendedCost'],
        GroupBy: [{ Type: 'DIMENSION', Key: 'SERVICE' }],
      }));

      let totalSpend = 0;
      const svcSpend: { service: string; amount: number }[] = [];
      for (const r of costResp.ResultsByTime ?? []) {
        for (const g of r.Groups ?? []) {
          const amount = parseFloat(g.Metrics?.UnblendedCost?.Amount ?? '0');
          if (amount > 0.01) {
            svcSpend.push({ service: g.Keys?.[0] ?? 'Unknown', amount });
            totalSpend += amount;
          }
        }
      }
      svcSpend.sort((a, b) => b.amount - a.amount);

      findings.push({
        finding_id: randomUUID(), account_id: accountId, region: 'global',
        service: 'Cost Explorer', resource_id: 'Monthly Cost Summary',
        pillar: 'Cost Optimization', severity: 'INFORMATIONAL',
        title: `Monthly spend: $${totalSpend.toFixed(2)} (${start} to ${end})`,
        description: 'Total unblended cost for the last 30 days across all services.',
        recommendation: 'Review top spending services for optimization opportunities.',
        finding_type: 'COST_USAGE', totalSpend, period: { start, end }, serviceBreakdown: svcSpend,
      });

      for (const s of svcSpend.slice(0, 10)) {
        if (s.amount < 1) continue;
        const pct = ((s.amount / totalSpend) * 100).toFixed(1);
        const short = costSimplifyName(s.service);
        findings.push({
          finding_id: randomUUID(), account_id: accountId, region: 'global',
          service: short, resource_id: s.service, pillar: 'Cost Optimization',
          severity: s.amount > totalSpend * 0.3 ? 'HIGH' : s.amount > totalSpend * 0.1 ? 'MEDIUM' : 'LOW',
          title: `${short}: $${s.amount.toFixed(2)}/mo (${pct}% of total)`,
          description: `Actual spend: $${s.amount.toFixed(2)} in the last 30 days.`,
          recommendation: costOptimizationTip(s.service),
          finding_type: 'COST_OPTIMIZATION', actualSpend: s.amount, spendPercentage: parseFloat(pct),
        });
      }
    } catch (err) { console.error('GetCostAndUsage error:', err); }

    // --- 2. RI Recommendations ---
    for (const svc of ['Amazon Elastic Compute Cloud - Compute', 'Amazon Relational Database Service', 'Amazon ElastiCache']) {
      try {
        const riR = await ce.send(new GetReservationPurchaseRecommendationCommand({
          Service: svc, TermInYears: 'ONE_YEAR', PaymentOption: 'PARTIAL_UPFRONT', LookbackPeriodInDays: 'THIRTY_DAYS',
        }));
        for (const rec of riR.Recommendations ?? []) {
          for (const d of rec.RecommendationDetails ?? []) {
            const sv = parseFloat(d.EstimatedMonthlySavingsAmount ?? '0');
            if (sv > 0) {
              const sh = svc.includes('Compute') ? 'EC2' : svc.includes('Relational') ? 'RDS' : 'ElastiCache';
              const it = d.InstanceDetails?.EC2InstanceDetails?.InstanceType || d.InstanceDetails?.RDSInstanceDetails?.DatabaseEngine || 'N/A';
              findings.push({
                finding_id: randomUUID(), account_id: accountId,
                region: d.InstanceDetails?.EC2InstanceDetails?.Region || 'global',
                service: sh, resource_id: it, pillar: 'Cost Optimization',
                severity: sv > 100 ? 'HIGH' : 'MEDIUM',
                title: `RI: ${sh} ${it} - save $${sv.toFixed(2)}/mo`,
                description: `Estimated savings: $${sv.toFixed(2)}/mo with 1-Year Partial Upfront RI.`,
                recommendation: `Purchase RI for ${sh} (${it}) to save $${sv.toFixed(2)}/month.`,
                finding_type: 'RI_RECOMMENDATION', monthlySavings: sv, term: '1 Year', paymentOption: 'Partial Upfront',
              });
            }
          }
        }
      } catch (err) { console.log(`No RI for ${svc}: ${err instanceof Error ? err.message : err}`); }
    }

    // --- 3. Savings Plans Recommendations ---
    try {
      const spR = await ce.send(new GetSavingsPlansPurchaseRecommendationCommand({
        SavingsPlansType: 'COMPUTE_SP', TermInYears: 'ONE_YEAR', PaymentOption: 'PARTIAL_UPFRONT', LookbackPeriodInDays: 'THIRTY_DAYS',
      }));
      const m = spR.SavingsPlansPurchaseRecommendation;
      if (m) {
        const sv = parseFloat(m.SavingsPlansPurchaseRecommendationSummary?.EstimatedMonthlySavingsAmount ?? '0');
        const cm = m.SavingsPlansPurchaseRecommendationSummary?.HourlyCommitmentToPurchase ?? '0';
        const od = parseFloat(m.SavingsPlansPurchaseRecommendationSummary?.CurrentOnDemandSpend ?? '0');
        if (sv > 0) {
          findings.push({
            finding_id: randomUUID(), account_id: accountId, region: 'global',
            service: 'Savings Plans', resource_id: 'Compute Savings Plan',
            pillar: 'Cost Optimization', severity: sv > 200 ? 'HIGH' : 'MEDIUM',
            title: `SP: Save $${sv.toFixed(2)}/mo`,
            description: `Current on-demand: $${od.toFixed(2)}/mo. Savings: $${sv.toFixed(2)}/mo with Compute SP.`,
            recommendation: `Purchase Compute SP ($${cm}/hr, 1-Year) to save $${sv.toFixed(2)}/month.`,
            finding_type: 'SP_RECOMMENDATION', monthlySavings: sv, currentOnDemandSpend: od,
            hourlyCommitment: parseFloat(cm), term: '1 Year', paymentOption: 'Partial Upfront',
          });
        }
      }
    } catch (err) { console.error('SP recommendations error:', err); }

  } catch (err) { console.error('Cost Explorer client error:', err); }
  return findings;
}

function costSimplifyName(n: string): string {
  const m: Record<string, string> = {
    'Amazon Elastic Compute Cloud - Compute': 'EC2', 'Amazon Simple Storage Service': 'S3',
    'Amazon Relational Database Service': 'RDS', 'Amazon DynamoDB': 'DynamoDB', 'AWS Lambda': 'Lambda',
    'Amazon CloudFront': 'CloudFront', 'Elastic Load Balancing': 'ELB', 'Amazon CloudWatch': 'CloudWatch',
    'Amazon API Gateway': 'API Gateway', 'AWS Data Transfer': 'Data Transfer',
  };
  return m[n] || n.replace(/^Amazon\s+/, '').replace(/^AWS\s+/, '');
}

function costOptimizationTip(n: string): string {
  const l = n.toLowerCase();
  if (l.includes('ec2') || l.includes('compute')) return 'Right-size instances, use Spot/RI/Savings Plans, stop idle instances.';
  if (l.includes('rds') || l.includes('relational')) return 'Use RI for steady databases. Review Multi-AZ for non-prod. Consider Aurora Serverless.';
  if (l.includes('s3') || l.includes('storage')) return 'Add lifecycle policies (Glacier/Deep Archive). Enable Intelligent-Tiering.';
  if (l.includes('lambda')) return 'Optimize memory with Power Tuning. Batch invocations.';
  if (l.includes('dynamodb')) return 'Switch to on-demand for variable workloads. Use Reserved Capacity for steady.';
  if (l.includes('nat gateway')) return 'Use VPC endpoints for S3/DynamoDB to reduce NAT traffic.';
  if (l.includes('cloudwatch')) return 'Review log retention, reduce custom metrics.';
  if (l.includes('cloudfront') || l.includes('data transfer')) return 'Optimize cache TTL, use price class, compress content.';
  if (l.includes('elastic load') || l.includes('elb')) return 'Consolidate LBs, remove idle ones.';
  return 'Review usage patterns and consider Reserved pricing if usage is steady.';
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
