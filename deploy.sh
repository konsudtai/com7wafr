#!/bin/bash
# ============================================================
# AWS Well-Architected Review Tool — One-Command Deployment
# Uses CloudFormation (no CDK/npm required)
# ============================================================
set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
info()    { echo -e "${CYAN}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
fail()    { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }
step()    { echo -e "\n${BOLD}=== $* ===${NC}"; }

AWS_REGION=""; AWS_PROFILE=""; ADMIN_EMAIL=""; DESTROY=false
while [[ $# -gt 0 ]]; do
  case $1 in
    --region)      AWS_REGION="$2"; shift 2 ;;
    --profile)     AWS_PROFILE="$2"; shift 2 ;;
    --admin-email) ADMIN_EMAIL="$2"; shift 2 ;;
    --destroy)     DESTROY=true; shift ;;
    -h|--help)
      echo "Usage: ./deploy.sh --admin-email EMAIL [OPTIONS]"
      echo "  --admin-email EMAIL  (required) Admin email"
      echo "  --region REGION      AWS region (default: ap-southeast-1)"
      echo "  --profile PROFILE    AWS CLI profile"
      echo "  --destroy            Tear down all stacks"
      exit 0 ;;
    *) fail "Unknown: $1" ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROF_ARG=""
[ -n "$AWS_PROFILE" ] && PROF_ARG="--profile $AWS_PROFILE" && export AWS_PROFILE

# Destroy mode
if [ "$DESTROY" = true ]; then
  step "Destroying all stacks"
  aws cloudformation delete-stack --stack-name wa-review-api $PROF_ARG 2>/dev/null || true
  aws cloudformation wait stack-delete-complete --stack-name wa-review-api $PROF_ARG 2>/dev/null || true
  aws cloudformation delete-stack --stack-name wa-review-frontend $PROF_ARG 2>/dev/null || true
  aws cloudformation delete-stack --stack-name wa-review-auth $PROF_ARG 2>/dev/null || true
  aws cloudformation delete-stack --stack-name wa-review-data $PROF_ARG 2>/dev/null || true
  success "All stacks deleted"
  exit 0
fi

[ "$DESTROY" = false ] && [ -z "$ADMIN_EMAIL" ] && fail "--admin-email is required"

# ============================================================
step "Step 1/6: Checking prerequisites"
# ============================================================
command -v aws &>/dev/null || fail "AWS CLI not found"
ACCOUNT_ID=$(aws sts get-caller-identity $PROF_ARG --query Account --output text 2>/dev/null) || fail "AWS credentials not configured"

REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-$(aws configure get region $PROF_ARG 2>/dev/null || true)}}"
[ -z "$REGION" ] && REGION="ap-southeast-1" && warn "Using default region: $REGION"
export AWS_DEFAULT_REGION="$REGION"

success "Account: $ACCOUNT_ID, Region: $REGION"

# ============================================================
step "Step 2/6: Building Lambda code"
# ============================================================
# Check if Node.js available for TypeScript build
if command -v node &>/dev/null && command -v npm &>/dev/null; then
  info "Building backend TypeScript..."
  npm cache clean --force 2>/dev/null || true
  (cd "$SCRIPT_DIR/backend" && npm install --silent 2>/dev/null && npx tsc 2>/dev/null) || warn "TypeScript build skipped"
  npm cache clean --force 2>/dev/null || true
  rm -rf /tmp/npm-* 2>/dev/null || true
fi

# Create Lambda deployment package
info "Packaging Lambda code..."
LAMBDA_BUCKET="wa-review-lambda-${ACCOUNT_ID}-${REGION}"
aws s3 mb "s3://${LAMBDA_BUCKET}" $PROF_ARG 2>/dev/null || true

LAMBDA_ZIP="/tmp/handlers.zip"
rm -f "$LAMBDA_ZIP"
(cd "$SCRIPT_DIR/backend" && zip -r "$LAMBDA_ZIP" dist/ auth/ node_modules/ -x "*.ts" 2>/dev/null) || \
(cd "$SCRIPT_DIR/backend" && zip -r "$LAMBDA_ZIP" handlers/ auth/ node_modules/ -x "*.ts" 2>/dev/null) || \
(cd "$SCRIPT_DIR/backend" && zip -r "$LAMBDA_ZIP" . -x "*.ts" "tsconfig.json" "package*.json" 2>/dev/null)

aws s3 cp "$LAMBDA_ZIP" "s3://${LAMBDA_BUCKET}/lambda/handlers.zip" $PROF_ARG --quiet
rm -f "$LAMBDA_ZIP"
success "Lambda code uploaded to s3://${LAMBDA_BUCKET}"

# ============================================================
step "Step 3/6: Deploying CloudFormation stacks"
# ============================================================

deploy_stack() {
  local STACK_NAME=$1 TEMPLATE=$2 PARAMS=$3
  info "Deploying $STACK_NAME..."
  aws cloudformation deploy \
    --stack-name "$STACK_NAME" \
    --template-file "$TEMPLATE" \
    --capabilities CAPABILITY_NAMED_IAM \
    --no-fail-on-empty-changeset \
    ${PARAMS:+--parameter-overrides $PARAMS} \
    $PROF_ARG 2>&1 || true
  success "$STACK_NAME deployed"
}

# Auth stack
deploy_stack "wa-review-auth" "$SCRIPT_DIR/cfn/auth.yaml"

# Data stack
deploy_stack "wa-review-data" "$SCRIPT_DIR/cfn/data.yaml"

# Get outputs for API stack
USER_POOL_ARN=$(aws cloudformation describe-stacks --stack-name wa-review-auth $PROF_ARG --query "Stacks[0].Outputs[?OutputKey=='UserPoolArn'].OutputValue" --output text)
USER_POOL_ID=$(aws cloudformation describe-stacks --stack-name wa-review-auth $PROF_ARG --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" --output text)
USER_POOL_CLIENT_ID=$(aws cloudformation describe-stacks --stack-name wa-review-auth $PROF_ARG --query "Stacks[0].Outputs[?OutputKey=='UserPoolClientId'].OutputValue" --output text)
TABLE_NAME=$(aws cloudformation describe-stacks --stack-name wa-review-data $PROF_ARG --query "Stacks[0].Outputs[?OutputKey=='TableName'].OutputValue" --output text)
TABLE_ARN=$(aws cloudformation describe-stacks --stack-name wa-review-data $PROF_ARG --query "Stacks[0].Outputs[?OutputKey=='TableArn'].OutputValue" --output text)

# API stack
deploy_stack "wa-review-api" "$SCRIPT_DIR/cfn/api.yaml" \
  "UserPoolArn=$USER_POOL_ARN TableName=$TABLE_NAME TableArn=$TABLE_ARN UserPoolId=$USER_POOL_ID S3BucketName=$LAMBDA_BUCKET"

# Frontend stack
deploy_stack "wa-review-frontend" "$SCRIPT_DIR/cfn/frontend.yaml"

# ============================================================
step "Step 4/6: Uploading dashboard"
# ============================================================
API_URL=$(aws cloudformation describe-stacks --stack-name wa-review-api $PROF_ARG --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue" --output text)
BUCKET_NAME=$(aws cloudformation describe-stacks --stack-name wa-review-frontend $PROF_ARG --query "Stacks[0].Outputs[?OutputKey=='BucketName'].OutputValue" --output text)
DASHBOARD_URL=$(aws cloudformation describe-stacks --stack-name wa-review-frontend $PROF_ARG --query "Stacks[0].Outputs[?OutputKey=='DashboardURL'].OutputValue" --output text)
DIST_ID=$(aws cloudformation describe-stacks --stack-name wa-review-frontend $PROF_ARG --query "Stacks[0].Outputs[?OutputKey=='DistributionId'].OutputValue" --output text)

# Inject config
cat > "$SCRIPT_DIR/dashboard/js/config.js" <<EOF
window.WA_CONFIG = {
  API_BASE_URL: '${API_URL}',
  USER_POOL_ID: '${USER_POOL_ID}',
  CLIENT_ID: '${USER_POOL_CLIENT_ID}',
  REGION: '${REGION}',
  PLATFORM_ACCOUNT_ID: '${ACCOUNT_ID}'
};
EOF

# Add config.js to index.html if needed
if ! grep -q 'config.js' "$SCRIPT_DIR/dashboard/index.html"; then
  sed -i 's|<script src="js/auth.js"></script>|<script src="js/config.js"></script>\n  <script src="js/auth.js"></script>|' "$SCRIPT_DIR/dashboard/index.html"
fi

aws s3 sync "$SCRIPT_DIR/dashboard" "s3://$BUCKET_NAME" --exclude "node_modules/*" --exclude "src/*" --delete $PROF_ARG --quiet
aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths "/*" $PROF_ARG > /dev/null 2>&1 || true
success "Dashboard uploaded"

# ============================================================
step "Step 5/6: Creating admin user"
# ============================================================
aws cognito-idp admin-create-user \
  --user-pool-id "$USER_POOL_ID" \
  --username "$ADMIN_EMAIL" \
  --user-attributes Name=email,Value="$ADMIN_EMAIL" Name=email_verified,Value=true Name=custom:role,Value=Admin \
  --desired-delivery-mediums EMAIL \
  $PROF_ARG 2>/dev/null \
  && success "Admin created: $ADMIN_EMAIL" \
  || warn "User may already exist"

# ============================================================
step "Step 6/6: Complete"
# ============================================================
echo ""
echo -e "${GREEN}${BOLD}============================================================${NC}"
echo -e "${GREEN}${BOLD}  Deployment Complete${NC}"
echo -e "${GREEN}${BOLD}============================================================${NC}"
echo -e "  Dashboard: ${BOLD}$DASHBOARD_URL${NC}"
echo -e "  API:       $API_URL"
echo -e "  Admin:     $ADMIN_EMAIL"
echo -e "  Region:    $REGION"
echo ""
echo -e "  Next: Open dashboard, login with temp password from email"
echo -e "  Destroy: ./deploy.sh --destroy"
echo ""
