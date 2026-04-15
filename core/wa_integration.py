"""AWS Well-Architected Tool API integration."""

import logging
from datetime import datetime

import boto3
from botocore.exceptions import ClientError

from core.models import Finding, Pillar, ScanResult

logger = logging.getLogger(__name__)

# Basic mapping from pillar to Well-Architected Tool question IDs
PILLAR_QUESTION_MAP: dict[str, list[str]] = {
    Pillar.SECURITY: [
        "SEC01",  # How do you securely operate your workload?
        "SEC02",  # How do you manage identities for people and machines?
        "SEC03",  # How do you manage permissions for people and machines?
    ],
    Pillar.RELIABILITY: [
        "REL01",  # How do you manage service quotas and constraints?
        "REL02",  # How do you plan your network topology?
        "REL03",  # How do you design your workload service architecture?
    ],
    Pillar.OPERATIONAL_EXCELLENCE: [
        "OPS01",  # How do you determine what your priorities are?
        "OPS02",  # How do you structure your organization to support your business outcomes?
        "OPS03",  # How does your organizational culture support your business outcomes?
    ],
    Pillar.PERFORMANCE_EFFICIENCY: [
        "PERF01",  # How do you select appropriate cloud resources?
        "PERF02",  # How do you select your compute solution?
        "PERF03",  # How do you select your storage solution?
    ],
    Pillar.COST_OPTIMIZATION: [
        "COST01",  # How do you implement cloud financial management?
        "COST02",  # How do you govern usage?
        "COST03",  # How do you monitor usage and cost?
    ],
}


class WAIntegration:
    """Integration with AWS Well-Architected Tool API."""

    def __init__(self, workload_name: str | None = None):
        self.workload_name = workload_name or "wa-review-tool-workload"
        self.client = boto3.client("wellarchitected")

    def create_workload(self, scan_result: ScanResult) -> str | None:
        """Create a workload in AWS Well-Architected Tool.

        Returns workload_id on success, None on failure.
        """
        try:
            regions = scan_result.configuration.regions or ["us-east-1"]
            response = self.client.create_workload(
                WorkloadName=self.workload_name,
                Description=f"Automated review from scan {scan_result.scan_id}",
                Environment="PRODUCTION",
                Lenses=["wellarchitected"],
                AwsRegions=regions,
                ReviewOwner="wa-review-tool",
            )
            workload_id = response["WorkloadId"]
            logger.info("Created WA Tool workload: %s", workload_id)
            return workload_id
        except ClientError as e:
            logger.warning(
                "Failed to create WA Tool workload: %s", e.response["Error"]["Message"]
            )
            return None

    def create_milestone(self, workload_id: str, scan_result: ScanResult) -> str | None:
        """Create a milestone for a workload with scan results summary.

        Returns milestone_number on success, None on failure.
        """
        try:
            milestone_name = (
                f"Scan {scan_result.scan_id} - "
                f"{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
            )
            response = self.client.create_milestone(
                WorkloadId=workload_id,
                MilestoneName=milestone_name,
            )
            milestone_number = response["MilestoneNumber"]
            logger.info(
                "Created WA Tool milestone %s for workload %s",
                milestone_number,
                workload_id,
            )
            return str(milestone_number)
        except ClientError as e:
            logger.warning(
                "Failed to create WA Tool milestone: %s",
                e.response["Error"]["Message"],
            )
            return None

    def map_findings_to_questions(
        self, findings: list[Finding]
    ) -> dict[str, list[str]]:
        """Map findings by pillar to WA Tool question IDs.

        Returns a dict mapping question IDs to lists of finding IDs.
        """
        try:
            result: dict[str, list[str]] = {}
            for finding in findings:
                question_ids = PILLAR_QUESTION_MAP.get(finding.pillar, [])
                for qid in question_ids:
                    result.setdefault(qid, []).append(finding.finding_id)
            return result
        except (AttributeError, TypeError) as e:
            logger.warning("Failed to map findings to questions: %s", e)
            return {}
