"""Unit tests for RuleEngine class."""

import logging
import textwrap
from pathlib import Path

import pytest

from core.models import Check, Finding, Pillar, ResourceData, Severity
from core.rule_engine import RuleEngine


@pytest.fixture
def tmp_checks_dir(tmp_path: Path) -> Path:
    """Create a temporary checks directory."""
    checks_dir = tmp_path / "checks"
    checks_dir.mkdir()
    return checks_dir


def _write_yaml(path: Path, content: str) -> Path:
    path.write_text(textwrap.dedent(content), encoding="utf-8")
    return path


def _make_resource(**overrides) -> ResourceData:
    defaults = dict(
        resource_id="i-12345",
        resource_arn="arn:aws:ec2:us-east-1:111111111111:instance/i-12345",
        service="ec2",
        region="us-east-1",
        account_id="111111111111",
        configuration={"monitoring": False, "instance_type": "t2.micro"},
        tags={"Environment": "dev"},
    )
    defaults.update(overrides)
    return ResourceData(**defaults)


class TestLoadChecks:
    def test_load_valid_yaml(self, tmp_checks_dir: Path):
        _write_yaml(tmp_checks_dir / "ec2_checks.yaml", """\
            checks:
              - check_id: EC2-001
                service: ec2
                description: EC2 monitoring disabled
                pillar: security
                severity: HIGH
                remediation_guidance: Enable detailed monitoring
                conditions:
                  - path: monitoring
                    operator: eq
                    value: false
        """)
        engine = RuleEngine(checks_dir=tmp_checks_dir)
        count = engine.load_checks()
        assert count == 1
        assert len(engine.checks) == 1
        assert engine.checks[0].check_id == "EC2-001"

    def test_load_checks_with_dir_parameter(self, tmp_checks_dir: Path):
        """load_checks(checks_dir=...) should override the init dir."""
        _write_yaml(tmp_checks_dir / "s3.yaml", """\
            - check_id: S3-001
              service: s3
              description: S3 bucket versioning disabled
              pillar: reliability
              severity: MEDIUM
              remediation_guidance: Enable versioning
              conditions:
                - path: versioning
                  operator: eq
                  value: false
        """)
        engine = RuleEngine()  # default dir (no YAML there)
        count = engine.load_checks(checks_dir=tmp_checks_dir)
        assert count == 1
        assert engine.checks[0].check_id == "S3-001"

    def test_load_yml_extension(self, tmp_checks_dir: Path):
        _write_yaml(tmp_checks_dir / "iam.yml", """\
            - check_id: IAM-001
              service: iam
              description: Root account used
              pillar: security
              severity: CRITICAL
              remediation_guidance: Avoid root usage
              conditions:
                - path: is_root
                  operator: eq
                  value: true
        """)
        engine = RuleEngine(checks_dir=tmp_checks_dir)
        count = engine.load_checks()
        assert count == 1

    def test_load_multiple_checks_in_one_file(self, tmp_checks_dir: Path):
        _write_yaml(tmp_checks_dir / "multi.yaml", """\
            checks:
              - check_id: EC2-001
                service: ec2
                description: Check 1
                pillar: security
                severity: HIGH
                remediation_guidance: Fix 1
                conditions:
                  - path: monitoring
                    operator: eq
                    value: false
              - check_id: EC2-002
                service: ec2
                description: Check 2
                pillar: reliability
                severity: MEDIUM
                remediation_guidance: Fix 2
                conditions:
                  - path: backup
                    operator: eq
                    value: false
        """)
        engine = RuleEngine(checks_dir=tmp_checks_dir)
        count = engine.load_checks()
        assert count == 2

    def test_load_empty_yaml(self, tmp_checks_dir: Path):
        _write_yaml(tmp_checks_dir / "empty.yaml", "")
        engine = RuleEngine(checks_dir=tmp_checks_dir)
        count = engine.load_checks()
        assert count == 0

    def test_load_nonexistent_directory(self, tmp_path: Path):
        engine = RuleEngine(checks_dir=tmp_path / "nonexistent")
        count = engine.load_checks()
        assert count == 0

    def test_invalid_check_missing_fields_logs_warning(self, tmp_checks_dir: Path, caplog):
        _write_yaml(tmp_checks_dir / "bad.yaml", """\
            - check_id: BAD-001
              description: Missing service and pillar
        """)
        engine = RuleEngine(checks_dir=tmp_checks_dir)
        with caplog.at_level(logging.WARNING):
            count = engine.load_checks()
        assert count == 0
        assert "BAD-001" in caplog.text

    def test_invalid_check_bad_pillar_logs_warning(self, tmp_checks_dir: Path, caplog):
        _write_yaml(tmp_checks_dir / "bad_pillar.yaml", """\
            - check_id: BAD-002
              service: ec2
              description: Bad pillar value
              pillar: nonexistent_pillar
              severity: HIGH
              remediation_guidance: Fix it
        """)
        engine = RuleEngine(checks_dir=tmp_checks_dir)
        with caplog.at_level(logging.WARNING):
            count = engine.load_checks()
        assert count == 0
        assert "BAD-002" in caplog.text

    def test_load_clears_previous_checks(self, tmp_checks_dir: Path):
        _write_yaml(tmp_checks_dir / "first.yaml", """\
            - check_id: EC2-001
              service: ec2
              description: First check
              pillar: security
              severity: HIGH
              remediation_guidance: Fix
              conditions:
                - path: x
                  operator: eq
                  value: false
        """)
        engine = RuleEngine(checks_dir=tmp_checks_dir)
        engine.load_checks()
        assert len(engine.checks) == 1

        # Remove the file and reload
        (tmp_checks_dir / "first.yaml").unlink()
        count = engine.load_checks()
        assert count == 0
        assert len(engine.checks) == 0

    def test_load_subdirectory_checks(self, tmp_checks_dir: Path):
        sub = tmp_checks_dir / "ec2"
        sub.mkdir()
        _write_yaml(sub / "monitoring.yaml", """\
            - check_id: EC2-001
              service: ec2
              description: Monitoring check
              pillar: security
              severity: HIGH
              remediation_guidance: Enable monitoring
              conditions:
                - path: monitoring
                  operator: eq
                  value: false
        """)
        engine = RuleEngine(checks_dir=tmp_checks_dir)
        count = engine.load_checks()
        assert count == 1


class TestEvaluate:
    def _setup_engine(self, tmp_checks_dir: Path) -> RuleEngine:
        _write_yaml(tmp_checks_dir / "ec2.yaml", """\
            checks:
              - check_id: EC2-001
                service: ec2
                description: Monitoring disabled
                pillar: security
                severity: HIGH
                remediation_guidance: Enable monitoring
                conditions:
                  - path: monitoring
                    operator: eq
                    value: true
        """)
        engine = RuleEngine(checks_dir=tmp_checks_dir)
        engine.load_checks()
        return engine

    def test_evaluate_returns_finding_on_failure(self, tmp_checks_dir: Path):
        engine = self._setup_engine(tmp_checks_dir)
        resource = _make_resource(configuration={"monitoring": False})
        findings = engine.evaluate(resource)
        assert len(findings) == 1
        f = findings[0]
        assert f.check_id == "EC2-001"
        assert f.pillar == Pillar.SECURITY
        assert f.severity == Severity.HIGH
        assert f.account_id == "111111111111"
        assert f.region == "us-east-1"
        assert f.resource_id == "i-12345"
        assert f.recommendation == "Enable monitoring"

    def test_evaluate_returns_empty_on_pass(self, tmp_checks_dir: Path):
        engine = self._setup_engine(tmp_checks_dir)
        resource = _make_resource(configuration={"monitoring": True})
        findings = engine.evaluate(resource)
        assert findings == []

    def test_evaluate_with_explicit_service_param(self, tmp_checks_dir: Path):
        engine = self._setup_engine(tmp_checks_dir)
        resource = _make_resource(
            service="other_service",
            configuration={"monitoring": False},
        )
        # Without service param, no checks match "other_service"
        assert engine.evaluate(resource) == []
        # With explicit service="ec2", the ec2 checks apply
        findings = engine.evaluate(resource, service="ec2")
        assert len(findings) == 1
        assert findings[0].check_id == "EC2-001"

    def test_evaluate_no_checks_for_service(self, tmp_checks_dir: Path):
        engine = self._setup_engine(tmp_checks_dir)
        resource = _make_resource(service="rds", configuration={})
        findings = engine.evaluate(resource)
        assert findings == []

    def test_evaluate_multiple_checks(self, tmp_checks_dir: Path):
        _write_yaml(tmp_checks_dir / "multi.yaml", """\
            checks:
              - check_id: EC2-001
                service: ec2
                description: Monitoring disabled
                pillar: security
                severity: HIGH
                remediation_guidance: Enable monitoring
                conditions:
                  - path: monitoring
                    operator: eq
                    value: true
              - check_id: EC2-002
                service: ec2
                description: No backup
                pillar: reliability
                severity: MEDIUM
                remediation_guidance: Enable backup
                conditions:
                  - path: backup_enabled
                    operator: eq
                    value: true
        """)
        engine = RuleEngine(checks_dir=tmp_checks_dir)
        engine.load_checks()
        resource = _make_resource(configuration={"monitoring": False, "backup_enabled": False})
        findings = engine.evaluate(resource)
        assert len(findings) == 2
        check_ids = {f.check_id for f in findings}
        assert check_ids == {"EC2-001", "EC2-002"}


class TestGetChecksByPillar:
    def test_filter_by_pillar(self, tmp_checks_dir: Path):
        _write_yaml(tmp_checks_dir / "mixed.yaml", """\
            checks:
              - check_id: SEC-001
                service: ec2
                description: Security check
                pillar: security
                severity: HIGH
                remediation_guidance: Fix
                conditions:
                  - path: x
                    operator: eq
                    value: false
              - check_id: REL-001
                service: ec2
                description: Reliability check
                pillar: reliability
                severity: MEDIUM
                remediation_guidance: Fix
                conditions:
                  - path: y
                    operator: eq
                    value: false
        """)
        engine = RuleEngine(checks_dir=tmp_checks_dir)
        engine.load_checks()
        sec_checks = engine.get_checks_by_pillar(Pillar.SECURITY)
        assert len(sec_checks) == 1
        assert sec_checks[0].check_id == "SEC-001"

        rel_checks = engine.get_checks_by_pillar(Pillar.RELIABILITY)
        assert len(rel_checks) == 1
        assert rel_checks[0].check_id == "REL-001"

    def test_empty_result_for_unused_pillar(self, tmp_checks_dir: Path):
        engine = RuleEngine(checks_dir=tmp_checks_dir)
        engine.load_checks()
        assert engine.get_checks_by_pillar(Pillar.COST_OPTIMIZATION) == []


class TestGetChecksByService:
    def test_filter_by_service(self, tmp_checks_dir: Path):
        _write_yaml(tmp_checks_dir / "services.yaml", """\
            checks:
              - check_id: EC2-001
                service: ec2
                description: EC2 check
                pillar: security
                severity: HIGH
                remediation_guidance: Fix
                conditions:
                  - path: x
                    operator: eq
                    value: false
              - check_id: S3-001
                service: s3
                description: S3 check
                pillar: reliability
                severity: MEDIUM
                remediation_guidance: Fix
                conditions:
                  - path: y
                    operator: eq
                    value: false
        """)
        engine = RuleEngine(checks_dir=tmp_checks_dir)
        engine.load_checks()
        ec2_checks = engine.get_checks_by_service("ec2")
        assert len(ec2_checks) == 1
        assert ec2_checks[0].check_id == "EC2-001"

        s3_checks = engine.get_checks_by_service("s3")
        assert len(s3_checks) == 1
        assert s3_checks[0].check_id == "S3-001"

    def test_empty_result_for_unknown_service(self, tmp_checks_dir: Path):
        engine = RuleEngine(checks_dir=tmp_checks_dir)
        engine.load_checks()
        assert engine.get_checks_by_service("unknown") == []


class TestInlineConditions:
    def test_not_exists_operator(self, tmp_checks_dir: Path):
        _write_yaml(tmp_checks_dir / "check.yaml", """\
            - check_id: EC2-010
              service: ec2
              description: Key should not exist
              pillar: security
              severity: LOW
              remediation_guidance: Remove key
              conditions:
                - path: public_ip
                  operator: not_exists
        """)
        engine = RuleEngine(checks_dir=tmp_checks_dir)
        engine.load_checks()
        # Resource HAS public_ip → not_exists triggers finding
        resource = _make_resource(configuration={"public_ip": "1.2.3.4"})
        findings = engine.evaluate(resource)
        assert len(findings) == 1

    def test_exists_operator(self, tmp_checks_dir: Path):
        _write_yaml(tmp_checks_dir / "check.yaml", """\
            - check_id: EC2-011
              service: ec2
              description: Key should exist
              pillar: security
              severity: LOW
              remediation_guidance: Add key
              conditions:
                - path: encryption
                  operator: exists
        """)
        engine = RuleEngine(checks_dir=tmp_checks_dir)
        engine.load_checks()
        # Resource does NOT have encryption → exists triggers finding
        resource = _make_resource(configuration={})
        findings = engine.evaluate(resource)
        assert len(findings) == 1

    def test_contains_operator(self, tmp_checks_dir: Path):
        _write_yaml(tmp_checks_dir / "check.yaml", """\
            - check_id: EC2-012
              service: ec2
              description: Should contain value
              pillar: security
              severity: LOW
              remediation_guidance: Fix
              conditions:
                - path: policy
                  operator: contains
                  value: "Allow"
        """)
        engine = RuleEngine(checks_dir=tmp_checks_dir)
        engine.load_checks()
        # policy does NOT contain "Allow" → finding
        resource = _make_resource(configuration={"policy": "Deny all"})
        findings = engine.evaluate(resource)
        assert len(findings) == 1

    def test_ne_operator(self, tmp_checks_dir: Path):
        _write_yaml(tmp_checks_dir / "check.yaml", """\
            - check_id: EC2-013
              service: ec2
              description: Should not equal
              pillar: security
              severity: LOW
              remediation_guidance: Fix
              conditions:
                - path: status
                  operator: ne
                  value: "running"
        """)
        engine = RuleEngine(checks_dir=tmp_checks_dir)
        engine.load_checks()
        # status IS "running" → ne triggers finding
        resource = _make_resource(configuration={"status": "running"})
        findings = engine.evaluate(resource)
        assert len(findings) == 1


class TestEvaluationLogicRef:
    def test_module_ref_loading(self, tmp_checks_dir: Path, tmp_path: Path):
        """Test loading evaluation function from a Python module reference."""
        # Create a temporary Python module
        mod_dir = tmp_path / "eval_mod"
        mod_dir.mkdir()
        (mod_dir / "__init__.py").write_text(
            "def check_fail(config, tags):\n    return True\n",
            encoding="utf-8",
        )

        import sys
        sys.path.insert(0, str(tmp_path))
        try:
            _write_yaml(tmp_checks_dir / "ref.yaml", """\
                - check_id: REF-001
                  service: ec2
                  description: Ref check
                  pillar: security
                  severity: HIGH
                  evaluation_logic_ref: "eval_mod:check_fail"
                  remediation_guidance: Fix
            """)
            engine = RuleEngine(checks_dir=tmp_checks_dir)
            engine.load_checks()
            resource = _make_resource()
            findings = engine.evaluate(resource)
            assert len(findings) == 1
            assert findings[0].check_id == "REF-001"
        finally:
            sys.path.remove(str(tmp_path))

    def test_invalid_module_ref_logs_warning(self, tmp_checks_dir: Path, caplog):
        _write_yaml(tmp_checks_dir / "bad_ref.yaml", """\
            - check_id: REF-002
              service: ec2
              description: Bad ref
              pillar: security
              severity: HIGH
              evaluation_logic_ref: "nonexistent.module:func"
              remediation_guidance: Fix
        """)
        engine = RuleEngine(checks_dir=tmp_checks_dir)
        with caplog.at_level(logging.WARNING):
            engine.load_checks()
        assert "REF-002" in caplog.text

    def test_dotted_path_format(self, tmp_checks_dir: Path, tmp_path: Path):
        """Test loading evaluation function via dotted path (no colon)."""
        mod_dir = tmp_path / "dotmod"
        mod_dir.mkdir()
        (mod_dir / "__init__.py").write_text(
            "def check_always_fail(config, tags):\n    return True\n",
            encoding="utf-8",
        )

        import sys
        sys.path.insert(0, str(tmp_path))
        try:
            _write_yaml(tmp_checks_dir / "dotted.yaml", """\
                - check_id: DOT-001
                  service: ec2
                  description: Dotted path check
                  pillar: security
                  severity: HIGH
                  evaluation_logic_ref: "dotmod.check_always_fail"
                  remediation_guidance: Fix
            """)
            engine = RuleEngine(checks_dir=tmp_checks_dir)
            engine.load_checks()
            resource = _make_resource()
            findings = engine.evaluate(resource)
            assert len(findings) == 1
            assert findings[0].check_id == "DOT-001"
        finally:
            sys.path.remove(str(tmp_path))

    def test_resource_based_evaluator(self, tmp_checks_dir: Path, tmp_path: Path):
        """Test evaluator that takes ResourceData and returns True for PASS."""
        mod_dir = tmp_path / "resmod"
        mod_dir.mkdir()
        (mod_dir / "__init__.py").write_text(
            "def check_monitoring(resource):\n"
            "    return resource.configuration.get('monitoring', False)\n",
            encoding="utf-8",
        )

        import sys
        sys.path.insert(0, str(tmp_path))
        try:
            _write_yaml(tmp_checks_dir / "res.yaml", """\
                - check_id: RES-001
                  service: ec2
                  description: Monitoring should be enabled
                  pillar: security
                  severity: HIGH
                  evaluation_logic_ref: "resmod:check_monitoring"
                  remediation_guidance: Enable monitoring
            """)
            engine = RuleEngine(checks_dir=tmp_checks_dir)
            engine.load_checks()

            # monitoring=False → evaluator returns False (fail) → finding created
            resource_fail = _make_resource(configuration={"monitoring": False})
            findings = engine.evaluate(resource_fail)
            assert len(findings) == 1
            assert findings[0].check_id == "RES-001"

            # monitoring=True → evaluator returns True (pass) → no finding
            resource_pass = _make_resource(configuration={"monitoring": True})
            findings = engine.evaluate(resource_pass)
            assert findings == []
        finally:
            sys.path.remove(str(tmp_path))

    def test_resource_based_evaluator_dotted_path(self, tmp_checks_dir: Path, tmp_path: Path):
        """Test ResourceData evaluator loaded via dotted path format."""
        mod_dir = tmp_path / "resdot"
        mod_dir.mkdir()
        (mod_dir / "__init__.py").write_text(
            "def check_encryption(resource):\n"
            "    return resource.configuration.get('encrypted', False)\n",
            encoding="utf-8",
        )

        import sys
        sys.path.insert(0, str(tmp_path))
        try:
            _write_yaml(tmp_checks_dir / "resdot.yaml", """\
                - check_id: RESDOT-001
                  service: s3
                  description: Encryption should be enabled
                  pillar: security
                  severity: CRITICAL
                  evaluation_logic_ref: "resdot.check_encryption"
                  remediation_guidance: Enable encryption
            """)
            engine = RuleEngine(checks_dir=tmp_checks_dir)
            engine.load_checks()

            resource_fail = _make_resource(service="s3", configuration={"encrypted": False})
            findings = engine.evaluate(resource_fail)
            assert len(findings) == 1

            resource_pass = _make_resource(service="s3", configuration={"encrypted": True})
            findings = engine.evaluate(resource_pass)
            assert findings == []
        finally:
            sys.path.remove(str(tmp_path))

    def test_invalid_dotted_path_logs_warning(self, tmp_checks_dir: Path, caplog):
        _write_yaml(tmp_checks_dir / "bad_dot.yaml", """\
            - check_id: BADDOT-001
              service: ec2
              description: Bad dotted ref
              pillar: security
              severity: HIGH
              evaluation_logic_ref: "nonexistent.module.func"
              remediation_guidance: Fix
        """)
        engine = RuleEngine(checks_dir=tmp_checks_dir)
        with caplog.at_level(logging.WARNING):
            engine.load_checks()
        assert "BADDOT-001" in caplog.text
