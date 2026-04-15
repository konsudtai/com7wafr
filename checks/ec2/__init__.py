"""EC2 check evaluation functions.

Each function takes a ResourceData object and returns True if the resource
PASSES the check (is compliant), or False if it FAILS (non-compliant).
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from core.models import ResourceData


def check_unrestricted_ssh(resource: ResourceData) -> bool:
    """Check that the EC2 instance does not have unrestricted SSH access.

    Returns True (pass) if no security group rule allows 0.0.0.0/0 on port 22.
    Expects configuration to contain a 'security_groups' list, where each group
    has an 'ip_permissions' list of rules with 'from_port', 'to_port', and
    'ip_ranges' (list of dicts with 'cidr_ip').
    """
    config = resource.configuration
    security_groups = config.get("security_groups", [])

    for sg in security_groups:
        for rule in sg.get("ip_permissions", []):
            from_port = rule.get("from_port", 0)
            to_port = rule.get("to_port", 0)

            # Check if port 22 is within the rule's port range
            if from_port <= 22 <= to_port:
                for ip_range in rule.get("ip_ranges", []):
                    cidr = ip_range.get("cidr_ip", "")
                    if cidr == "0.0.0.0/0":
                        return False

                for ipv6_range in rule.get("ipv6_ranges", []):
                    cidr = ipv6_range.get("cidr_ipv6", "")
                    if cidr == "::/0":
                        return False

    return True


def check_ebs_encryption(resource: ResourceData) -> bool:
    """Check that all EBS volumes attached to the instance are encrypted.

    Returns True (pass) if all volumes in 'block_device_mappings' have
    'encrypted' set to True, or if no volumes are present.
    """
    config = resource.configuration
    mappings = config.get("block_device_mappings", [])

    if not mappings:
        # No block devices info available — cannot confirm encryption
        return True

    for mapping in mappings:
        ebs = mapping.get("ebs", {})
        if not ebs.get("encrypted", False):
            return False

    return True


def check_detailed_monitoring(resource: ResourceData) -> bool:
    """Check that detailed monitoring is enabled on the instance.

    Returns True (pass) if 'monitoring_enabled' is True or
    'monitoring.state' is 'enabled'.
    """
    config = resource.configuration

    # Direct flag
    if config.get("monitoring_enabled") is True:
        return True

    # Nested structure from describe-instances
    monitoring = config.get("monitoring", {})
    if isinstance(monitoring, dict):
        return monitoring.get("state", "").lower() == "enabled"

    # Boolean shorthand
    if monitoring is True:
        return True

    return False


def check_underutilized_instance(resource: ResourceData) -> bool:
    """Check that the instance is not underutilized.

    Returns True (pass) if average CPU utilization is above 10%.
    Expects 'cpu_utilization_avg' in configuration (float, 0-100).
    If metric is not available, passes by default.
    """
    config = resource.configuration
    cpu_avg = config.get("cpu_utilization_avg")

    if cpu_avg is None:
        return True

    try:
        return float(cpu_avg) > 10.0
    except (TypeError, ValueError):
        return True


def check_backup_configured(resource: ResourceData) -> bool:
    """Check that the instance has backup or recovery configured.

    Returns True (pass) if any of these are present:
    - 'auto_scaling_group' is set
    - 'backup_plan_id' is set
    - 'has_backup' is True
    """
    config = resource.configuration

    if config.get("auto_scaling_group"):
        return True
    if config.get("backup_plan_id"):
        return True
    if config.get("has_backup") is True:
        return True

    return False
