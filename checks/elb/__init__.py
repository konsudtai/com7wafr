"""ELB check evaluation functions.

Each function takes a ResourceData object and returns True if the resource
PASSES the check (is compliant), or False if it FAILS (non-compliant).
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from core.models import ResourceData


def check_access_logging_enabled(resource: ResourceData) -> bool:
    """Check that access logging is enabled on the load balancer.

    Returns True (pass) if 'access_logging_enabled' is True or
    the 'access_log' attribute has 'enabled' set to True.
    """
    config = resource.configuration

    if config.get("access_logging_enabled") is True:
        return True

    # ALB/NLB attributes structure
    access_log = config.get("access_log", {})
    if isinstance(access_log, dict):
        return bool(access_log.get("enabled", False))

    # Flat attributes from DescribeLoadBalancerAttributes
    attributes = config.get("attributes", {})
    if isinstance(attributes, dict):
        return attributes.get("access_logs.s3.enabled", "false").lower() == "true"

    return False


def check_https_listener(resource: ResourceData) -> bool:
    """Check that the load balancer has at least one HTTPS listener.

    Returns True (pass) if any listener uses HTTPS (port 443) or TLS protocol.
    Expects 'listeners' list with 'protocol' and/or 'port' fields.
    """
    config = resource.configuration

    if config.get("has_https_listener") is True:
        return True

    listeners = config.get("listeners", [])
    if isinstance(listeners, list):
        for listener in listeners:
            if isinstance(listener, dict):
                protocol = listener.get("protocol", "").upper()
                if protocol in ("HTTPS", "TLS"):
                    return True
                port = listener.get("port")
                if port == 443:
                    return True

    return False
