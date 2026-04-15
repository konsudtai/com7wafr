"""Unit tests for ConfigParser class.

Validates: Requirements 10.1, 10.2, 10.3
"""

from __future__ import annotations

import json

import pytest
import yaml

from core.config_parser import ConfigParser
from core.models import ScanConfiguration


@pytest.fixture
def parser() -> ConfigParser:
    return ConfigParser()


# ---------------------------------------------------------------------------
# parse_config_file — JSON
# ---------------------------------------------------------------------------


class TestParseConfigFileJSON:
    def test_parse_valid_json(self, parser: ConfigParser, tmp_path):
        cfg = {
            "regions": ["us-east-1", "eu-west-1"],
            "services": ["ec2", "s3"],
            "output_dir": "./reports",
            "concurrency_limit": 5,
            "verbosity": "DEBUG",
        }
        f = tmp_path / "config.json"
        f.write_text(json.dumps(cfg), encoding="utf-8")

        result = parser.parse_config_file(str(f))
        assert result.regions == ["us-east-1", "eu-west-1"]
        assert result.services == ["ec2", "s3"]
        assert result.output_dir == "./reports"
        assert result.concurrency_limit == 5
        assert result.verbosity == "DEBUG"

    def test_parse_json_with_tags(self, parser: ConfigParser, tmp_path):
        cfg = {
            "regions": ["us-east-1"],
            "tags": [{"key": "Env", "value": "prod"}],
        }
        f = tmp_path / "config.json"
        f.write_text(json.dumps(cfg), encoding="utf-8")

        result = parser.parse_config_file(str(f))
        assert len(result.tags) == 1
        assert result.tags[0].key == "Env"
        assert result.tags[0].value == "prod"

    def test_parse_invalid_json_raises(self, parser: ConfigParser, tmp_path):
        f = tmp_path / "bad.json"
        f.write_text("{invalid json", encoding="utf-8")

        with pytest.raises(ValueError, match="Invalid JSON"):
            parser.parse_config_file(str(f))

    def test_parse_json_not_a_dict_raises(self, parser: ConfigParser, tmp_path):
        f = tmp_path / "list.json"
        f.write_text(json.dumps([1, 2, 3]), encoding="utf-8")

        with pytest.raises(ValueError, match="must contain a mapping"):
            parser.parse_config_file(str(f))


# ---------------------------------------------------------------------------
# parse_config_file — YAML
# ---------------------------------------------------------------------------


class TestParseConfigFileYAML:
    def test_parse_valid_yaml(self, parser: ConfigParser, tmp_path):
        cfg = {
            "regions": ["ap-southeast-1"],
            "services": ["rds", "lambda"],
            "verbosity": "WARNING",
        }
        f = tmp_path / "config.yaml"
        f.write_text(yaml.dump(cfg), encoding="utf-8")

        result = parser.parse_config_file(str(f))
        assert result.regions == ["ap-southeast-1"]
        assert result.services == ["rds", "lambda"]
        assert result.verbosity == "WARNING"

    def test_parse_yml_extension(self, parser: ConfigParser, tmp_path):
        cfg = {"regions": ["us-west-2"], "services": ["iam"]}
        f = tmp_path / "config.yml"
        f.write_text(yaml.dump(cfg), encoding="utf-8")

        result = parser.parse_config_file(str(f))
        assert result.regions == ["us-west-2"]

    def test_parse_invalid_yaml_raises(self, parser: ConfigParser, tmp_path):
        f = tmp_path / "bad.yaml"
        f.write_text(":\n  - :\n    bad: [", encoding="utf-8")

        with pytest.raises(ValueError, match="Invalid YAML"):
            parser.parse_config_file(str(f))


# ---------------------------------------------------------------------------
# Invalid format handling
# ---------------------------------------------------------------------------


class TestInvalidFormatHandling:
    def test_unsupported_extension_raises(self, parser: ConfigParser, tmp_path):
        f = tmp_path / "config.toml"
        f.write_text("key = 'value'", encoding="utf-8")

        with pytest.raises(ValueError, match="Unsupported configuration file format"):
            parser.parse_config_file(str(f))

    def test_file_not_found_raises(self, parser: ConfigParser):
        with pytest.raises(FileNotFoundError):
            parser.parse_config_file("/nonexistent/config.json")


# ---------------------------------------------------------------------------
# merge_configs — CLI args override file config
# ---------------------------------------------------------------------------


class TestMergeConfigs:
    def test_cli_regions_override_file(self, parser: ConfigParser):
        file_cfg = ScanConfiguration(regions=["us-east-1"], services=["ec2"])
        cli_cfg = ScanConfiguration(regions=["eu-west-1"])

        merged = parser.merge_configs(file_cfg, cli_cfg)
        assert merged.regions == ["eu-west-1"]

    def test_file_value_used_when_cli_is_default(self, parser: ConfigParser):
        file_cfg = ScanConfiguration(
            regions=["us-east-1"],
            services=["s3"],
            output_dir="/custom/output",
            concurrency_limit=20,
            verbosity="DEBUG",
        )
        cli_cfg = ScanConfiguration()  # all defaults

        merged = parser.merge_configs(file_cfg, cli_cfg)
        assert merged.regions == ["us-east-1"]
        assert merged.services == ["s3"]
        assert merged.output_dir == "/custom/output"
        assert merged.concurrency_limit == 20
        assert merged.verbosity == "DEBUG"

    def test_cli_scalar_overrides_file(self, parser: ConfigParser):
        file_cfg = ScanConfiguration(output_dir="/file/dir", verbosity="INFO")
        cli_cfg = ScanConfiguration(output_dir="/cli/dir", verbosity="ERROR")

        merged = parser.merge_configs(file_cfg, cli_cfg)
        assert merged.output_dir == "/cli/dir"
        assert merged.verbosity == "ERROR"

    def test_cli_suppression_file_overrides(self, parser: ConfigParser):
        file_cfg = ScanConfiguration(suppression_file="file_supp.yaml")
        cli_cfg = ScanConfiguration(suppression_file="cli_supp.yaml")

        merged = parser.merge_configs(file_cfg, cli_cfg)
        assert merged.suppression_file == "cli_supp.yaml"

    def test_file_suppression_used_when_cli_is_none(self, parser: ConfigParser):
        file_cfg = ScanConfiguration(suppression_file="file_supp.yaml")
        cli_cfg = ScanConfiguration()  # suppression_file=None

        merged = parser.merge_configs(file_cfg, cli_cfg)
        assert merged.suppression_file == "file_supp.yaml"


# ---------------------------------------------------------------------------
# validate_config — invalid values
# ---------------------------------------------------------------------------


class TestValidateConfig:
    def test_valid_config_returns_empty(self, parser: ConfigParser):
        cfg = ScanConfiguration(
            regions=["us-east-1"],
            services=["ec2"],
            concurrency_limit=5,
            verbosity="INFO",
        )
        errors = parser.validate_config(cfg)
        assert errors == []

    def test_invalid_region_format(self, parser: ConfigParser):
        cfg = ScanConfiguration(regions=["invalid-region-123"])
        errors = parser.validate_config(cfg)
        assert any("Invalid AWS region format" in e for e in errors)

    def test_unsupported_service(self, parser: ConfigParser):
        cfg = ScanConfiguration(services=["nonexistent_service"])
        errors = parser.validate_config(cfg)
        assert any("Unsupported service" in e for e in errors)

    def test_zero_concurrency(self, parser: ConfigParser):
        cfg = ScanConfiguration(concurrency_limit=0)
        errors = parser.validate_config(cfg)
        assert any("concurrency_limit must be greater than 0" in e for e in errors)

    def test_negative_concurrency(self, parser: ConfigParser):
        cfg = ScanConfiguration(concurrency_limit=-1)
        errors = parser.validate_config(cfg)
        assert any("concurrency_limit must be greater than 0" in e for e in errors)

    def test_invalid_verbosity(self, parser: ConfigParser):
        cfg = ScanConfiguration(verbosity="VERBOSE")
        errors = parser.validate_config(cfg)
        assert any("Invalid verbosity level" in e for e in errors)

    def test_multiple_errors_returned(self, parser: ConfigParser):
        cfg = ScanConfiguration(
            regions=["bad-region"],
            services=["fake_svc"],
            concurrency_limit=-5,
            verbosity="TRACE",
        )
        errors = parser.validate_config(cfg)
        assert len(errors) >= 3


# ---------------------------------------------------------------------------
# parse_suppression_file
# ---------------------------------------------------------------------------


class TestParseSuppressionFile:
    def test_parse_valid_suppression_file(self, parser: ConfigParser, tmp_path):
        data = {
            "suppressions": [
                {"service": "ec2", "check_id": "EC2-001", "resource_id": "i-123"},
                {"service": "s3"},
            ]
        }
        f = tmp_path / "suppressions.yaml"
        f.write_text(yaml.dump(data), encoding="utf-8")

        rules = parser.parse_suppression_file(str(f))
        assert len(rules) == 2
        assert rules[0].service == "ec2"
        assert rules[0].check_id == "EC2-001"
        assert rules[0].resource_id == "i-123"
        assert rules[1].service == "s3"
        assert rules[1].check_id is None

    def test_suppression_file_not_found(self, parser: ConfigParser):
        with pytest.raises(FileNotFoundError):
            parser.parse_suppression_file("/nonexistent/supp.yaml")

    def test_suppression_file_invalid_yaml(self, parser: ConfigParser, tmp_path):
        f = tmp_path / "bad.yaml"
        f.write_text(":\n  bad: [", encoding="utf-8")

        with pytest.raises(ValueError, match="Invalid YAML"):
            parser.parse_suppression_file(str(f))

    def test_suppression_file_missing_key(self, parser: ConfigParser, tmp_path):
        f = tmp_path / "no_key.yaml"
        f.write_text(yaml.dump({"other": []}), encoding="utf-8")

        with pytest.raises(ValueError, match="missing required key 'suppressions'"):
            parser.parse_suppression_file(str(f))

    def test_suppression_file_not_a_dict(self, parser: ConfigParser, tmp_path):
        f = tmp_path / "list.yaml"
        f.write_text(yaml.dump(["item1", "item2"]), encoding="utf-8")

        with pytest.raises(ValueError, match="must contain a mapping"):
            parser.parse_suppression_file(str(f))

    def test_suppression_rule_not_a_dict(self, parser: ConfigParser, tmp_path):
        data = {"suppressions": ["not_a_dict"]}
        f = tmp_path / "bad_rule.yaml"
        f.write_text(yaml.dump(data), encoding="utf-8")

        with pytest.raises(ValueError, match="must be a mapping"):
            parser.parse_suppression_file(str(f))
