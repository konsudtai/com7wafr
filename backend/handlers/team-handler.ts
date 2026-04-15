/**
 * Team Handler — CRUD /team/members endpoints + TeamManager
 *
 * Endpoints:
 * - POST   /team/members              — Add new team member (Admin only)
 * - GET    /team/members              — List all team members (Admin only)
 * - PUT    /team/members/{email}/role — Update member role (Admin only)
 * - DELETE /team/members/{email}      — Remove team member (Admin only)
 *
 * Team member data lives in Cognito User Pool (not DynamoDB).
 * Uses @aws-sdk/client-cognito-identity-provider for all Cognito operations.
 *
 * Environment variables: USER_POOL_ID
 */

import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminUserGlobalSignOutCommand,
  AdminUpdateUserAttributesCommand,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { extractUserRole, checkAuthorization, UserRole } from '../auth/auth-module';

const USER_POOL_ID = process.env.USER_POOL_ID ?? '';

const cognitoClient = new CognitoIdentityProviderClient({});

// --- Types ---

interface TeamMember {
  email: string;
  role: string;
  status: string;
  joinedAt: string;
}

// --- Helpers ---

function jsonResponse(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
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

function extractEmailFromPath(event: APIGatewayProxyEvent): string | undefined {
  const email = event.pathParameters?.email;
  if (!email) return undefined;
  return decodeURIComponent(email);
}

// --- TeamManager ---

/**
 * List all users from Cognito User Pool and map to TeamMember objects.
 */
async function listCognitoUsers(): Promise<TeamMember[]> {
  const members: TeamMember[] = [];
  let paginationToken: string | undefined;

  do {
    const result = await cognitoClient.send(
      new ListUsersCommand({
        UserPoolId: USER_POOL_ID,
        PaginationToken: paginationToken,
      }),
    );

    for (const user of result.Users ?? []) {
      const attrs = user.Attributes ?? [];
      const email = attrs.find((a) => a.Name === 'email')?.Value ?? '';
      const role = attrs.find((a) => a.Name === 'custom:role')?.Value ?? UserRole.VIEWER;

      let status = 'ACTIVE';
      if (user.UserStatus === 'FORCE_CHANGE_PASSWORD') {
        status = 'INVITED';
      } else if (user.UserStatus === 'CONFIRMED') {
        status = 'ACTIVE';
      } else {
        status = user.UserStatus ?? 'UNKNOWN';
      }

      members.push({
        email,
        role,
        status,
        joinedAt: user.UserCreateDate?.toISOString() ?? '',
      });
    }

    paginationToken = result.PaginationToken;
  } while (paginationToken);

  return members;
}

/**
 * Count the number of Admin users in the pool, optionally excluding a given email.
 */
async function countAdmins(excludeEmail?: string): Promise<number> {
  const members = await listCognitoUsers();
  return members.filter(
    (m) => m.role === UserRole.ADMIN && m.email !== excludeEmail,
  ).length;
}

// --- Endpoint Handlers ---

/**
 * POST /team/members — Add new team member (Admin only).
 * Creates user in Cognito with temporary password and custom:role.
 * Cognito sends the invitation email automatically.
 * Body: { email, role }
 */
async function addMember(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const authError = validateRequest(event);
  if (authError) return authError;

  const claims = extractClaims(event);
  const userRole = extractUserRole(claims);

  if (!checkAuthorization(userRole, '/team/members', 'POST')) {
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

  const email = body.email as string | undefined;
  const role = body.role as string | undefined;

  if (!email || !role) {
    return jsonResponse(400, { message: 'Missing required fields: email, role' });
  }

  if (role !== UserRole.ADMIN && role !== UserRole.VIEWER) {
    return jsonResponse(400, { message: 'Invalid role: must be Admin or Viewer' });
  }

  try {
    await cognitoClient.send(
      new AdminCreateUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: email,
        UserAttributes: [
          { Name: 'email', Value: email },
          { Name: 'email_verified', Value: 'true' },
          { Name: 'custom:role', Value: role },
        ],
        DesiredDeliveryMediums: ['EMAIL'],
        // Do NOT set MessageAction to SUPPRESS — let Cognito send invitation email
      }),
    );
  } catch (err) {
    const error = err as Error & { name?: string };
    if (error.name === 'UsernameExistsException') {
      return jsonResponse(409, { message: `User ${email} already exists` });
    }
    console.error('Cognito AdminCreateUser error:', error);
    return jsonResponse(500, { message: 'Failed to create user' });
  }

  auditLog('ADD_MEMBER', email, (claims['email'] as string) ?? 'unknown', { role });

  return jsonResponse(201, {
    message: `Member ${email} added successfully with role ${role}`,
    member: { email, role, status: 'INVITED', joinedAt: new Date().toISOString() },
  });
}

/**
 * DELETE /team/members/{email} — Remove team member (Admin only).
 * Deletes user from Cognito and revokes all active sessions.
 * Prevents self-deletion and last admin deletion.
 */
async function removeMember(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const authError = validateRequest(event);
  if (authError) return authError;

  const claims = extractClaims(event);
  const userRole = extractUserRole(claims);

  if (!checkAuthorization(userRole, '/team/members', 'DELETE')) {
    return jsonResponse(403, { message: 'Forbidden: Admin role required' });
  }

  const targetEmail = extractEmailFromPath(event);
  if (!targetEmail) {
    return jsonResponse(400, { message: 'Missing email in path' });
  }

  // Prevent self-deletion
  const callerEmail = claims['email'] as string | undefined;
  if (callerEmail && callerEmail === targetEmail) {
    return jsonResponse(400, { message: 'ไม่สามารถลบตัวเองได้' });
  }

  // Check if target is an Admin and would leave zero Admins
  const members = await listCognitoUsers();
  const targetMember = members.find((m) => m.email === targetEmail);
  if (!targetMember) {
    return jsonResponse(404, { message: `Member ${targetEmail} not found` });
  }

  if (targetMember.role === UserRole.ADMIN) {
    const adminCount = members.filter((m) => m.role === UserRole.ADMIN).length;
    if (adminCount <= 1) {
      return jsonResponse(400, {
        message: 'ต้องมี Admin อย่างน้อย 1 คนในระบบ',
      });
    }
  }

  try {
    // Revoke all active sessions first
    try {
      await cognitoClient.send(
        new AdminUserGlobalSignOutCommand({
          UserPoolId: USER_POOL_ID,
          Username: targetEmail,
        }),
      );
    } catch {
      // Sign-out may fail if user never signed in — continue with deletion
    }

    // Delete the user
    await cognitoClient.send(
      new AdminDeleteUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: targetEmail,
      }),
    );
  } catch (err) {
    const error = err as Error & { name?: string };
    if (error.name === 'UserNotFoundException') {
      return jsonResponse(404, { message: `Member ${targetEmail} not found` });
    }
    console.error('Cognito AdminDeleteUser error:', error);
    return jsonResponse(500, { message: 'Failed to remove member' });
  }

  auditLog('REMOVE_MEMBER', targetEmail, (claims['email'] as string) ?? 'unknown');

  return jsonResponse(200, { message: `Member ${targetEmail} removed successfully` });
}

/**
 * PUT /team/members/{email}/role — Update member role (Admin only).
 * Changes custom:role attribute in Cognito.
 * Prevents changing the last Admin to Viewer.
 * Body: { role }
 */
async function updateMemberRole(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const authError = validateRequest(event);
  if (authError) return authError;

  const claims = extractClaims(event);
  const userRole = extractUserRole(claims);

  if (!checkAuthorization(userRole, '/team/members', 'PUT')) {
    return jsonResponse(403, { message: 'Forbidden: Admin role required' });
  }

  const targetEmail = extractEmailFromPath(event);
  if (!targetEmail) {
    return jsonResponse(400, { message: 'Missing email in path' });
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

  const newRole = body.role as string | undefined;
  if (!newRole || (newRole !== UserRole.ADMIN && newRole !== UserRole.VIEWER)) {
    return jsonResponse(400, { message: 'Invalid role: must be Admin or Viewer' });
  }

  // Check current member exists and get their current role
  const members = await listCognitoUsers();
  const targetMember = members.find((m) => m.email === targetEmail);
  if (!targetMember) {
    return jsonResponse(404, { message: `Member ${targetEmail} not found` });
  }

  // Prevent changing the last Admin to Viewer
  if (targetMember.role === UserRole.ADMIN && newRole === UserRole.VIEWER) {
    const adminCount = members.filter((m) => m.role === UserRole.ADMIN).length;
    if (adminCount <= 1) {
      return jsonResponse(400, {
        message: 'ต้องมี Admin อย่างน้อย 1 คนในระบบ',
      });
    }
  }

  try {
    await cognitoClient.send(
      new AdminUpdateUserAttributesCommand({
        UserPoolId: USER_POOL_ID,
        Username: targetEmail,
        UserAttributes: [{ Name: 'custom:role', Value: newRole }],
      }),
    );
  } catch (err) {
    const error = err as Error & { name?: string };
    if (error.name === 'UserNotFoundException') {
      return jsonResponse(404, { message: `Member ${targetEmail} not found` });
    }
    console.error('Cognito AdminUpdateUserAttributes error:', error);
    return jsonResponse(500, { message: 'Failed to update member role' });
  }

  auditLog('UPDATE_MEMBER_ROLE', targetEmail, (claims['email'] as string) ?? 'unknown', { newRole, previousRole: targetMember.role });

  return jsonResponse(200, {
    message: `Member ${targetEmail} role updated to ${newRole}`,
    member: { ...targetMember, role: newRole },
  });
}

/**
 * GET /team/members — List all team members (Admin only).
 * Returns email, role, status, and join date for each member.
 */
async function listMembers(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const authError = validateRequest(event);
  if (authError) return authError;

  const claims = extractClaims(event);
  const userRole = extractUserRole(claims);

  if (!checkAuthorization(userRole, '/team/members', 'GET')) {
    return jsonResponse(403, { message: 'Forbidden: Admin role required' });
  }

  try {
    const members = await listCognitoUsers();
    return jsonResponse(200, { members });
  } catch (err) {
    console.error('Cognito ListUsers error:', err);
    return jsonResponse(500, { message: 'Failed to list members' });
  }
}

// --- Router ---

function resolveRoute(event: APIGatewayProxyEvent): string {
  const method = event.httpMethod;
  const resource = event.resource ?? '';

  if (method === 'POST' && resource === '/team/members') return 'ADD_MEMBER';
  if (method === 'GET' && resource === '/team/members') return 'LIST_MEMBERS';
  if (method === 'PUT' && resource === '/team/members/{email}/role') return 'UPDATE_ROLE';
  if (method === 'DELETE' && resource === '/team/members/{email}') return 'REMOVE_MEMBER';

  return 'UNKNOWN';
}

/**
 * Lambda entry point — routes API Gateway proxy events to the correct handler.
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const route = resolveRoute(event);

    switch (route) {
      case 'ADD_MEMBER':
        return await addMember(event);
      case 'LIST_MEMBERS':
        return await listMembers(event);
      case 'UPDATE_ROLE':
        return await updateMemberRole(event);
      case 'REMOVE_MEMBER':
        return await removeMember(event);
      default:
        return jsonResponse(404, { message: 'Not found' });
    }
  } catch (error) {
    console.error('Team handler error:', error);
    return jsonResponse(500, { message: 'Internal server error' });
  }
}
