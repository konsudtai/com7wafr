/**
 * Auth Module — Cognito auth helpers, role extraction, authorization checks
 *
 * Responsibilities:
 * - Extract UserRole from JWT claims (custom:role attribute)
 * - Check authorization based on role (Admin: full access, Viewer: GET only except /team/*)
 * - Return generic auth error messages (never reveal which field was wrong)
 */

export enum UserRole {
  ADMIN = 'Admin',
  VIEWER = 'Viewer',
}

/**
 * Extract UserRole from JWT token claims.
 * Looks for the `custom:role` attribute in the claims object.
 * Defaults to Viewer if the attribute is missing or unrecognized.
 */
export function extractUserRole(claims: Record<string, unknown>): UserRole {
  const role = claims['custom:role'];
  if (typeof role === 'string' && role === UserRole.ADMIN) {
    return UserRole.ADMIN;
  }
  return UserRole.VIEWER;
}

/**
 * Check if a user role has permission to access the given endpoint with the given HTTP method.
 *
 * Authorization matrix:
 * - Admin: full access to all endpoints
 * - Viewer: GET methods only, EXCLUDING /team/* endpoints entirely
 */
export function checkAuthorization(
  userRole: UserRole,
  endpoint: string,
  method: string,
): boolean {
  if (userRole === UserRole.ADMIN) {
    return true;
  }

  // Viewer: block all /team/* endpoints regardless of method
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  if (normalizedEndpoint === '/team' || normalizedEndpoint.startsWith('/team/')) {
    return false;
  }

  // Viewer: allow GET only
  return method.toUpperCase() === 'GET';
}

/**
 * Return a generic authentication error message.
 * MUST NOT reveal whether email or password was incorrect.
 */
export function getGenericAuthError(): string {
  return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง';
}
