"""Scanner for AWS Well-Architected Review Tool.

Concurrent resource scanning across accounts, regions, and services
using asyncio + ThreadPoolExecutor (boto3 doesn't support async natively).
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Any, Callable

import boto3

from core.models import (
    Finding,
    ResourceData,
    ScanConfiguration,
    ScanResult,
    ScanStatus,
    SuppressionRule,
    TagFilter,
)

logger = logging.getLogger(__name__)


class Scanner:
    """Concurrent resource scanner across accounts, regions, and services."""

    def __init__(
        self,
        config: ScanConfiguration,
        rule_engine: Any = None,
        sts_client: Any = None,
        account_manager: Any = None,
    ) -> None:
        self.config = config
        self.rule_engine = rule_engine
        self.sts_client = sts_client
        self.account_manager = account_manager
        self._service_scanners: dict[str, Callable] = self._build_service_scanners()

    async def scan(self) -> ScanResult:
        """Run a full scan across all accounts, regions, and services concurrently."""
        scan_id = str(uuid.uuid4())
        result = ScanResult(
            scan_id=scan_id,
            status=ScanStatus.IN_PROGRESS,
            started_at=datetime.now(timezone.utc),
            configuration=self.config,
        )

        accounts = self.config.accounts or ["current"]
        regions = self.config.regions
        services = self.config.services

        tasks: list[tuple[str, str, str]] = [
            (account, region, service)
            for account in accounts
            for region in regions
            for service in services
        ]

        total = len(tasks)
        if total == 0:
            result.status = ScanStatus.COMPLETED
            result.completed_at = datetime.now(timezone.utc)
            result.progress_percentage = 100.0
            return result

        semaphore = asyncio.Semaphore(self.config.concurrency_limit)
        completed = 0
        all_resources: list[ResourceData] = []
        all_findings: list[Finding] = []

        loop = asyncio.get_event_loop()
        executor = ThreadPoolExecutor(max_workers=self.config.concurrency_limit)

        async def run_task(account: str, region: str, service: str) -> None:
            nonlocal completed
            async with semaphore:
                result.current_service = service
                result.current_region = region
                try:
                    resources = await loop.run_in_executor(
                        executor, self._scan_service, account, region, service
                    )
                    # Apply tag filtering
                    if self.config.tags:
                        resources = self.filter_by_tags(resources, self.config.tags)

                    all_resources.extend(resources)
                    result.resources_scanned += len(resources)

                    # Evaluate resources against rules
                    if self.rule_engine:
                        for resource in resources:
                            findings = self.rule_engine.evaluate(resource)
                            all_findings.extend(findings)
                except Exception as exc:
                    error_msg = f"Error scanning {service} in {region} (account={account}): {exc}"
                    logger.error(error_msg)
                    result.errors.append(error_msg)
                finally:
                    completed += 1
                    result.progress_percentage = (completed / total) * 100

        await asyncio.gather(
            *(run_task(a, r, s) for a, r, s in tasks),
            return_exceptions=True,
        )

        executor.shutdown(wait=False)

        # Apply suppressions
        active, suppressed = self.apply_suppressions(all_findings)
        result.findings = active
        result.suppressed_findings = suppressed
        result.status = ScanStatus.COMPLETED
        result.completed_at = datetime.now(timezone.utc)
        result.progress_percentage = 100.0
        result.current_service = None
        result.current_region = None

        return result

    def scan_service(
        self, account: str, region: str, service: str
    ) -> list[ResourceData]:
        """Scan a single service in a single region (synchronous)."""
        return self._scan_service(account, region, service)

    def filter_by_tags(
        self, resources: list[ResourceData], tags: list[TagFilter]
    ) -> list[ResourceData]:
        """Filter resources by tag conditions using AND logic.

        A resource must match ALL tag filters to be included.
        """
        if not tags:
            return resources

        filtered: list[ResourceData] = []
        for resource in resources:
            if all(
                resource.tags.get(tag.key) == tag.value for tag in tags
            ):
                filtered.append(resource)
        return filtered

    def apply_suppressions(
        self, findings: list[Finding]
    ) -> tuple[list[Finding], list[Finding]]:
        """Split findings into active and suppressed based on suppression rules.

        Returns (active_findings, suppressed_findings).
        """
        if not self.config.suppression_file:
            return findings, []

        from core.config_parser import ConfigParser

        try:
            rules = ConfigParser().parse_suppression_file(self.config.suppression_file)
        except Exception as exc:
            logger.warning("Failed to load suppression file: %s", exc)
            return findings, []

        return self._split_by_suppressions(findings, rules)

    def apply_suppression_rules(
        self, findings: list[Finding], rules: list[SuppressionRule]
    ) -> tuple[list[Finding], list[Finding]]:
        """Split findings using pre-loaded suppression rules."""
        return self._split_by_suppressions(findings, rules)

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _split_by_suppressions(
        self, findings: list[Finding], rules: list[SuppressionRule]
    ) -> tuple[list[Finding], list[Finding]]:
        active: list[Finding] = []
        suppressed: list[Finding] = []
        for finding in findings:
            if self._is_suppressed(finding, rules):
                suppressed.append(finding)
            else:
                active.append(finding)
        return active, suppressed

    @staticmethod
    def _is_suppressed(finding: Finding, rules: list[SuppressionRule]) -> bool:
        for rule in rules:
            match = True
            if rule.service is not None and rule.service != finding.service:
                match = False
            if rule.check_id is not None and rule.check_id != finding.check_id:
                match = False
            if rule.resource_id is not None and rule.resource_id != finding.resource_id:
                match = False
            if match:
                return True
        return False

    def _scan_service(
        self, account: str, region: str, service: str
    ) -> list[ResourceData]:
        """Fetch resources for a single service/region/account."""
        session = self._get_session(account, region)
        scanner_fn = self._service_scanners.get(service)
        if scanner_fn is None:
            logger.warning("No scanner for service: %s", service)
            return []
        return scanner_fn(session, region, account)

    def _get_session(self, account: str, region: str) -> boto3.Session:
        """Get a boto3 session, using STS credentials for cross-account."""
        if account == "current" or self.sts_client is None:
            return boto3.Session(region_name=region)

        if self.account_manager:
            creds = self.account_manager.get_credentials(account)
        else:
            role_arn = f"arn:aws:iam::{account}:role/WAReviewReadOnly"
            creds = self.sts_client.get_or_refresh_credentials(account, role_arn)

        return boto3.Session(
            aws_access_key_id=creds["AccessKeyId"],
            aws_secret_access_key=creds["SecretAccessKey"],
            aws_session_token=creds["SessionToken"],
            region_name=region,
        )

    def _build_service_scanners(self) -> dict[str, Callable]:
        return {
            "ec2": self._scan_ec2,
            "s3": self._scan_s3,
            "rds": self._scan_rds,
            "iam": self._scan_iam,
            "lambda": self._scan_lambda,
            "dynamodb": self._scan_dynamodb,
            "elb": self._scan_elb,
            "cloudfront": self._scan_cloudfront,
            "ecs": self._scan_ecs,
            "eks": self._scan_eks,
        }

    # ------------------------------------------------------------------
    # Service-specific scanners
    # ------------------------------------------------------------------

    @staticmethod
    def _extract_tags(tag_list: list[dict] | None) -> dict[str, str]:
        if not tag_list:
            return {}
        return {t["Key"]: t["Value"] for t in tag_list if "Key" in t and "Value" in t}

    def _scan_ec2(self, session: boto3.Session, region: str, account: str) -> list[ResourceData]:
        ec2 = session.client("ec2")
        resources: list[ResourceData] = []
        paginator = ec2.get_paginator("describe_instances")
        for page in paginator.paginate():
            for reservation in page.get("Reservations", []):
                for inst in reservation.get("Instances", []):
                    resources.append(ResourceData(
                        resource_id=inst["InstanceId"],
                        resource_arn=f"arn:aws:ec2:{region}:{account}:instance/{inst['InstanceId']}",
                        service="ec2", region=region, account_id=account,
                        configuration=inst,
                        tags=self._extract_tags(inst.get("Tags")),
                    ))
        return resources

    def _scan_s3(self, session: boto3.Session, region: str, account: str) -> list[ResourceData]:
        s3 = session.client("s3")
        resources: list[ResourceData] = []
        buckets = s3.list_buckets().get("Buckets", [])
        for bucket in buckets:
            name = bucket["BucketName"]
            try:
                loc = s3.get_bucket_location(Bucket=name).get("LocationConstraint") or "us-east-1"
                if loc != region:
                    continue
                tags_resp = s3.get_bucket_tagging(Bucket=name)
                tags = self._extract_tags(tags_resp.get("TagSet"))
            except Exception:
                tags = {}
            config: dict[str, Any] = {"BucketName": name}
            try:
                config["Versioning"] = s3.get_bucket_versioning(Bucket=name)
            except Exception:
                pass
            try:
                config["Encryption"] = s3.get_bucket_encryption(Bucket=name)
            except Exception:
                pass
            try:
                config["PublicAccessBlock"] = s3.get_public_access_block(Bucket=name)
            except Exception:
                pass
            resources.append(ResourceData(
                resource_id=name,
                resource_arn=f"arn:aws:s3:::{name}",
                service="s3", region=region, account_id=account,
                configuration=config, tags=tags,
            ))
        return resources

    def _scan_rds(self, session: boto3.Session, region: str, account: str) -> list[ResourceData]:
        rds = session.client("rds")
        resources: list[ResourceData] = []
        paginator = rds.get_paginator("describe_db_instances")
        for page in paginator.paginate():
            for db in page.get("DBInstances", []):
                arn = db.get("DBInstanceArn", "")
                tags = {}
                try:
                    tags_resp = rds.list_tags_for_resource(ResourceName=arn)
                    tags = self._extract_tags(tags_resp.get("TagList"))
                except Exception:
                    pass
                resources.append(ResourceData(
                    resource_id=db["DBInstanceIdentifier"],
                    resource_arn=arn, service="rds", region=region,
                    account_id=account, configuration=db, tags=tags,
                ))
        return resources

    def _scan_iam(self, session: boto3.Session, region: str, account: str) -> list[ResourceData]:
        iam = session.client("iam")
        resources: list[ResourceData] = []
        paginator = iam.get_paginator("list_users")
        for page in paginator.paginate():
            for user in page.get("Users", []):
                resources.append(ResourceData(
                    resource_id=user["UserName"],
                    resource_arn=user.get("Arn"),
                    service="iam", region="global", account_id=account,
                    configuration=user, tags=self._extract_tags(user.get("Tags")),
                ))
        return resources

    def _scan_lambda(self, session: boto3.Session, region: str, account: str) -> list[ResourceData]:
        lam = session.client("lambda")
        resources: list[ResourceData] = []
        paginator = lam.get_paginator("list_functions")
        for page in paginator.paginate():
            for fn in page.get("Functions", []):
                tags = {}
                try:
                    tags = lam.list_tags(Resource=fn["FunctionArn"]).get("Tags", {})
                except Exception:
                    pass
                resources.append(ResourceData(
                    resource_id=fn["FunctionName"],
                    resource_arn=fn.get("FunctionArn"),
                    service="lambda", region=region, account_id=account,
                    configuration=fn, tags=tags,
                ))
        return resources

    def _scan_dynamodb(self, session: boto3.Session, region: str, account: str) -> list[ResourceData]:
        ddb = session.client("dynamodb")
        resources: list[ResourceData] = []
        paginator = ddb.get_paginator("list_tables")
        for page in paginator.paginate():
            for name in page.get("TableNames", []):
                try:
                    desc = ddb.describe_table(TableName=name)["Table"]
                    arn = desc.get("TableArn", "")
                    tags = {}
                    try:
                        tags_resp = ddb.list_tags_of_resource(ResourceArn=arn)
                        tags = self._extract_tags(tags_resp.get("Tags"))
                    except Exception:
                        pass
                    resources.append(ResourceData(
                        resource_id=name, resource_arn=arn,
                        service="dynamodb", region=region, account_id=account,
                        configuration=desc, tags=tags,
                    ))
                except Exception:
                    pass
        return resources

    def _scan_elb(self, session: boto3.Session, region: str, account: str) -> list[ResourceData]:
        elbv2 = session.client("elbv2")
        resources: list[ResourceData] = []
        paginator = elbv2.get_paginator("describe_load_balancers")
        for page in paginator.paginate():
            for lb in page.get("LoadBalancers", []):
                arn = lb.get("LoadBalancerArn", "")
                tags = {}
                try:
                    tags_resp = elbv2.describe_tags(ResourceArns=[arn])
                    for desc in tags_resp.get("TagDescriptions", []):
                        tags = self._extract_tags(desc.get("Tags"))
                except Exception:
                    pass
                resources.append(ResourceData(
                    resource_id=lb.get("LoadBalancerName", ""),
                    resource_arn=arn, service="elb", region=region,
                    account_id=account, configuration=lb, tags=tags,
                ))
        return resources

    def _scan_cloudfront(self, session: boto3.Session, region: str, account: str) -> list[ResourceData]:
        cf = session.client("cloudfront")
        resources: list[ResourceData] = []
        paginator = cf.get_paginator("list_distributions")
        for page in paginator.paginate():
            dist_list = page.get("DistributionList", {})
            for dist in dist_list.get("Items", []):
                arn = dist.get("ARN", "")
                tags = {}
                try:
                    tags_resp = cf.list_tags_for_resource(Resource=arn)
                    tags = self._extract_tags(tags_resp.get("Tags", {}).get("Items"))
                except Exception:
                    pass
                resources.append(ResourceData(
                    resource_id=dist.get("Id", ""),
                    resource_arn=arn, service="cloudfront", region="global",
                    account_id=account, configuration=dist, tags=tags,
                ))
        return resources

    def _scan_ecs(self, session: boto3.Session, region: str, account: str) -> list[ResourceData]:
        ecs = session.client("ecs")
        resources: list[ResourceData] = []
        clusters = ecs.list_clusters().get("clusterArns", [])
        if clusters:
            descs = ecs.describe_clusters(clusters=clusters).get("clusters", [])
            for cluster in descs:
                arn = cluster.get("clusterArn", "")
                tags = self._extract_tags(cluster.get("tags"))
                resources.append(ResourceData(
                    resource_id=cluster.get("clusterName", ""),
                    resource_arn=arn, service="ecs", region=region,
                    account_id=account, configuration=cluster, tags=tags,
                ))
        return resources

    def _scan_eks(self, session: boto3.Session, region: str, account: str) -> list[ResourceData]:
        eks = session.client("eks")
        resources: list[ResourceData] = []
        clusters = eks.list_clusters().get("clusters", [])
        for name in clusters:
            try:
                desc = eks.describe_cluster(name=name)["cluster"]
                tags = desc.get("tags", {})
                resources.append(ResourceData(
                    resource_id=name,
                    resource_arn=desc.get("arn", ""),
                    service="eks", region=region, account_id=account,
                    configuration=desc, tags=tags,
                ))
            except Exception:
                pass
        return resources
