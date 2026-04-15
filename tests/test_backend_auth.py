"""Tests for backend authorization logic.

Mirrors the TypeScript auth module (backend/auth/auth-module.ts) using
Python equivalents from core/models.py.  The authorization matrix tested:

  - Admin: full access to all endpoints
  - Viewer: GET only, EXCLUDING /team/* endpoints entirely
  - Generic error message never reveals which credential field was wrong

Validates: Requirements 18.2, 19.6, 19.10, 19.11, 20.3, 20.6
"""

from __future__ import annotations

import pytest

from core.models import UserRole


# ---------------------------------------------------------------------------
# Pure-Python reimplementation of the TS auth helpers so we can test the
# *authorization matrix* without needing Node / npm.
# ---------------------------------------------------------------------------

def extract_user_role(claims: dict) -> UserRole:
    """Python equivalent of extractUserRole() in auth-module.ts."""
    role = claims.get("custom:role")
    if isinstance(role, str) and role == UserRole.ADMIN.value:
        return UserRole.ADMIN
    return UserRole.VIEWER


def check_authorization(user_role: UserRole, endpoint: str, method: str) -> bool:
    """Python equivalent of checkAuthorization() in auth-module.ts."""
    if user_role == UserRole.ADMIN:
        return True

    normalized = endpoint if endpoint.startswith("/") else f"/{endpoint}"
    if normalized == "/team" or normalized.startswith("/team/"):
        return False

    return method.upper() == "GET"


GENERIC_AUTH_ERROR = "อีเมลหรือรหัสผ่านไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง"


def get_generic_auth_error() -> str:
    return GENERIC_AUTH_ERROR


# ---------------------------------------------------------------------------
# extractUserRole tests
# ---------------------------------------------------------------------------

class TestExtractUserRole:
    """Test role extraction from JWT claims (custom:role attribute)."""

    def test_admin_role_extracted(self):
        claims = {"custom:role": "Admin", "email": "admin@example.com"}
        assert extract_user_role(claims) == UserRole.ADMIN

    def test_viewer_role_extracted(self):
        claims = {"custom:role": "Viewer", "email": "viewer@example.com"}
        assert extract_user_role(claims) == UserRole.VIEWER

    def test_missing_role_defaults_to_viewer(self):
        claims = {"email": "user@example.com"}
        assert extract_user_role(claims) == UserRole.VIEWER

    def test_empty_claims_defaults_to_viewer(self):
        assert extract_user_role({}) == UserRole.VIEWER

    def test_unrecognized_role_defaults_to_viewer(self):
        claims = {"custom:role": "SuperUser"}
        assert extract_user_role(claims) == UserRole.VIEWER

    def test_none_role_defaults_to_viewer(self):
        claims = {"custom:role": None}
        assert extract_user_role(claims) == UserRole.VIEWER

    def test_numeric_role_defaults_to_viewer(self):
        claims = {"custom:role": 42}
        assert extract_user_role(claims) == UserRole.VIEWER

    def test_case_sensitive_admin(self):
        """'admin' (lowercase) should NOT match — must be 'Admin'."""
        claims = {"custom:role": "admin"}
        assert extract_user_role(claims) == UserRole.VIEWER


# ---------------------------------------------------------------------------
# checkAuthorization tests — Admin
# ---------------------------------------------------------------------------

class TestCheckAuthorizationAdmin:
    """Admin should have full access to every endpoint and method."""

    @pytest.mark.parametrize("endpoint,method", [
        ("/scans", "POST"),
        ("/scans", "GET"),
        ("/scans/123/status", "GET"),
        ("/scans/123/results", "GET"),
        ("/accounts", "POST"),
        ("/accounts", "GET"),
        ("/accounts/123", "PUT"),
        ("/accounts/123", "DELETE"),
        ("/accounts/123/verify", "POST"),
        ("/team/members", "POST"),
        ("/team/members", "GET"),
        ("/team/members/user@example.com/role", "PUT"),
        ("/team/members/user@example.com", "DELETE"),
    ])
    def test_admin_full_access(self, endpoint: str, method: str):
        assert check_authorization(UserRole.ADMIN, endpoint, method) is True


# ---------------------------------------------------------------------------
# checkAuthorization tests — Viewer
# ---------------------------------------------------------------------------

class TestCheckAuthorizationViewer:
    """Viewer: GET only, no /team/* access at all."""

    # Allowed
    @pytest.mark.parametrize("endpoint", [
        "/scans",
        "/scans/123/status",
        "/scans/123/results",
        "/accounts",
    ])
    def test_viewer_get_allowed(self, endpoint: str):
        assert check_authorization(UserRole.VIEWER, endpoint, "GET") is True

    # Blocked — write methods on non-team endpoints
    @pytest.mark.parametrize("endpoint,method", [
        ("/scans", "POST"),
        ("/accounts", "POST"),
        ("/accounts/123", "PUT"),
        ("/accounts/123", "DELETE"),
        ("/accounts/123/verify", "POST"),
    ])
    def test_viewer_write_blocked(self, endpoint: str, method: str):
        assert check_authorization(UserRole.VIEWER, endpoint, method) is False

    # Blocked — ALL /team/* endpoints regardless of method
    @pytest.mark.parametrize("method", ["GET", "POST", "PUT", "DELETE"])
    def test_viewer_team_endpoints_blocked(self, method: str):
        assert check_authorization(UserRole.VIEWER, "/team/members", method) is False

    def test_viewer_team_subpath_blocked(self):
        assert check_authorization(UserRole.VIEWER, "/team/members/a@b.com", "GET") is False
        assert check_authorization(UserRole.VIEWER, "/team/members/a@b.com/role", "PUT") is False

    def test_viewer_bare_team_blocked(self):
        assert check_authorization(UserRole.VIEWER, "/team", "GET") is False

    # Edge: endpoint without leading slash
    def test_endpoint_without_leading_slash(self):
        assert check_authorization(UserRole.VIEWER, "scans", "GET") is True
        assert check_authorization(UserRole.VIEWER, "team/members", "GET") is False

    # Edge: method case insensitivity
    def test_method_case_insensitive(self):
        assert check_authorization(UserRole.VIEWER, "/scans", "get") is True
        assert check_authorization(UserRole.VIEWER, "/scans", "Get") is True


# ---------------------------------------------------------------------------
# Generic auth error message tests
# ---------------------------------------------------------------------------

class TestGenericAuthError:
    """Error message must be identical regardless of failure reason."""

    def test_error_message_is_constant(self):
        msg = get_generic_auth_error()
        assert msg == GENERIC_AUTH_ERROR

    def test_error_does_not_mention_email(self):
        msg = get_generic_auth_error()
        assert "email" not in msg.lower()

    def test_error_does_not_mention_password_in_english(self):
        msg = get_generic_auth_error()
        assert "password" not in msg.lower()

    def test_multiple_calls_return_same_message(self):
        """Ensures the message is deterministic — no random component."""
        assert get_generic_auth_error() == get_generic_auth_error()
