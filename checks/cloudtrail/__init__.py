"""CloudTrail checks for Well-Architected Review."""


def check_multi_region_trail(resource):
    """Returns True if PASSES — trail is multi-region."""
    return resource.configuration.get("IsMultiRegionTrail", False) is True


def check_kms_encryption(resource):
    """Returns True if PASSES — trail uses KMS encryption."""
    return bool(resource.configuration.get("KmsKeyId"))


def check_log_file_validation(resource):
    """Returns True if PASSES — log file validation is enabled."""
    return resource.configuration.get("LogFileValidationEnabled", False) is True


def check_s3_public_access(resource):
    """Returns True if PASSES — trail S3 bucket has public access blocked."""
    s3_config = resource.configuration.get("S3PublicAccessBlock", {})
    return (
        s3_config.get("BlockPublicAcls", False)
        and s3_config.get("BlockPublicPolicy", False)
        and s3_config.get("IgnorePublicAcls", False)
        and s3_config.get("RestrictPublicBuckets", False)
    )
