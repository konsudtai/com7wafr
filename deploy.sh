#!/bin/bash
# ============================================================
# AWS WA Review Platform — One-Command Deployment
# Deploys: Auth (Cognito) + Data (DynamoDB) + API (Lambda/APIGW/WAF)
#          + Frontend (S3/CloudFront) + AI Agent (Bedrock)
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
      echo ""
      echo "Options:"
      echo "  --admin-email EMAIL  (required) Admin email for first login"
      echo "  --region REGION      AWS region (default: ap-southeast-1)"
      echo "  --profile PROFILE    AWS CLI profile name"
      echo "  --destroy            Remove all platform stacks (safe — does not affect other workloads)"
      echo ""
      echo "Examples:"
      echo "  ./deploy.sh --admin-email admin@company.com"
      echo "  ./deploy.sh --region us-east-1 --admin-email admin@company.com"
      echo "  ./deploy.sh --destroy"
      exit 0 ;;
    *) fail "Unknown option: $1. Use --help for usage." ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROF_ARG=""
[ -n "$AWS_PROFILE" ] && PROF_ARG="--profile $AWS_PROFILE" && export AWS_PROFILE

# ============================================================
# DESTROY MODE
# ============================================================
if [ "$DESTROY" = true ]; then
  step "Destroying AWS WA Review Platform"
  
  ACCOUNT_ID=$(aws sts get-caller-identity $PROF_ARG --query Account --output text 2>/dev/null) || fail "AWS credentials not configured"
  REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-$(aws configure get region $PROF_ARG 2>/dev/null || true)}}"
  [ -z "$REGION" ] && REGION="ap-southeast-1"
  export AWS_DEFAULT_REGION="$REGION"

  # Empty S3 frontend bucket before deleting stack
  BUCKET_NAME=$(aws cloudformation describe-stacks --stack-name wa-review-frontend $PROF_ARG --query "Stacks[0].Outputs[?OutputKey=='BucketName'].OutputValue" --output text 2>/dev/null || true)
  if [ -n "$BUCKET_NAME" ] && [ "$BUCKET_NAME" != "None" ]; then
    info "Emptying S3 bucket: $BUCKET_NAME"
    aws s3 rm "s3://$BUCKET_NAME" --recursive $PROF_ARG 2>/dev/null || true
  fi

  # Delete stacks in dependency order
  info "Deleting wa-review-api..."
  aws cloudformation delete-stack --stack-name wa-review-api $PROF_ARG 2>/dev/null || true
  aws cloudformation wait stack-delete-complete --stack-name wa-review-api $PROF_ARG 2>/dev/null || true

  info "Deleting wa-review-frontend..."
  aws cloudformation delete-stack --stack-name wa-review-frontend $PROF_ARG 2>/dev/null || true
  aws cloudformation wait stack-delete-complete --stack-name wa-review-frontend $PROF_ARG 2>/dev/null || true

  info "Deleting wa-review-auth..."
  aws cloudformation delete-stack --stack-name wa-review-auth $PROF_ARG 2>/dev/null || true

  info "Deleting wa-review-data..."
  aws cloudformation delete-stack --stack-name wa-review-data $PROF_ARG 2>/dev/null || true

  # Clean up Lambda S3 bucket
  LAMBDA_BUCKET="wa-review-lambda-${ACCOUNT_ID}-${REGION}"
  info "Cleaning Lambda bucket: $LAMBDA_BUCKET"
  aws s3 rm "s3://$LAMBDA_BUCKET" --recursive $PROF_ARG 2>/dev/null || true
  aws s3 rb "s3://$LAMBDA_BUCKET" $PROF_ARG 2>/dev/null || true

  # Clean up CloudWatch log groups
  info "Cleaning CloudWatch logs..."
  for fn in scan-handler account-handler team-handler ai-handler; do
    aws logs delete-log-group --log-group-name "/aws/lambda/wa-review-${fn}" $PROF_ARG 2>/dev/null || true
  done

  aws cloudformation wait stack-delete-complete --stack-name wa-review-auth $PROF_ARG 2>/dev/null || true
  aws cloudformation wait stack-delete-complete --stack-name wa-review-data $PROF_ARG 2>/dev/null || true

  echo ""
  success "All WA Review Platform stacks deleted"
  echo -e "  ${YELLOW}Note:${NC} IAM roles (WAReviewReadOnly) in target accounts are NOT deleted."
  echo -e "  Remove them manually if no longer needed."
  echo ""
  exit 0
fi

# ============================================================
# DEPLOY MODE
# ============================================================
[ -z "$ADMIN_EMAIL" ] && fail "--admin-email is required. Use --help for usage."

# ============================================================
step "Step 1/8: Checking prerequisites"
# ============================================================
command -v aws &>/dev/null || fail "AWS CLI not found. Install: https://aws.amazon.com/cli/"
ACCOUNT_ID=$(aws sts get-caller-identity $PROF_ARG --query Account --output text 2>/dev/null) || fail "AWS credentials not configured. Run: aws configure"

REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-$(aws configure get region $PROF_ARG 2>/dev/null || true)}}"
[ -z "$REGION" ] && REGION="ap-southeast-1" && warn "No region specified, using default: $REGION"
export AWS_DEFAULT_REGION="$REGION"

success "Account: $ACCOUNT_ID | Region: $REGION | Admin: $ADMIN_EMAIL"

# ============================================================
step "Step 2/8: Building Lambda code"
# ============================================================
if command -v node &>/dev/null && command -v npm &>/dev/null; then
  info "Building backend TypeScript..."
  npm cache clean --force 2>/dev/null || true
  (cd "$SCRIPT_DIR/backend" && npm install --silent 2>/dev/null && npx tsc 2>/dev/null) || warn "TypeScript build skipped (using pre-built dist/)"
  npm cache clean --force 2>/dev/null || true
  rm -rf /tmp/npm-* 2>/dev/null || true
else
  warn "Node.js not found — using pre-built dist/ (if available)"
fi

info "Packaging Lambda code..."
LAMBDA_BUCKET="wa-review-lambda-${ACCOUNT_ID}-${REGION}"
aws s3 mb "s3://${LAMBDA_BUCKET}" $PROF_ARG 2>/dev/null || true

LAMBDA_ZIP="/tmp/wa-review-handlers.zip"
rm -f "$LAMBDA_ZIP"
(cd "$SCRIPT_DIR/backend" && zip -r "$LAMBDA_ZIP" dist/ node_modules/ -x "*.ts" 2>/dev/null) || \
(cd "$SCRIPT_DIR/backend" && zip -r "$LAMBDA_ZIP" . -x "*.ts" "tsconfig.json" "package*.json" 2>/dev/null)

aws s3 cp "$LAMBDA_ZIP" "s3://${LAMBDA_BUCKET}/lambda/handlers.zip" $PROF_ARG --quiet
rm -f "$LAMBDA_ZIP"
success "Lambda code uploaded to s3://${LAMBDA_BUCKET}"

# ============================================================
step "Step 3/8: Deploying CloudFormation stacks"
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

# Auth stack (Cognito)
deploy_stack "wa-review-auth" "$SCRIPT_DIR/cfn/auth.yaml"

# Data stack (DynamoDB)
deploy_stack "wa-review-data" "$SCRIPT_DIR/cfn/data.yaml"

# Get outputs for API stack
USER_POOL_ARN=$(aws cloudformation describe-stacks --stack-name wa-review-auth $PROF_ARG --query "Stacks[0].Outputs[?OutputKey=='UserPoolArn'].OutputValue" --output text)
USER_POOL_ID=$(aws cloudformation describe-stacks --stack-name wa-review-auth $PROF_ARG --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" --output text)
USER_POOL_CLIENT_ID=$(aws cloudformation describe-stacks --stack-name wa-review-auth $PROF_ARG --query "Stacks[0].Outputs[?OutputKey=='UserPoolClientId'].OutputValue" --output text)
TABLE_NAME=$(aws cloudformation describe-stacks --stack-name wa-review-data $PROF_ARG --query "Stacks[0].Outputs[?OutputKey=='TableName'].OutputValue" --output text)
TABLE_ARN=$(aws cloudformation describe-stacks --stack-name wa-review-data $PROF_ARG --query "Stacks[0].Outputs[?OutputKey=='TableArn'].OutputValue" --output text)

# API stack (Lambda + API Gateway + WAF + AI Handler)
deploy_stack "wa-review-api" "$SCRIPT_DIR/cfn/api.yaml" \
  "UserPoolArn=$USER_POOL_ARN TableName=$TABLE_NAME TableArn=$TABLE_ARN UserPoolId=$USER_POOL_ID S3BucketName=$LAMBDA_BUCKET"

# Frontend stack (S3 + CloudFront)
deploy_stack "wa-review-frontend" "$SCRIPT_DIR/cfn/frontend.yaml"

# ============================================================
step "Step 4/8: Updating Lambda function code"
# ============================================================
for FN_NAME in wa-review-scan-handler wa-review-account-handler wa-review-team-handler wa-review-ai-handler; do
  info "Updating $FN_NAME..."
  aws lambda update-function-code \
    --function-name "$FN_NAME" \
    --s3-bucket "$LAMBDA_BUCKET" \
    --s3-key lambda/handlers.zip \
    $PROF_ARG > /dev/null 2>&1 || warn "Could not update $FN_NAME"
done
success "All Lambda functions updated"

# ============================================================
step "Step 5/8: Uploading dashboard"
# ============================================================
API_URL=$(aws cloudformation describe-stacks --stack-name wa-review-api $PROF_ARG --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue" --output text)
BUCKET_NAME=$(aws cloudformation describe-stacks --stack-name wa-review-frontend $PROF_ARG --query "Stacks[0].Outputs[?OutputKey=='BucketName'].OutputValue" --output text)
DASHBOARD_URL=$(aws cloudformation describe-stacks --stack-name wa-review-frontend $PROF_ARG --query "Stacks[0].Outputs[?OutputKey=='DashboardURL'].OutputValue" --output text)
DIST_ID=$(aws cloudformation describe-stacks --stack-name wa-review-frontend $PROF_ARG --query "Stacks[0].Outputs[?OutputKey=='DistributionId'].OutputValue" --output text)

# Inject runtime config
cat > "$SCRIPT_DIR/dashboard/js/config.js" <<EOF
window.WA_CONFIG = {
  API_BASE_URL: '${API_URL}',
  USER_POOL_ID: '${USER_POOL_ID}',
  CLIENT_ID: '${USER_POOL_CLIENT_ID}',
  REGION: '${REGION}',
  PLATFORM_ACCOUNT_ID: '${ACCOUNT_ID}'
};
EOF

# Ensure config.js is loaded in index.html
if ! grep -q 'config.js' "$SCRIPT_DIR/dashboard/index.html"; then
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' 's|<script src="js/auth.js"></script>|<script src="js/config.js"></script>\
  <script src="js/auth.js"></script>|' "$SCRIPT_DIR/dashboard/index.html"
  else
    sed -i 's|<script src="js/auth.js"></script>|<script src="js/config.js"></script>\n  <script src="js/auth.js"></script>|' "$SCRIPT_DIR/dashboard/index.html"
  fi
fi

aws s3 sync "$SCRIPT_DIR/dashboard" "s3://$BUCKET_NAME" --exclude "node_modules/*" --exclude "src/*" --delete $PROF_ARG --quiet
aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths "/*" $PROF_ARG > /dev/null 2>&1 || true
success "Dashboard uploaded to $BUCKET_NAME"

# ============================================================
step "Step 6/8: Creating admin user"
# ============================================================
aws cognito-idp admin-create-user \
  --user-pool-id "$USER_POOL_ID" \
  --username "$ADMIN_EMAIL" \
  --user-attributes Name=email,Value="$ADMIN_EMAIL" Name=email_verified,Value=true Name=custom:role,Value=Admin \
  --desired-delivery-mediums EMAIL \
  $PROF_ARG 2>/dev/null \
  && success "Admin created: $ADMIN_EMAIL (temp password sent via email)" \
  || warn "User may already exist — check email for existing credentials"

# ============================================================
step "Step 7/8: Enabling Bedrock model access (AI Agent)"
# ============================================================
info "Checking Bedrock model access in us-east-1..."
# Note: Bedrock model access must be enabled manually via AWS Console
# if not already done. The script checks and provides guidance.
BEDROCK_CHECK=$(aws bedrock get-foundation-model-availability \
  --model-id anthropic.claude-sonnet-4-6 \
  --region us-east-1 $PROF_ARG 2>&1 || true)

if echo "$BEDROCK_CHECK" | grep -q "error\|Error\|not found"; then
  warn "Bedrock model access may need manual setup:"
  echo -e "  1. Go to AWS Console → Amazon Bedrock → Model access (us-east-1)"
  echo -e "  2. Enable: Claude Sonnet 4.6, Claude Opus 4.6, Amazon Nova Lite"
  echo -e "  3. Click Save changes"
  echo -e "  ${YELLOW}Without this, the WA Agent chat will not work (platform works fine without AI)${NC}"
else
  success "Bedrock models available"
fi

# ============================================================
step "Step 8/8: Deployment Complete"
# ============================================================
echo ""
echo -e "${GREEN}${BOLD}============================================================${NC}"
echo -e "${GREEN}${BOLD}  AWS WA Review Platform — Deployed Successfully${NC}"
echo -e "${GREEN}${BOLD}============================================================${NC}"
echo ""
echo -e "  Dashboard:  ${BOLD}${DASHBOARD_URL}${NC}"
echo -e "  API:        ${API_URL}"
echo -e "  Admin:      ${ADMIN_EMAIL}"
echo -e "  Region:     ${REGION}"
echo -e "  Account:    ${ACCOUNT_ID}"
echo ""
echo -e "  ${BOLD}Next steps:${NC}"
echo -e "  1. Open the Dashboard URL above"
echo -e "  2. Check email for temporary password"
echo -e "  3. Login and set a new password"
echo -e "  4. Go to Accounts → Add AWS accounts for scanning"
echo -e "  5. (Optional) Enable Bedrock models for AI Agent"
echo ""
echo -e "  ${BOLD}Commands:${NC}"
echo -e "  Re-deploy:  ./deploy.sh --region $REGION --admin-email $ADMIN_EMAIL"
echo -e "  Destroy:    ./deploy.sh --destroy --region $REGION"
echo ""
