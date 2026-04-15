"""EKS check evaluation functions.

Each function takes a ResourceData object and returns True if the resource
PASSES the check (is compliant), or False if it FAILS (non-compliant).
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from core.models import ResourceData


def check_control_plane_logging(resource: ResourceData) -> bool:
    """Check that control plane logging is enabled on the EKS cluster.

    Returns True (pass) if at least one log type is enabled in the
    cluster's logging configuration.
    """
    config = resource.configuration

    if config.get("control_plane_logging_enabled") is True:
        return True

    # Nested structure from DescribeCluster
    logging_config = config.get("logging", {})
    if isinstance(logging_config, dict):
        cluster_logging = logging_config.get("cluster_logging", [])
        if isinstance(cluster_logging, list):
            for log_group in cluster_logging:
                if isinstance(log_group, dict):
                    if log_group.get("enabled") is True:
                        types = log_group.get("types", [])
                        if isinstance(types, list) and len(types) > 0:
                            return True

    return False


def check_public_endpoint_disabled(resource: ResourceData) -> bool:
    """Check that the EKS cluster does not have public endpoint access enabled.

    Returns True (pass) if public endpoint access is disabled.
    Expects 'endpoint_public_access' boolean or nested
    'resources_vpc_config.endpoint_public_access'.
    """
    config = resource.configuration

    # Direct boolean field
    public_access = config.get("endpoint_public_access")
    if public_access is not None:
        return not bool(public_access)

    # Nested structure from DescribeCluster
    vpc_config = config.get("resources_vpc_config", {})
    if isinstance(vpc_config, dict):
        public_access = vpc_config.get("endpoint_public_access")
        if public_access is not None:
            return not bool(public_access)

    # If no info available, assume public (fail safe)
    return False
