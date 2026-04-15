"""RDS check evaluation functions.

Each function takes a ResourceData object and returns True if the resource
PASSES the check (is compliant), or False if it FAILS (non-compliant).
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from core.models import ResourceData


def check_multi_az_enabled(resource: ResourceData) -> bool:
    """Check that the RDS instance has Multi-AZ deployment enabled.

    Returns True (pass) if 'multi_az' is True.
    """
    config = resource.configuration
    return bool(config.get("multi_az", False))


def check_encryption_at_rest(resource: ResourceData) -> bool:
    """Check that the RDS instance has encryption at rest enabled.

    Returns True (pass) if 'storage_encrypted' is True.
    """
    config = resource.configuration
    return bool(config.get("storage_encrypted", False))


def check_automated_backups(resource: ResourceData) -> bool:
    """Check that the RDS instance has automated backups enabled.

    Returns True (pass) if 'backup_retention_period' is greater than 0.
    A retention period of 0 means automated backups are disabled.
    """
    config = resource.configuration
    retention = config.get("backup_retention_period")

    if retention is None:
        return False

    try:
        return int(retention) > 0
    except (TypeError, ValueError):
        return False
