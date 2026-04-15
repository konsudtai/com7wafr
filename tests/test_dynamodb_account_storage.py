"""Unit tests for DynamoDBAccountStorage class."""

from __future__ import annotations

from datetime import datetime, timezone

import boto3
import pytest
from moto import mock_aws

from core.account_manager import DynamoDBAccountStorage
from core.models import AccountConfiguration

TABLE_NAME = "wa-review-tool"


@pytest.fixture
def dynamodb_table():
    """Create a mocked DynamoDB table for testing."""
    with mock_aws():
        ddb = boto3.resource("dynamodb", region_name="us-east-1")
        ddb.create_table(
            TableName=TABLE_NAME,
            KeySchema=[
                {"AttributeName": "PK", "KeyType": "HASH"},
                {"AttributeName": "SK", "KeyType": "RANGE"},
            ],
            AttributeDefinitions=[
                {"AttributeName": "PK", "AttributeType": "S"},
                {"AttributeName": "SK", "AttributeType": "S"},
            ],
            BillingMode="PAY_PER_REQUEST",
        )
        yield ddb.Table(TABLE_NAME)


VALID_ARN = "arn:aws:iam::123456789012:role/ScanRole"
VALID_ARN_2 = "arn:aws:iam::999888777666:role/AuditRole"


def _make_account(
    account_id: str = "123456789012",
    role_arn: str = VALID_ARN,
    alias: str = "dev",
    status: str | None = None,
    verified_at: datetime | None = None,
) -> AccountConfiguration:
    return AccountConfiguration(
        account_id=account_id,
        role_arn=role_arn,
        alias=alias,
        last_connection_status=status,
        last_verified_at=verified_at,
    )


class TestDynamoDBAccountStorageLoad:
    def test_load_empty_table(self, dynamodb_table):
        storage = DynamoDBAccountStorage(TABLE_NAME)
        assert storage.load() == []

    def test_load_single_account(self, dynamodb_table):
        dynamodb_table.put_item(
            Item={
                "PK": "ACCOUNT#123456789012",
                "SK": "META",
                "role_arn": VALID_ARN,
                "alias": "dev",
            }
        )
        storage = DynamoDBAccountStorage(TABLE_NAME)
        accounts = storage.load()

        assert len(accounts) == 1
        assert accounts[0].account_id == "123456789012"
        assert accounts[0].role_arn == VALID_ARN
        assert accounts[0].alias == "dev"
        assert accounts[0].last_connection_status is None
        assert accounts[0].last_verified_at is None

    def test_load_account_with_connection_status(self, dynamodb_table):
        now = datetime.now(timezone.utc)
        dynamodb_table.put_item(
            Item={
                "PK": "ACCOUNT#123456789012",
                "SK": "META",
                "role_arn": VALID_ARN,
                "alias": "dev",
                "last_connection_status": "SUCCESS",
                "last_verified_at": now.isoformat(),
            }
        )
        storage = DynamoDBAccountStorage(TABLE_NAME)
        accounts = storage.load()

        assert len(accounts) == 1
        assert accounts[0].last_connection_status == "SUCCESS"
        assert accounts[0].last_verified_at is not None

    def test_load_multiple_accounts(self, dynamodb_table):
        dynamodb_table.put_item(
            Item={
                "PK": "ACCOUNT#111111111111",
                "SK": "META",
                "role_arn": VALID_ARN,
                "alias": "dev",
            }
        )
        dynamodb_table.put_item(
            Item={
                "PK": "ACCOUNT#222222222222",
                "SK": "META",
                "role_arn": VALID_ARN_2,
                "alias": "prod",
            }
        )
        storage = DynamoDBAccountStorage(TABLE_NAME)
        accounts = storage.load()

        assert len(accounts) == 2
        ids = {a.account_id for a in accounts}
        assert ids == {"111111111111", "222222222222"}

    def test_load_ignores_non_account_items(self, dynamodb_table):
        # Add a scan item that should be ignored
        dynamodb_table.put_item(
            Item={"PK": "SCAN#abc123", "SK": "META", "status": "COMPLETED"}
        )
        dynamodb_table.put_item(
            Item={
                "PK": "ACCOUNT#123456789012",
                "SK": "META",
                "role_arn": VALID_ARN,
                "alias": "dev",
            }
        )
        storage = DynamoDBAccountStorage(TABLE_NAME)
        accounts = storage.load()

        assert len(accounts) == 1
        assert accounts[0].account_id == "123456789012"


class TestDynamoDBAccountStorageSave:
    def test_save_single_account(self, dynamodb_table):
        storage = DynamoDBAccountStorage(TABLE_NAME)
        account = _make_account()
        storage.save([account])

        resp = dynamodb_table.get_item(
            Key={"PK": "ACCOUNT#123456789012", "SK": "META"}
        )
        item = resp["Item"]
        assert item["role_arn"] == VALID_ARN
        assert item["alias"] == "dev"

    def test_save_replaces_existing(self, dynamodb_table):
        storage = DynamoDBAccountStorage(TABLE_NAME)

        # Save initial accounts
        storage.save([
            _make_account("111111111111", VALID_ARN, "a1"),
            _make_account("222222222222", VALID_ARN_2, "a2"),
        ])
        assert len(storage.load()) == 2

        # Save new list (replaces old)
        storage.save([_make_account("333333333333", VALID_ARN, "a3")])
        accounts = storage.load()
        assert len(accounts) == 1
        assert accounts[0].account_id == "333333333333"

    def test_save_empty_list_clears_accounts(self, dynamodb_table):
        storage = DynamoDBAccountStorage(TABLE_NAME)
        storage.save([_make_account()])
        assert len(storage.load()) == 1

        storage.save([])
        assert storage.load() == []

    def test_save_preserves_non_account_items(self, dynamodb_table):
        # Add a non-account item
        dynamodb_table.put_item(
            Item={"PK": "SCAN#abc123", "SK": "META", "status": "COMPLETED"}
        )

        storage = DynamoDBAccountStorage(TABLE_NAME)
        storage.save([_make_account()])

        # Non-account item should still exist
        resp = dynamodb_table.get_item(
            Key={"PK": "SCAN#abc123", "SK": "META"}
        )
        assert "Item" in resp

    def test_save_with_connection_status(self, dynamodb_table):
        now = datetime.now(timezone.utc)
        account = _make_account(status="SUCCESS", verified_at=now)

        storage = DynamoDBAccountStorage(TABLE_NAME)
        storage.save([account])

        resp = dynamodb_table.get_item(
            Key={"PK": "ACCOUNT#123456789012", "SK": "META"}
        )
        item = resp["Item"]
        assert item["last_connection_status"] == "SUCCESS"
        assert item["last_verified_at"] == now.isoformat()


class TestDynamoDBAccountStorageRoundTrip:
    def test_save_then_load_roundtrip(self, dynamodb_table):
        now = datetime.now(timezone.utc)
        original = [
            _make_account("111111111111", VALID_ARN, "dev", "SUCCESS", now),
            _make_account("222222222222", VALID_ARN_2, "prod"),
        ]

        storage = DynamoDBAccountStorage(TABLE_NAME)
        storage.save(original)
        loaded = storage.load()

        assert len(loaded) == len(original)
        loaded_by_id = {a.account_id: a for a in loaded}

        for orig in original:
            loaded_acct = loaded_by_id[orig.account_id]
            assert loaded_acct.role_arn == orig.role_arn
            assert loaded_acct.alias == orig.alias
            assert loaded_acct.last_connection_status == orig.last_connection_status
