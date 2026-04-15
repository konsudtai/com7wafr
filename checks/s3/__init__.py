"""S3 check evaluation functions.

Each function takes a ResourceData object and returns True if the resource
PASSES the check (is compliant), or False if it FAILS (non-compliant).
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from core.models import ResourceData


def check_public_access_blocked(resource: ResourceData) -> bool:
    """Check that S3 Block Public Access is fully enabled.

    Returns True (pass) if all four block public access settings are True:
    - block_public_acls
    - ignore_public_acls
    - block_public_policy
    - restrict_public_buckets
    """
    config = resource.configuration
    public_access = config.get("public_access_block", {})

    if not isinstance(public_access, dict):
        return False

    required_settings = [
        "block_public_acls",
        "ignore_public_acls",
        "block_public_policy",
        "restrict_public_buckets",
    ]

    return all(public_access.get(setting, False) for setting in required_settings)


def check_encryption_enabled(resource: ResourceData) -> bool:
    """Check that default encryption is enabled on the bucket.

    Returns True (pass) if 'encryption_enabled' is True or
    'server_side_encryption' configuration is present with a valid algorithm.
    """
    config = resource.configuration

    if config.get("encryption_enabled") is True:
        return True

    sse_config = config.get("server_side_encryption", {})
    if isinstance(sse_config, dict):
        algorithm = sse_config.get("algorithm", "")
        if algorithm in ("AES256", "aws:kms", "aws:kms:dsse"):
            return True

    # Check nested rules structure from GetBucketEncryption
    rules = config.get("encryption_rules", [])
    if isinstance(rules, list):
        for rule in rules:
            default_encryption = rule.get("apply_server_side_encryption_by_default", {})
            if default_encryption.get("sse_algorithm"):
                return True

    return False


def check_versioning_enabled(resource: ResourceData) -> bool:
    """Check that versioning is enabled on the bucket.

    Returns True (pass) if 'versioning' is 'Enabled' or
    'versioning_enabled' is True.
    """
    config = resource.configuration

    if config.get("versioning_enabled") is True:
        return True

    versioning = config.get("versioning", "")
    if isinstance(versioning, str):
        return versioning.lower() == "enabled"

    if isinstance(versioning, dict):
        return versioning.get("status", "").lower() == "enabled"

    return bool(versioning)


def check_logging_enabled(resource: ResourceData) -> bool:
    """Check that server access logging is enabled on the bucket.

    Returns True (pass) if 'logging_enabled' is True or
    'logging' configuration has a 'target_bucket' set.
    """
    config = resource.configuration

    if config.get("logging_enabled") is True:
        return True

    logging_config = config.get("logging", {})
    if isinstance(logging_config, dict):
        return bool(logging_config.get("target_bucket"))

    return bool(logging_config)


def check_lifecycle_policy(resource: ResourceData) -> bool:
    """Check that a lifecycle policy is configured on the bucket.

    Returns True (pass) if 'lifecycle_rules' is a non-empty list or
    'lifecycle_configured' is True.
    """
    config = resource.configuration

    if config.get("lifecycle_configured") is True:
        return True

    rules = config.get("lifecycle_rules", [])
    if isinstance(rules, list) and len(rules) > 0:
        return True

    return False
