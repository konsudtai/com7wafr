"""STS Client for AWS Well-Architected Review Tool.

Manages STS assume role operations and credential caching with
automatic refresh when credentials expire.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)

# Regex for validating IAM role ARN format:
# arn:aws:iam::<12-digit-account-id>:role/<role-name>
_ARN_PATTERN = re.compile(r"^arn:aws:iam::\d{12}:role/[\w+=,.@\-/]+$")


@dataclass
class CachedCredentials:
    """Stores temporary credentials with their expiration time."""

    access_key_id: str
    secret_access_key: str
    session_token: str
    expiration: datetime


class STSClient:
    """Manages STS assume role and credential caching/refresh.

    Provides assume_role for obtaining temporary credentials, a
    credential cache keyed by account ID with automatic refresh
    when credentials are expired, and ARN format validation.
    """

    def __init__(self, session_duration: int = 3600) -> None:
        self.session_duration = session_duration
        self._credentials_cache: dict[str, CachedCredentials] = {}
        self._sts_client = boto3.client("sts")

    def assume_role(self, role_arn: str, session_name: str) -> dict:
        """Assume an IAM role and return temporary credentials.

        Args:
            role_arn: The ARN of the role to assume.
            session_name: An identifier for the assumed role session.

        Returns:
            A dict with keys ``AccessKeyId``, ``SecretAccessKey``,
            ``SessionToken``, and ``Expiration``.

        Raises:
            ValueError: If the role ARN format is invalid.
            ClientError: If the STS API call fails (e.g. role does not
                exist, trust policy disallows, insufficient permissions).
        """
        if not self.validate_role_arn(role_arn):
            raise ValueError(
                f"Invalid IAM role ARN format: '{role_arn}'. "
                "Expected: arn:aws:iam::<12-digit-account-id>:role/<role-name>"
            )

        logger.debug(
            "Assuming role %s with session '%s' (duration=%ds)",
            role_arn,
            session_name,
            self.session_duration,
        )

        response = self._sts_client.assume_role(
            RoleArn=role_arn,
            RoleSessionName=session_name,
            DurationSeconds=self.session_duration,
        )

        credentials = response["Credentials"]
        return {
            "AccessKeyId": credentials["AccessKeyId"],
            "SecretAccessKey": credentials["SecretAccessKey"],
            "SessionToken": credentials["SessionToken"],
            "Expiration": credentials["Expiration"],
        }

    def get_or_refresh_credentials(
        self, account_id: str, role_arn: str
    ) -> dict:
        """Get cached credentials or refresh if expired.

        Looks up the credential cache by *account_id*. If valid
        (non-expired) credentials exist they are returned immediately.
        Otherwise a new ``assume_role`` call is made and the cache is
        updated.

        Args:
            account_id: The AWS account ID used as cache key.
            role_arn: The ARN of the role to assume when refreshing.

        Returns:
            A dict with keys ``AccessKeyId``, ``SecretAccessKey``,
            ``SessionToken``, and ``Expiration``.
        """
        cached = self._credentials_cache.get(account_id)

        if cached is not None and not self._is_expired(cached):
            logger.debug(
                "Using cached credentials for account %s", account_id
            )
            return {
                "AccessKeyId": cached.access_key_id,
                "SecretAccessKey": cached.secret_access_key,
                "SessionToken": cached.session_token,
                "Expiration": cached.expiration,
            }

        logger.info(
            "Refreshing credentials for account %s", account_id
        )

        creds = self.assume_role(
            role_arn, session_name=f"scan-{account_id}"
        )

        self._credentials_cache[account_id] = CachedCredentials(
            access_key_id=creds["AccessKeyId"],
            secret_access_key=creds["SecretAccessKey"],
            session_token=creds["SessionToken"],
            expiration=creds["Expiration"],
        )

        return creds

    def validate_role_arn(self, role_arn: str) -> bool:
        """Validate IAM role ARN format.

        The expected pattern is::

            arn:aws:iam::<12-digit-account-id>:role/<role-name>

        Returns:
            ``True`` if the ARN matches the expected pattern,
            ``False`` otherwise.
        """
        return bool(_ARN_PATTERN.match(role_arn))

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _is_expired(cached: CachedCredentials) -> bool:
        """Return True if the cached credentials have expired."""
        now = datetime.now(timezone.utc)
        expiration = cached.expiration

        # Ensure timezone-aware comparison
        if expiration.tzinfo is None:
            expiration = expiration.replace(tzinfo=timezone.utc)

        return now >= expiration
