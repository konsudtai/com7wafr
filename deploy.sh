#!/bin/bash
# ============================================================
# AWS Well-Architected Review Tool — One-Command Deployment
# ============================================================
#
# Usage:
#   chmod +x deploy.sh
#   ./deploy.sh
#
# Optional:
#   ./deploy.sh --region ap-southeast-1
#   ./deploy.sh --profile my-aws-profile
#   ./deploy.sh --admin-email admin@company.com
#   ./deploy.sh --destroy    (tear down all stacks)
#
# Prerequisites:
#   - AWS CLI configured with credentials
#   - Node.js 18+ and npm
#   - Python 3.9+
#   - AWS CDK CLI (installed automatically if missing)
#
# This script will:
#   1. Check prerequisites
#   2. Install dependencies (backend, infra)
#   3. Build backend Lambda handlers
#   4. Deploy CDK stacks (Auth, Data, API, Frontend)
#   5. Upload dashboard to S3
#   6. Create initial admin user in Cognito
#   7. Output dashboard URL and credentials
# ============================================================
set -e

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()    { echo -e "${CYAN}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
fail()    { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }
step()    { echo -e "\n${BOLD}=== $* ===${NC}"; }

# --- Parse Arguments ---
AWS_REGION=""
AWS_PROFILE=""
ADMIN_EMAIL=""
DESTROY=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --region)      AWS_REGION="$2"; shift 2 ;;
    --profile)     AWS_PROFILE="$2"; shift 2 ;;
    --admin-email) ADMIN_EMAIL="$2"; shift 2 ;;
    --destroy)     DESTROY=true; shift ;;
    -h|--help)
      echo "Usage: ./deploy.sh --admin-email EMAIL [OPTIONS]"
      echo ""
      echo "Required:"
      echo "  --admin-email EMAIL    Email for initial admin user"
      echo ""
      echo "Options:"
      echo "  --region REGION        AWS region (default: from AWS config)"
      echo "  --profile PROFILE      AWS CLI profile name"
      echo "  --destroy              Tear down all stacks"
      echo "  -h, --help             Show this help"
      exit 0
      ;;
    *) fail "Unknown option: $1. Use --help for usage." ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INFRA_DIR="$SCRIPT_DIR/infra"
BACKEND_DIR="$SCRIPT_DIR/backend"
DASHBOARD_DIR="$SCRIPT_DIR/dashboard"

# Validate --admin-email is provided (unless destroying)
if [ "$DESTROY" = false ] && [ -z "$ADMIN_EMAIL" ]; then
  fail "--admin-email is required.\n\n  Usage: ./deploy.sh --admin-email admin@yourcompany.com\n\n  Run ./deploy.sh --help for all options."
fi

# Build AWS CLI args
AWS_ARGS=""
if [ -n "$AWS_PROFILE" ]; then
  AWS_ARGS="$AWS_ARGS --profile $AWS_PROFILE"
  export AWS_PROFILE
fi
if [ -n "$AWS_REGION" ]; then
  export AWS_DEFAULT_REGION="$AWS_REGION"
  export CDK_DEFAULT_REGION="$AWS_REGION"
fi

# --- Destroy Mode ---
if [ "$DESTROY" = true ]; then
  step "Destroying all stacks"
  cd "$INFRA_DIR"
  npx aws-cdk destroy --all --force $AWS_ARGS
  success "All stacks destroyed"
  exit 0
fi

# ============================================================
# Step 1: Check Prerequisites
# ============================================================
step "Step 1/7: Checking prerequisites"

# AWS CLI
if ! command -v aws &>/dev/null; then
  fail "AWS CLI not found. Install: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html"
fi
success "AWS CLI $(aws --version 2>&1 | head -1)"

# AWS credentials
ACCOUNT_ID=$(aws sts get-caller-identity $AWS_ARGS --query Account --output text 2>/dev/null) \
  || fail "AWS credentials not configured. Run: aws configure"

# Region detection: CLI arg > aws configure > AWS_REGION env > AWS_DEFAULT_REGION env > CloudShell metadata > fallback
REGION=""
if [ -n "$AWS_REGION" ]; then
  REGION="$AWS_REGION"
elif [ -n "$AWS_DEFAULT_REGION" ]; then
  REGION="$AWS_DEFAULT_REGION"
else
  REGION=$(aws configure get region $AWS_ARGS 2>/dev/null || true)
fi

if [ -z "$REGION" ]; then
  # CloudShell sets AWS_REGION automatically, but just in case:
  REGION=$(curl -s http://169.254.169.254/latest/meta-data/placement/region 2>/dev/null || true)
fi

if [ -z "$REGION" ]; then
  REGION="ap-southeast-1"
  warn "Could not detect region. Using default: $REGION"
  warn "To specify a region, use: ./deploy.sh --region ap-southeast-1 --admin-email ..."
fi

export AWS_DEFAULT_REGION="$REGION"
export CDK_DEFAULT_REGION="$REGION"
export CDK_DEFAULT_ACCOUNT="$ACCOUNT_ID"

success "AWS Account: $ACCOUNT_ID, Region: $REGION"

# Node.js
if ! command -v node &>/dev/null; then
  fail "Node.js not found. Install Node.js 18+: https://nodejs.org/"
fi
NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  fail "Node.js 18+ required (found: $(node -v))"
fi
success "Node.js $(node -v)"

# npm
if ! command -v npm &>/dev/null; then
  fail "npm not found"
fi
success "npm $(npm -v)"

# Python
if command -v python3 &>/dev/null; then
  PYTHON=python3
elif command -v python &>/dev/null; then
  PYTHON=python
else
  fail "Python 3.9+ not found"
fi
PY_VERSION=$($PYTHON -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
success "Python $PY_VERSION"

# CDK CLI
if ! command -v cdk &>/dev/null; then
  info "CDK CLI not found. Will use npx cdk instead."
  alias cdk="npx aws-cdk"
fi
success "CDK $(npx aws-cdk --version 2>/dev/null || cdk --version 2>/dev/null || echo 'via npx')"

# ============================================================
# Step 2: Install Dependencies
# ============================================================
step "Step 2/7: Installing dependencies"

# Backend
info "Installing backend dependencies..."
cd "$BACKEND_DIR"
npm ci --silent 2>/dev/null || npm install --silent
success "Backend dependencies installed"

# Infra
info "Installing infrastructure dependencies..."
cd "$INFRA_DIR"
npm ci --silent 2>/dev/null || npm install --silent
success "Infrastructure dependencies installed"

# Python (for CLI tools, optional)
cd "$SCRIPT_DIR"
if [ -f requirements.txt ]; then
  info "Installing Python dependencies..."
  $PYTHON -m pip install -r requirements.txt --quiet 2>/dev/null || true
  success "Python dependencies installed"
fi

# ============================================================
# Step 3: Build Backend
# ============================================================
step "Step 3/7: Building backend Lambda handlers"

cd "$BACKEND_DIR"
npx tsc
success "Backend TypeScript compiled"

# ============================================================
# Step 4: CDK Bootstrap (if needed)
# ============================================================
step "Step 4/7: CDK Bootstrap"

cd "$INFRA_DIR"
info "Checking CDK bootstrap status..."
npx aws-cdk bootstrap "aws://$ACCOUNT_ID/$REGION" $AWS_ARGS 2>/dev/null \
  && success "CDK bootstrapped" \
  || warn "CDK bootstrap may already exist (continuing)"

# ============================================================
# Step 5: Deploy CDK Stacks
# ============================================================
step "Step 5/7: Deploying CDK stacks"

cd "$INFRA_DIR"
info "This may take 5-10 minutes on first deploy..."

npx aws-cdk deploy --all \
  --require-approval never \
  --outputs-file "$SCRIPT_DIR/cdk-outputs.json" \
  $AWS_ARGS

success "All CDK stacks deployed"

# ============================================================
# Step 6: Upload Dashboard to S3
# ============================================================
step "Step 6/7: Uploading dashboard to S3"

# Parse CDK outputs
if [ ! -f "$SCRIPT_DIR/cdk-outputs.json" ]; then
  fail "cdk-outputs.json not found. CDK deploy may have failed."
fi

DASHBOARD_URL=$(cat "$SCRIPT_DIR/cdk-outputs.json" | $PYTHON -c "
import json, sys
data = json.load(sys.stdin)
for stack in data.values():
    if 'DashboardURL' in stack:
        print(stack['DashboardURL'])
        break
" 2>/dev/null)

API_URL=$(cat "$SCRIPT_DIR/cdk-outputs.json" | $PYTHON -c "
import json, sys
data = json.load(sys.stdin)
for stack in data.values():
    if 'ApiURL' in stack:
        print(stack['ApiURL'])
        break
" 2>/dev/null)

USER_POOL_ID=$(cat "$SCRIPT_DIR/cdk-outputs.json" | $PYTHON -c "
import json, sys
data = json.load(sys.stdin)
for stack in data.values():
    if 'UserPoolId' in stack:
        print(stack['UserPoolId'])
        break
" 2>/dev/null)

USER_POOL_CLIENT_ID=$(cat "$SCRIPT_DIR/cdk-outputs.json" | $PYTHON -c "
import json, sys
data = json.load(sys.stdin)
for stack in data.values():
    if 'UserPoolClientId' in stack:
        print(stack['UserPoolClientId'])
        break
" 2>/dev/null)

# Find S3 bucket name from CloudFormation
BUCKET_NAME=$(aws cloudformation describe-stack-resources \
  --stack-name WAReviewFrontendStack \
  --query "StackResources[?ResourceType=='AWS::S3::Bucket'].PhysicalResourceId" \
  --output text $AWS_ARGS 2>/dev/null)

if [ -z "$BUCKET_NAME" ]; then
  fail "Could not find S3 bucket from FrontendStack"
fi

# Inject config into dashboard
info "Injecting API and Cognito config into dashboard..."
cat > "$DASHBOARD_DIR/js/config.js" <<EOF
// Auto-generated by deploy.sh — do not edit manually
window.WA_CONFIG = {
  API_BASE_URL: '${API_URL}',
  USER_POOL_ID: '${USER_POOL_ID}',
  CLIENT_ID: '${USER_POOL_CLIENT_ID}',
  REGION: '${REGION}',
  PLATFORM_ACCOUNT_ID: '${ACCOUNT_ID}',
};
EOF

# Add config.js to index.html if not already there
if ! grep -q 'config.js' "$DASHBOARD_DIR/index.html"; then
  sed -i 's|<script src="js/auth.js"></script>|<script src="js/config.js"></script>\n  <script src="js/auth.js"></script>|' "$DASHBOARD_DIR/index.html"
fi

# Upload dashboard files to S3
info "Uploading dashboard to S3: $BUCKET_NAME"
aws s3 sync "$DASHBOARD_DIR" "s3://$BUCKET_NAME" \
  --exclude "node_modules/*" \
  --exclude "src/*" \
  --exclude ".gitkeep" \
  --delete \
  $AWS_ARGS

# Invalidate CloudFront cache
DISTRIBUTION_ID=$(aws cloudformation describe-stack-resources \
  --stack-name WAReviewFrontendStack \
  --query "StackResources[?ResourceType=='AWS::CloudFront::Distribution'].PhysicalResourceId" \
  --output text $AWS_ARGS 2>/dev/null)

if [ -n "$DISTRIBUTION_ID" ]; then
  info "Invalidating CloudFront cache..."
  aws cloudfront create-invalidation \
    --distribution-id "$DISTRIBUTION_ID" \
    --paths "/*" \
    $AWS_ARGS > /dev/null 2>&1 || true
  success "CloudFront cache invalidated"
fi

success "Dashboard uploaded to S3"

# ============================================================
# Step 7: Create Initial Admin User
# ============================================================
step "Step 7/7: Setting up initial admin user"

info "Creating admin user: $ADMIN_EMAIL"

# Create user in Cognito
aws cognito-idp admin-create-user \
  --user-pool-id "$USER_POOL_ID" \
  --username "$ADMIN_EMAIL" \
  --user-attributes \
    Name=email,Value="$ADMIN_EMAIL" \
    Name=email_verified,Value=true \
    Name=custom:role,Value=Admin \
  --desired-delivery-mediums EMAIL \
  $AWS_ARGS 2>/dev/null \
  && success "Admin user created. Temporary password sent to $ADMIN_EMAIL" \
  || warn "User may already exist (continuing)"

# ============================================================
# Deployment Complete
# ============================================================
echo ""
echo -e "${GREEN}${BOLD}============================================================${NC}"
echo -e "${GREEN}${BOLD}  Deployment Complete${NC}"
echo -e "${GREEN}${BOLD}============================================================${NC}"
echo ""
echo -e "  ${BOLD}Dashboard URL:${NC}     $DASHBOARD_URL"
echo -e "  ${BOLD}API URL:${NC}           $API_URL"
echo -e "  ${BOLD}User Pool ID:${NC}      $USER_POOL_ID"
echo -e "  ${BOLD}Client ID:${NC}         $USER_POOL_CLIENT_ID"
echo -e "  ${BOLD}S3 Bucket:${NC}         $BUCKET_NAME"
echo -e "  ${BOLD}Region:${NC}            $REGION"
echo -e "  ${BOLD}Account:${NC}           $ACCOUNT_ID"
if [ -n "$ADMIN_EMAIL" ]; then
echo -e "  ${BOLD}Admin Email:${NC}       $ADMIN_EMAIL"
fi
echo ""
echo -e "  ${CYAN}Next Steps:${NC}"
echo -e "  1. Open ${BOLD}$DASHBOARD_URL${NC}"
echo -e "  2. Login with admin email and temporary password from email"
echo -e "  3. Change password on first login"
echo -e "  4. Go to Accounts page to add AWS accounts for scanning"
echo ""
echo -e "  ${CYAN}Useful Commands:${NC}"
echo -e "  ./deploy.sh                          # Re-deploy (update)"
echo -e "  ./deploy.sh --destroy                # Tear down everything"
echo -e "  aws s3 sync dashboard/ s3://$BUCKET_NAME  # Update dashboard only"
echo ""

# Save outputs for reference
cat > "$SCRIPT_DIR/deployment-outputs.txt" <<EOF
# WA Review Tool — Deployment Outputs
# Generated: $(date)

DASHBOARD_URL=$DASHBOARD_URL
API_URL=$API_URL
USER_POOL_ID=$USER_POOL_ID
USER_POOL_CLIENT_ID=$USER_POOL_CLIENT_ID
S3_BUCKET=$BUCKET_NAME
CLOUDFRONT_DISTRIBUTION=$DISTRIBUTION_ID
REGION=$REGION
ACCOUNT_ID=$ACCOUNT_ID
ADMIN_EMAIL=$ADMIN_EMAIL
EOF

success "Outputs saved to deployment-outputs.txt"
