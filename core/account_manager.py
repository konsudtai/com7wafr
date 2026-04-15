"""Account Manager for AWS Well-Architected Review Tool.

Manages AWS account configurations for cross-account scanning.
Provides storage backends for CLI (file-based) and web dashboard (DynamoDB) modes.
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Protocol, runtime_checkable

import boto3
import yaml

from core.models import AccountConfiguration


@runtime_checkable
class AccountStorageBackend(Protocol):
    """Protocol for account configuration storage backends."""

    def load(self) -> list[AccountConfiguration]: ...

    def save(self, accounts: list[AccountConfiguration]) -> None: ...


class FileAccountStorage:
    """JSON/YAML file storage backend for CLI mode.

    Reads and writes AccountConfiguration lists to a local file.
    Supports both JSON (.json) and YAML (.yaml, .yml) formats,
    determined by the file extension.
    """

    def __init__(self, file_path: str) -> None:
        self.file_path = Path(file_path)

    def load(self) -> list[AccountConfiguration]:
        """Load account configurations from a JSON or YAML file.

        Returns an empty list if the file does not exist.

        Raises:
            ValueError: If the file format is unsupported or content is invalid.
        """
        if not self.file_path.exists():
            return []

        content = self.file_path.read_text(encoding="utf-8")
        if not content.strip():
            return []

        suffix = self.file_path.suffix.lower()

        if suffix == ".json":
            try:
                data = json.loads(content)
            except json.JSONDecodeError as e:
                raise ValueError(
                    f"Invalid JSON in accounts file '{self.file_path}': {e}"
                ) from e
        elif suffix in (".yaml", ".yml"):
            try:
                data = yaml.safe_load(content)
            except yaml.YAMLError as e:
                raise ValueError(
                    f"Invalid YAML in accounts file '{self.file_path}': {e}"
                ) from e
        else:
            raise ValueError(
                f"Unsupported file format '{suffix}'. "
                "Supported formats: .json, .yaml, .yml"
            )

        if data is None:
            return []

        if not isinstance(data, dict) or "accounts" not in data:
            raise ValueError(
                f"Accounts file '{self.file_path}' must contain a mapping "
                "with an 'accounts' key."
            )

        accounts_list = data["accounts"]
        if not isinstance(accounts_list, list):
            raise ValueError(
                f"'accounts' in '{self.file_path}' must be a list."
            )

        return [AccountConfiguration(**item) for item in accounts_list]

    def save(self, accounts: list[AccountConfiguration]) -> None:
        """Save account configurations to a JSON or YAML file.

        Creates parent directories if they don't exist.

        Raises:
            ValueError: If the file format is unsupported.
        """
        suffix = self.file_path.suffix.lower()
        if suffix not in (".json", ".yaml", ".yml"):
            raise ValueError(
                f"Unsupported file format '{suffix}'. "
                "Supported formats: .json, .yaml, .yml"
            )

        self.file_path.parent.mkdir(parents=True, exist_ok=True)

        data = {
            "accounts": [
                account.model_dump(mode="json") for account in accounts
            ]
        }

        if suffix == ".json":
            content = json.dumps(data, indent=2, ensure_ascii=False, default=str)
        else:
            content = yaml.dump(data, default_flow_style=False, allow_unicode=True)

        self.file_path.write_text(content, encoding="utf-8")


class DynamoDBAccountStorage:
    """DynamoDB storage backend for web dashboard mode.

    Stores AccountConfiguration items using single-table design with
    PK=ACCOUNT#{account_id} and SK=META.
    """

    def __init__(self, table_name: str) -> None:
        self.table_name = table_name
        dynamodb = boto3.resource("dynamodb")
        self.table = dynamodb.Table(table_name)

    def load(self) -> list[AccountConfiguration]:
        """Load account configurations from DynamoDB.

        Scans for items where PK starts with 'ACCOUNT#' and SK='META',
        then converts each item to an AccountConfiguration.
        """
        response = self.table.scan(
            FilterExpression="begins_with(PK, :pk_prefix) AND SK = :sk",
            ExpressionAttributeValues={
                ":pk_prefix": "ACCOUNT#",
                ":sk": "META",
            },
        )
        items = response.get("Items", [])

        # Handle pagination
        while "LastEvaluatedKey" in response:
            response = self.table.scan(
                FilterExpression="begins_with(PK, :pk_prefix) AND SK = :sk",
                ExpressionAttributeValues={
                    ":pk_prefix": "ACCOUNT#",
                    ":sk": "META",
                },
                ExclusiveStartKey=response["LastEvaluatedKey"],
            )
            items.extend(response.get("Items", []))

        accounts: list[AccountConfiguration] = []
        for item in items:
            account_id = item["PK"].removeprefix("ACCOUNT#")
            last_verified_at = None
            if item.get("last_verified_at"):
                last_verified_at = datetime.fromisoformat(
                    item["last_verified_at"]
                )
            accounts.append(
                AccountConfiguration(
                    account_id=account_id,
                    role_arn=item["role_arn"],
                    alias=item["alias"],
                    last_connection_status=item.get("last_connection_status"),
                    last_verified_at=last_verified_at,
                )
            )
        return accounts

    def save(self, accounts: list[AccountConfiguration]) -> None:
        """Write accounts to DynamoDB.

        Deletes all existing ACCOUNT# items first, then writes the
        new list using batch_writer for efficiency.
        """
        # First, delete existing account items
        existing = self.table.scan(
            FilterExpression="begins_with(PK, :pk_prefix) AND SK = :sk",
            ExpressionAttributeValues={
                ":pk_prefix": "ACCOUNT#",
                ":sk": "META",
            },
        )
        with self.table.batch_writer() as batch:
            for item in existing.get("Items", []):
                batch.delete_item(Key={"PK": item["PK"], "SK": item["SK"]})

            # Handle pagination for deletes
            while "LastEvaluatedKey" in existing:
                existing = self.table.scan(
                    FilterExpression="begins_with(PK, :pk_prefix) AND SK = :sk",
                    ExpressionAttributeValues={
                        ":pk_prefix": "ACCOUNT#",
                        ":sk": "META",
                    },
                    ExclusiveStartKey=existing["LastEvaluatedKey"],
                )
                for item in existing.get("Items", []):
                    batch.delete_item(
                        Key={"PK": item["PK"], "SK": item["SK"]}
                    )

        # Then write all current accounts
        with self.table.batch_writer() as batch:
            for account in accounts:
                item: dict[str, Any] = {
                    "PK": f"ACCOUNT#{account.account_id}",
                    "SK": "META",
                    "role_arn": account.role_arn,
                    "alias": account.alias,
                }
                if account.last_connection_status is not None:
                    item["last_connection_status"] = (
                        account.last_connection_status
                    )
                if account.last_verified_at is not None:
                    item["last_verified_at"] = (
                        account.last_verified_at.isoformat()
                    )
                batch.put_item(Item=item)


# Regex for validating IAM role ARN format:
# arn:aws:iam::<12-digit-account-id>:role/<role-name>
_ARN_PATTERN = re.compile(
    r"^arn:aws:iam::\d{12}:role/[\w+=,.@\-/]+$"
)


class AccountManager:
    """Manages AWS account configurations for cross-account scanning.

    Provides CRUD operations for account registrations backed by a
    pluggable storage backend. Optionally validates connectivity via
    an STS client when one is provided.
    """

    def __init__(
        self,
        storage_backend: AccountStorageBackend,
        sts_client: Any | None = None,
    ) -> None:
        self.storage = storage_backend
        self.sts_client = sts_client

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def add_account(
        self, account_id: str, role_arn: str, alias: str
    ) -> AccountConfiguration:
        """Add a new account configuration.

        Validates the ARN format and, if an STS client is available,
        tests assume-role connectivity before persisting.

        Raises:
            ValueError: If the ARN format is invalid, the account ID
                already exists, or the assume-role test fails.
        """
        if not _ARN_PATTERN.match(role_arn):
            raise ValueError(
                f"Invalid IAM role ARN format: '{role_arn}'. "
                "Expected: arn:aws:iam::<12-digit-account-id>:role/<role-name>"
            )

        accounts = self.storage.load()

        if any(a.account_id == account_id for a in accounts):
            raise ValueError(
                f"Account ID '{account_id}' already exists."
            )

        connection_status: str | None = None
        verified_at: datetime | None = None

        if self.sts_client is not None:
            try:
                self.sts_client.assume_role(
                    role_arn, session_name="account-verify"
                )
                connection_status = "SUCCESS"
                verified_at = datetime.now(timezone.utc)
            except Exception as exc:
                raise ValueError(
                    f"Assume role test failed for '{role_arn}': {exc}"
                ) from exc

        account = AccountConfiguration(
            account_id=account_id,
            role_arn=role_arn,
            alias=alias,
            last_connection_status=connection_status,
            last_verified_at=verified_at,
        )
        accounts.append(account)
        self.storage.save(accounts)
        return account

    def remove_account(self, identifier: str) -> bool:
        """Remove an account by account_id or alias.

        Returns True if an account was removed, False otherwise.
        """
        accounts = self.storage.load()
        remaining = [
            a
            for a in accounts
            if a.account_id != identifier and a.alias != identifier
        ]

        if len(remaining) == len(accounts):
            return False

        self.storage.save(remaining)
        return True

    def update_account(
        self,
        account_id: str,
        role_arn: str | None = None,
        alias: str | None = None,
    ) -> AccountConfiguration:
        """Update role_arn and/or alias for an existing account.

        Raises:
            ValueError: If the account is not found or the new ARN is invalid.
        """
        if role_arn is not None and not _ARN_PATTERN.match(role_arn):
            raise ValueError(
                f"Invalid IAM role ARN format: '{role_arn}'. "
                "Expected: arn:aws:iam::<12-digit-account-id>:role/<role-name>"
            )

        accounts = self.storage.load()

        target: AccountConfiguration | None = None
        for acct in accounts:
            if acct.account_id == account_id:
                target = acct
                break

        if target is None:
            raise ValueError(f"Account '{account_id}' not found.")

        if role_arn is not None:
            target.role_arn = role_arn
        if alias is not None:
            target.alias = alias

        self.storage.save(accounts)
        return target

    def list_accounts(self) -> list[AccountConfiguration]:
        """List all registered accounts with their connection status."""
        return self.storage.load()

    def verify_account(self, account_id: str) -> bool:
        """Test assume-role connectivity for an account.

        Updates the stored connection status and timestamp.

        Raises:
            ValueError: If the account is not found.
        """
        accounts = self.storage.load()

        target: AccountConfiguration | None = None
        for acct in accounts:
            if acct.account_id == account_id:
                target = acct
                break

        if target is None:
            raise ValueError(f"Account '{account_id}' not found.")

        if self.sts_client is None:
            return True

        try:
            self.sts_client.assume_role(
                target.role_arn, session_name="account-verify"
            )
            target.last_connection_status = "SUCCESS"
            target.last_verified_at = datetime.now(timezone.utc)
            self.storage.save(accounts)
            return True
        except Exception:
            target.last_connection_status = "FAILED"
            target.last_verified_at = datetime.now(timezone.utc)
            self.storage.save(accounts)
            return False

    def get_credentials(self, account_id: str) -> dict:
        """Get temporary credentials via STS assume role.

        Raises:
            ValueError: If the account is not found.
            RuntimeError: If no STS client is configured.
        """
        if self.sts_client is None:
            raise RuntimeError("No STS client configured.")

        accounts = self.storage.load()

        target: AccountConfiguration | None = None
        for acct in accounts:
            if acct.account_id == account_id:
                target = acct
                break

        if target is None:
            raise ValueError(f"Account '{account_id}' not found.")

        return self.sts_client.assume_role(
            target.role_arn, session_name=f"scan-{account_id}"
        )
