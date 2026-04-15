# Project Structure

```
├── cli/                        # CLI mode entry point
│   └── main.py                 # CLIApp class, argument parsing, orchestration
│
├── core/                       # Shared core logic (used by both CLI and backend)
│   ├── models.py               # Pydantic v2 data models (Finding, Check, ScanConfiguration, etc.)
│   ├── config_parser.py        # Parse CLI args, JSON/YAML config files, suppression files
│   ├── account_manager.py      # AWS account CRUD, storage backends (File + DynamoDB)
│   ├── sts_client.py           # STS assume role, credential caching/refresh
│   ├── scanner.py              # Concurrent resource scanning (asyncio + ThreadPoolExecutor)
│   ├── rule_engine.py          # Load check definitions, evaluate resources, map to pillars
│   ├── report_generator.py     # Generate HTML (self-contained) and JSON reports
│   └── wa_integration.py       # AWS Well-Architected Tool API integration
│
├── checks/                     # Check definitions (plugin-based)
│   ├── ec2/                    # EC2 check YAML files + evaluation logic
│   ├── s3/
│   ├── rds/
│   ├── iam/
│   ├── lambda_/
│   ├── dynamodb/
│   ├── elb/
│   ├── cloudfront/
│   ├── ecs/
│   └── eks/
│
├── backend/                    # Web dashboard backend (Lambda handlers)
│   ├── handlers/
│   │   ├── scan_handler.py     # POST/GET /scans endpoints
│   │   ├── account_handler.py  # CRUD /accounts endpoints
│   │   └── team_handler.py     # CRUD /team/members endpoints + TeamManager class
│   └── auth/
│       └── auth_module.py      # Cognito auth helpers, role extraction, authorization checks
│
├── dashboard/                  # React frontend (Cloudscape Design System)
│   ├── src/
│   │   ├── pages/              # Login, Overview, Findings, Accounts, History, Scan, Team Management
│   │   ├── components/         # Charts (radar, donut, heatmap), filters, cards
│   │   └── auth/               # Cognito integration, token management, route guards
│   └── package.json
│
├── infra/                      # AWS CDK infrastructure (Python)
│   ├── app.py                  # CDK app entry point
│   └── stacks/
│       ├── auth_stack.py       # Cognito User Pool + Client
│       ├── data_stack.py       # DynamoDB table (single-table design)
│       ├── api_stack.py        # API Gateway + Lambda + Cognito Authorizer
│       └── frontend_stack.py   # S3 + CloudFront distribution
│
├── installer/
│   └── install.sh              # One-liner CloudShell installation script
│
├── tests/                      # All Python tests
│   ├── test_*_roundtrip.py     # Property-based: serialization round-trip tests
│   ├── test_tag_filtering.py   # Property-based: tag filter AND logic
│   ├── test_suppression_matching.py
│   ├── test_finding_invariants.py
│   ├── test_error_isolation.py
│   ├── test_config_merge.py
│   ├── test_report_summary.py
│   ├── test_exit_codes.py
│   ├── test_arn_validation.py
│   ├── test_account_uniqueness.py
│   ├── test_result_merging.py
│   ├── test_role_authorization.py
│   ├── test_auth_error_messages.py
│   ├── test_role_extraction.py
│   ├── test_team_member_data.py
│   └── test_admin_invariant.py
│
└── .kiro/
    ├── specs/                  # Feature specs
    └── steering/               # Steering rules (this directory)
```

## Key Architectural Boundaries

- `core/` is shared between CLI and backend — keep it free of mode-specific logic
- `checks/` are YAML + Python evaluation functions — adding a new service check should never require changes to `core/`
- `backend/handlers/` are Lambda entry points — they delegate to `core/` for business logic
- `dashboard/` is a standalone React app that communicates with backend via REST API
- `infra/` defines all AWS resources as CDK stacks — review with `cdk synth` before deploying
- Team member data lives in Cognito User Pool (not DynamoDB) — Cognito is the source of truth for users

## DynamoDB Key Patterns (Single-Table)

| Entity | PK | SK |
|--------|----|----|
| Scan metadata | `SCAN#{scan_id}` | `META` |
| Scan finding | `SCAN#{scan_id}` | `FINDING#{finding_id}` |
| Scan error | `SCAN#{scan_id}` | `ERROR#{index}` |
| Account config | `ACCOUNT#{account_id}` | `META` |
| Scan history | `HISTORY` | `SCAN#{timestamp}#{scan_id}` |
