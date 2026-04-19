/**
 * AI Handler — WA Copilot
 *
 * Endpoints:
 * - POST /ai/chat     — Chat with AI (read + analyze + propose fixes)
 * - POST /ai/execute  — Execute approved fix action
 *
 * Uses Bedrock InvokeModel with tool use (function calling).
 * Models: Claude Sonnet 4.6, Opus 4.6, Nova Lite 2.0
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { STSClient, AssumeRoleCommand } from '@aws-sdk/client-sts';
import { randomUUID } from 'crypto';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { extractUserRole, checkAuthorization } from '../auth/auth-module';

const TABLE_NAME = process.env.TABLE_NAME ?? '';
const BEDROCK_REGION = process.env.BEDROCK_REGION || 'us-east-1';

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);
const stsClient = new STSClient({});

// --- Model IDs ---
const MODELS: Record<string, string> = {
  'sonnet-4.6': 'anthropic.claude-sonnet-4-6',
  'opus-4.6': 'anthropic.claude-opus-4-6-v1',
  'nova-lite': 'amazon.nova-lite-v1:0',
};
const DEFAULT_MODEL = 'sonnet-4.6';

// --- Tool Definitions ---
const READ_TOOLS = [
  {
    name: 'get_findings_summary',
    description: 'Get summary of scan findings grouped by severity and pillar. Use this to understand the overall security posture.',
    input_schema: { type: 'object', properties: { severity: { type: 'string', description: 'Filter by severity: CRITICAL, HIGH, MEDIUM, LOW' }, service: { type: 'string', description: 'Filter by AWS service name' } }, required: [] },
  },
  {
    name: 'get_findings_detail',
    description: 'Get detailed findings list with resource IDs, titles, and recommendations.',
    input_schema: { type: 'object', properties: { service: { type: 'string' }, severity: { type: 'string' }, limit: { type: 'number', description: 'Max results (default 20)' } }, required: [] },
  },
  {
    name: 'get_compliance_status',
    description: 'Get compliance framework status (CIS, NIST, SOC2, FTR, WAFS, SPIP, SSB). Shows passed/failed controls.',
    input_schema: { type: 'object', properties: { framework: { type: 'string', description: 'Framework ID: cis, nist, soc2, ftr, wafs, spip, ssb' } }, required: [] },
  },
  {
    name: 'get_cost_data',
    description: 'Get cost data including monthly spend, RI/SP recommendations, and rightsizing opportunities.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_cloudtrail_events',
    description: 'Query CloudTrail events for investigation. Returns recent management events.',
    input_schema: { type: 'object', properties: { accountId: { type: 'string', description: 'AWS account ID' }, hours: { type: 'number', description: 'Look back hours (default 24)' }, username: { type: 'string' }, eventName: { type: 'string' } }, required: ['accountId'] },
  },
  {
    name: 'get_accounts',
    description: 'List registered AWS accounts with connection status.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
];

const WRITE_TOOLS = [
  {
    name: 'propose_fix',
    description: 'Propose a fix action that requires user approval before execution. Always use this for any write/modify operation.',
    input_schema: {
      type: 'object',
      properties: {
        accountId: { type: 'string', description: 'Target AWS account ID' },
        action: { type: 'string', description: 'Action type: enable_s3_encryption, block_s3_public, enable_s3_versioning, enable_vpc_flowlogs, fix_security_group, enable_rds_encryption, enable_rds_multiaz, enable_cloudtrail_multiregion, enable_cloudtrail_validation, enable_kms_rotation' },
        resourceId: { type: 'string', description: 'Resource identifier (bucket name, VPC ID, etc.)' },
        region: { type: 'string', description: 'AWS region' },
        description: { type: 'string', description: 'Human-readable description of what will be done' },
        risk: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'], description: 'Risk level of this action' },
        reversible: { type: 'boolean', description: 'Whether this action can be reversed' },
      },
      required: ['accountId', 'action', 'resourceId', 'description', 'risk'],
    },
  },
];

// --- Helpers ---

function jsonResponse(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type,Authorization', 'Access-Control-Allow-Methods': 'POST,OPTIONS' },
    body: JSON.stringify(body),
  };
}

function extractClaims(event: APIGatewayProxyEvent): Record<string, unknown> {
  return (event.requestContext?.authorizer?.claims as Record<string, unknown>) ?? {};
}

function validateRequest(event: APIGatewayProxyEvent): APIGatewayProxyResult | null {
  const claims = extractClaims(event);
  if (!claims || Object.keys(claims).length === 0) return jsonResponse(401, { message: 'Unauthorized' });
  return null;
}

// --- Read Tool Implementations ---

async function toolGetFindingsSummary(params: Record<string, unknown>): Promise<string> {
  // Get latest completed scan
  const hist = await docClient.send(new QueryCommand({
    TableName: TABLE_NAME, KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: { ':pk': 'HISTORY', ':sk': 'SCAN#' }, ScanIndexForward: false, Limit: 20,
  }));
  const completed = (hist.Items ?? []).find(i => i.status === 'COMPLETED');
  if (!completed) return JSON.stringify({ error: 'No completed scan found' });

  const scanId = completed.scanId as string;
  const findings = await docClient.send(new QueryCommand({
    TableName: TABLE_NAME, KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: { ':pk': `SCAN#${scanId}`, ':sk': 'FINDING#' },
  }));

  const items = (findings.Items ?? []).filter(f => {
    if (params.severity && f.severity !== params.severity) return false;
    if (params.service && f.service !== params.service) return false;
    return !f.finding_type || f.finding_type === '';
  });

  const bySev: Record<string, number> = {};
  const byPillar: Record<string, number> = {};
  const bySvc: Record<string, number> = {};
  items.forEach(f => {
    bySev[f.severity as string] = (bySev[f.severity as string] || 0) + 1;
    byPillar[f.pillar as string] = (byPillar[f.pillar as string] || 0) + 1;
    bySvc[f.service as string] = (bySvc[f.service as string] || 0) + 1;
  });

  return JSON.stringify({ totalFindings: items.length, bySeverity: bySev, byPillar: byPillar, byService: bySvc, scanId });
}

async function toolGetFindingsDetail(params: Record<string, unknown>): Promise<string> {
  const hist = await docClient.send(new QueryCommand({
    TableName: TABLE_NAME, KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: { ':pk': 'HISTORY', ':sk': 'SCAN#' }, ScanIndexForward: false, Limit: 20,
  }));
  const completed = (hist.Items ?? []).find(i => i.status === 'COMPLETED');
  if (!completed) return JSON.stringify({ error: 'No completed scan found' });

  const scanId = completed.scanId as string;
  const findings = await docClient.send(new QueryCommand({
    TableName: TABLE_NAME, KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: { ':pk': `SCAN#${scanId}`, ':sk': 'FINDING#' },
  }));

  const limit = (params.limit as number) || 20;
  const items = (findings.Items ?? [])
    .filter(f => {
      if (params.severity && f.severity !== params.severity) return false;
      if (params.service && f.service !== params.service) return false;
      return !f.finding_type || f.finding_type === '';
    })
    .slice(0, limit)
    .map(f => ({ service: f.service, severity: f.severity, title: f.title, resource: f.resource_id, pillar: f.pillar, checkId: f.check_id, recommendation: f.recommendation, account: f.account_id }));

  return JSON.stringify({ findings: items, total: items.length });
}

async function toolGetComplianceStatus(params: Record<string, unknown>): Promise<string> {
  // Return a summary — actual compliance evaluation happens in frontend data.js
  // Here we return the raw findings with check_ids for the AI to reason about
  const hist = await docClient.send(new QueryCommand({
    TableName: TABLE_NAME, KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: { ':pk': 'HISTORY', ':sk': 'SCAN#' }, ScanIndexForward: false, Limit: 20,
  }));
  const completed = (hist.Items ?? []).find(i => i.status === 'COMPLETED');
  if (!completed) return JSON.stringify({ error: 'No completed scan found' });

  const scanId = completed.scanId as string;
  const findings = await docClient.send(new QueryCommand({
    TableName: TABLE_NAME, KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: { ':pk': `SCAN#${scanId}`, ':sk': 'FINDING#' },
  }));

  const checkIds = (findings.Items ?? []).filter(f => f.check_id).map(f => ({ checkId: f.check_id, service: f.service, severity: f.severity, title: f.title }));
  const scannedServices = [...new Set((findings.Items ?? []).map(f => f.service as string).filter(Boolean))];

  return JSON.stringify({ failedChecks: checkIds, scannedServices, framework: params.framework || 'all' });
}

async function toolGetCostData(): Promise<string> {
  const hist = await docClient.send(new QueryCommand({
    TableName: TABLE_NAME, KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: { ':pk': 'HISTORY', ':sk': 'SCAN#' }, ScanIndexForward: false, Limit: 20,
  }));
  const completed = (hist.Items ?? []).find(i => i.status === 'COMPLETED');
  if (!completed) return JSON.stringify({ error: 'No completed scan found' });

  const scanId = completed.scanId as string;
  const findings = await docClient.send(new QueryCommand({
    TableName: TABLE_NAME, KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: { ':pk': `SCAN#${scanId}`, ':sk': 'FINDING#' },
  }));

  const costItems = (findings.Items ?? []).filter(f => f.finding_type && f.finding_type !== '').map(f => ({
    type: f.finding_type, service: f.service, title: f.title, monthlySavings: f.monthlySavings, actualSpend: f.actualSpend, totalSpend: f.totalSpend, recommendation: f.recommendation,
  }));

  return JSON.stringify({ costData: costItems, total: costItems.length });
}

async function toolGetAccounts(): Promise<string> {
  const result = await docClient.send(new QueryCommand({
    TableName: TABLE_NAME, KeyConditionExpression: 'begins_with(PK, :pk) AND SK = :sk',
    ExpressionAttributeValues: { ':pk': 'ACCOUNT#', ':sk': 'META' },
  }));
  // Scan instead since we can't use begins_with on PK in Query without GSI
  const { ScanCommand } = await import('@aws-sdk/lib-dynamodb');
  const scan = await docClient.send(new ScanCommand({
    TableName: TABLE_NAME,
    FilterExpression: 'begins_with(PK, :pk) AND SK = :sk',
    ExpressionAttributeValues: { ':pk': 'ACCOUNT#', ':sk': 'META' },
  }));
  const accounts = (scan.Items ?? []).map(a => ({ accountId: a.accountId, alias: a.alias, status: a.connectionStatus }));
  return JSON.stringify({ accounts });
}

async function toolGetCloudTrailEvents(params: Record<string, unknown>): Promise<string> {
  const accountId = params.accountId as string;
  if (!accountId) return JSON.stringify({ error: 'accountId required' });

  const acctRecord = await docClient.send(new GetCommand({ TableName: TABLE_NAME, Key: { PK: `ACCOUNT#${accountId}`, SK: 'META' } }));
  if (!acctRecord.Item) return JSON.stringify({ error: 'Account not found' });

  try {
    const assumeResult = await stsClient.send(new AssumeRoleCommand({
      RoleArn: acctRecord.Item.roleArn as string,
      RoleSessionName: `wa-ai-ct-${accountId.substring(0, 8)}`,
      ExternalId: `wa-review-${accountId}`,
      DurationSeconds: 900,
    }));
    if (!assumeResult.Credentials) return JSON.stringify({ error: 'No credentials' });

    const { CloudTrailClient, LookupEventsCommand } = await import('@aws-sdk/client-cloudtrail');
    const ct = new CloudTrailClient({
      region: (params.region as string) || 'ap-southeast-1',
      credentials: { accessKeyId: assumeResult.Credentials.AccessKeyId!, secretAccessKey: assumeResult.Credentials.SecretAccessKey!, sessionToken: assumeResult.Credentials.SessionToken! },
    });

    const hours = (params.hours as number) || 24;
    const lookupAttrs: any[] = [];
    if (params.username) lookupAttrs.push({ AttributeKey: 'Username', AttributeValue: params.username });
    if (params.eventName) lookupAttrs.push({ AttributeKey: 'EventName', AttributeValue: params.eventName });

    const resp = await ct.send(new LookupEventsCommand({
      LookupAttributes: lookupAttrs.length > 0 ? lookupAttrs : undefined,
      StartTime: new Date(Date.now() - hours * 3600000),
      EndTime: new Date(),
      MaxResults: 30,
    }));

    const events = (resp.Events ?? []).map(e => {
      let d: any = {}; try { d = JSON.parse(e.CloudTrailEvent || '{}'); } catch {}
      return { time: e.EventTime?.toISOString(), event: e.EventName, source: e.EventSource, user: e.Username, ip: d.sourceIPAddress, error: d.errorCode || '' };
    });

    return JSON.stringify({ events, total: events.length });
  } catch (err) {
    return JSON.stringify({ error: `CloudTrail query failed: ${err instanceof Error ? err.message : err}` });
  }
}

// --- Execute Tool ---

async function executeTool(toolName: string, params: Record<string, unknown>): Promise<string> {
  switch (toolName) {
    case 'get_findings_summary': return toolGetFindingsSummary(params);
    case 'get_findings_detail': return toolGetFindingsDetail(params);
    case 'get_compliance_status': return toolGetComplianceStatus(params);
    case 'get_cost_data': return toolGetCostData();
    case 'get_cloudtrail_events': return toolGetCloudTrailEvents(params);
    case 'get_accounts': return toolGetAccounts();
    case 'propose_fix': return JSON.stringify({ status: 'PENDING_APPROVAL', ...params });
    default: return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }
}

// --- Bedrock InvokeModel with Tool Use ---

async function chatWithAI(message: string, model: string, conversationHistory: any[]): Promise<{ response: string; toolCalls: any[]; pendingActions: any[] }> {
  const { BedrockRuntimeClient, InvokeModelCommand } = await import('@aws-sdk/client-bedrock-runtime');
  const bedrock = new BedrockRuntimeClient({ region: BEDROCK_REGION });

  const modelId = MODELS[model] || MODELS[DEFAULT_MODEL];
  const allTools = [...READ_TOOLS, ...WRITE_TOOLS];
  const pendingActions: any[] = [];

  const systemPrompt = `You are WA Agent, an AI assistant for the AWS Well-Architected Review Platform. You help users understand their AWS security posture, compliance status, cost optimization opportunities, and investigate CloudTrail events.

You have access to tools to query scan findings, compliance data, cost data, CloudTrail events, and account information. Use these tools to provide accurate, data-driven answers.

When users ask you to fix or remediate issues, use the propose_fix tool to create an action proposal. NEVER execute fixes directly — always propose and wait for approval.

Guidelines:
- Answer in the same language the user uses (Thai or English)
- Be specific — reference actual resource IDs, account IDs, and findings
- For compliance questions, explain which controls failed and why
- For cost questions, provide specific dollar amounts and recommendations
- For security questions, prioritize by severity (CRITICAL first)
- When proposing fixes, explain the risk level and whether it's reversible
- Keep responses concise but actionable`;

  // Build messages
  const messages = [...conversationHistory, { role: 'user', content: message }];

  // Tool use loop (max 5 iterations)
  let finalResponse = '';
  let currentMessages = [...messages];

  for (let i = 0; i < 5; i++) {
    const isNova = modelId.includes('nova');
    const requestBody: any = {
      anthropic_version: isNova ? undefined : 'bedrock-2023-05-31',
      max_tokens: 4096,
      system: isNova ? undefined : systemPrompt,
      messages: currentMessages,
      tools: allTools.map(t => ({ name: t.name, description: t.description, input_schema: t.input_schema })),
    };

    // Nova uses different format
    if (isNova) {
      requestBody.system = [{ text: systemPrompt }];
      requestBody.inferenceConfig = { maxTokens: 4096 };
      requestBody.toolConfig = { tools: allTools.map(t => ({ toolSpec: { name: t.name, description: t.description, inputSchema: { json: t.input_schema } } })) };
      delete requestBody.tools;
      delete requestBody.anthropic_version;
    }

    const resp = await bedrock.send(new InvokeModelCommand({
      modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(requestBody),
    }));

    const result = JSON.parse(new TextDecoder().decode(resp.body));

    // Check for tool use
    const content = result.content || result.output?.message?.content || [];
    let hasToolUse = false;
    const toolResults: any[] = [];

    for (const block of content) {
      if (block.type === 'text') {
        finalResponse += block.text;
      } else if (block.type === 'tool_use') {
        hasToolUse = true;
        const toolResult = await executeTool(block.name, block.input || {});

        // If it's a propose_fix, collect as pending action
        if (block.name === 'propose_fix') {
          const action = { actionId: randomUUID(), ...block.input, status: 'PENDING_APPROVAL' };
          pendingActions.push(action);
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify({ status: 'PENDING_APPROVAL', actionId: action.actionId, message: 'Action proposed. Waiting for user approval.' }) });
        } else {
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: toolResult });
        }
      }
    }

    if (!hasToolUse || result.stop_reason === 'end_turn') break;

    // Add assistant response + tool results to conversation
    currentMessages.push({ role: 'assistant', content });
    currentMessages.push({ role: 'user', content: toolResults });
  }

  return { response: finalResponse, toolCalls: [], pendingActions };
}

// --- Fix Execution ---

async function executeFixAction(actionId: string, action: string, accountId: string, resourceId: string, region: string): Promise<{ success: boolean; message: string }> {
  // Get account credentials
  const acctRecord = await docClient.send(new GetCommand({ TableName: TABLE_NAME, Key: { PK: `ACCOUNT#${accountId}`, SK: 'META' } }));
  if (!acctRecord.Item) return { success: false, message: 'Account not found' };

  const assumeResult = await stsClient.send(new AssumeRoleCommand({
    RoleArn: acctRecord.Item.roleArn as string,
    RoleSessionName: `wa-ai-fix-${actionId.substring(0, 8)}`,
    ExternalId: `wa-review-${accountId}`,
    DurationSeconds: 900,
  }));
  if (!assumeResult.Credentials) return { success: false, message: 'AssumeRole failed' };

  const creds = {
    accessKeyId: assumeResult.Credentials.AccessKeyId!,
    secretAccessKey: assumeResult.Credentials.SecretAccessKey!,
    sessionToken: assumeResult.Credentials.SessionToken!,
  };
  const clientConfig = { region: region || 'ap-southeast-1', credentials: creds };

  try {
    switch (action) {
      case 'enable_s3_encryption': {
        const { S3Client, PutBucketEncryptionCommand } = await import('@aws-sdk/client-s3');
        await new S3Client(clientConfig).send(new PutBucketEncryptionCommand({
          Bucket: resourceId,
          ServerSideEncryptionConfiguration: { Rules: [{ ApplyServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } }] },
        }));
        return { success: true, message: `S3 bucket ${resourceId} encryption enabled (SSE-S3)` };
      }
      case 'block_s3_public': {
        const { S3Client, PutPublicAccessBlockCommand } = await import('@aws-sdk/client-s3');
        await new S3Client(clientConfig).send(new PutPublicAccessBlockCommand({
          Bucket: resourceId,
          PublicAccessBlockConfiguration: { BlockPublicAcls: true, BlockPublicPolicy: true, IgnorePublicAcls: true, RestrictPublicBuckets: true },
        }));
        return { success: true, message: `S3 bucket ${resourceId} public access blocked` };
      }
      case 'enable_s3_versioning': {
        const { S3Client, PutBucketVersioningCommand } = await import('@aws-sdk/client-s3');
        await new S3Client(clientConfig).send(new PutBucketVersioningCommand({
          Bucket: resourceId, VersioningConfiguration: { Status: 'Enabled' },
        }));
        return { success: true, message: `S3 bucket ${resourceId} versioning enabled` };
      }
      case 'enable_vpc_flowlogs': {
        const { EC2Client, CreateFlowLogsCommand } = await import('@aws-sdk/client-ec2');
        await new EC2Client(clientConfig).send(new CreateFlowLogsCommand({
          ResourceIds: [resourceId], ResourceType: 'VPC', TrafficType: 'ALL', LogDestinationType: 'cloud-watch-logs',
        }));
        return { success: true, message: `VPC ${resourceId} flow logs enabled` };
      }
      case 'enable_kms_rotation': {
        const { KMSClient, EnableKeyRotationCommand } = await import('@aws-sdk/client-kms');
        await new KMSClient(clientConfig).send(new EnableKeyRotationCommand({ KeyId: resourceId }));
        return { success: true, message: `KMS key ${resourceId} rotation enabled` };
      }
      case 'enable_cloudtrail_validation': {
        const { CloudTrailClient, UpdateTrailCommand } = await import('@aws-sdk/client-cloudtrail');
        await new CloudTrailClient(clientConfig).send(new UpdateTrailCommand({ Name: resourceId, EnableLogFileValidation: true }));
        return { success: true, message: `CloudTrail ${resourceId} log file validation enabled` };
      }
      case 'enable_cloudtrail_multiregion': {
        const { CloudTrailClient, UpdateTrailCommand } = await import('@aws-sdk/client-cloudtrail');
        await new CloudTrailClient(clientConfig).send(new UpdateTrailCommand({ Name: resourceId, IsMultiRegionTrail: true }));
        return { success: true, message: `CloudTrail ${resourceId} multi-region enabled` };
      }
      default:
        return { success: false, message: `Unknown action: ${action}` };
    }
  } catch (err) {
    return { success: false, message: `Execution failed: ${err instanceof Error ? err.message : err}` };
  }
}

// --- Endpoint Handlers ---

async function handleChat(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const authError = validateRequest(event);
  if (authError) return authError;

  if (!event.body) return jsonResponse(400, { message: 'Request body required' });
  let body: Record<string, unknown>;
  try { body = JSON.parse(event.body); } catch { return jsonResponse(400, { message: 'Invalid JSON' }); }

  const message = body.message as string;
  if (!message) return jsonResponse(400, { message: 'message is required' });

  const model = (body.model as string) || DEFAULT_MODEL;
  const history = (body.history as any[]) || [];

  try {
    const result = await chatWithAI(message, model, history);

    return jsonResponse(200, {
      response: result.response,
      pendingActions: result.pendingActions,
      model,
    });
  } catch (err) {
    console.error('AI chat error:', err);
    return jsonResponse(500, { message: `AI error: ${err instanceof Error ? err.message : err}` });
  }
}

async function handleExecute(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const authError = validateRequest(event);
  if (authError) return authError;

  const claims = extractClaims(event);
  const userRole = extractUserRole(claims);
  if (!checkAuthorization(userRole, '/scans', 'POST')) {
    return jsonResponse(403, { message: 'Forbidden: Admin role required to execute fixes' });
  }

  if (!event.body) return jsonResponse(400, { message: 'Request body required' });
  let body: Record<string, unknown>;
  try { body = JSON.parse(event.body); } catch { return jsonResponse(400, { message: 'Invalid JSON' }); }

  const actionId = body.actionId as string;
  const action = body.action as string;
  const accountId = body.accountId as string;
  const resourceId = body.resourceId as string;
  const region = (body.region as string) || 'ap-southeast-1';

  if (!action || !accountId || !resourceId) {
    return jsonResponse(400, { message: 'action, accountId, resourceId are required' });
  }

  // Audit log
  const callerEmail = (claims['email'] as string) ?? 'unknown';
  console.log(JSON.stringify({ audit: true, timestamp: new Date().toISOString(), action: 'AI_FIX_EXECUTE', callerEmail, detail: { actionId, action, accountId, resourceId, region } }));

  const result = await executeFixAction(actionId || randomUUID(), action, accountId, resourceId, region);

  return jsonResponse(200, { ...result, actionId, action, accountId, resourceId });
}

// --- Router ---

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const method = event.httpMethod;
    const resource = event.resource ?? '';

    if (method === 'POST' && resource === '/ai/chat') return await handleChat(event);
    if (method === 'POST' && resource === '/ai/execute') return await handleExecute(event);

    return jsonResponse(404, { message: 'Not found' });
  } catch (error) {
    console.error('AI handler error:', error);
    return jsonResponse(500, { message: 'Internal server error' });
  }
}
