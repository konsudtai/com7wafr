"""Config Parser for AWS Well-Architected Review Tool.

Reads and validates scan configuration from CLI arguments,
JSON/YAML configuration files, and suppression files.
"""

import argparse
import json
import re
from pathlib import Path

import yaml

from core.models import ScanConfiguration, SuppressionRule, TagFilter

# Supported AWS services for scanning
SUPPORTED_SERVICES = [
    "ec2", "s3", "rds", "iam", "lambda",
    "dynamodb", "elb", "cloudfront", "ecs", "eks",
]

# Valid AWS region pattern
AWS_REGION_PATTERN = re.compile(r"^[a-z]{2}(-[a-z]+-\d+)$")

# Valid verbosity levels
VALID_VERBOSITY_LEVELS = ["DEBUG", "INFO", "WARNING", "ERROR"]


class ConfigParser:
    """Parse and validate scan configuration from multiple sources."""

    def parse_cli_args(self, args: argparse.Namespace) -> ScanConfiguration:
        """Parse CLI arguments into ScanConfiguration.

        Handles conversion of comma-separated strings to lists,
        Key=Value tag format to TagFilter objects, and type coercion.
        """
        regions: list[str] = []
        if hasattr(args, "regions") and args.regions:
            regions = [r.strip() for r in args.regions.split(",") if r.strip()]

        services: list[str] = []
        if hasattr(args, "services") and args.services:
            services = [s.strip().lower() for s in args.services.split(",") if s.strip()]

        tags: list[TagFilter] = []
        if hasattr(args, "tags") and args.tags:
            for tag_str in args.tags:
                if "=" in tag_str:
                    key, value = tag_str.split("=", 1)
                    tags.append(TagFilter(key=key.strip(), value=value.strip()))

        output_dir = getattr(args, "output_dir", "./output") or "./output"
        suppression_file = getattr(args, "suppression_file", None)
        concurrency = int(getattr(args, "concurrency", 10) or 10)
        verbosity = (getattr(args, "verbosity", "INFO") or "INFO").upper()
        wa_integration = bool(getattr(args, "wa_integration", False))

        return ScanConfiguration(
            regions=regions,
            services=services,
            tags=tags,
            output_dir=output_dir,
            suppression_file=suppression_file,
            concurrency_limit=concurrency,
            verbosity=verbosity,
            wa_integration=wa_integration,
        )

    def parse_config_file(self, file_path: str) -> ScanConfiguration:
        """Parse JSON or YAML configuration file into ScanConfiguration.

        Raises:
            ValueError: If file format is unsupported or content is invalid.
            FileNotFoundError: If the file does not exist.
        """
        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(f"Configuration file not found: {file_path}")

        suffix = path.suffix.lower()
        content = path.read_text(encoding="utf-8")

        if suffix == ".json":
            try:
                data = json.loads(content)
            except json.JSONDecodeError as e:
                raise ValueError(f"Invalid JSON in configuration file '{file_path}': {e}") from e
        elif suffix in (".yaml", ".yml"):
            try:
                data = yaml.safe_load(content)
            except yaml.YAMLError as e:
                raise ValueError(f"Invalid YAML in configuration file '{file_path}': {e}") from e
        else:
            raise ValueError(
                f"Unsupported configuration file format '{suffix}'. "
                "Supported formats: .json, .yaml, .yml"
            )

        if not isinstance(data, dict):
            raise ValueError(
                f"Configuration file '{file_path}' must contain a mapping/object at the top level."
            )

        return self._dict_to_scan_config(data)

    def merge_configs(
        self, file_config: ScanConfiguration, cli_config: ScanConfiguration
    ) -> ScanConfiguration:
        """Merge file config and CLI config. CLI args take precedence.

        For list fields: use CLI value if non-empty, otherwise file value.
        For scalar fields: use CLI value if it differs from default, otherwise file value.
        """
        defaults = ScanConfiguration()

        regions = cli_config.regions if cli_config.regions else file_config.regions
        services = cli_config.services if cli_config.services else file_config.services
        tags = cli_config.tags if cli_config.tags else file_config.tags
        accounts = cli_config.accounts if cli_config.accounts else file_config.accounts

        output_dir = (
            cli_config.output_dir
            if cli_config.output_dir != defaults.output_dir
            else file_config.output_dir
        )
        suppression_file = (
            cli_config.suppression_file
            if cli_config.suppression_file is not None
            else file_config.suppression_file
        )
        concurrency_limit = (
            cli_config.concurrency_limit
            if cli_config.concurrency_limit != defaults.concurrency_limit
            else file_config.concurrency_limit
        )
        verbosity = (
            cli_config.verbosity
            if cli_config.verbosity != defaults.verbosity
            else file_config.verbosity
        )
        wa_integration = (
            cli_config.wa_integration
            if cli_config.wa_integration != defaults.wa_integration
            else file_config.wa_integration
        )
        sts_session_duration = (
            cli_config.sts_session_duration
            if cli_config.sts_session_duration != defaults.sts_session_duration
            else file_config.sts_session_duration
        )

        return ScanConfiguration(
            regions=regions,
            services=services,
            tags=tags,
            output_dir=output_dir,
            suppression_file=suppression_file,
            concurrency_limit=concurrency_limit,
            verbosity=verbosity,
            wa_integration=wa_integration,
            accounts=accounts,
            sts_session_duration=sts_session_duration,
        )

    def parse_suppression_file(self, file_path: str) -> list[SuppressionRule]:
        """Parse YAML suppression file and return list of SuppressionRule objects.

        Expected format:
            suppressions:
              - service: "ec2"
                check_id: "ec2-001"
                resource_id: "i-xxx"

        Raises:
            ValueError: If file format is invalid.
            FileNotFoundError: If the file does not exist.
        """
        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(f"Suppression file not found: {file_path}")

        content = path.read_text(encoding="utf-8")
        try:
            data = yaml.safe_load(content)
        except yaml.YAMLError as e:
            raise ValueError(
                f"Invalid YAML in suppression file '{file_path}': {e}"
            ) from e

        if not isinstance(data, dict):
            raise ValueError(
                f"Suppression file '{file_path}' must contain a mapping with a 'suppressions' key."
            )

        if "suppressions" not in data:
            raise ValueError(
                f"Suppression file '{file_path}' is missing required key 'suppressions'."
            )

        suppressions_list = data["suppressions"]
        if not isinstance(suppressions_list, list):
            raise ValueError(
                f"'suppressions' in '{file_path}' must be a list of suppression rules."
            )

        rules: list[SuppressionRule] = []
        for i, item in enumerate(suppressions_list):
            if not isinstance(item, dict):
                raise ValueError(
                    f"Suppression rule at position {i} in '{file_path}' must be a mapping, "
                    f"got {type(item).__name__}."
                )
            rules.append(
                SuppressionRule(
                    service=item.get("service"),
                    check_id=item.get("check_id"),
                    resource_id=item.get("resource_id"),
                )
            )

        return rules

    def validate_config(self, config: ScanConfiguration) -> list[str]:
        """Validate configuration and return list of error messages.

        Validates:
        - Regions match valid AWS region format
        - Services are in the supported list
        - concurrency_limit > 0
        - verbosity is one of DEBUG, INFO, WARNING, ERROR

        Returns empty list if configuration is valid.
        """
        errors: list[str] = []

        for region in config.regions:
            if not AWS_REGION_PATTERN.match(region):
                errors.append(
                    f"Invalid AWS region format: '{region}'. "
                    "Expected format like 'us-east-1', 'ap-southeast-1'."
                )

        for service in config.services:
            if service.lower() not in SUPPORTED_SERVICES:
                errors.append(
                    f"Unsupported service: '{service}'. "
                    f"Supported services: {', '.join(SUPPORTED_SERVICES)}."
                )

        if config.concurrency_limit <= 0:
            errors.append(
                f"concurrency_limit must be greater than 0, got {config.concurrency_limit}."
            )

        if config.verbosity.upper() not in VALID_VERBOSITY_LEVELS:
            errors.append(
                f"Invalid verbosity level: '{config.verbosity}'. "
                f"Valid levels: {', '.join(VALID_VERBOSITY_LEVELS)}."
            )

        return errors

    # --- Private helpers ---

    def _dict_to_scan_config(self, data: dict) -> ScanConfiguration:
        """Convert a dictionary (from JSON/YAML) to ScanConfiguration."""
        tags: list[TagFilter] = []
        if "tags" in data and isinstance(data["tags"], list):
            for tag_item in data["tags"]:
                if isinstance(tag_item, dict) and "key" in tag_item and "value" in tag_item:
                    tags.append(TagFilter(key=tag_item["key"], value=tag_item["value"]))
                elif isinstance(tag_item, str) and "=" in tag_item:
                    key, value = tag_item.split("=", 1)
                    tags.append(TagFilter(key=key.strip(), value=value.strip()))

        regions = data.get("regions", [])
        if isinstance(regions, str):
            regions = [r.strip() for r in regions.split(",") if r.strip()]

        services = data.get("services", [])
        if isinstance(services, str):
            services = [s.strip().lower() for s in services.split(",") if s.strip()]

        return ScanConfiguration(
            regions=regions,
            services=services,
            tags=tags,
            output_dir=data.get("output_dir", "./output"),
            suppression_file=data.get("suppression_file"),
            concurrency_limit=int(data.get("concurrency_limit", 10)),
            verbosity=str(data.get("verbosity", "INFO")).upper(),
            wa_integration=bool(data.get("wa_integration", False)),
            accounts=data.get("accounts", []),
            sts_session_duration=int(data.get("sts_session_duration", 3600)),
        )
