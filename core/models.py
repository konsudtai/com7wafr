"""Pydantic v2 data models for AWS Well-Architected Review Tool."""

from __future__ import annotations

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


# --- Enums ---


class Pillar(str, Enum):
    """AWS Well-Architected Framework pillars."""

    SECURITY = "security"
    RELIABILITY = "reliability"
    OPERATIONAL_EXCELLENCE = "operational_excellence"
    PERFORMANCE_EFFICIENCY = "performance_efficiency"
    COST_OPTIMIZATION = "cost_optimization"


class Severity(str, Enum):
    """Finding severity levels."""

    CRITICAL = "CRITICAL"
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"
    INFORMATIONAL = "INFORMATIONAL"


class ScanStatus(str, Enum):
    """Scan job status."""

    PENDING = "PENDING"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class UserRole(str, Enum):
    """User roles for RBAC."""

    ADMIN = "Admin"
    VIEWER = "Viewer"


class MemberStatus(str, Enum):
    """Team member status in Cognito."""

    ACTIVE = "ACTIVE"
    INVITED = "INVITED"
    FORCE_CHANGE_PASSWORD = "FORCE_CHANGE_PASSWORD"


# --- Models ---


class TagFilter(BaseModel):
    """Tag key-value pair for resource filtering."""

    key: str
    value: str


class Finding(BaseModel):
    """A single finding from a check evaluation."""

    finding_id: str
    account_id: str
    region: str
    service: str
    resource_id: str
    resource_arn: str | None = None
    check_id: str
    pillar: Pillar
    severity: Severity
    title: str
    description: str
    recommendation: str
    documentation_url: str | None = None
    timestamp: datetime


class Check(BaseModel):
    """A check definition that maps to a Well-Architected pillar."""

    check_id: str
    service: str
    description: str
    pillar: Pillar
    severity: Severity
    evaluation_logic_ref: str
    remediation_guidance: str
    documentation_url: str | None = None


class SuppressionRule(BaseModel):
    """Rule for suppressing specific findings."""

    service: str | None = None
    check_id: str | None = None
    resource_id: str | None = None


class AccountConfiguration(BaseModel):
    """AWS account configuration for cross-account scanning."""

    account_id: str
    role_arn: str
    alias: str
    last_connection_status: str | None = None
    last_verified_at: datetime | None = None


class ScanConfiguration(BaseModel):
    """Configuration for a scan run."""

    regions: list[str] = Field(default_factory=list)
    services: list[str] = Field(default_factory=list)
    tags: list[TagFilter] = Field(default_factory=list)
    output_dir: str = "./output"
    suppression_file: str | None = None
    concurrency_limit: int = 10
    verbosity: str = "INFO"
    wa_integration: bool = False
    accounts: list[str] = Field(default_factory=list)
    sts_session_duration: int = 3600


class ResourceData(BaseModel):
    """Raw resource data fetched from AWS APIs."""

    resource_id: str
    resource_arn: str | None = None
    service: str
    region: str
    account_id: str
    configuration: dict
    tags: dict[str, str] = Field(default_factory=dict)


class ScanResult(BaseModel):
    """Result of a scan run."""

    scan_id: str
    status: ScanStatus
    started_at: datetime
    completed_at: datetime | None = None
    configuration: ScanConfiguration
    findings: list[Finding] = Field(default_factory=list)
    suppressed_findings: list[Finding] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)
    resources_scanned: int = 0
    progress_percentage: float = 0.0
    current_service: str | None = None
    current_region: str | None = None


class TeamMember(BaseModel):
    """Team member info stored in Cognito User Pool."""

    email: str
    role: UserRole
    status: MemberStatus
    joined_at: datetime
    last_login_at: datetime | None = None
