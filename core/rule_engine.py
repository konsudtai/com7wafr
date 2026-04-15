"""Rule Engine for AWS Well-Architected Review Tool.

Loads check definitions from YAML files in the checks/ directory,
evaluates resources against applicable checks, and produces findings.
"""

from __future__ import annotations

import importlib
import inspect
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

import yaml

from core.models import Check, Finding, Pillar, ResourceData, Severity

logger = logging.getLogger(__name__)

# Default checks directory relative to project root
DEFAULT_CHECKS_DIR = Path(__file__).resolve().parent.parent / "checks"

# Sentinel to distinguish ResourceData-based evaluators from (config, tags) ones
_RESOURCE_BASED = "resource_based"
_INLINE = "inline"


class RuleEngine:
    """Load check definitions and evaluate resources against them."""

    def __init__(self, checks_dir: str | Path | None = None) -> None:
        self.checks_dir = Path(checks_dir) if checks_dir else DEFAULT_CHECKS_DIR
        self._checks: list[Check] = []
        self._evaluators: dict[str, Callable] = {}
        self._evaluator_type: dict[str, str] = {}  # check_id -> _RESOURCE_BASED or _INLINE

    def load_checks(self, checks_dir: str | Path | None = None) -> int:
        """Load all check definitions from YAML files in the given directory.

        Args:
            checks_dir: Directory containing check YAML files. If provided,
                overrides the directory set in __init__. Accepts str or Path.

        Returns the number of checks loaded.
        Skips invalid definitions with a warning log that specifies the check ID.
        """
        if checks_dir is not None:
            self.checks_dir = Path(checks_dir)

        self._checks.clear()
        self._evaluators.clear()
        self._evaluator_type.clear()
        count = 0

        if not self.checks_dir.exists():
            logger.warning("Checks directory not found: %s", self.checks_dir)
            return 0

        for yaml_path in sorted(self.checks_dir.rglob("*.yaml")):
            try:
                loaded = self._load_yaml_file(yaml_path)
                count += loaded
            except Exception as exc:
                logger.warning("Failed to load %s: %s", yaml_path, exc)

        for yml_path in sorted(self.checks_dir.rglob("*.yml")):
            try:
                loaded = self._load_yaml_file(yml_path)
                count += loaded
            except Exception as exc:
                logger.warning("Failed to load %s: %s", yml_path, exc)

        logger.info("Loaded %d checks from %s", count, self.checks_dir)
        return count

    def evaluate(self, resource: ResourceData, service: str | None = None) -> list[Finding]:
        """Evaluate a resource against all applicable checks for a service.

        Args:
            resource: The resource data to evaluate.
            service: The service to filter checks by. If not provided,
                uses resource.service.

        Returns a list of findings for checks that the resource fails.
        """
        findings: list[Finding] = []
        target_service = service if service is not None else resource.service
        service_checks = self.get_checks_by_service(target_service)

        for check in service_checks:
            try:
                evaluator = self._evaluators.get(check.check_id)
                if evaluator is None:
                    continue

                eval_type = self._evaluator_type.get(check.check_id, _INLINE)

                if eval_type == _RESOURCE_BASED:
                    # ResourceData-based evaluator: returns True if PASSES
                    passed = evaluator(resource)
                    failed = not passed
                else:
                    # Inline/legacy evaluator: (config, tags) -> True if FAILS
                    failed = evaluator(resource.configuration, resource.tags)

                if failed:
                    findings.append(Finding(
                        finding_id=str(uuid.uuid4()),
                        account_id=resource.account_id,
                        region=resource.region,
                        service=resource.service,
                        resource_id=resource.resource_id,
                        resource_arn=resource.resource_arn,
                        check_id=check.check_id,
                        pillar=check.pillar,
                        severity=check.severity,
                        title=check.description,
                        description=check.description,
                        recommendation=check.remediation_guidance,
                        documentation_url=check.documentation_url,
                        timestamp=datetime.now(timezone.utc),
                    ))
            except Exception as exc:
                logger.warning(
                    "Error evaluating check %s on %s: %s",
                    check.check_id, resource.resource_id, exc,
                )

        return findings

    def get_checks_by_pillar(self, pillar: Pillar) -> list[Check]:
        """Return all checks for a given Well-Architected pillar."""
        return [c for c in self._checks if c.pillar == pillar]

    def get_checks_by_service(self, service: str) -> list[Check]:
        """Return all checks for a given service."""
        return [c for c in self._checks if c.service == service]

    @property
    def checks(self) -> list[Check]:
        return list(self._checks)

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _load_yaml_file(self, path: Path) -> int:
        """Load checks from a single YAML file. Returns count loaded."""
        content = path.read_text(encoding="utf-8")
        data = yaml.safe_load(content)
        if data is None:
            return 0

        checks_list = data if isinstance(data, list) else data.get("checks", [data])
        if not isinstance(checks_list, list):
            checks_list = [checks_list]

        loaded = 0
        for item in checks_list:
            if not isinstance(item, dict):
                continue
            try:
                check = self._parse_check(item, path)
                self._checks.append(check)
                self._register_evaluator(check, item, path)
                loaded += 1
            except Exception as exc:
                check_id = item.get("check_id", "unknown")
                logger.warning(
                    "Invalid check definition '%s' in %s: %s",
                    check_id, path, exc,
                )
        return loaded

    def _parse_check(self, item: dict, source_path: Path) -> Check:
        """Parse a dict into a Check model."""
        required = ["check_id", "service", "description", "pillar", "severity"]
        missing = [k for k in required if k not in item]
        if missing:
            raise ValueError(f"Missing required fields: {', '.join(missing)}")

        return Check(
            check_id=item["check_id"],
            service=item["service"],
            description=item["description"],
            pillar=Pillar(item["pillar"]),
            severity=Severity(item["severity"]),
            evaluation_logic_ref=item.get("evaluation_logic_ref", ""),
            remediation_guidance=item.get("remediation_guidance", ""),
            documentation_url=item.get("documentation_url"),
        )

    def _register_evaluator(
        self, check: Check, item: dict, source_path: Path
    ) -> None:
        """Register the evaluation function for a check.

        Supports three modes:
        1. evaluation_logic_ref with colon: "module.path:function_name"
        2. evaluation_logic_ref with dotted path: "module.path.function_name"
        3. Inline evaluation conditions in the YAML

        For modes 1 & 2, the function can have two signatures:
        - (resource: ResourceData) -> bool  — returns True if PASSES (compliant)
        - (config: dict, tags: dict) -> bool — returns True if FAILS (non-compliant)
        The signature is auto-detected via parameter count.
        """
        logic_ref = item.get("evaluation_logic_ref", "")

        if logic_ref:
            func = self._resolve_function_ref(logic_ref, check.check_id)
            if func is not None:
                self._evaluators[check.check_id] = func
                # Detect signature: 1 param = ResourceData-based, 2 params = inline-style
                try:
                    sig = inspect.signature(func)
                    param_count = len(sig.parameters)
                except (ValueError, TypeError):
                    param_count = 2  # fallback to legacy
                self._evaluator_type[check.check_id] = (
                    _RESOURCE_BASED if param_count == 1 else _INLINE
                )
                return

        # Inline conditions: evaluate based on YAML-defined conditions
        conditions = item.get("conditions")
        if conditions:
            evaluator = self._build_inline_evaluator(conditions)
            self._evaluators[check.check_id] = evaluator
            self._evaluator_type[check.check_id] = _INLINE
            return

        # No evaluator available — skip silently
        logger.debug("No evaluator for check %s", check.check_id)

    def _resolve_function_ref(
        self, logic_ref: str, check_id: str
    ) -> Callable | None:
        """Resolve a function reference string to a callable.

        Supports:
        - "module.path:function_name" (colon separator)
        - "module.path.function_name" (dotted path — last segment is function name)
        """
        # Try colon-separated format first
        if ":" in logic_ref:
            try:
                module_path, func_name = logic_ref.rsplit(":", 1)
                module = importlib.import_module(module_path)
                return getattr(module, func_name)
            except Exception as exc:
                logger.warning(
                    "Failed to load evaluator '%s' for %s: %s",
                    logic_ref, check_id, exc,
                )
                return None

        # Dotted path format: "checks.ec2.check_public_ip"
        # Last segment is the function name, rest is the module path
        parts = logic_ref.rsplit(".", 1)
        if len(parts) == 2:
            module_path, func_name = parts
            try:
                module = importlib.import_module(module_path)
                return getattr(module, func_name)
            except Exception as exc:
                logger.warning(
                    "Failed to load evaluator '%s' for %s: %s",
                    logic_ref, check_id, exc,
                )
                return None

        logger.warning(
            "Invalid evaluation_logic_ref format '%s' for %s",
            logic_ref, check_id,
        )
        return None

    @staticmethod
    def _build_inline_evaluator(
        conditions: list[dict],
    ) -> Callable[[dict, dict], bool]:
        """Build an evaluator from inline YAML conditions.

        Each condition is a dict with:
          - path: dot-separated key path into the configuration dict
          - operator: eq, ne, exists, not_exists, contains, in
          - value: expected value (not needed for exists/not_exists)

        Returns True (= finding triggered) if ANY condition matches.
        """

        def evaluator(config: dict, tags: dict) -> bool:
            for cond in conditions:
                path = cond.get("path", "")
                operator = cond.get("operator", "eq")
                expected = cond.get("value")

                actual = _resolve_path(config, path)

                if operator == "exists" and actual is None:
                    return True
                if operator == "not_exists" and actual is not None:
                    return True
                if operator == "eq" and actual != expected:
                    return True
                if operator == "ne" and actual == expected:
                    return True
                if operator == "contains" and (
                    actual is None or expected not in str(actual)
                ):
                    return True
                if operator == "in" and (
                    actual is None
                    or (isinstance(expected, list) and actual not in expected)
                ):
                    return True
            return False

        return evaluator


def _resolve_path(data: dict, path: str) -> Any:
    """Resolve a dot-separated path in a nested dict. Returns None if not found."""
    if not path:
        return data
    current: Any = data
    for key in path.split("."):
        if isinstance(current, dict):
            current = current.get(key)
        else:
            return None
    return current
