"""CloudFront check evaluation functions.

Each function takes a ResourceData object and returns True if the resource
PASSES the check (is compliant), or False if it FAILS (non-compliant).
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from core.models import ResourceData


def check_https_enforced(resource: ResourceData) -> bool:
    """Check that the CloudFront distribution enforces HTTPS for viewers.

    Returns True (pass) if the default cache behavior's viewer protocol
    policy is 'redirect-to-https' or 'https-only'.
    'allow-all' means HTTP is allowed, which fails the check.
    """
    config = resource.configuration

    # Direct field
    viewer_policy = config.get("viewer_protocol_policy", "")
    if viewer_policy:
        return viewer_policy.lower() in ("redirect-to-https", "https-only")

    # Nested structure from GetDistribution
    default_behavior = config.get("default_cache_behavior", {})
    if isinstance(default_behavior, dict):
        policy = default_behavior.get("viewer_protocol_policy", "")
        return policy.lower() in ("redirect-to-https", "https-only")

    return False


def check_waf_associated(resource: ResourceData) -> bool:
    """Check that the CloudFront distribution has a WAF web ACL associated.

    Returns True (pass) if 'web_acl_id' or 'web_acl_arn' is set to a
    non-empty value.
    """
    config = resource.configuration

    if config.get("web_acl_id"):
        return True

    if config.get("web_acl_arn"):
        return True

    return False
