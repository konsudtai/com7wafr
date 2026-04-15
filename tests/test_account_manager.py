"""Unit tests for AccountManager class."""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import MagicMock

import pytest

from core.account_manager import AccountManager, FileAccountStorage
from core.models import AccountConfiguration


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

class InMemoryStorage:
    """Simple in-memory storage backend for testing."""

    def __init__(self, initial: list[AccountConfiguration] | None = None):
        self._accounts: list[AccountConfiguration] = list(initial or [])

    def load(self) -> list[AccountConfiguration]:
        return list(self._accounts)

    def save(self, accounts: list[AccountConfiguration]) -> None:
        self._accounts = list(accounts)


VALID_ARN = "arn:aws:iam::123456789012:role/ScanRole"
VALID_ARN_2 = "arn:aws:iam::999888777666:role/AuditRole"


def _make_account(
    account_id: str = "123456789012",
    role_arn: str = VALID_ARN,
    alias: str = "dev",
) -> AccountConfiguration:
    return AccountConfiguration(
        account_id=account_id, role_arn=role_arn, alias=alias
    )


# ---------------------------------------------------------------------------
# add_account
# ---------------------------------------------------------------------------

class TestAddAccount:
    def test_add_account_success(self):
        mgr = AccountManager(InMemoryStorage())
        acct = mgr.add_account("123456789012", VALID_ARN, "dev")

        assert acct.account_id == "123456789012"
        assert acct.role_arn == VALID_ARN
        assert acct.alias == "dev"
        assert mgr.list_accounts() == [acct]

    def test_add_account_invalid_arn_raises(self):
        mgr = AccountManager(InMemoryStorage())
        with pytest.raises(ValueError, match="Invalid IAM role ARN format"):
            mgr.add_account("123456789012", "bad-arn", "dev")

    def test_add_account_arn_missing_role_prefix(self):
        mgr = AccountManager(InMemoryStorage())
        with pytest.raises(ValueError, match="Invalid IAM role ARN format"):
            mgr.add_account("123456789012", "arn:aws:iam::123456789012:user/Bob", "dev")

    def test_add_account_arn_wrong_digit_count(self):
        mgr = AccountManager(InMemoryStorage())
        with pytest.raises(ValueError, match="Invalid IAM role ARN format"):
            mgr.add_account("12345", "arn:aws:iam::12345:role/R", "dev")

    def test_add_account_duplicate_id_raises(self):
        storage = InMemoryStorage([_make_account()])
        mgr = AccountManager(storage)
        with pytest.raises(ValueError, match="already exists"):
            mgr.add_account("123456789012", VALID_ARN, "other-alias")

    def test_add_account_with_sts_success(self):
        sts = MagicMock()
        sts.assume_role.return_value = {"Credentials": {}}
        mgr = AccountManager(InMemoryStorage(), sts_client=sts)

        acct = mgr.add_account("123456789012", VALID_ARN, "dev")

        sts.assume_role.assert_called_once_with(VALID_ARN, session_name="account-verify")
        assert acct.last_connection_status == "SUCCESS"
        assert acct.last_verified_at is not None

    def test_add_account_with_sts_failure_raises(self):
        sts = MagicMock()
        sts.assume_role.side_effect = Exception("Access denied")
        mgr = AccountManager(InMemoryStorage(), sts_client=sts)

        with pytest.raises(ValueError, match="Assume role test failed"):
            mgr.add_account("123456789012", VALID_ARN, "dev")

        # Account should NOT be persisted on failure
        assert mgr.list_accounts() == []

    def test_add_account_without_sts_skips_verification(self):
        mgr = AccountManager(InMemoryStorage())
        acct = mgr.add_account("123456789012", VALID_ARN, "dev")

        assert acct.last_connection_status is None
        assert acct.last_verified_at is None


# ---------------------------------------------------------------------------
# remove_account
# ---------------------------------------------------------------------------

class TestRemoveAccount:
    def test_remove_by_account_id(self):
        storage = InMemoryStorage([_make_account()])
        mgr = AccountManager(storage)

        assert mgr.remove_account("123456789012") is True
        assert mgr.list_accounts() == []

    def test_remove_by_alias(self):
        storage = InMemoryStorage([_make_account(alias="my-dev")])
        mgr = AccountManager(storage)

        assert mgr.remove_account("my-dev") is True
        assert mgr.list_accounts() == []

    def test_remove_nonexistent_returns_false(self):
        mgr = AccountManager(InMemoryStorage())
        assert mgr.remove_account("nonexistent") is False

    def test_remove_leaves_other_accounts(self):
        storage = InMemoryStorage([
            _make_account("111111111111", VALID_ARN, "a1"),
            _make_account("222222222222", VALID_ARN_2, "a2"),
        ])
        mgr = AccountManager(storage)

        mgr.remove_account("111111111111")
        remaining = mgr.list_accounts()
        assert len(remaining) == 1
        assert remaining[0].account_id == "222222222222"


# ---------------------------------------------------------------------------
# update_account
# ---------------------------------------------------------------------------

class TestUpdateAccount:
    def test_update_role_arn(self):
        storage = InMemoryStorage([_make_account()])
        mgr = AccountManager(storage)

        updated = mgr.update_account("123456789012", role_arn=VALID_ARN_2)
        assert updated.role_arn == VALID_ARN_2

    def test_update_alias(self):
        storage = InMemoryStorage([_make_account()])
        mgr = AccountManager(storage)

        updated = mgr.update_account("123456789012", alias="production")
        assert updated.alias == "production"

    def test_update_both_fields(self):
        storage = InMemoryStorage([_make_account()])
        mgr = AccountManager(storage)

        updated = mgr.update_account("123456789012", role_arn=VALID_ARN_2, alias="prod")
        assert updated.role_arn == VALID_ARN_2
        assert updated.alias == "prod"

    def test_update_nonexistent_raises(self):
        mgr = AccountManager(InMemoryStorage())
        with pytest.raises(ValueError, match="not found"):
            mgr.update_account("999999999999", alias="x")

    def test_update_invalid_arn_raises(self):
        storage = InMemoryStorage([_make_account()])
        mgr = AccountManager(storage)
        with pytest.raises(ValueError, match="Invalid IAM role ARN format"):
            mgr.update_account("123456789012", role_arn="bad")


# ---------------------------------------------------------------------------
# list_accounts
# ---------------------------------------------------------------------------

class TestListAccounts:
    def test_list_empty(self):
        mgr = AccountManager(InMemoryStorage())
        assert mgr.list_accounts() == []

    def test_list_returns_all(self):
        storage = InMemoryStorage([
            _make_account("111111111111", VALID_ARN, "a1"),
            _make_account("222222222222", VALID_ARN_2, "a2"),
        ])
        mgr = AccountManager(storage)
        assert len(mgr.list_accounts()) == 2


# ---------------------------------------------------------------------------
# verify_account
# ---------------------------------------------------------------------------

class TestVerifyAccount:
    def test_verify_success_with_sts(self):
        sts = MagicMock()
        sts.assume_role.return_value = {"Credentials": {}}
        storage = InMemoryStorage([_make_account()])
        mgr = AccountManager(storage, sts_client=sts)

        assert mgr.verify_account("123456789012") is True

        saved = mgr.list_accounts()
        assert saved[0].last_connection_status == "SUCCESS"
        assert saved[0].last_verified_at is not None

    def test_verify_failure_with_sts(self):
        sts = MagicMock()
        sts.assume_role.side_effect = Exception("denied")
        storage = InMemoryStorage([_make_account()])
        mgr = AccountManager(storage, sts_client=sts)

        assert mgr.verify_account("123456789012") is False

        saved = mgr.list_accounts()
        assert saved[0].last_connection_status == "FAILED"

    def test_verify_without_sts_returns_true(self):
        storage = InMemoryStorage([_make_account()])
        mgr = AccountManager(storage)
        assert mgr.verify_account("123456789012") is True

    def test_verify_nonexistent_raises(self):
        mgr = AccountManager(InMemoryStorage())
        with pytest.raises(ValueError, match="not found"):
            mgr.verify_account("999999999999")


# ---------------------------------------------------------------------------
# get_credentials
# ---------------------------------------------------------------------------

class TestGetCredentials:
    def test_get_credentials_success(self):
        creds = {"AccessKeyId": "AK", "SecretAccessKey": "SK", "SessionToken": "ST"}
        sts = MagicMock()
        sts.assume_role.return_value = creds
        storage = InMemoryStorage([_make_account()])
        mgr = AccountManager(storage, sts_client=sts)

        result = mgr.get_credentials("123456789012")
        assert result == creds

    def test_get_credentials_no_sts_raises(self):
        storage = InMemoryStorage([_make_account()])
        mgr = AccountManager(storage)
        with pytest.raises(RuntimeError, match="No STS client"):
            mgr.get_credentials("123456789012")

    def test_get_credentials_nonexistent_raises(self):
        sts = MagicMock()
        mgr = AccountManager(InMemoryStorage(), sts_client=sts)
        with pytest.raises(ValueError, match="not found"):
            mgr.get_credentials("999999999999")


# ---------------------------------------------------------------------------
# Integration: AccountManager + FileAccountStorage
# ---------------------------------------------------------------------------

class TestAccountManagerWithFileStorage:
    def test_add_and_list_with_file_backend(self, tmp_path):
        f = tmp_path / "accounts.json"
        storage = FileAccountStorage(str(f))
        mgr = AccountManager(storage)

        mgr.add_account("123456789012", VALID_ARN, "dev")
        mgr.add_account("999888777666", VALID_ARN_2, "audit")

        accounts = mgr.list_accounts()
        assert len(accounts) == 2
        ids = {a.account_id for a in accounts}
        assert ids == {"123456789012", "999888777666"}

    def test_remove_persists_to_file(self, tmp_path):
        f = tmp_path / "accounts.json"
        storage = FileAccountStorage(str(f))
        mgr = AccountManager(storage)

        mgr.add_account("123456789012", VALID_ARN, "dev")
        mgr.remove_account("123456789012")

        # Re-load from file to confirm persistence
        mgr2 = AccountManager(FileAccountStorage(str(f)))
        assert mgr2.list_accounts() == []
