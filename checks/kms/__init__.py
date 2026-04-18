"""KMS checks for Well-Architected Review."""


def check_key_rotation(resource):
    """Returns True if PASSES — KMS key has automatic rotation enabled."""
    return resource.configuration.get("KeyRotationEnabled", False) is True


def check_key_policy_no_wildcard(resource):
    """Returns True if PASSES — KMS key policy has no wildcard principal."""
    policy = resource.configuration.get("Policy", "")
    if isinstance(policy, str):
        return '"Principal": "*"' not in policy and '"Principal":"*"' not in policy
    return True
