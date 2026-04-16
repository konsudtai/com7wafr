# AWS Well-Architected Review Tool

Automated platform for scanning and evaluating AWS environments against the 5 pillars of the AWS Well-Architected Framework.

---

## Quick Start — One Command Deployment

Open **AWS CloudShell** and run:

**First time:**
```bash
git clone https://github.com/konsudtai/com7wafr.git && cd com7wafr && chmod +x deploy.sh && ./deploy.sh --region ap-southeast-1 --admin-email admin@yourcompany.com
```

**Re-deploy (update):**
```bash
cd com7wafr && git pull && ./deploy.sh --region ap-southeast-1 --admin-email admin@yourcompany.com
```

**Re-deploy (clean):**
```bash
rm -rf com7wafr && git clone https://github.com/konsudtai/com7wafr.git && cd com7wafr && chmod +x deploy.sh && ./deploy.sh --region ap-southeast-1 --admin-email admin@yourcompany.com
```

The script deploys the entire platform in approximately 10 minutes and outputs the Dashboard URL.

> Replace `admin@yourcompany.com` with the actual admin email. A temporary password will be sent to this email.
> Replace `ap-southeast-1` with your preferred AWS region.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture](#2-architecture)
3. [Technology Stack](#3-technology-stack)
4. [Features](#4-features)
5. [Supported AWS Services & Checks](#5-supported-aws-services--checks)
6. [Dashboard Pages](#6-dashboard-pages)
7. [Deployment Guide](#7-deployment-guide)
8. [Adding AWS Accounts](#8-adding-aws-accounts)
9. [CLI Usage](#9-cli-usage)
10. [Data Model & DynamoDB Design](#10-data-model--dynamodb-design)
11. [Authentication & Authorization](#11-authentication--authorization)
12. [Cost Estimate](#12-cost-estimate)
13. [Security Considerations](#13-security-considerations)
14. [Extending the Platform](#14-extending-the-platform)
15. [Testing](#15-testing)
16. [Project Structure](#16-project-structure)
17. [Troubleshooting](#17-troubleshooting)

---

## 1. Project Overview

### Problem

Organizations running workloads on AWS need to regularly assess their environments against the AWS Well-Architected Framework. Manual reviews are time-consuming, inconsistent, and difficult to track over time across multiple accounts and regions.

### Solution

This tool automates the Well-Architected review process by scanning AWS resources via APIs, evaluating them against a plugin-based rule engine, and producing actionable findings categorized by pillar and severity. It operates in two modes:

- **CLI Mode** — Command-line tool for AWS CloudShell or local environments. Scans resources, evaluates against rules, generates HTML/JSON reports. Suitable for CI/CD pipelines and automation.
- **Web Dashboard Mode** — Serverless web application deployed on AWS (CloudFront + S3 + API Gateway + Lambda + DynamoDB + Cognito). Provides real-time scanning, interactive charts, team management, cost optimization recommendations, and audit-ready PDF reports.

### Design Decisions

| Decision | Rationale |
|----------|-----------|
| Python 3.9+ for core logic | Compatible with AWS CloudShell, boto3 ecosystem, service-screener-v2 patterns |
| asyncio + ThreadPoolExecutor | Concurrent scanning across regions/services/accounts; boto3 is synchronous |
| Plugin-based Rule Engine | Add checks via YAML + Python without modifying core code |
| Pydantic v2 | Data validation and serialization for all models |
| Vanilla HTML/CSS/JS dashboard | No build tools, no framework dependencies, deploy as static files directly |
| Chart.js via CDN | Charts without npm build step |
| DynamoDB single-table design | Low latency, low cost, serverless-native |
| Cognito User Pool | Managed auth with RBAC via custom attributes |
| AWS CDK (TypeScript) | Infrastructure as Code for all stacks |
| Read-only IAM roles | Least privilege for cross-account scanning |

---

## 2. Architecture

### Architecture Diagram

> Draw.io files: [architecture.drawio](docs/architecture.drawio) | [data-flow.drawio](docs/data-flow.drawio)

```mermaid
graph TB
    classDef usr fill:#f5f4ed,stroke:#c96442,stroke-width:2px,color:#232F3E,font-weight:bold
    classDef cf fill:#F3EAFF,stroke:#8C4FFF,stroke-width:2px,color:#232F3E
    classDef s3 fill:#E8F5E8,stroke:#3F8624,stroke-width:2px,color:#232F3E
    classDef cog fill:#FDE8E8,stroke:#DD344C,stroke-width:2px,color:#232F3E
    classDef api fill:#F3EAFF,stroke:#8C4FFF,stroke-width:2px,color:#232F3E
    classDef lam fill:#FFF3E0,stroke:#ED7100,stroke-width:2px,color:#232F3E
    classDef ddb fill:#E8EAFD,stroke:#3334B9,stroke-width:2px,color:#232F3E
    classDef sts fill:#FDE8E8,stroke:#DD344C,stroke-width:2px,color:#232F3E
    classDef tgt fill:#fff,stroke:#82B366,stroke-width:2px,color:#232F3E
    classDef eng fill:#FFF8F0,stroke:#ED7100,stroke-width:1.5px,stroke-dasharray:5 5
    classDef pS fill:#DD344C,color:#fff
    classDef pR fill:#3334B9,color:#fff
    classDef pO fill:#3F8624,color:#fff
    classDef pP fill:#8C4FFF,color:#fff
    classDef pC fill:#ED7100,color:#fff

    subgraph USR [" Users "]
        U1[" Admin "]:::usr
        U2[" Viewer "]:::usr
    end

    subgraph PLAT [" AWS Cloud — Platform Account "]
        subgraph FE [" Frontend "]
            CF[" CloudFront CDN + HTTPS "]:::cf
            S3[" S3 Dashboard Files "]:::s3
        end
        subgraph AU [" Auth "]
            COG[" Cognito User Pool + MFA TOTP "]:::cog
        end
        subgraph AP [" API "]
            GW[" API Gateway REST + Cognito Authorizer "]:::api
            L1[" Lambda scan-handler "]:::lam
            L2[" Lambda account-handler "]:::lam
            L3[" Lambda team-handler "]:::lam
        end
        subgraph EN [" Core Engine Python "]
            SC[" Scanner asyncio "]:::eng
            RE[" Rule Engine 29 checks "]:::eng
            RG[" Report Generator "]:::eng
        end
        subgraph DA [" Data "]
            DDB[" DynamoDB Single-Table + GSI + TTL "]:::ddb
        end
        STS[" STS AssumeRole "]:::sts
    end

    subgraph TGT [" Target AWS Accounts "]
        TA[" Account A Production "]:::tgt
        TB[" Account B Staging "]:::tgt
        TC[" Account C Development "]:::tgt
    end

    subgraph PIL [" Well-Architected 5 Pillars "]
        P1[Security]:::pS
        P2[Reliability]:::pR
        P3[Ops Excellence]:::pO
        P4[Performance]:::pP
        P5[Cost Optimization]:::pC
    end

    U1 & U2 -->|HTTPS| CF
    CF --> S3
    CF -->|REST API| GW
    GW -.->|JWT Validate| COG
    GW --> L1 & L2 & L3
    L1 & L2 --> DDB
    L3 -.->|Manage Users| COG
    L1 --> SC --> RE --> RG
    L1 -->|AssumeRole| STS
    STS --> TA & TB & TC
    SC -->|boto3| TA & TB & TC
    L1 -->|Store| DDB
    RE -.-> P1 & P2 & P3 & P4 & P5
```

### CDK Stacks

```mermaid
graph LR
    classDef au fill:#FDE8E8,stroke:#DD344C,stroke-width:2px
    classDef da fill:#E8EAFD,stroke:#3334B9,stroke-width:2px
    classDef ap fill:#F3EAFF,stroke:#8C4FFF,stroke-width:2px
    classDef fe fill:#E8F5E8,stroke:#3F8624,stroke-width:2px

    subgraph S1 [" WAReviewAuthStack "]
        A1[Cognito User Pool]
        A2[MFA TOTP Required]
    end
    S1:::au

    subgraph S2 [" WAReviewDataStack "]
        D1[DynamoDB Table]
        D2[GSI1 + TTL]
    end
    S2:::da

    subgraph S3 [" WAReviewApiStack "]
        G1[API Gateway]
        G2[3 Lambda Functions]
    end
    S3:::ap

    subgraph S4 [" WAReviewFrontendStack "]
        F1[S3 + CloudFront]
        F2[CfnOutputs]
    end
    S4:::fe

    S1 -->|userPool| S3
    S2 -->|table| S3
    S3 -->|apiUrl| S4
    S1 -->|poolId, clientId| S4
```

### Cross-Account Scanning

```mermaid
sequenceDiagram
    participant P as Platform Lambda
    participant STS as AWS STS
    participant T as Target Account
    participant API as AWS APIs

    rect rgb(253,232,232)
    Note over P,T: Cross-Account Access
    P->>STS: AssumeRole + ExternalId
    STS->>T: Validate trust policy
    T-->>STS: Approved
    STS-->>P: Temp credentials 1hr
    end

    rect rgb(255,248,240)
    Note over P,API: Concurrent Scanning
    loop region x service
        P->>API: describe/list resources
        API-->>P: Resource configs
    end
    end

    rect rgb(232,245,232)
    Note over P,P: Evaluate + Store
    P->>P: Rule Engine 29 checks
    P->>P: Store findings in DynamoDB
    end
```

### Data Flow — Authentication

```mermaid
sequenceDiagram
    participant U as User / Browser
    participant CF as CloudFront + S3
    participant COG as Amazon Cognito
    participant APIGW as API Gateway

    U->>CF: Open Dashboard (HTTPS)
    CF-->>U: Serve HTML/CSS/JS

    rect rgb(253, 232, 232)
    Note over U,COG: Authentication Flow
    U->>COG: 1. Login (email + password)
    COG-->>U: NEW_PASSWORD_REQUIRED (first login)
    U->>COG: 2. Set new password
    COG-->>U: MFA_SETUP challenge
    U->>U: 3. Scan QR code with Authenticator app
    U->>COG: 4. Submit TOTP code
    COG-->>U: JWT Tokens (ID + Access + Refresh)
    end

    rect rgb(243, 234, 255)
    Note over U,APIGW: Subsequent API Calls
    U->>APIGW: API request + Authorization: Bearer JWT
    APIGW->>COG: Validate JWT (Cognito Authorizer)
    COG-->>APIGW: Valid + claims (custom:role)
    APIGW-->>U: Response
    end

    rect rgb(245, 245, 245)
    Note over U,COG: Token Refresh
    U->>COG: Refresh token (auto, 5 min before expiry)
    COG-->>U: New ID + Access tokens
    Note over U,COG: If refresh token expired
    COG-->>U: NotAuthorizedException
    U->>U: Redirect to Login
    end
```

### Data Flow — Scan Lifecycle

```mermaid
sequenceDiagram
    participant U as User / Browser
    participant APIGW as API Gateway
    participant LM as Lambda (scan-handler)
    participant DDB as DynamoDB
    participant STS as AWS STS
    participant TGT as Target Accounts

    rect rgb(255, 248, 240)
    Note over U,TGT: Scan Execution
    U->>APIGW: POST /scans (Admin only)
    APIGW->>LM: Invoke scan-handler
    LM->>DDB: Create scan job (status=PENDING)
    LM-->>U: 201 scanId, status IN_PROGRESS

    loop For each registered account
        LM->>STS: AssumeRole (ExternalId wa-review-accountId)
        STS-->>LM: Temporary credentials (1hr)
    end

    loop For each region x service (concurrent)
        LM->>TGT: boto3 API calls (describe/list)
        TGT-->>LM: Resource configurations
        LM->>LM: Rule Engine evaluate (29 checks)
        LM->>LM: Generate findings (pillar + severity)
    end

    LM->>DDB: Store findings (SCAN id FINDING fid)
    LM->>DDB: Store errors (SCAN id ERROR i)
    LM->>DDB: Update status COMPLETED
    LM->>DDB: Write history (HISTORY SCAN ts)
    end

    rect rgb(243, 234, 255)
    Note over U,DDB: Progress Polling
    loop Every 2 seconds
        U->>APIGW: GET /scans/id/status
        APIGW->>LM: Invoke
        LM->>DDB: Read scan metadata
        DDB-->>LM: status, progress, currentService
        LM-->>U: status IN_PROGRESS, progress 65%
    end
    end

    rect rgb(232, 245, 232)
    Note over U,DDB: View Results
    U->>APIGW: GET /scans/id/results
    APIGW->>LM: Invoke
    LM->>DDB: Query findings + errors
    DDB-->>LM: Finding items
    LM-->>U: findings, errors, summary
    U->>U: Render charts + tables
    end

    rect rgb(232, 234, 253)
    Note over U,U: Export Report
    U->>U: Generate PDF (client-side html2pdf.js)
    Note over U: Per-pillar audit report with TOC
    end
```

### Data Flow — Team Management

```mermaid
sequenceDiagram
    participant A as Admin
    participant APIGW as API Gateway
    participant LM as Lambda (team-handler)
    participant COG as Amazon Cognito

    rect rgb(253, 232, 232)
    Note over A,COG: Add Member
    A->>APIGW: POST /team/members (email, role)
    APIGW->>LM: Invoke (verify caller is Admin)
    LM->>COG: AdminCreateUser (email, custom:role, temp password)
    COG-->>LM: User created
    COG->>COG: Send invitation email
    LM-->>A: 201 Created
    end

    rect rgb(245, 245, 245)
    Note over A,COG: Remove Member
    A->>APIGW: DELETE /team/members/email
    APIGW->>LM: Invoke
    LM->>LM: Check not self-deletion
    LM->>LM: Check at least 1 Admin remains
    LM->>COG: AdminUserGlobalSignOut
    LM->>COG: AdminDeleteUser
    LM-->>A: 200 OK
    end

    rect rgb(243, 234, 255)
    Note over A,COG: Change Role
    A->>APIGW: PUT /team/members/email/role
    APIGW->>LM: Invoke
    LM->>LM: Check not demoting last Admin
    LM->>COG: AdminUpdateUserAttributes (custom:role)
    LM-->>A: 200 OK
    end
```

### Data Flow — Cost Advisor

```mermaid
sequenceDiagram
    participant U as User / Browser
    participant APIGW as API Gateway
    participant LM as Lambda
    participant CE as Cost Explorer
    participant CO as Compute Optimizer
    participant HUB as Cost Optimization Hub

    rect rgb(255, 248, 240)
    Note over U,HUB: Cost Data Collection
    U->>APIGW: GET /cost-recommendations
    APIGW->>LM: Invoke

    par Parallel data collection
        LM->>CE: GetReservationPurchaseRecommendation
        CE-->>LM: RI recommendations
    and
        LM->>CE: GetSavingsPlansPurchaseRecommendation
        CE-->>LM: Savings Plan recommendations
    and
        LM->>CO: GetEC2InstanceRecommendations
        CO-->>LM: Right-sizing recommendations
    and
        LM->>HUB: ListRecommendations
        HUB-->>LM: Hub recommendations
    end

    LM->>LM: Merge with scan findings
    LM->>LM: Calculate total potential savings
    LM->>LM: Generate prioritized action plan
    LM-->>U: RI, SP, Hub, actionPlan, totalSavings
    end

    U->>U: Render savings charts + action plan table
```

---

## 3. Technology Stack

## 3. Technology Stack

### Backend & Core

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Core Logic | Python 3.9+ | Scanner, Rule Engine, Report Generator |
| Data Models | Pydantic v2 | Validation and serialization |
| AWS SDK | boto3 | AWS API calls |
| Concurrency | asyncio + ThreadPoolExecutor | Parallel scanning |
| Config Parsing | PyYAML + JSON | Configuration files |
| Lambda Handlers | TypeScript (Node.js 20) | API backend |
| AWS SDK (Lambda) | @aws-sdk v3 | DynamoDB, STS, Cognito operations |

### Frontend

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Dashboard | Vanilla HTML/CSS/JS | No build tools required |
| Charts | Chart.js v4 (CDN) | Radar, doughnut, bar, line charts |
| PDF Export | html2pdf.js (CDN) | Client-side PDF generation |
| Authentication | amazon-cognito-identity-js (CDN) | Cognito login/token management |
| Design System | Custom CSS (Claude-inspired) | Warm parchment theme, dark/light mode |

### Infrastructure

| Component | Technology | Purpose |
|-----------|-----------|---------|
| IaC | AWS CDK (TypeScript) | All infrastructure as code |
| Compute | AWS Lambda | Serverless API handlers |
| API | Amazon API Gateway | REST API with Cognito Authorizer |
| Database | Amazon DynamoDB | Single-table design, PAY_PER_REQUEST |
| Auth | Amazon Cognito | User Pool with RBAC |
| CDN | Amazon CloudFront | HTTPS, caching, SPA routing |
| Storage | Amazon S3 | Dashboard static files |
| Identity | AWS STS | Cross-account assume role |

### Testing

| Tool | Purpose |
|------|---------|
| pytest | Unit and integration tests |
| hypothesis | Property-based testing (100+ iterations) |
| moto | AWS service mocking |
| unittest.mock | General mocking |

---

## 4. Features

### Scanning
- Multi-region concurrent scanning
- Multi-account via STS AssumeRole
- Resource filtering by services and tags (AND logic)
- Configurable concurrency limit
- Error isolation (one failed task does not affect others)
- Automatic credential refresh

### Analysis
- 29 built-in checks across 10 AWS services
- Findings categorized by 5 Well-Architected pillars
- 5 severity levels: CRITICAL, HIGH, MEDIUM, LOW, INFORMATIONAL
- Suppression files to exclude known/accepted findings
- AWS Well-Architected Tool API integration

### Reporting
- Interactive HTML reports (self-contained, offline-viewable)
- JSON output (raw + full with summary)
- Audit-ready PDF reports organized by pillar
- Thai and English language support
- Table of Contents, control compliance status, sign-off section

### Cost Optimization
- Reserved Instance recommendations
- Savings Plan recommendations
- Cost Optimization Hub integration
- Right-sizing recommendations (Compute Optimizer)
- Idle resource detection
- Storage optimization suggestions
- Prioritized action plan with estimated savings

### Dashboard
- Real-time scan with progress bar
- Overview with radar chart, severity distribution, heatmap
- Filterable findings table with detail modal
- Scan history with trend charts
- Account management with auto-generated IAM setup scripts
- Team management (Admin/Viewer roles)
- Dark/light mode
- Responsive design

---

## 5. Supported AWS Services & Checks

| Service | Checks | Key Areas |
|---------|--------|-----------|
| EC2 | 5 | Unrestricted SSH, EBS encryption, monitoring, utilization, backup |
| S3 | 5 | Public access, encryption, versioning, logging, lifecycle |
| RDS | 3 | Multi-AZ, encryption at rest, automated backups |
| IAM | 3 | Root access keys, inline policies, MFA |
| Lambda | 3 | Memory optimization, dead letter queue, deprecated runtime |
| DynamoDB | 2 | Point-in-time recovery, KMS encryption |
| ELB | 2 | Access logging, HTTPS listener |
| CloudFront | 2 | HTTPS enforcement, WAF association |
| ECS | 2 | Circuit breaker, Container Insights |
| EKS | 2 | Control plane logging, public endpoint |

**Total: 29 checks** across Security, Reliability, Operational Excellence, Performance Efficiency, and Cost Optimization pillars.

---

## 6. Dashboard Pages

| Page | Description | Access |
|------|-------------|--------|
| Overview | Radar chart (pillar scores), severity doughnut, service heatmap, account cards | All |
| Findings | Filterable table with 5 dropdown filters + text search, detail modal with recommendations | All |
| Accounts | Account CRUD, summary cards, auto-generated CloudShell IAM setup scripts | Admin: write, Viewer: read |
| Scan | Run Check button, real-time progress bar, service/region status | Admin only |
| History | Scan history table, trend line chart by severity | All |
| Report | Audit-ready report by pillar, TH/EN toggle, PDF export with TOC | All |
| Cost Advisor | RI/SP/Hub recommendations, savings charts, prioritized action plan | All |
| Team | Add/remove members, change roles, self-deletion protection | Admin only |

---

## 7. Deployment Guide

### Prerequisites

All pre-installed in AWS CloudShell:
- AWS CLI with configured credentials
- Node.js 18+ and npm
- Python 3.9+
- Git

### One-Command Deployment (CloudShell)

**First time:**
```bash
git clone https://github.com/konsudtai/com7wafr.git && cd com7wafr && chmod +x deploy.sh && ./deploy.sh --region ap-southeast-1 --admin-email admin@yourcompany.com
```

**Re-deploy (update):**
```bash
cd com7wafr && git pull && ./deploy.sh --region ap-southeast-1 --admin-email admin@yourcompany.com
```

**Re-deploy (clean):**
```bash
rm -rf com7wafr && git clone https://github.com/konsudtai/com7wafr.git && cd com7wafr && chmod +x deploy.sh && ./deploy.sh --region ap-southeast-1 --admin-email admin@yourcompany.com
```

### Deployment Options

```bash
# Basic deployment
./deploy.sh --region ap-southeast-1 --admin-email admin@company.com

# Specific region
./deploy.sh --region ap-southeast-1 --admin-email admin@company.com

# Specific AWS profile
./deploy.sh --profile production --region ap-southeast-1 --admin-email admin@company.com

# Tear down everything
./deploy.sh --destroy

# Help
./deploy.sh --help
```

| Option | Required | Description |
|--------|----------|-------------|
| `--admin-email EMAIL` | Yes | Admin email (temp password sent via email) |
| `--region REGION` | No | AWS region (default: from AWS config) |
| `--profile PROFILE` | No | AWS CLI profile name |
| `--destroy` | No | Remove all stacks and resources |

### What the Script Does

| Step | Action | Duration |
|------|--------|----------|
| 1 | Check prerequisites (AWS CLI, Node.js, Python, CDK) | 5s |
| 2 | Install dependencies (backend npm, infra npm, Python pip) | 30s |
| 3 | Build backend TypeScript Lambda handlers | 10s |
| 4 | CDK bootstrap (first time only) | 30s |
| 5 | Deploy 4 CDK stacks (Auth, Data, API, Frontend) | 5-8 min |
| 6 | Upload dashboard to S3, inject config, invalidate CloudFront | 15s |
| 7 | Create initial admin user in Cognito | 5s |

### After Deployment

1. Open the Dashboard URL from the output
2. Check email for temporary password
3. Login and change password on first login
4. Go to **Accounts** page to add AWS accounts for scanning

### Updating

Re-run the deploy script to update:

```bash
./deploy.sh
```

Or update dashboard only:

```bash
aws s3 sync dashboard/ s3://BUCKET_NAME --exclude "node_modules/*" --exclude "src/*" --delete
aws cloudfront create-invalidation --distribution-id DIST_ID --paths "/*"
```

---

## 8. Adding AWS Accounts

### Automated Setup (Dashboard)

1. Go to **Accounts** page, click **+ Add Account**
2. Enter target Account ID and Alias
3. Click **Generate Setup Script**
4. Copy the script
5. Open **AWS CloudShell** in the **target account**
6. Paste and run the script
7. Return to Dashboard and click **Register Account**

### IAM Role Created

The script creates `WAReviewReadOnly` in the target account:

| Policy | Type | Permissions |
|--------|------|-------------|
| ReadOnlyAccess | AWS Managed | Read all resource configurations |
| SecurityAudit | AWS Managed | Security configuration audit |
| WAReviewAdditionalReadOnly | Inline | Well-Architected Tool, Cost Explorer (RI/SP recommendations), Cost Optimization Hub, Compute Optimizer, Trusted Advisor |

Trust policy:
- Principal: Platform account only
- Condition: External ID `wa-review-{targetAccountId}` (confused deputy protection)
- Max session: 1 hour

---

## 9. CLI Usage

```bash
# Install dependencies
pip install -r requirements.txt

# Basic scan
python -m cli.main --services ec2,s3

# Multi-region scan
python -m cli.main --regions us-east-1,ap-southeast-1 --services ec2,s3,rds

# Scan with config file
python -m cli.main --config config.yaml

# Tag filtering
python -m cli.main --regions us-east-1 --tags Environment=Production Team=Platform

# Account management
python -m cli.main add-account --account-id 123456789012 --role-arn arn:aws:iam::123456789012:role/WAReviewReadOnly --alias production
python -m cli.main list-accounts
python -m cli.main verify-account --account-id 123456789012
python -m cli.main remove-account --account-id 123456789012

# Help
python -m cli.main --help
```

| Exit Code | Meaning |
|-----------|---------|
| 0 | Success, no critical findings |
| 1 | Success, critical findings found |
| 2 | Execution error |

---

## 10. Data Model & DynamoDB Design

### Single-Table Design

Table: `wa-review-tool`, Billing: PAY_PER_REQUEST, TTL: `ttl`

| Entity | PK | SK |
|--------|----|----|
| Scan metadata | `SCAN#{scan_id}` | `META` |
| Scan finding | `SCAN#{scan_id}` | `FINDING#{finding_id}` |
| Scan error | `SCAN#{scan_id}` | `ERROR#{index}` |
| Account config | `ACCOUNT#{account_id}` | `META` |
| Scan history | `HISTORY` | `SCAN#{timestamp}#{scan_id}` |

GSI1: `GSI1PK` / `GSI1SK` for per-account scan history queries.

### Core Data Models (Pydantic v2)

| Model | Key Fields |
|-------|------------|
| Finding | finding_id, account_id, region, service, resource_id, check_id, pillar, severity, title, description, recommendation |
| Check | check_id, service, pillar, severity, evaluation_logic_ref, remediation_guidance |
| ScanConfiguration | regions, services, tags, concurrency_limit, suppression_file |
| ScanResult | scan_id, status, findings, suppressed_findings, errors, resources_scanned |
| AccountConfiguration | account_id, role_arn, alias, last_connection_status |
| TeamMember | email, role (Admin/Viewer), status, joined_at |

---

## 11. Authentication & Authorization

### Cognito Configuration

| Setting | Value |
|---------|-------|
| Self Sign-Up | Disabled (Admin creates users) |
| Sign-In | Email |
| Password Policy | Min 8, uppercase, lowercase, digits, symbols |
| Token Validity | ID/Access: 1 hour, Refresh: 30 days |
| User Existence Errors | Prevented (no user enumeration) |
| Custom Attributes | `custom:role` (Admin / Viewer) |

### Authorization Matrix

| Endpoint | Admin | Viewer |
|----------|-------|--------|
| GET /scans, /scans/* | Yes | Yes |
| POST /scans | Yes | No |
| GET /accounts | Yes | Yes |
| POST/PUT/DELETE /accounts/* | Yes | No |
| ALL /team/* | Yes | No |

### Error Handling

- Login failure: Generic message "อีเมลหรือรหัสผ่านไม่ถูกต้อง" (never reveals which field)
- Token expired: Auto-refresh via refresh token
- Refresh token expired: Redirect to login
- Unauthorized: 403 Forbidden

---

## 12. Cost Estimate

### Monthly Cost (Typical Usage)

Assumptions: 3 accounts, 10 services, daily scans, 5 team members, ap-southeast-1 region.

| Service | Usage | Estimated Cost |
|---------|-------|---------------|
| **Lambda** | ~900 invocations/mo, 256MB, avg 10s | $0.15 |
| **API Gateway** | ~3,000 requests/mo | $0.01 |
| **DynamoDB** | ~5,000 writes + 15,000 reads/mo (on-demand) | $0.02 |
| **S3** | ~50 MB dashboard + reports | $0.01 |
| **CloudFront** | ~10 GB transfer/mo | $0.85 |
| **Cognito** | 5 MAU (first 50,000 free) | $0.00 |
| **STS** | ~900 AssumeRole calls/mo | $0.00 |
| **CloudWatch Logs** | ~1 GB/mo | $0.50 |
| | | |
| **Total** | | **~$1.54/mo** |

### Cost at Scale

| Scale | Accounts | Daily Scans | Est. Monthly Cost |
|-------|----------|-------------|-------------------|
| Small | 1-5 | 1 | $1-3 |
| Medium | 10-20 | 2 | $5-15 |
| Large | 50-100 | 4 | $30-80 |

### Free Tier Coverage

Most components fall within AWS Free Tier for the first 12 months:
- Lambda: 1M requests/mo free
- DynamoDB: 25 WCU + 25 RCU free
- API Gateway: 1M calls/mo free
- S3: 5 GB free
- CloudFront: 1 TB transfer free
- Cognito: 50,000 MAU free

**Estimated cost during Free Tier: $0/mo** for typical usage.

---

## 13. Security Considerations

| Area | Implementation |
|------|---------------|
| Cross-account access | Read-only IAM roles with External ID |
| Authentication | Cognito User Pool, no self-signup |
| Authorization | JWT validation via Cognito Authorizer on API Gateway |
| Error messages | Generic (never reveal email/password specifics) |
| User enumeration | Prevented via Cognito `preventUserExistenceErrors` |
| Data in transit | HTTPS enforced via CloudFront |
| Data at rest | DynamoDB encryption (AWS managed) |
| S3 access | Block all public access, OAC for CloudFront |
| Admin protection | Cannot self-delete, minimum 1 admin enforced |
| Supply chain | Dashboard uses no npm at runtime (CDN only) |
| IAM | Least privilege, no wildcard permissions on platform |

---

## 14. Extending the Platform

### Adding a New Check

1. Create YAML in `checks/{service}/checks.yaml`:

```yaml
checks:
  - check_id: ec2-006
    service: ec2
    description: EC2 instance should have IMDSv2 enforced
    pillar: security
    severity: HIGH
    evaluation_logic_ref: "checks.ec2:check_imdsv2"
    remediation_guidance: Set HttpTokens to required in instance metadata options
    documentation_url: https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/configuring-instance-metadata-service.html
```

2. Add function in `checks/{service}/__init__.py`:

```python
def check_imdsv2(resource):
    """Returns True if PASSES (IMDSv2 enforced)."""
    metadata = resource.configuration.get("metadata_options", {})
    return metadata.get("http_tokens") == "required"
```

No core code changes needed.

### Adding a New Service

1. Create `checks/{service}/` directory with `__init__.py` and `checks.yaml`
2. Add scanner method in `core/scanner.py` (`_scan_{service}`)
3. Register in `_build_service_scanners()`

---

## 15. Testing

```bash
# Install test dependencies
pip install -r requirements.txt

# Run all tests
pytest

# With coverage
pytest --cov

# Specific test file
pytest tests/test_rule_engine.py

# Property-based tests only
pytest -k "roundtrip or invariant or correctness"
```

### Test Coverage

| Area | Tests | Type |
|------|-------|------|
| Config Parser | 27 | Unit (pytest) |
| Account Manager | 28 | Unit (mock STS) |
| Rule Engine | 29 | Unit (YAML + evaluators) |
| Scanner | 15 | Unit + Integration (mock) |
| STS Client | 10 | Unit (mock) |
| Report Generator | 20 | Unit (file output) |
| Auth Module | 42 | Unit (authorization matrix) |
| File Storage | 18 | Unit (JSON/YAML round-trip) |
| DynamoDB Storage | 11 | Integration (moto) |

### Property-Based Tests (Hypothesis)

19 correctness properties validated with 100+ random iterations each, covering serialization round-trips, tag filtering AND logic, suppression matching, error isolation, config merge precedence, exit codes, ARN validation, account uniqueness, role authorization, and admin count invariants.

---

## 16. Project Structure

```
.
├── deploy.sh                # One-command deployment script
├── README.md
├── .gitignore
├── requirements.txt         # Python dependencies
├── pyproject.toml
│
├── dashboard/               # Web Dashboard (vanilla HTML/CSS/JS)
│   ├── index.html           # SPA shell
│   ├── css/style.css        # Design system (warm parchment theme)
│   └── js/
│       ├── config.js        # Auto-generated (API URL, Cognito IDs)
│       ├── app.js           # Router, navigation, dark/light mode
│       ├── auth.js          # Cognito auth + demo mode
│       ├── api.js           # API client with JWT
│       └── pages/
│           ├── login.js     # Login + force change password
│           ├── overview.js  # Charts (radar, doughnut, heatmap)
│           ├── findings.js  # Filterable table + detail modal
│           ├── accounts.js  # CRUD + IAM script generation
│           ├── scan.js      # Run scan + progress bar
│           ├── history.js   # History table + trend chart
│           ├── report.js    # Audit report (TH/EN) + PDF
│           ├── cost.js      # Cost Advisor (RI, SP, Hub)
│           └── team.js      # Team management
│
├── backend/                 # Lambda handlers (TypeScript)
│   ├── auth/auth-module.ts  # Role extraction, authorization
│   ├── handlers/
│   │   ├── scan-handler.ts
│   │   ├── account-handler.ts
│   │   └── team-handler.ts
│   ├── package.json
│   └── tsconfig.json
│
├── infra/                   # CDK stacks (TypeScript)
│   ├── bin/app.ts           # Stack wiring
│   ├── lib/
│   │   ├── auth-stack.ts    # Cognito
│   │   ├── data-stack.ts    # DynamoDB
│   │   ├── api-stack.ts     # API Gateway + Lambda
│   │   └── frontend-stack.ts # S3 + CloudFront
│   ├── package.json
│   └── cdk.json
│
├── core/                    # Python core (shared CLI + backend)
│   ├── models.py            # Pydantic v2 data models
│   ├── scanner.py           # Concurrent resource scanning
│   ├── rule_engine.py       # Check evaluation engine
│   ├── report_generator.py  # HTML/JSON reports
│   ├── account_manager.py   # Account CRUD + DynamoDB storage
│   ├── config_parser.py     # JSON/YAML config parsing
│   ├── sts_client.py        # STS assume role + credential cache
│   └── wa_integration.py    # Well-Architected Tool API
│
├── checks/                  # Check definitions (plugin-based)
│   ├── ec2/                 # 5 checks + evaluation functions
│   ├── s3/                  # 5 checks
│   ├── rds/                 # 3 checks
│   ├── iam/                 # 3 checks
│   ├── lambda_/             # 3 checks
│   ├── dynamodb/            # 2 checks
│   ├── elb/                 # 2 checks
│   ├── cloudfront/          # 2 checks
│   ├── ecs/                 # 2 checks
│   └── eks/                 # 2 checks
│
├── cli/main.py              # CLI entry point
├── tests/                   # pytest + hypothesis tests
└── installer/install.sh     # CloudShell installer (CLI only)
```

---

## 17. Troubleshooting

| Issue | Solution |
|-------|----------|
| `cdk bootstrap` fails | Ensure your IAM user/role has `AdministratorAccess` or CDK bootstrap permissions |
| CloudShell disk full | Run `rm -rf /tmp/* ~/.npm/_cacache` then retry |
| Lambda timeout on large scans | Reduce `concurrency_limit` or scan fewer services/regions per run |
| Cognito "User already exists" | The admin user was already created; check email for temp password |
| Dashboard shows login but API fails | Check `dashboard/js/config.js` has correct API URL and Cognito IDs |
| Cross-account assume role fails | Verify the IAM role exists in target account and trust policy includes platform account |
| PDF export blank | Ensure html2pdf.js CDN is accessible; check browser console for errors |
| Dark mode not persisting | Clear localStorage: `localStorage.removeItem('wa-theme')` |

### Useful Commands

```bash
# Check deployment outputs
cat deployment-outputs.txt

# View CDK stack status
aws cloudformation describe-stacks --query "Stacks[?starts_with(StackName,'WAReview')].{Name:StackName,Status:StackStatus}" --output table

# View Lambda logs
aws logs tail /aws/lambda/wa-review-scan-handler --follow

# Re-deploy dashboard only
aws s3 sync dashboard/ s3://$(grep S3_BUCKET deployment-outputs.txt | cut -d= -f2) --exclude "node_modules/*" --delete

# Destroy everything
./deploy.sh --destroy
```

---

## License

Copyright (c) 2024 Com7 Public Company Limited (Com7 Business). All rights reserved.

This software is proprietary and licensed exclusively to Com7 Business customers with a valid service agreement. Unauthorized use, reproduction, or distribution is prohibited. See [LICENSE](LICENSE) for full terms.
