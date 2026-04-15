"""DynamoDB check evaluation functions.

Each function takes a ResourceData object and returns True if the resource
PASSES the check (is compliant), or False if it FAILS (non-compliant).
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from core.models import ResourceData


def check_pitr_enabled(resource: ResourceData) -> bool:
    """Check that Point-in-Time Recovery is enabled on the DynamoDB table.

    Returns True (pass) if 'point_in_time_recovery_enabled' is True or
    'continuous_backups.point_in_time_recovery_description.point_in_time_recovery_status'
    is 'ENABLED'.
    """
    config = resource.configuration

    if config.get("point_in_time_recovery_enabled") is True:
        return True

    # Nested structure from DescribeContinuousBackups
    continuous = config.get("continuous_backups", {})
    if isinstance(continuous, dict):
        pitr = continuous.get("point_in_time_recovery_description", {})
        if isinstance(pitr, dict):
            status = pitr.get("point_in_time_recovery_status", "")
            if status.upper() == "ENABLED":
                return True

    return False


def check_kms_encryption(resource: ResourceData) -> bool:
    """Check that the DynamoDB table is encrypted with a customer-managed KMS key.

    Returns True (pass) if 'sse_description.sse_type' is 'KMS' or
    'kms_key_arn' is set to a customer-managed key ARN.
    Default AWS owned encryption does not count as a pass.
    """
    config = resource.configuration

    # Direct KMS key ARN
    kms_key = config.get("kms_key_arn", "")
    if kms_key:
        return True

    # SSE description from DescribeTable
    sse = config.get("sse_description", {})
    if isinstance(sse, dict):
        sse_type = sse.get("sse_type", "")
        if sse_type.upper() == "KMS":
            return True

    return False
