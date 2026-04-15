"""Unit tests for core/scanner.py — Scanner class.

Tests cover:
- filter_by_tags() with AND logic
- apply_suppressions() splitting active/suppressed findings
- scan() concurrent execution with error isolation
- scan_service() single service scanning
- Concurrency limiting
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest

from core.models import (
    Finding,
    Pillar,
    ResourceData,
    ScanConfiguration,
    ScanStatus,
    Severity,
    SuppressionRule,
    TagFilter,
)
from core.scanner import Scanner


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_resource(
    resource_id: str = "r-1",
    service: str = "ec2",
    region: str = "us-east-1",
    account_id: str = "111111111111",
    tags: dict[str, str] | None = None,
) -> ResourceData:
    return ResourceData(
        resource_id=resource_id,
        resource_arn=f"arn:aws:{service}:{region}:{account_id}:{resource_id}",
        service=service,
        region=region,
        account_id=account_id,
        configuration={},
        tags=tags or {},
    )


def _make_finding(
    finding_id: str = "f-1",
    service: str = "ec2",
    check_id: str = "CHK-001",
    resource_id: str = "r-1",
    severity: Severity = Severity.HIGH,
) -> Finding:
    return Finding(
        finding_id=finding_id,
        account_id="111111111111",
        region="us-east-1",
        service=service,
        resource_id=resource_id,
        check_id=check_id,
        pillar=Pillar.SECURITY,
        severity=severity,
        title="Test finding",
        description="Test description",
        recommendation="Fix it",
        timestamp=datetime.now(timezone.utc),
    )


def _default_config(**overrides) -> ScanConfiguration:
    defaults = dict(
        regions=["us-east-1"],
        services=["ec2"],
        concurrency_limit=10,
    )
    defaults.update(overrides)
    return ScanConfiguration(**defaults)


# ---------------------------------------------------------------------------
# filter_by_tags tests
# ---------------------------------------------------------------------------

class TestFilterByTags:
    """Tests for Scanner.filter_by_tags() — AND logic tag filtering."""

    def test_no_filters_returns_all(self):
        scanner = Scanner(config=_default_config())
        resources = [_make_resource(tags={"env": "prod"}), _make_resource(resource_id="r-2")]
        result = scanner.filter_by_tags(resources, [])
        assert len(result) == 2

    def test_single_tag_match(self):
        scanner = Scanner(config=_default_config())
        resources = [
            _make_resource(resource_id="r-1", tags={"env": "prod"}),
            _make_resource(resource_id="r-2", tags={"env": "dev"}),
            _make_resource(resource_id="r-3", tags={}),
        ]
        result = scanner.filter_by_tags(resources, [TagFilter(key="env", value="prod")])
        assert len(result) == 1
        assert result[0].resource_id == "r-1"

    def test_multiple_tags_and_logic(self):
        """Multiple tag filters use AND logic — resource must match ALL."""
        scanner = Scanner(config=_default_config())
        resources = [
            _make_resource(resource_id="r-1", tags={"env": "prod", "team": "infra"}),
            _make_resource(resource_id="r-2", tags={"env": "prod", "team": "app"}),
            _make_resource(resource_id="r-3", tags={"env": "dev", "team": "infra"}),
        ]
        filters = [
            TagFilter(key="env", value="prod"),
            TagFilter(key="team", value="infra"),
        ]
        result = scanner.filter_by_tags(resources, filters)
        assert len(result) == 1
        assert result[0].resource_id == "r-1"

    def test_no_resources_match(self):
        scanner = Scanner(config=_default_config())
        resources = [_make_resource(tags={"env": "dev"})]
        result = scanner.filter_by_tags(resources, [TagFilter(key="env", value="prod")])
        assert result == []

    def test_resource_missing_tag_key_excluded(self):
        """Resource without the tag key should be excluded."""
        scanner = Scanner(config=_default_config())
        resources = [_make_resource(tags={"other": "value"})]
        result = scanner.filter_by_tags(resources, [TagFilter(key="env", value="prod")])
        assert result == []


# ---------------------------------------------------------------------------
# apply_suppressions tests
# ---------------------------------------------------------------------------

class TestApplySuppressions:
    """Tests for suppression rule matching and splitting."""

    def test_no_suppression_file_returns_all_active(self):
        """When no suppression file is configured, all findings are active."""
        scanner = Scanner(config=_default_config())
        findings = [_make_finding()]
        active, suppressed = scanner.apply_suppressions(findings)
        assert len(active) == 1
        assert len(suppressed) == 0

    def test_suppress_by_service(self):
        scanner = Scanner(config=_default_config())
        findings = [
            _make_finding(finding_id="f-1", service="ec2"),
            _make_finding(finding_id="f-2", service="s3"),
        ]
        rules = [SuppressionRule(service="ec2")]
        active, suppressed = scanner.apply_suppression_rules(findings, rules)
        assert len(active) == 1
        assert active[0].service == "s3"
        assert len(suppressed) == 1
        assert suppressed[0].service == "ec2"

    def test_suppress_by_check_id(self):
        scanner = Scanner(config=_default_config())
        findings = [
            _make_finding(finding_id="f-1", check_id="CHK-001"),
            _make_finding(finding_id="f-2", check_id="CHK-002"),
        ]
        rules = [SuppressionRule(check_id="CHK-001")]
        active, suppressed = scanner.apply_suppression_rules(findings, rules)
        assert len(active) == 1
        assert active[0].check_id == "CHK-002"
        assert len(suppressed) == 1

    def test_suppress_by_resource_id(self):
        scanner = Scanner(config=_default_config())
        findings = [
            _make_finding(finding_id="f-1", resource_id="r-1"),
            _make_finding(finding_id="f-2", resource_id="r-2"),
        ]
        rules = [SuppressionRule(resource_id="r-1")]
        active, suppressed = scanner.apply_suppression_rules(findings, rules)
        assert len(active) == 1
        assert active[0].resource_id == "r-2"

    def test_suppress_by_combination(self):
        """Suppression with service + check_id + resource_id must match all."""
        scanner = Scanner(config=_default_config())
        findings = [
            _make_finding(finding_id="f-1", service="ec2", check_id="CHK-001", resource_id="r-1"),
            _make_finding(finding_id="f-2", service="ec2", check_id="CHK-001", resource_id="r-2"),
        ]
        rules = [SuppressionRule(service="ec2", check_id="CHK-001", resource_id="r-1")]
        active, suppressed = scanner.apply_suppression_rules(findings, rules)
        assert len(active) == 1
        assert active[0].resource_id == "r-2"
        assert len(suppressed) == 1

    def test_empty_rule_suppresses_all(self):
        """A rule with all None fields matches everything."""
        scanner = Scanner(config=_default_config())
        findings = [_make_finding(finding_id="f-1"), _make_finding(finding_id="f-2")]
        rules = [SuppressionRule()]
        active, suppressed = scanner.apply_suppression_rules(findings, rules)
        assert len(active) == 0
        assert len(suppressed) == 2

    def test_no_rules_returns_all_active(self):
        scanner = Scanner(config=_default_config())
        findings = [_make_finding()]
        active, suppressed = scanner.apply_suppression_rules(findings, [])
        assert len(active) == 1
        assert len(suppressed) == 0


# ---------------------------------------------------------------------------
# scan() concurrent execution tests
# ---------------------------------------------------------------------------

class TestScanConcurrent:
    """Tests for Scanner.scan() — concurrent execution and error isolation."""

    def test_scan_empty_config_completes(self):
        """Scan with no regions/services should complete immediately."""
        config = ScanConfiguration(regions=[], services=[])
        scanner = Scanner(config=config)
        result = asyncio.run(scanner.scan())
        assert result.status == ScanStatus.COMPLETED
        assert result.progress_percentage == 100.0
        assert result.findings == []
        assert result.errors == []

    def test_scan_creates_tasks_for_all_combinations(self):
        """Scan should create tasks for each account × region × service."""
        config = ScanConfiguration(
            regions=["us-east-1", "eu-west-1"],
            services=["ec2", "s3"],
            accounts=["current"],
            concurrency_limit=5,
        )
        scanner = Scanner(config=config)

        call_log: list[tuple] = []

        def mock_scan_service(account, region, service):
            call_log.append((account, region, service))
            return []

        scanner._scan_service = mock_scan_service
        result = asyncio.run(scanner.scan())

        assert result.status == ScanStatus.COMPLETED
        assert len(call_log) == 4  # 1 account × 2 regions × 2 services

    def test_scan_error_isolation(self):
        """Error in one task should not affect other tasks."""
        config = ScanConfiguration(
            regions=["us-east-1"],
            services=["ec2", "s3"],
            accounts=["current"],
            concurrency_limit=5,
        )
        scanner = Scanner(config=config)

        def mock_scan_service(account, region, service):
            if service == "ec2":
                raise RuntimeError("EC2 API error")
            return [_make_resource(service=service, region=region)]

        scanner._scan_service = mock_scan_service
        result = asyncio.run(scanner.scan())

        assert result.status == ScanStatus.COMPLETED
        assert result.resources_scanned == 1  # only s3 succeeded
        assert len(result.errors) == 1
        assert "ec2" in result.errors[0].lower() or "EC2" in result.errors[0]

    def test_scan_applies_tag_filtering(self):
        """Scan should filter resources by tags when configured."""
        config = ScanConfiguration(
            regions=["us-east-1"],
            services=["ec2"],
            accounts=["current"],
            tags=[TagFilter(key="env", value="prod")],
        )
        scanner = Scanner(config=config)

        def mock_scan_service(account, region, service):
            return [
                _make_resource(resource_id="r-1", tags={"env": "prod"}),
                _make_resource(resource_id="r-2", tags={"env": "dev"}),
            ]

        scanner._scan_service = mock_scan_service
        result = asyncio.run(scanner.scan())

        assert result.resources_scanned == 1  # only r-1 matches

    def test_scan_evaluates_with_rule_engine(self):
        """Scan should use rule_engine to evaluate resources."""
        config = ScanConfiguration(
            regions=["us-east-1"],
            services=["ec2"],
            accounts=["current"],
        )
        mock_rule_engine = MagicMock()
        mock_rule_engine.evaluate.return_value = [_make_finding()]

        scanner = Scanner(config=config, rule_engine=mock_rule_engine)

        def mock_scan_service(account, region, service):
            return [_make_resource()]

        scanner._scan_service = mock_scan_service
        result = asyncio.run(scanner.scan())

        assert mock_rule_engine.evaluate.called
        assert len(result.findings) == 1

    def test_scan_concurrency_limit_respected(self):
        """Concurrency limit should restrict parallel tasks."""
        config = ScanConfiguration(
            regions=["us-east-1", "us-west-2", "eu-west-1"],
            services=["ec2", "s3"],
            accounts=["current"],
            concurrency_limit=2,
        )
        scanner = Scanner(config=config)

        import threading
        max_concurrent = 0
        current_concurrent = 0
        lock = threading.Lock()

        original_scan = scanner._scan_service

        def tracking_scan(account, region, service):
            nonlocal max_concurrent, current_concurrent
            with lock:
                current_concurrent += 1
                max_concurrent = max(max_concurrent, current_concurrent)
            import time
            time.sleep(0.05)
            with lock:
                current_concurrent -= 1
            return []

        scanner._scan_service = tracking_scan
        result = asyncio.run(scanner.scan())

        assert result.status == ScanStatus.COMPLETED
        # The semaphore limits to 2, but ThreadPoolExecutor also has max_workers=2
        assert max_concurrent <= config.concurrency_limit

    def test_scan_result_has_correct_metadata(self):
        """ScanResult should have proper scan_id, timestamps, and status."""
        config = ScanConfiguration(
            regions=["us-east-1"],
            services=["ec2"],
            accounts=["current"],
        )
        scanner = Scanner(config=config)
        scanner._scan_service = lambda a, r, s: []

        result = asyncio.run(scanner.scan())

        assert result.scan_id  # non-empty UUID
        assert result.started_at is not None
        assert result.completed_at is not None
        assert result.completed_at >= result.started_at
        assert result.status == ScanStatus.COMPLETED
        assert result.current_service is None
        assert result.current_region is None


# ---------------------------------------------------------------------------
# scan_service() tests
# ---------------------------------------------------------------------------

class TestScanService:
    """Tests for Scanner.scan_service() — single service scanning."""

    def test_scan_service_unknown_service_returns_empty(self):
        """Unknown service should return empty list with warning."""
        config = _default_config()
        scanner = Scanner(config=config)
        # Mock _get_session to avoid real AWS calls
        scanner._get_session = MagicMock(return_value=MagicMock())
        result = scanner.scan_service("current", "us-east-1", "unknown_service")
        assert result == []

    def test_scan_service_delegates_to_service_scanner(self):
        """scan_service should delegate to the appropriate service scanner."""
        config = _default_config()
        scanner = Scanner(config=config)

        mock_session = MagicMock()
        scanner._get_session = MagicMock(return_value=mock_session)

        expected = [_make_resource(service="ec2")]
        scanner._service_scanners["ec2"] = MagicMock(return_value=expected)

        result = scanner.scan_service("current", "us-east-1", "ec2")
        assert result == expected
        scanner._service_scanners["ec2"].assert_called_once_with(
            mock_session, "us-east-1", "current"
        )
