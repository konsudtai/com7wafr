"""Unit tests for AccountStorageBackend protocol and FileAccountStorage."""

import json
from datetime import datetime, timezone

import pytest
import yaml

from core.account_manager import AccountStorageBackend, FileAccountStorage
from core.models import AccountConfiguration


class TestAccountStorageBackendProtocol:
    """Tests for the AccountStorageBackend protocol."""

    def test_file_account_storage_is_protocol_compliant(self):
        storage = FileAccountStorage("dummy.json")
        assert isinstance(storage, AccountStorageBackend)


class TestFileAccountStorageLoad:
    """Tests for FileAccountStorage.load()."""

    def test_load_returns_empty_list_when_file_missing(self, tmp_path):
        storage = FileAccountStorage(str(tmp_path / "nonexistent.json"))
        assert storage.load() == []

    def test_load_returns_empty_list_for_empty_file(self, tmp_path):
        f = tmp_path / "accounts.json"
        f.write_text("", encoding="utf-8")
        storage = FileAccountStorage(str(f))
        assert storage.load() == []

    def test_load_json_file(self, tmp_path):
        data = {
            "accounts": [
                {
                    "account_id": "123456789012",
                    "role_arn": "arn:aws:iam::123456789012:role/MyRole",
                    "alias": "dev-account",
                }
            ]
        }
        f = tmp_path / "accounts.json"
        f.write_text(json.dumps(data), encoding="utf-8")

        storage = FileAccountStorage(str(f))
        accounts = storage.load()

        assert len(accounts) == 1
        assert accounts[0].account_id == "123456789012"
        assert accounts[0].alias == "dev-account"

    def test_load_yaml_file(self, tmp_path):
        data = {
            "accounts": [
                {
                    "account_id": "111222333444",
                    "role_arn": "arn:aws:iam::111222333444:role/ScanRole",
                    "alias": "staging",
                }
            ]
        }
        f = tmp_path / "accounts.yaml"
        f.write_text(yaml.dump(data), encoding="utf-8")

        storage = FileAccountStorage(str(f))
        accounts = storage.load()

        assert len(accounts) == 1
        assert accounts[0].account_id == "111222333444"
        assert accounts[0].alias == "staging"

    def test_load_yml_extension(self, tmp_path):
        data = {"accounts": []}
        f = tmp_path / "accounts.yml"
        f.write_text(yaml.dump(data), encoding="utf-8")

        storage = FileAccountStorage(str(f))
        assert storage.load() == []

    def test_load_multiple_accounts(self, tmp_path):
        data = {
            "accounts": [
                {"account_id": "111111111111", "role_arn": "arn:aws:iam::111111111111:role/R1", "alias": "a1"},
                {"account_id": "222222222222", "role_arn": "arn:aws:iam::222222222222:role/R2", "alias": "a2"},
                {"account_id": "333333333333", "role_arn": "arn:aws:iam::333333333333:role/R3", "alias": "a3"},
            ]
        }
        f = tmp_path / "accounts.json"
        f.write_text(json.dumps(data), encoding="utf-8")

        storage = FileAccountStorage(str(f))
        accounts = storage.load()
        assert len(accounts) == 3

    def test_load_preserves_optional_fields(self, tmp_path):
        ts = "2024-01-15T10:30:00Z"
        data = {
            "accounts": [
                {
                    "account_id": "123456789012",
                    "role_arn": "arn:aws:iam::123456789012:role/R",
                    "alias": "prod",
                    "last_connection_status": "SUCCESS",
                    "last_verified_at": ts,
                }
            ]
        }
        f = tmp_path / "accounts.json"
        f.write_text(json.dumps(data), encoding="utf-8")

        storage = FileAccountStorage(str(f))
        accounts = storage.load()
        assert accounts[0].last_connection_status == "SUCCESS"
        assert accounts[0].last_verified_at is not None

    def test_load_raises_on_invalid_json(self, tmp_path):
        f = tmp_path / "accounts.json"
        f.write_text("{bad json", encoding="utf-8")

        storage = FileAccountStorage(str(f))
        with pytest.raises(ValueError, match="Invalid JSON"):
            storage.load()

    def test_load_raises_on_invalid_yaml(self, tmp_path):
        f = tmp_path / "accounts.yaml"
        f.write_text(":\n  :\n    - [invalid", encoding="utf-8")

        storage = FileAccountStorage(str(f))
        with pytest.raises(ValueError, match="Invalid YAML"):
            storage.load()

    def test_load_raises_on_unsupported_format(self, tmp_path):
        f = tmp_path / "accounts.txt"
        f.write_text("some content", encoding="utf-8")

        storage = FileAccountStorage(str(f))
        with pytest.raises(ValueError, match="Unsupported file format"):
            storage.load()

    def test_load_raises_when_missing_accounts_key(self, tmp_path):
        f = tmp_path / "accounts.json"
        f.write_text(json.dumps({"data": []}), encoding="utf-8")

        storage = FileAccountStorage(str(f))
        with pytest.raises(ValueError, match="'accounts' key"):
            storage.load()

    def test_load_raises_when_accounts_not_list(self, tmp_path):
        f = tmp_path / "accounts.json"
        f.write_text(json.dumps({"accounts": "not-a-list"}), encoding="utf-8")

        storage = FileAccountStorage(str(f))
        with pytest.raises(ValueError, match="must be a list"):
            storage.load()


class TestFileAccountStorageSave:
    """Tests for FileAccountStorage.save()."""

    def test_save_json_creates_file(self, tmp_path):
        accounts = [
            AccountConfiguration(
                account_id="123456789012",
                role_arn="arn:aws:iam::123456789012:role/MyRole",
                alias="dev",
            )
        ]
        f = tmp_path / "accounts.json"
        storage = FileAccountStorage(str(f))
        storage.save(accounts)

        assert f.exists()
        data = json.loads(f.read_text(encoding="utf-8"))
        assert len(data["accounts"]) == 1
        assert data["accounts"][0]["account_id"] == "123456789012"

    def test_save_yaml_creates_file(self, tmp_path):
        accounts = [
            AccountConfiguration(
                account_id="111222333444",
                role_arn="arn:aws:iam::111222333444:role/R",
                alias="staging",
            )
        ]
        f = tmp_path / "accounts.yaml"
        storage = FileAccountStorage(str(f))
        storage.save(accounts)

        assert f.exists()
        data = yaml.safe_load(f.read_text(encoding="utf-8"))
        assert len(data["accounts"]) == 1
        assert data["accounts"][0]["alias"] == "staging"

    def test_save_creates_parent_directories(self, tmp_path):
        f = tmp_path / "nested" / "dir" / "accounts.json"
        storage = FileAccountStorage(str(f))
        storage.save([])

        assert f.exists()
        data = json.loads(f.read_text(encoding="utf-8"))
        assert data["accounts"] == []

    def test_save_empty_list(self, tmp_path):
        f = tmp_path / "accounts.json"
        storage = FileAccountStorage(str(f))
        storage.save([])

        data = json.loads(f.read_text(encoding="utf-8"))
        assert data["accounts"] == []

    def test_save_raises_on_unsupported_format(self, tmp_path):
        f = tmp_path / "accounts.txt"
        storage = FileAccountStorage(str(f))
        with pytest.raises(ValueError, match="Unsupported file format"):
            storage.save([])

    def test_save_overwrites_existing_file(self, tmp_path):
        f = tmp_path / "accounts.json"
        storage = FileAccountStorage(str(f))

        storage.save([
            AccountConfiguration(account_id="111111111111", role_arn="arn:aws:iam::111111111111:role/R", alias="old"),
        ])
        storage.save([
            AccountConfiguration(account_id="222222222222", role_arn="arn:aws:iam::222222222222:role/R", alias="new"),
        ])

        data = json.loads(f.read_text(encoding="utf-8"))
        assert len(data["accounts"]) == 1
        assert data["accounts"][0]["alias"] == "new"


class TestFileAccountStorageRoundTrip:
    """Tests for save-then-load round-trip consistency."""

    def test_json_round_trip(self, tmp_path):
        original = [
            AccountConfiguration(
                account_id="123456789012",
                role_arn="arn:aws:iam::123456789012:role/ScanRole",
                alias="production",
                last_connection_status="SUCCESS",
                last_verified_at=datetime(2024, 6, 15, 12, 0, 0, tzinfo=timezone.utc),
            ),
            AccountConfiguration(
                account_id="999888777666",
                role_arn="arn:aws:iam::999888777666:role/AuditRole",
                alias="audit",
            ),
        ]
        f = tmp_path / "accounts.json"
        storage = FileAccountStorage(str(f))
        storage.save(original)
        loaded = storage.load()

        assert len(loaded) == len(original)
        for orig, load in zip(original, loaded):
            assert orig.account_id == load.account_id
            assert orig.role_arn == load.role_arn
            assert orig.alias == load.alias
            assert orig.last_connection_status == load.last_connection_status

    def test_yaml_round_trip(self, tmp_path):
        original = [
            AccountConfiguration(
                account_id="555666777888",
                role_arn="arn:aws:iam::555666777888:role/DevRole",
                alias="dev-env",
            ),
        ]
        f = tmp_path / "accounts.yaml"
        storage = FileAccountStorage(str(f))
        storage.save(original)
        loaded = storage.load()

        assert len(loaded) == 1
        assert loaded[0].account_id == original[0].account_id
        assert loaded[0].alias == original[0].alias
