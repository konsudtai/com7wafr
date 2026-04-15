"""IAM check evaluation functions.

Each function takes a ResourceData object and returns True if the resource
PASSES the check (is compliant), or False if it FAILS (non-compliant).
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from core.models import ResourceData


def check_root_access_keys(resource: ResourceData) -> bool:
    """Check that the root account does not have active access keys.

    Returns True (pass) if no active access keys exist for the root account.
    Expects configuration to contain 'access_keys' list with 'status' field,
    or a boolean 'has_access_keys'.
    """
    config = resource.configuration

    # Direct boolean flag
    if config.get("has_access_keys") is True:
        return False

    # List of access keys with status
    access_keys = config.get("access_keys", [])
    if isinstance(access_keys, list):
        for key in access_keys:
            if isinstance(key, dict) and key.get("status", "").lower() == "active":
                return False

    return True


def check_user_inline_policy(resource: ResourceData) -> bool:
    """Check that the IAM user does not have inline policies.

    Returns True (pass) if the user has no inline policies attached.
    Expects configuration to contain 'inline_policies' list or
    'inline_policy_count' integer.
    """
    config = resource.configuration

    # Count-based check
    count = config.get("inline_policy_count")
    if count is not None:
        try:
            return int(count) == 0
        except (TypeError, ValueError):
            pass

    # List-based check
    policies = config.get("inline_policies", [])
    if isinstance(policies, list):
        return len(policies) == 0

    return True


def check_mfa_enabled(resource: ResourceData) -> bool:
    """Check that MFA is enabled for IAM users with console access.

    Returns True (pass) if:
    - The user does not have console access (password not set), OR
    - The user has MFA enabled.
    Expects configuration to contain 'has_console_password' and 'mfa_active'
    or 'mfa_devices' list.
    """
    config = resource.configuration

    # If user has no console access, MFA is not required
    has_console = config.get("has_console_password", False)
    if not has_console:
        return True

    # Check MFA status
    if config.get("mfa_active") is True:
        return True

    # Check MFA devices list
    mfa_devices = config.get("mfa_devices", [])
    if isinstance(mfa_devices, list) and len(mfa_devices) > 0:
        return True

    return False
