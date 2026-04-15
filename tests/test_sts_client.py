"""Unit tests for core.sts_client.STSClient."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest

from core.sts_client import CachedCredentials, STSClient


# ---------------------------------------------------------------
# validate_role_arn
# ---------------------------------------------------------------


class TestValidateRoleArn:
    """Tests for STSClient.validate_role_arn."""

    def test_valid_simple_role(self):
        client = STSClient()
        assert client.validate_role_arn("arn:aws:iam::123456789012:role/MyRole") is True

    def test_valid_role_with_path(self):
        client = STSClient()
        assert client.validate_role_arn("arn:aws:iam::123456789012:role/path/to/MyRole") is True

    def test_valid_role_with_special_chars(self):
        client = STSClient()
        assert client.validate_role_arn("arn:aws:iam::123456789012:role/My_Role-Name.v2") is True

    def test_invalid_missing_role_prefix(self):
        client = STSClient()
        assert client.validate_role_arn("arn:aws:iam::123456789012:user/MyUser") is False

    def test_invalid_account_id_too_short(self):
        client = STSClient()
        assert client.validate_role_arn("arn:aws:iam::12345:role/MyRole") is False

    def test_invalid_account_id_too_long(self):
        client = STSClient()
        assert client.validate_role_arn("arn:aws:iam::1234567890123:role/MyRole") is False

    def test_invalid_empty_string(self):
        client = STSClient()
        assert client.validate_role_arn("") is False

    def test_invalid_random_string(self):
        client = STSClient()
        assert client.validate_role_arn("not-an-arn") is False

    def test_invalid_missing_role_name(self):
        client = STSClient()
        assert client.validate_role_arn("arn:aws:iam::123456789012:role/") is False

    def test_invalid_non_digit_account_id(self):
        client = STSClient()
        assert client.validate_role_arn("arn:aws:iam::12345678abcd:role/MyRole") is False


# ---------------------------------------------------------------
# assume_role
# ---------------------------------------------------------------


class TestAssumeRole:
    """Tests for STSClient.assume_role."""

    def test_assume_role_returns_credentials(self):
        client = STSClient(session_duration=900)
        expiration = datetime.now(timezone.utc) + timedelta(hours=1)
        client._sts_client = MagicMock()
        client._sts_client.assume_role.return_value = {
            "Credentials": {
                "AccessKeyId": "AKID",
                "SecretAccessKey": "SECRET",
                "SessionToken": "TOKEN",
                "Expiration": expiration,
            }
        }

        result = client.assume_role(
            "arn:aws:iam::123456789012:role/TestRole", "test-session"
        )

        assert result["AccessKeyId"] == "AKID"
        assert result["SecretAccessKey"] == "SECRET"
        assert result["SessionToken"] == "TOKEN"
        assert result["Expiration"] == expiration

        client._sts_client.assume_role.assert_called_once_with(
            RoleArn="arn:aws:iam::123456789012:role/TestRole",
            RoleSessionName="test-session",
            DurationSeconds=900,
        )

    def test_assume_role_invalid_arn_raises(self):
        client = STSClient()
        with pytest.raises(ValueError, match="Invalid IAM role ARN format"):
            client.assume_role("bad-arn", "session")

    def test_assume_role_custom_session_duration(self):
        client = STSClient(session_duration=1800)
        expiration = datetime.now(timezone.utc) + timedelta(minutes=30)
        client._sts_client = MagicMock()
        client._sts_client.assume_role.return_value = {
            "Credentials": {
                "AccessKeyId": "AK",
                "SecretAccessKey": "SK",
                "SessionToken": "ST",
                "Expiration": expiration,
            }
        }

        client.assume_role("arn:aws:iam::111222333444:role/R", "s")

        client._sts_client.assume_role.assert_called_once_with(
            RoleArn="arn:aws:iam::111222333444:role/R",
            RoleSessionName="s",
            DurationSeconds=1800,
        )


# ---------------------------------------------------------------
# get_or_refresh_credentials
# ---------------------------------------------------------------


class TestGetOrRefreshCredentials:
    """Tests for STSClient.get_or_refresh_credentials."""

    def _make_client_with_mock(self) -> STSClient:
        client = STSClient()
        client._sts_client = MagicMock()
        return client

    def test_returns_fresh_credentials_on_cache_miss(self):
        client = self._make_client_with_mock()
        expiration = datetime.now(timezone.utc) + timedelta(hours=1)
        client._sts_client.assume_role.return_value = {
            "Credentials": {
                "AccessKeyId": "AK1",
                "SecretAccessKey": "SK1",
                "SessionToken": "ST1",
                "Expiration": expiration,
            }
        }

        result = client.get_or_refresh_credentials(
            "111222333444", "arn:aws:iam::111222333444:role/Role"
        )

        assert result["AccessKeyId"] == "AK1"
        assert "111222333444" in client._credentials_cache

    def test_returns_cached_credentials_when_valid(self):
        client = self._make_client_with_mock()
        future = datetime.now(timezone.utc) + timedelta(hours=1)
        client._credentials_cache["111222333444"] = CachedCredentials(
            access_key_id="CACHED_AK",
            secret_access_key="CACHED_SK",
            session_token="CACHED_ST",
            expiration=future,
        )

        result = client.get_or_refresh_credentials(
            "111222333444", "arn:aws:iam::111222333444:role/Role"
        )

        assert result["AccessKeyId"] == "CACHED_AK"
        # STS should NOT have been called
        client._sts_client.assume_role.assert_not_called()

    def test_refreshes_expired_credentials(self):
        client = self._make_client_with_mock()
        past = datetime.now(timezone.utc) - timedelta(hours=1)
        client._credentials_cache["111222333444"] = CachedCredentials(
            access_key_id="OLD_AK",
            secret_access_key="OLD_SK",
            session_token="OLD_ST",
            expiration=past,
        )

        new_expiration = datetime.now(timezone.utc) + timedelta(hours=1)
        client._sts_client.assume_role.return_value = {
            "Credentials": {
                "AccessKeyId": "NEW_AK",
                "SecretAccessKey": "NEW_SK",
                "SessionToken": "NEW_ST",
                "Expiration": new_expiration,
            }
        }

        result = client.get_or_refresh_credentials(
            "111222333444", "arn:aws:iam::111222333444:role/Role"
        )

        assert result["AccessKeyId"] == "NEW_AK"
        client._sts_client.assume_role.assert_called_once()

    def test_caches_credentials_after_refresh(self):
        client = self._make_client_with_mock()
        expiration = datetime.now(timezone.utc) + timedelta(hours=1)
        client._sts_client.assume_role.return_value = {
            "Credentials": {
                "AccessKeyId": "AK",
                "SecretAccessKey": "SK",
                "SessionToken": "ST",
                "Expiration": expiration,
            }
        }

        client.get_or_refresh_credentials(
            "999888777666", "arn:aws:iam::999888777666:role/R"
        )

        cached = client._credentials_cache["999888777666"]
        assert cached.access_key_id == "AK"
        assert cached.secret_access_key == "SK"
        assert cached.session_token == "ST"
        assert cached.expiration == expiration
