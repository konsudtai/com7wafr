"""CLI mode entry point for AWS Well-Architected Review Tool.

Provides the CLIApp class that orchestrates argument parsing,
configuration, scanning, and report generation.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
import time
from typing import Sequence

from core.account_manager import AccountManager, FileAccountStorage
from core.config_parser import ConfigParser
from core.models import Severity
from core.report_generator import ReportGenerator
from core.rule_engine import RuleEngine
from core.scanner import Scanner
from core.sts_client import STSClient

logger = logging.getLogger("wa-review")

# Exit codes
EXIT_SUCCESS = 0
EXIT_CRITICAL_FINDINGS = 1
EXIT_ERROR = 2

# Default accounts file for CLI mode
DEFAULT_ACCOUNTS_FILE = "accounts.yaml"

# Retry settings for rate-limiting
MAX_RETRIES = 5
INITIAL_BACKOFF = 1.0  # seconds

_EPILOG = """\
examples:
  # Scan EC2 and S3 in us-east-1
  python -m cli.main --regions us-east-1 --services ec2,s3

  # Scan with a config file
  python -m cli.main --config config.yaml

  # Scan with tag filters
  python -m cli.main --regions us-east-1 --tags Environment=Production Team=Platform

  # Add a cross-account role
  python -m cli.main add-account --account-id 123456789012 \\
      --role-arn arn:aws:iam::123456789012:role/WAReviewRole --alias prod

  # List registered accounts
  python -m cli.main list-accounts

  # Verify account connectivity
  python -m cli.main verify-account --account-id 123456789012
"""


def _setup_logging(verbosity: str) -> None:
    """Configure root logger with the given verbosity level."""
    level = getattr(logging, verbosity.upper(), logging.INFO)
    logging.basicConfig(
        level=level,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )



class CLIApp:
    """Main CLI application that orchestrates scanning and reporting.

    Parses command-line arguments, builds configuration, runs the scanner
    concurrently, and generates HTML/JSON reports.
    """

    def __init__(self) -> None:
        self.config_parser = ConfigParser()
        self.account_manager: AccountManager | None = None
        self.scanner: Scanner | None = None
        self.report_generator = ReportGenerator()

    def parse_arguments(self, args: Sequence[str] | None = None) -> argparse.Namespace:
        """Parse CLI arguments including subcommands for account management.

        Returns the parsed argparse.Namespace.
        """
        parser = argparse.ArgumentParser(
            prog="wa-review",
            description="AWS Well-Architected Review Tool — scan and evaluate your AWS environment.",
            epilog=_EPILOG,
            formatter_class=argparse.RawDescriptionHelpFormatter,
        )

        # Global scan options
        parser.add_argument(
            "--regions",
            type=str,
            default=None,
            help="Comma-separated list of AWS regions to scan (e.g. us-east-1,eu-west-1).",
        )
        parser.add_argument(
            "--services",
            type=str,
            default=None,
            help="Comma-separated list of services to scan (e.g. ec2,s3,rds).",
        )
        parser.add_argument(
            "--tags",
            nargs="*",
            default=None,
            help="Tag filters in Key=Value format. Multiple tags use AND logic.",
        )
        parser.add_argument(
            "--output-dir",
            type=str,
            default=None,
            help="Directory for output reports (default: ./output).",
        )
        parser.add_argument(
            "--suppression-file",
            type=str,
            default=None,
            help="Path to YAML suppression file.",
        )
        parser.add_argument(
            "--concurrency",
            type=int,
            default=None,
            help="Maximum number of concurrent scan tasks (default: 10).",
        )
        parser.add_argument(
            "--verbosity",
            type=str,
            choices=["DEBUG", "INFO", "WARNING", "ERROR"],
            default=None,
            help="Logging verbosity level (default: INFO).",
        )
        parser.add_argument(
            "--config",
            type=str,
            default=None,
            help="Path to JSON or YAML configuration file.",
        )
        parser.add_argument(
            "--wa-integration",
            action="store_true",
            default=False,
            help="Enable AWS Well-Architected Tool integration.",
        )

        # Subcommands for account management
        subparsers = parser.add_subparsers(dest="subcommand", help="Account management subcommands.")

        # add-account
        add_parser = subparsers.add_parser(
            "add-account",
            help="Register a new AWS account for cross-account scanning.",
        )
        add_parser.add_argument("--account-id", required=True, help="AWS account ID (12 digits).")
        add_parser.add_argument("--role-arn", required=True, help="IAM role ARN for assume role.")
        add_parser.add_argument("--alias", required=True, help="Friendly alias for the account.")

        # remove-account
        remove_parser = subparsers.add_parser(
            "remove-account",
            help="Remove a registered AWS account.",
        )
        remove_parser.add_argument(
            "--account-id",
            required=True,
            help="Account ID or alias to remove.",
        )

        # list-accounts
        subparsers.add_parser(
            "list-accounts",
            help="List all registered AWS accounts.",
        )

        # verify-account
        verify_parser = subparsers.add_parser(
            "verify-account",
            help="Verify assume-role connectivity for an account.",
        )
        verify_parser.add_argument("--account-id", required=True, help="Account ID to verify.")

        return parser.parse_args(args)

    def run(self, args: Sequence[str] | None = None) -> int:
        """Run the CLI tool. Returns an exit code (0, 1, or 2)."""
        try:
            parsed = self.parse_arguments(args)
        except SystemExit as exc:
            # argparse calls sys.exit on --help or bad args
            return exc.code if isinstance(exc.code, int) else EXIT_ERROR

        # Set up logging early
        verbosity = (parsed.verbosity or "INFO").upper()
        _setup_logging(verbosity)

        try:
            return self._dispatch(parsed)
        except KeyboardInterrupt:
            logger.info("Interrupted by user.")
            return EXIT_ERROR
        except Exception as exc:
            logger.error("Unexpected error: %s", exc, exc_info=True)
            return EXIT_ERROR

    # ------------------------------------------------------------------
    # Dispatch
    # ------------------------------------------------------------------

    def _dispatch(self, parsed: argparse.Namespace) -> int:
        """Route to the appropriate handler based on subcommand."""
        subcommand = getattr(parsed, "subcommand", None)

        if subcommand == "add-account":
            return self._handle_add_account(parsed)
        if subcommand == "remove-account":
            return self._handle_remove_account(parsed)
        if subcommand == "list-accounts":
            return self._handle_list_accounts()
        if subcommand == "verify-account":
            return self._handle_verify_account(parsed)

        # Default: run scan
        return self._handle_scan(parsed)


    # ------------------------------------------------------------------
    # Account management subcommands
    # ------------------------------------------------------------------

    def _get_account_manager(self) -> AccountManager:
        """Lazily create and return the AccountManager."""
        if self.account_manager is None:
            storage = FileAccountStorage(DEFAULT_ACCOUNTS_FILE)
            sts = STSClient()
            self.account_manager = AccountManager(storage_backend=storage, sts_client=sts)
        return self.account_manager

    def _handle_add_account(self, parsed: argparse.Namespace) -> int:
        mgr = self._get_account_manager()
        try:
            account = mgr.add_account(
                account_id=parsed.account_id,
                role_arn=parsed.role_arn,
                alias=parsed.alias,
            )
            print(f"Account added: {account.account_id} ({account.alias})")
            if account.last_connection_status:
                print(f"  Connection status: {account.last_connection_status}")
            return EXIT_SUCCESS
        except ValueError as exc:
            logger.error("Failed to add account: %s", exc)
            return EXIT_ERROR

    def _handle_remove_account(self, parsed: argparse.Namespace) -> int:
        mgr = self._get_account_manager()
        removed = mgr.remove_account(parsed.account_id)
        if removed:
            print(f"Account removed: {parsed.account_id}")
            return EXIT_SUCCESS
        logger.error("Account not found: %s", parsed.account_id)
        return EXIT_ERROR

    def _handle_list_accounts(self) -> int:
        mgr = self._get_account_manager()
        accounts = mgr.list_accounts()
        if not accounts:
            print("No accounts registered.")
            return EXIT_SUCCESS
        print(f"{'Account ID':<16} {'Alias':<16} {'Role ARN':<60} {'Status'}")
        print("-" * 110)
        for acct in accounts:
            status = acct.last_connection_status or "N/A"
            print(f"{acct.account_id:<16} {acct.alias:<16} {acct.role_arn:<60} {status}")
        return EXIT_SUCCESS

    def _handle_verify_account(self, parsed: argparse.Namespace) -> int:
        mgr = self._get_account_manager()
        try:
            ok = mgr.verify_account(parsed.account_id)
            if ok:
                print(f"Account {parsed.account_id}: connectivity OK")
                return EXIT_SUCCESS
            print(f"Account {parsed.account_id}: connectivity FAILED")
            return EXIT_ERROR
        except ValueError as exc:
            logger.error("Verification failed: %s", exc)
            return EXIT_ERROR

    # ------------------------------------------------------------------
    # Scan orchestration
    # ------------------------------------------------------------------

    def _handle_scan(self, parsed: argparse.Namespace) -> int:
        """Orchestrate: ConfigParser → AccountManager → Scanner → ReportGenerator."""
        # 1. Build configuration
        config = self._build_config(parsed)

        # 2. Validate configuration
        errors = self.config_parser.validate_config(config)
        if errors:
            for err in errors:
                logger.error("Config error: %s", err)
            return EXIT_ERROR

        logger.info(
            "Starting scan — regions=%s, services=%s, concurrency=%d",
            config.regions or ["current"],
            config.services or ["all"],
            config.concurrency_limit,
        )

        # 3. Load suppression rules
        suppression_rules = []
        if config.suppression_file:
            try:
                suppression_rules = self.config_parser.parse_suppression_file(
                    config.suppression_file
                )
                logger.info("Loaded %d suppression rules.", len(suppression_rules))
            except (FileNotFoundError, ValueError) as exc:
                logger.error("Suppression file error: %s", exc)
                return EXIT_ERROR

        # 4. Set up rule engine
        rule_engine = RuleEngine()
        checks_loaded = rule_engine.load_checks()
        logger.info("Loaded %d checks.", checks_loaded)

        # 5. Set up STS client and account manager
        sts_client = STSClient(session_duration=config.sts_session_duration)
        storage = FileAccountStorage(DEFAULT_ACCOUNTS_FILE)
        account_mgr = AccountManager(storage_backend=storage, sts_client=sts_client)

        # 6. Create scanner
        scanner = Scanner(
            config=config,
            rule_engine=rule_engine,
            sts_client=sts_client,
            account_manager=account_mgr,
        )
        self.scanner = scanner

        # 7. Run scan with progress indicator and retry logic
        scan_result = self._run_scan_with_retry(scanner)
        if scan_result is None:
            return EXIT_ERROR

        # 8. Apply suppression rules if loaded separately
        if suppression_rules:
            active, suppressed = scanner.apply_suppression_rules(
                scan_result.findings, suppression_rules
            )
            scan_result.findings = active
            scan_result.suppressed_findings = suppressed

        # 9. Generate reports
        output_dir = config.output_dir
        try:
            paths = self.report_generator.generate_all(scan_result, output_dir)
            logger.info("Reports generated in %s", output_dir)
            for fmt, path in paths.items():
                logger.info("  %s: %s", fmt, path)
        except Exception as exc:
            logger.error("Report generation failed: %s", exc, exc_info=True)
            return EXIT_ERROR

        # 10. Print summary
        self._print_summary(scan_result)

        # 11. Determine exit code
        has_critical = any(
            f.severity == Severity.CRITICAL for f in scan_result.findings
        )
        return EXIT_CRITICAL_FINDINGS if has_critical else EXIT_SUCCESS


    def _build_config(self, parsed: argparse.Namespace) -> "ScanConfiguration":
        """Build ScanConfiguration from CLI args and optional config file."""
        from core.models import ScanConfiguration

        cli_config = self.config_parser.parse_cli_args(parsed)

        if parsed.config:
            try:
                file_config = self.config_parser.parse_config_file(parsed.config)
                return self.config_parser.merge_configs(file_config, cli_config)
            except (FileNotFoundError, ValueError) as exc:
                logger.warning("Config file error, using CLI args only: %s", exc)

        return cli_config

    def _run_scan_with_retry(self, scanner: Scanner):
        """Execute the async scan with exponential backoff on rate-limit errors.

        Returns the ScanResult or None on failure.
        """
        from botocore.exceptions import ClientError

        backoff = INITIAL_BACKOFF
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                scan_result = asyncio.run(self._scan_with_progress(scanner))
                return scan_result
            except ClientError as exc:
                error_code = exc.response.get("Error", {}).get("Code", "")
                if error_code in ("Throttling", "TooManyRequestsException", "RequestLimitExceeded"):
                    if attempt < MAX_RETRIES:
                        logger.warning(
                            "Rate limited (attempt %d/%d). Retrying in %.1fs...",
                            attempt, MAX_RETRIES, backoff,
                        )
                        time.sleep(backoff)
                        backoff *= 2
                        continue
                logger.error("AWS API error: %s", exc)
                return None
            except Exception as exc:
                logger.error("Scan failed: %s", exc, exc_info=True)
                return None
        return None

    async def _scan_with_progress(self, scanner: Scanner):
        """Run the scan and print progress updates to stderr."""
        import asyncio as _asyncio

        scan_task = _asyncio.create_task(scanner.scan())

        # Poll progress while scan is running
        while not scan_task.done():
            await _asyncio.sleep(1)
            if scanner.config and not scan_task.done():
                svc = getattr(scanner, "_last_service", None)
                rgn = getattr(scanner, "_last_region", None)
                # Read from the in-flight ScanResult if available
                # The scanner updates current_service/current_region on its result
                progress_msg = "Scanning..."
                # We can't easily read the result mid-flight, so just show a spinner
                sys.stderr.write(f"\r  {progress_msg}  ")
                sys.stderr.flush()

        sys.stderr.write("\r" + " " * 40 + "\r")
        sys.stderr.flush()
        return scan_task.result()

    def _print_summary(self, scan_result) -> None:
        """Print a human-readable summary after scan completion."""
        findings = scan_result.findings
        suppressed = scan_result.suppressed_findings
        errors = scan_result.errors

        total = len(findings)
        suppressed_count = len(suppressed)
        error_count = len(errors)

        severity_counts: dict[str, int] = {}
        for f in findings:
            sev = f.severity.value
            severity_counts[sev] = severity_counts.get(sev, 0) + 1

        print("\n" + "=" * 60)
        print("  Scan Summary")
        print("=" * 60)
        print(f"  Resources scanned : {scan_result.resources_scanned}")
        print(f"  Total findings    : {total}")
        print(f"  Suppressed        : {suppressed_count}")
        print(f"  Errors            : {error_count}")
        if severity_counts:
            print("  By severity:")
            for sev in ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFORMATIONAL"]:
                count = severity_counts.get(sev, 0)
                if count:
                    print(f"    {sev:<16}: {count}")
        print("=" * 60)


def main(args: Sequence[str] | None = None) -> int:
    """Entry point for ``python -m cli.main``."""
    app = CLIApp()
    return app.run(args)


if __name__ == "__main__":
    sys.exit(main())
