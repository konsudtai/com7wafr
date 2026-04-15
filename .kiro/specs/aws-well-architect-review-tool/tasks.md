# Implementation Plan: AWS Well-Architected Review Tool

## Overview

แผนการ implement เครื่องมือ AWS Well-Architected Review Tool ครอบคลุมทั้ง CLI mode และ Web Dashboard mode โดยแบ่งเป็น tasks ที่สร้างโค้ดทั้งหมด (Python core, CDK infra, backend handlers, dashboard frontend) แต่ไม่รวมการ deploy จริง — เน้นสร้างโค้ดที่สามารถ review ด้วย `cdk synth` ได้

## Tasks

- [x] 1. ตั้งค่าโครงสร้างโปรเจกต์และ dependencies
  - [x] 1.1 สร้างโครงสร้างไดเรกทอรีตาม structure.md (cli/, core/, checks/, backend/, dashboard/, infra/, installer/, tests/)
    - สร้าง `__init__.py` สำหรับทุก Python packages
    - สร้าง `requirements.txt` พร้อม dependencies: boto3, pydantic>=2.0, PyYAML, hypothesis, pytest, pytest-cov, moto, aws-cdk-lib
    - _Requirements: ทุก requirements (โครงสร้างพื้นฐาน)_

  - [x] 1.2 ตั้งค่า CDK project ใน `infra/`
    - สร้าง `infra/app.py`, `infra/cdk.json`, `infra/requirements.txt`
    - สร้างไดเรกทอรี `infra/stacks/` พร้อม `__init__.py`
    - _Requirements: 18 (Backend Infrastructure)_

  - [x] 1.3 ตั้งค่า Dashboard project ใน `dashboard/`
    - สร้าง `dashboard/index.html` พร้อม basic structure
    - สร้างโครงสร้าง `dashboard/css/`, `dashboard/js/`, `dashboard/js/pages/`
    - _Requirements: 17 (Dashboard)_

- [x] 2. สร้าง Core Data Models (Pydantic v2)
  - [x] 2.1 Implement data models ใน `core/models.py`
    - สร้าง Enums: Pillar, Severity, ScanStatus, UserRole, MemberStatus
    - สร้าง Models: TagFilter, Finding, Check, SuppressionRule, AccountConfiguration, ScanConfiguration, ResourceData, ScanResult, TeamMember
    - ใช้ Pydantic v2 BaseModel พร้อม Field validators
    - _Requirements: 4.3, 4.4, 6.4, 7.5, 10.5, 15.13, 19.9, 20.8_

  - [ ]* 2.2 Property test: Finding serialization round-trip
    - **Property 1: Finding serialization round-trip**
    - **Validates: Requirements 6.4**

  - [ ]* 2.3 Property test: Suppression config serialization round-trip
    - **Property 2: Suppression config serialization round-trip**
    - **Validates: Requirements 7.5**

  - [ ]* 2.4 Property test: Scan configuration serialization round-trip
    - **Property 3: Scan configuration serialization round-trip**
    - **Validates: Requirements 10.5**

  - [ ]* 2.5 Property test: Account configuration serialization round-trip
    - **Property 4: Account configuration serialization round-trip**
    - **Validates: Requirements 15.13**

  - [ ]* 2.6 Property test: Finding invariants
    - **Property 7: Finding invariants**
    - **Validates: Requirements 4.1, 4.3, 4.4**

  - [ ]* 2.7 Property test: Team member data completeness
    - **Property 18: Team member data completeness**
    - **Validates: Requirements 20.8**

- [x] 3. Implement Config Parser (`core/config_parser.py`)
  - [x] 3.1 Implement ConfigParser class
    - `parse_cli_args()`: แปลง argparse.Namespace เป็น ScanConfiguration
    - `parse_config_file()`: อ่าน JSON/YAML config file
    - `merge_configs()`: รวม config โดย CLI args override file config
    - `parse_suppression_file()`: อ่าน YAML suppression file
    - `validate_config()`: validate configuration พร้อม error messages ที่ระบุ field และสาเหตุ
    - _Requirements: 7.1, 7.2, 7.3, 10.1, 10.2, 10.3, 10.4_

  - [ ]* 3.2 Property test: Config merge precedence
    - **Property 9: Config merge precedence**
    - **Validates: Requirements 10.4**

- [x] 4. Implement Account Manager (`core/account_manager.py`)
  - [x] 4.1 Implement AccountStorageBackend protocol และ FileAccountStorage
    - `FileAccountStorage`: อ่าน/เขียน JSON/YAML file สำหรับ CLI mode
    - _Requirements: 15.1_

  - [x] 4.2 Implement AccountManager class
    - `add_account()`: เพิ่ม account พร้อม validate ARN format และทดสอบ assume role
    - `remove_account()`: ลบ account ด้วย account_id หรือ alias
    - `update_account()`: แก้ไข role_arn หรือ alias
    - `list_accounts()`: แสดงรายการ accounts พร้อมสถานะ
    - `verify_account()`: ทดสอบ assume role connectivity
    - ตรวจสอบ account ID ไม่ซ้ำกัน
    - _Requirements: 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 15.8, 15.9_

  - [ ]* 4.3 Property test: IAM Role ARN validation
    - **Property 12: IAM Role ARN validation**
    - **Validates: Requirements 15.3**

  - [ ]* 4.4 Property test: Account ID uniqueness
    - **Property 13: Account ID uniqueness**
    - **Validates: Requirements 15.9**

- [x] 5. Implement STS Client (`core/sts_client.py`)
  - [x] 5.1 Implement STSClient class
    - `assume_role()`: เรียก STS AssumeRole พร้อม session duration ที่ configurable
    - `get_or_refresh_credentials()`: credential caching พร้อม auto-refresh เมื่อหมดอายุ
    - `validate_role_arn()`: validate ARN format ตาม pattern `arn:aws:iam::<12-digit>:role/<name>`
    - _Requirements: 9.1, 15.4, 15.10, 15.11, 15.12_

- [x] 6. Checkpoint - ตรวจสอบ core models และ config
  - ตรวจสอบว่า tests ทั้งหมดผ่าน, ถามผู้ใช้หากมีข้อสงสัย

- [ ] 7. Implement Scanner (`core/scanner.py`)
  - [x] 7.1 Implement Scanner class พร้อม concurrent execution
    - `scan()`: สแกนข้าม accounts, regions, services แบบ concurrent ด้วย asyncio + ThreadPoolExecutor
    - `scan_service()`: สแกน service เดียวใน region เดียว
    - `filter_by_tags()`: กรอง resources ตาม tag conditions (AND logic)
    - `apply_suppressions()`: แยก findings เป็น active และ suppressed
    - จำกัด concurrent tasks ตาม concurrency_limit
    - จัดการ errors แบบ isolate ไม่กระทบ tasks อื่น
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 7.1, 9.1, 9.2, 9.3, 11.1, 11.2, 11.3, 11.4_

  - [ ]* 7.2 Property test: Tag filtering with AND logic
    - **Property 5: Tag filtering with AND logic**
    - **Validates: Requirements 3.1, 3.2, 3.3**

  - [ ]* 7.3 Property test: Suppression matching correctness
    - **Property 6: Suppression matching correctness**
    - **Validates: Requirements 7.1, 7.4**

  - [ ]* 7.4 Property test: Error isolation in scan tasks
    - **Property 8: Error isolation in scan tasks**
    - **Validates: Requirements 1.3, 2.3, 9.3, 11.2**

  - [ ]* 7.5 Property test: Concurrent result merging completeness
    - **Property 14: Concurrent result merging completeness**
    - **Validates: Requirements 11.4**

- [ ] 8. Implement Rule Engine (`core/rule_engine.py`)
  - [x] 8.1 Implement RuleEngine class
    - `load_checks()`: โหลด check definitions จาก YAML files ใน checks/ directory
    - `evaluate()`: ประเมิน resource ตาม checks ที่เกี่ยวข้องกับ service
    - `get_checks_by_pillar()`: ดึง checks ตาม pillar
    - `get_checks_by_service()`: ดึง checks ตาม service
    - จัดการ invalid check definitions พร้อม error message ที่ระบุ check ID
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 14.1, 14.2, 14.3, 14.4_

- [ ] 9. Implement Report Generator (`core/report_generator.py`)
  - [x] 9.1 Implement ReportGenerator class
    - `generate_html()`: สร้าง self-contained HTML report พร้อม summary dashboard, filters, คำแนะนำ
    - `generate_json_raw()`: สร้าง api-raw.json
    - `generate_json_full()`: สร้าง api-full.json พร้อม summary data
    - แสดง suppressed findings count แยกต่างหาก
    - แสดงผลแยกตาม account สำหรับ cross-account scans
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.3, 7.4, 9.4_

  - [ ]* 9.2 Property test: Report summary accuracy
    - **Property 10: Report summary accuracy**
    - **Validates: Requirements 5.2, 12.5**

- [ ] 10. Implement CLI Entry Point (`cli/main.py`)
  - [x] 10.1 Implement CLIApp class
    - `parse_arguments()`: parse CLI arguments รวมถึง subcommands (add-account, remove-account, list-accounts, verify-account)
    - `run()`: ประสานงาน ConfigParser → AccountManager → Scanner → ReportGenerator
    - รองรับ --help พร้อมตัวอย่างการใช้งาน
    - แสดง progress indicator ระหว่างสแกน
    - แสดง summary เมื่อสแกนเสร็จ
    - Exit codes: 0 (สำเร็จ), 1 (มี critical findings), 2 (execution error)
    - Logging ระดับ DEBUG, INFO, WARNING, ERROR
    - Retry ด้วย exponential backoff สำหรับ rate limiting
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 13.1, 13.2, 13.3, 13.4_

  - [ ]* 10.2 Property test: Exit code correctness
    - **Property 11: Exit code correctness**
    - **Validates: Requirements 13.4**

- [ ] 11. Checkpoint - ตรวจสอบ CLI mode ทำงานครบถ้วน
  - ตรวจสอบว่า tests ทั้งหมดผ่าน, ถามผู้ใช้หากมีข้อสงสัย

- [ ] 12. Implement CDK Infrastructure Stacks (ไม่ deploy)
  - [x] 12.1 Implement AuthStack (`infra/stacks/auth_stack.py`)
    - สร้าง Cognito User Pool พร้อม password policy, custom attributes (custom:role)
    - สร้าง User Pool Client พร้อม auth flows (USER_PASSWORD_AUTH, USER_SRP_AUTH)
    - ตั้งค่า self_sign_up_enabled=False, prevent_user_existence_errors=True
    - Token validity: ID/Access 1 ชั่วโมง, Refresh 30 วัน
    - _Requirements: 19.1, 19.9_

  - [x] 12.2 Implement DataStack (`infra/stacks/data_stack.py`)
    - สร้าง DynamoDB table (single-table design) พร้อม PK/SK, GSI1, TTL
    - Billing mode: PAY_PER_REQUEST
    - _Requirements: 18.3, 18.9_

  - [x] 12.3 Implement ApiStack (`infra/stacks/api_stack.py`)
    - สร้าง REST API Gateway พร้อม Cognito Authorizer
    - สร้าง Lambda Functions สำหรับ scan, account, team handlers
    - กำหนด API resources และ methods ตาม endpoint table ใน design
    - ตั้งค่า CORS configuration
    - Grant DynamoDB permissions ให้ Lambda functions
    - _Requirements: 18.1, 18.2, 18.7, 18.10, 19.6, 19.12_

  - [x] 12.4 Implement FrontendStack (`infra/stacks/frontend_stack.py`)
    - สร้าง S3 bucket (block public access) สำหรับ static site
    - สร้าง CloudFront distribution พร้อม OAC, HTTPS redirect, SPA routing (404 → index.html)
    - CfnOutput สำหรับ DashboardURL, ApiURL, UserPoolId, UserPoolClientId
    - _Requirements: 17.1_

  - [x] 12.5 สร้าง CDK app entry point (`infra/app.py`)
    - Wire ทุก stacks เข้าด้วยกัน: AuthStack → DataStack → ApiStack → FrontendStack
    - ส่ง cross-stack references (user_pool, table, api_url)
    - ตรวจสอบว่า `cdk synth` ทำงานได้สำเร็จ
    - _Requirements: 18 (ทั้งหมด)_

- [ ] 13. Implement Auth Module (`backend/auth/auth_module.py`)
  - [x] 13.1 Implement AuthModule class
    - `extract_user_role()`: ดึง UserRole จาก JWT claims (custom:role), default เป็น Viewer
    - `check_authorization()`: ตรวจสอบสิทธิ์ตาม role (Admin: full access, Viewer: GET only ยกเว้น /team/*)
    - `get_generic_auth_error()`: return generic error message ที่ไม่เปิดเผย email/password
    - _Requirements: 19.4, 19.6, 19.9, 19.10, 19.11_

  - [ ]* 13.2 Property test: Role-based authorization correctness
    - **Property 15: Role-based authorization correctness**
    - **Validates: Requirements 19.10, 19.11**

  - [ ]* 13.3 Property test: Authentication error message uniformity
    - **Property 16: Authentication error message uniformity**
    - **Validates: Requirements 19.4**

  - [ ]* 13.4 Property test: User role extraction from JWT claims
    - **Property 17: User role extraction from JWT claims**
    - **Validates: Requirements 19.9**

- [ ] 14. Implement Backend Lambda Handlers
  - [x] 14.1 Implement ScanHandler (`backend/handlers/scan_handler.py`)
    - `start_scan()`: POST /scans — สร้าง scan job, ประมวลผล async, ต้องเป็น Admin
    - `get_scan_status()`: GET /scans/{id}/status — ส่งคืนสถานะ (PENDING, IN_PROGRESS, COMPLETED, FAILED) พร้อม progress
    - `get_scan_results()`: GET /scans/{id}/results — ส่งคืนผลการสแกน
    - `list_scan_history()`: GET /scans — ดูประวัติการสแกน
    - จัดเก็บผลลงใน DynamoDB พร้อม timestamp
    - _Requirements: 18.2, 18.4, 18.5, 18.6, 18.8_

  - [x] 14.2 Implement AccountHandler (`backend/handlers/account_handler.py`)
    - CRUD operations สำหรับ accounts ผ่าน DynamoDB
    - `create_account()`, `delete_account()`, `update_account()`, `list_accounts()`, `verify_account()`
    - ใช้ DynamoDBAccountStorage backend
    - _Requirements: 15.1, 15.2, 15.6, 15.7, 15.8, 18.2_

  - [x] 14.3 Implement TeamHandler และ TeamManager (`backend/handlers/team_handler.py`)
    - `add_member()`: สร้าง user ใน Cognito พร้อม temp password และ custom:role
    - `remove_member()`: ลบ user จาก Cognito พร้อม revoke sessions
    - `update_member_role()`: เปลี่ยน custom:role attribute
    - `list_members()`: ดึงรายการ users จาก Cognito
    - ป้องกัน self-deletion และ last admin deletion
    - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5, 20.6, 20.7, 20.8, 20.9, 20.10, 20.12_

  - [ ] 14.4 Property test: Admin minimum count invariant
    - **Property 19: Admin minimum count invariant**
    - **Validates: Requirements 20.9, 20.10**

- [ ] 15. Checkpoint - ตรวจสอบ backend และ CDK stacks
  - ตรวจสอบว่า tests ทั้งหมดผ่าน, รัน `cdk synth` เพื่อ verify infrastructure, ถามผู้ใช้หากมีข้อสงสัย

- [ ] 16. Implement Dashboard Frontend (Vanilla HTML/CSS/JS)
  - [x] 16.1 สร้างโครงสร้าง Dashboard และ main entry point
    - สร้าง `dashboard/index.html` — SPA shell พร้อม navigation sidebar, content area, CDN links (Chart.js, Cognito SDK)
    - สร้าง `dashboard/css/style.css` — Global styles ตาม Claude-inspired design system (warm parchment theme)
    - สร้าง `dashboard/js/app.js` — Hash-based routing, navigation, dark/light mode toggle
    - _Requirements: 17.1, 17.8_

  - [x] 16.2 Implement Auth module และ Login page
    - สร้าง `dashboard/js/auth.js` — Cognito integration: login, logout, token management, auto-refresh, force change password
    - สร้าง `dashboard/js/pages/login.js` — Login form, generic error messages, force change password form
    - สร้าง `dashboard/js/api.js` — API client with JWT Authorization header
    - _Requirements: 19.2, 19.3, 19.4, 19.5, 19.7, 19.8_

  - [x] 16.3 Implement Overview Page
    - สร้าง `dashboard/js/pages/overview.js` — Radar chart (pillar scores), doughnut chart (severity), stacked bar chart (heatmap), account summary cards
    - ใช้ Chart.js สำหรับ charts
    - _Requirements: 17.2, 17.3, 17.4, 17.9_

  - [x] 16.4 Implement Findings Page
    - สร้าง `dashboard/js/pages/findings.js` — Findings table พร้อม dropdown filters (account, region, service, pillar, severity), text search, detail modal
    - _Requirements: 17.5, 17.7_

  - [x] 16.5 Implement Accounts Page
    - สร้าง `dashboard/js/pages/accounts.js` — Accounts table, Add/Edit/Delete modals (Admin only), Verify button, account summary cards
    - _Requirements: 17.9, 18.2_

  - [x] 16.6 Implement Scan Page
    - สร้าง `dashboard/js/pages/scan.js` — Run Check button (Admin only), progress bar, status indicator, current service/region display
    - _Requirements: 17.10, 17.12_

  - [x] 16.7 Implement History Page
    - สร้าง `dashboard/js/pages/history.js` — Scan history table, trend line chart (Chart.js)
    - _Requirements: 17.6_

  - [x] 16.8 Implement Team Management Page
    - สร้าง `dashboard/js/pages/team.js` — Members table, Add/Remove/Change Role modals (Admin only), self-deletion prevention, last admin protection
    - ซ่อนหน้านี้สำหรับ Viewer
    - _Requirements: 20.1, 20.2, 20.5, 20.7, 20.8, 20.11_

  - [x] 16.9 Implement PDF export และ shared utilities
    - PDF export functionality (placeholder)
    - Navigation layout พร้อม role-based menu visibility
    - _Requirements: 17.11_

- [ ] 17. Implement Check Definitions (YAML + evaluation logic)
  - [x] 17.1 สร้าง check definitions สำหรับ EC2 และ S3
    - สร้าง YAML files ตาม check definition format ใน design
    - Implement evaluation functions ใน `checks/ec2/` และ `checks/s3/`
    - Map checks กับ Well-Architected pillars และ severity levels
    - _Requirements: 2.4, 4.1, 4.2, 14.1, 14.2, 14.3_

  - [x] 17.2 สร้าง check definitions สำหรับ RDS, IAM, Lambda
    - YAML definitions + evaluation logic
    - _Requirements: 2.4, 14.1, 14.2_

  - [x] 17.3 สร้าง check definitions สำหรับ DynamoDB, ELB, CloudFront, ECS, EKS
    - YAML definitions + evaluation logic
    - _Requirements: 2.4, 14.1, 14.2_

- [ ] 18. Implement WA Integration (`core/wa_integration.py`)
  - [x] 18.1 Implement WAIntegration class
    - `create_workload()`: สร้าง workload ใน AWS Well-Architected Tool
    - `create_milestone()`: สร้าง milestone พร้อมผลการสแกน
    - `map_findings_to_questions()`: map findings กับ WA Tool questions
    - จัดการ error เมื่อ API ล้มเหลว (log error, สร้างรายงานปกติ)
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [ ] 19. Implement DynamoDBAccountStorage (`core/account_manager.py`)
  - [x] 19.1 Implement DynamoDBAccountStorage class
    - `load()`: อ่าน accounts จาก DynamoDB (PK=ACCOUNT#{id}, SK=META)
    - `save()`: เขียน accounts ลง DynamoDB
    - ใช้สำหรับ web dashboard mode
    - _Requirements: 15.1_

- [ ] 20. Implement Installer Script (`installer/install.sh`)
  - [x] 20.1 สร้าง install.sh
    - ตรวจสอบ environment (CloudShell/Linux)
    - ตรวจสอบ Python version
    - ดาวน์โหลดและติดตั้ง dependencies ด้วย pip --user (ไม่ต้องใช้ sudo)
    - ตั้งค่า PATH
    - แสดงข้อความยืนยันพร้อมตัวอย่างคำสั่ง
    - จัดการ error พร้อมข้อความแก้ไข
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7_

- [ ] 21. Checkpoint - ตรวจสอบ integration ทั้งหมด
  - ตรวจสอบว่า tests ทั้งหมดผ่าน, รัน `cdk synth` เพื่อ verify infrastructure, ถามผู้ใช้หากมีข้อสงสัย

- [ ] 22. เขียน Unit Tests และ Integration Tests
  - [x] 22.1 Unit tests สำหรับ Config Parser
    - ทดสอบ parsing JSON/YAML files, invalid formats, error messages
    - _Requirements: 10.1, 10.2, 10.3_

  - [x] 22.2 Unit tests สำหรับ Account Manager
    - ทดสอบ CRUD operations, delete by ID/alias, duplicate detection
    - ใช้ moto สำหรับ mock STS
    - _Requirements: 15.2, 15.6, 15.7, 15.8, 15.9_

  - [x] 22.3 Unit tests สำหรับ Rule Engine
    - ทดสอบ loading check definitions, invalid check formats, evaluation logic
    - _Requirements: 14.1, 14.2, 14.3, 14.4_

  - [x] 22.4 Integration tests สำหรับ Scanner
    - ใช้ moto mock AWS services, ทดสอบ end-to-end scan flow
    - ทดสอบ concurrent execution ด้วย ThreadPoolExecutor
    - ทดสอบ cross-account STS assume role flow
    - _Requirements: 1.1, 1.4, 9.1, 11.1_

  - [x] 22.5 Integration tests สำหรับ Backend Handlers
    - ทดสอบ Lambda handlers ด้วย mocked DynamoDB และ Cognito (moto)
    - ทดสอบ API authorization (missing token, expired token, wrong role)
    - ทดสอบ Team Management operations
    - _Requirements: 18.2, 18.4, 19.6, 20.3, 20.6_

- [ ] 23. Final Checkpoint - ตรวจสอบทุกอย่างพร้อมสำหรับ review
  - ตรวจสอบว่า tests ทั้งหมดผ่าน, รัน `cdk synth` สำเร็จ, ถามผู้ใช้หากมีข้อสงสัย

## Notes

- Tasks ที่มีเครื่องหมาย `*` เป็น optional สามารถข้ามได้สำหรับ MVP ที่เร็วขึ้น
- ทุก task อ้างอิง requirements เฉพาะเพื่อ traceability
- Checkpoints ช่วยให้ตรวจสอบความถูกต้องแบบ incremental
- Property tests ตรวจสอบ correctness properties ที่กำหนดใน design document
- Unit tests ตรวจสอบ specific examples และ edge cases
- **ไม่มีการ deploy จริง** — เน้นสร้างโค้ดที่สามารถ review ด้วย `cdk synth` ได้
- ภาษาที่ใช้ implement: Python (CLI, backend, CDK), JavaScript (Dashboard frontend)
