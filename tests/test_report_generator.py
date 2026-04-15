"""Unit tests for ReportGenerator."""

import json
from datetime import datetime, timezone
from pathlib import Path

import pytest

from core.models import (
    Finding,
    Pillar,
    ScanConfiguration,
    ScanResult,
    ScanStatus,
    Severity,
)
from core.report_generator import ReportGenerator


def _make_finding(
    *,
    account_id: str = "111111111111",
    region: str = "us-east-1",
    service: str = "ec2",
    severity: Severity = Severity.HIGH,
    pillar: Pillar = Pillar.SECURITY,
    finding_id: str = "f-1",
    doc_url: str | None = "https://docs.aws.amazon.com/example",
) -> Finding:
    return Finding(
        finding_id=finding_id,
        account_id=account_id,
        region=region,
        service=service,
        resource_id="r-abc",
        check_id="chk-001",
        pillar=pillar,
        severity=severity,
        title="Test finding",
        description="A test finding description",
        recommendation="Fix this issue",
        documentation_url=doc_url,
        timestamp=datetime(2024, 1, 1, tzinfo=timezone.utc),
    )


def _make_scan_result(
    findings: list[Finding] | None = None,
    suppressed: list[Finding] | None = None,
    errors: list[str] | None = None,
) -> ScanResult:
    return ScanResult(
        scan_id="scan-001",
        status=ScanStatus.COMPLETED,
        started_at=datetime(2024, 1, 1, 0, 0, tzinfo=timezone.utc),
        completed_at=datetime(2024, 1, 1, 1, 0, tzinfo=timezone.utc),
        configuration=ScanConfiguration(),
        findings=findings or [],
        suppressed_findings=suppressed or [],
        errors=errors or [],
        resources_scanned=10,
    )


@pytest.fixture
def gen() -> ReportGenerator:
    return ReportGenerator()


class TestGenerateHTML:
    def test_creates_file(self, gen: ReportGenerator, tmp_path: Path) -> None:
        result = _make_scan_result()
        path = gen.generate_html(result, str(tmp_path))
        assert Path(path).exists()
        assert path.endswith("report.html")

    def test_self_contained(self, gen: ReportGenerator, tmp_path: Path) -> None:
        result = _make_scan_result(findings=[_make_finding()])
        path = gen.generate_html(result, str(tmp_path))
        html = Path(path).read_text(encoding="utf-8")
        assert "<style>" in html
        assert "<script>" in html
        assert "<!DOCTYPE html>" in html

    def test_summary_dashboard(self, gen: ReportGenerator, tmp_path: Path) -> None:
        findings = [
            _make_finding(severity=Severity.CRITICAL, finding_id="f-1"),
            _make_finding(severity=Severity.HIGH, finding_id="f-2"),
        ]
        result = _make_scan_result(findings=findings)
        path = gen.generate_html(result, str(tmp_path))
        html = Path(path).read_text(encoding="utf-8")
        assert "Summary Dashboard" in html
        assert "Total Findings" in html
        assert ">2<" in html  # total findings value

    def test_suppressed_count_shown(self, gen: ReportGenerator, tmp_path: Path) -> None:
        suppressed = [_make_finding(finding_id="f-s1")]
        result = _make_scan_result(suppressed=suppressed)
        path = gen.generate_html(result, str(tmp_path))
        html = Path(path).read_text(encoding="utf-8")
        assert "Suppressed" in html
        assert ">1<" in html

    def test_filter_dropdowns_present(self, gen: ReportGenerator, tmp_path: Path) -> None:
        result = _make_scan_result(findings=[_make_finding()])
        path = gen.generate_html(result, str(tmp_path))
        html = Path(path).read_text(encoding="utf-8")
        assert 'id="f-service"' in html
        assert 'id="f-region"' in html
        assert 'id="f-pillar"' in html
        assert 'id="f-severity"' in html
        assert 'id="f-search"' in html
        assert "applyFilters" in html

    def test_documentation_links(self, gen: ReportGenerator, tmp_path: Path) -> None:
        result = _make_scan_result(
            findings=[_make_finding(doc_url="https://docs.aws.amazon.com/test")]
        )
        path = gen.generate_html(result, str(tmp_path))
        html = Path(path).read_text(encoding="utf-8")
        assert "https://docs.aws.amazon.com/test" in html
        assert "doc-link" in html

    def test_cross_account_sections(self, gen: ReportGenerator, tmp_path: Path) -> None:
        findings = [
            _make_finding(account_id="111111111111", finding_id="f-1"),
            _make_finding(account_id="222222222222", finding_id="f-2"),
        ]
        result = _make_scan_result(findings=findings)
        path = gen.generate_html(result, str(tmp_path))
        html = Path(path).read_text(encoding="utf-8")
        assert "Results by Account" in html
        assert "111111111111" in html
        assert "222222222222" in html

    def test_single_account_no_account_section(
        self, gen: ReportGenerator, tmp_path: Path
    ) -> None:
        result = _make_scan_result(findings=[_make_finding()])
        path = gen.generate_html(result, str(tmp_path))
        html = Path(path).read_text(encoding="utf-8")
        assert "Results by Account" not in html

    def test_severity_pillar_distribution(
        self, gen: ReportGenerator, tmp_path: Path
    ) -> None:
        result = _make_scan_result(
            findings=[_make_finding(pillar=Pillar.RELIABILITY, severity=Severity.LOW)]
        )
        path = gen.generate_html(result, str(tmp_path))
        html = Path(path).read_text(encoding="utf-8")
        assert "Severity Distribution" in html
        assert "Findings by Pillar" in html
        assert "reliability" in html

    def test_errors_shown(self, gen: ReportGenerator, tmp_path: Path) -> None:
        result = _make_scan_result(errors=["Something went wrong"])
        path = gen.generate_html(result, str(tmp_path))
        html = Path(path).read_text(encoding="utf-8")
        assert "Something went wrong" in html

    def test_creates_output_dir(self, gen: ReportGenerator, tmp_path: Path) -> None:
        nested = tmp_path / "sub" / "dir"
        path = gen.generate_html(_make_scan_result(), str(nested))
        assert Path(path).exists()


class TestGenerateJsonRaw:
    def test_creates_file(self, gen: ReportGenerator, tmp_path: Path) -> None:
        result = _make_scan_result()
        path = gen.generate_json_raw(result, str(tmp_path))
        assert Path(path).exists()
        assert path.endswith("api-raw.json")

    def test_contains_findings(self, gen: ReportGenerator, tmp_path: Path) -> None:
        result = _make_scan_result(findings=[_make_finding()])
        path = gen.generate_json_raw(result, str(tmp_path))
        data = json.loads(Path(path).read_text())
        assert len(data["findings"]) == 1
        assert data["findings"][0]["finding_id"] == "f-1"

    def test_suppressed_count(self, gen: ReportGenerator, tmp_path: Path) -> None:
        suppressed = [_make_finding(finding_id="f-s1"), _make_finding(finding_id="f-s2")]
        result = _make_scan_result(suppressed=suppressed)
        path = gen.generate_json_raw(result, str(tmp_path))
        data = json.loads(Path(path).read_text())
        assert data["suppressed_findings_count"] == 2

    def test_scan_metadata(self, gen: ReportGenerator, tmp_path: Path) -> None:
        result = _make_scan_result()
        path = gen.generate_json_raw(result, str(tmp_path))
        data = json.loads(Path(path).read_text())
        assert data["scan_id"] == "scan-001"
        assert data["status"] == "COMPLETED"
        assert data["resources_scanned"] == 10

    def test_errors_included(self, gen: ReportGenerator, tmp_path: Path) -> None:
        result = _make_scan_result(errors=["err1", "err2"])
        path = gen.generate_json_raw(result, str(tmp_path))
        data = json.loads(Path(path).read_text())
        assert data["errors"] == ["err1", "err2"]


class TestGenerateJsonFull:
    def test_creates_file(self, gen: ReportGenerator, tmp_path: Path) -> None:
        result = _make_scan_result()
        path = gen.generate_json_full(result, str(tmp_path))
        assert Path(path).exists()
        assert path.endswith("api-full.json")

    def test_contains_summary(self, gen: ReportGenerator, tmp_path: Path) -> None:
        findings = [
            _make_finding(severity=Severity.CRITICAL, finding_id="f-1"),
            _make_finding(severity=Severity.HIGH, finding_id="f-2"),
        ]
        result = _make_scan_result(findings=findings)
        path = gen.generate_json_full(result, str(tmp_path))
        data = json.loads(Path(path).read_text())
        assert "summary" in data
        assert data["summary"]["total_findings"] == 2
        assert data["summary"]["by_severity"]["CRITICAL"] == 1
        assert data["summary"]["by_severity"]["HIGH"] == 1

    def test_contains_configuration(self, gen: ReportGenerator, tmp_path: Path) -> None:
        result = _make_scan_result()
        path = gen.generate_json_full(result, str(tmp_path))
        data = json.loads(Path(path).read_text())
        assert "configuration" in data

    def test_suppressed_count(self, gen: ReportGenerator, tmp_path: Path) -> None:
        suppressed = [_make_finding(finding_id="f-s1")]
        result = _make_scan_result(suppressed=suppressed)
        path = gen.generate_json_full(result, str(tmp_path))
        data = json.loads(Path(path).read_text())
        assert data["suppressed_findings_count"] == 1
        assert data["summary"]["suppressed_findings"] == 1

    def test_per_account_detail(self, gen: ReportGenerator, tmp_path: Path) -> None:
        findings = [
            _make_finding(account_id="111111111111", finding_id="f-1"),
            _make_finding(account_id="222222222222", finding_id="f-2"),
        ]
        result = _make_scan_result(findings=findings)
        path = gen.generate_json_full(result, str(tmp_path))
        data = json.loads(Path(path).read_text())
        detail = data["summary"]["accounts_detail"]
        assert "111111111111" in detail
        assert "222222222222" in detail
        assert detail["111111111111"]["total"] == 1

    def test_heatmap(self, gen: ReportGenerator, tmp_path: Path) -> None:
        findings = [
            _make_finding(service="ec2", pillar=Pillar.SECURITY, finding_id="f-1"),
            _make_finding(service="s3", pillar=Pillar.RELIABILITY, finding_id="f-2"),
        ]
        result = _make_scan_result(findings=findings)
        path = gen.generate_json_full(result, str(tmp_path))
        data = json.loads(Path(path).read_text())
        heatmap = data["summary"]["heatmap"]
        assert heatmap["ec2"]["security"] == 1
        assert heatmap["s3"]["reliability"] == 1


class TestGenerateAll:
    def test_generates_all_formats(self, gen: ReportGenerator, tmp_path: Path) -> None:
        result = _make_scan_result(findings=[_make_finding()])
        paths = gen.generate_all(result, str(tmp_path))
        assert "html" in paths
        assert "json_raw" in paths
        assert "json_full" in paths
        for p in paths.values():
            assert Path(p).exists()


class TestBuildSummary:
    def test_empty_findings(self, gen: ReportGenerator) -> None:
        result = _make_scan_result()
        summary = gen._build_summary(result)
        assert summary["total_findings"] == 0
        assert summary["by_severity"] == {}
        assert summary["by_pillar"] == {}

    def test_counts_match(self, gen: ReportGenerator) -> None:
        findings = [
            _make_finding(severity=Severity.CRITICAL, pillar=Pillar.SECURITY, finding_id="f-1"),
            _make_finding(severity=Severity.CRITICAL, pillar=Pillar.SECURITY, finding_id="f-2"),
            _make_finding(severity=Severity.LOW, pillar=Pillar.COST_OPTIMIZATION, finding_id="f-3"),
        ]
        result = _make_scan_result(findings=findings)
        summary = gen._build_summary(result)
        assert summary["total_findings"] == 3
        assert summary["by_severity"]["CRITICAL"] == 2
        assert summary["by_severity"]["LOW"] == 1
        assert summary["by_pillar"]["security"] == 2
        assert summary["by_pillar"]["cost_optimization"] == 1
