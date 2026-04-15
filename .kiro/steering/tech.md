# Tech Stack & Build

## Languages
- Python 3.12+ (CLI, backend, CDK infrastructure)
- TypeScript/JavaScript (Dashboard frontend)

## Core Libraries & Frameworks

### Python (CLI + Backend)
- **boto3**: AWS SDK for API calls
- **pydantic v2**: Data validation and serialization for all models
- **asyncio + ThreadPoolExecutor**: Concurrent execution (boto3 doesn't support async natively)
- **PyYAML**: YAML config/suppression file parsing
- **argparse**: CLI argument parsing

### Frontend (Dashboard)
- **React**: UI framework
- **AWS Cloudscape Design System**: Component library (AWS-native design system)
- **Amazon Cognito JS SDK**: Authentication (login, token management, refresh)

### Infrastructure
- **AWS CDK (Python)**: Infrastructure as Code for all stacks (Auth, Data, API, Frontend)

### Testing
- **pytest**: Unit and integration tests
- **hypothesis**: Property-based testing (min 100 iterations per property via `@settings(max_examples=100)`)
- **moto**: AWS service mocking
- **unittest.mock**: General mocking
- **pytest-cov**: Code coverage
- **Jest + React Testing Library**: Dashboard component tests
- **Playwright**: Dashboard E2E tests

## AWS Services Used
- **Lambda**: Backend API handlers
- **API Gateway**: REST API with Cognito Authorizer
- **DynamoDB**: Data store (single-table design)
- **S3**: Static site hosting for dashboard
- **CloudFront**: CDN for dashboard
- **Cognito User Pool**: Authentication & user management (RBAC via custom:role attribute)
- **STS**: Cross-account assume role
- **Well-Architected Tool API**: Optional integration for findings

## Common Commands

```bash
# Install Python dependencies
pip install -r requirements.txt

# Run all tests
pytest

# Run tests with coverage
pytest --cov

# Run only property-based tests
pytest tests/test_*_roundtrip.py tests/test_*_invariant*.py tests/test_*_correctness.py

# CDK synth (preview infrastructure)
cd infra && cdk synth

# CDK deploy
cd infra && cdk deploy --all

# Dashboard dev server
cd dashboard && npm install && npm start

# Dashboard build
cd dashboard && npm run build

# Run the CLI tool
python -m cli.main --regions us-east-1 --services ec2,s3
```

## Key Conventions
- All data models use Pydantic v2 BaseModel
- Check definitions are YAML files (plugin-based, no core code changes needed)
- Suppression files are YAML format
- Scan configuration supports both JSON and YAML
- CLI args override config file values when both are provided
- DynamoDB uses single-table design with PK/SK pattern
- JWT validation via Cognito Authorizer on API Gateway (not custom Lambda logic)
- Error messages for auth failures must be generic (never reveal which field was wrong)
