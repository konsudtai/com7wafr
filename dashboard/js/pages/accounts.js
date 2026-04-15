/* ============================================
   WA Review Tool — Accounts Page
   Accounts table, Add with CloudShell script
   generation, Edit/Delete, Verify
   ============================================ */

// NOTE: Mock data below is for DEMO MODE only.
// In production, all data is fetched from the backend API via ApiClient.

const AccountsPage = (() => {
  // --- Mock Data ---
  const accounts = [
    { id: '111122223333', alias: 'Production', roleArn: 'arn:aws:iam::111122223333:role/WAReviewReadOnly', status: 'Active', lastVerified: '2024-12-15 10:30', critical: 2, high: 5, medium: 10, low: 8 },
    { id: '444455556666', alias: 'Staging', roleArn: 'arn:aws:iam::444455556666:role/WAReviewReadOnly', status: 'Active', lastVerified: '2024-12-14 08:15', critical: 1, high: 4, medium: 8, low: 6 },
    { id: '777788889999', alias: 'Development', roleArn: 'arn:aws:iam::777788889999:role/WAReviewReadOnly', status: 'Active', lastVerified: '2024-12-13 14:00', critical: 0, high: 3, medium: 7, low: 4 },
  ];

  // Platform account ID (the account running this tool)
  const PLATFORM_ACCOUNT_ID = '000011112222';
  const ROLE_NAME = 'WAReviewReadOnly';

  function statusBadgeClass(s) { return s === 'Active' ? 'badge-low' : 'badge-info'; }
  function isAdmin() { return App.state.role === 'Admin'; }

  // --- Generate CloudShell Script ---
  function generateScript(targetAccountId, alias) {
    return `#!/bin/bash
# ============================================================
# AWS Well-Architected Review Tool — IAM Role Setup Script
# ============================================================
# Target Account : ${targetAccountId} (${alias})
# Platform Account: ${PLATFORM_ACCOUNT_ID}
# Role Name      : ${ROLE_NAME}
#
# Run this script in AWS CloudShell of the TARGET account
# (${targetAccountId}) to create the read-only IAM role
# that allows the WA Review platform to scan resources.
# ============================================================
set -e

ROLE_NAME="${ROLE_NAME}"
PLATFORM_ACCOUNT="${PLATFORM_ACCOUNT_ID}"
TARGET_ACCOUNT="${targetAccountId}"

echo "============================================================"
echo " WA Review Tool — Creating Read-Only IAM Role"
echo " Target Account : $TARGET_ACCOUNT"
echo " Platform Account: $PLATFORM_ACCOUNT"
echo " Role Name       : $ROLE_NAME"
echo "============================================================"
echo ""

# --- Step 1: Create Trust Policy ---
echo "[1/4] Creating trust policy..."

TRUST_POLICY=$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::$PLATFORM_ACCOUNT:root"
      },
      "Action": "sts:AssumeRole",
      "Condition": {
        "StringEquals": {
          "sts:ExternalId": "wa-review-$TARGET_ACCOUNT"
        },
        "ArnLike": {
          "aws:PrincipalArn": "arn:aws:iam::$PLATFORM_ACCOUNT:role/wa-review-*"
        }
      }
    }
  ]
}
EOF
)

# --- Step 2: Create IAM Role ---
echo "[2/4] Creating IAM role: $ROLE_NAME ..."

if aws iam get-role --role-name "$ROLE_NAME" > /dev/null 2>&1; then
  echo "  Role already exists. Updating trust policy..."
  aws iam update-assume-role-policy \\
    --role-name "$ROLE_NAME" \\
    --policy-document "$TRUST_POLICY"
else
  aws iam create-role \\
    --role-name "$ROLE_NAME" \\
    --assume-role-policy-document "$TRUST_POLICY" \\
    --description "Read-only role for AWS Well-Architected Review Tool" \\
    --max-session-duration 3600 \\
    --tags Key=ManagedBy,Value=WAReviewTool Key=Purpose,Value=SecurityAudit
fi

echo "  Done."

# --- Step 3: Attach Targeted Read-Only Policies ---
echo "[3/4] Attaching read-only policies..."

# SECURITY: Use SecurityAudit (targeted) instead of ReadOnlyAccess (overly broad).
# A custom inline policy below grants only the specific describe/list/get permissions
# needed for the 10 services we scan.
POLICIES=(
  "arn:aws:iam::aws:policy/SecurityAudit"
)

for POLICY_ARN in "\${POLICIES[@]}"; do
  echo "  Attaching: $POLICY_ARN"
  aws iam attach-role-policy \\
    --role-name "$ROLE_NAME" \\
    --policy-arn "$POLICY_ARN" 2>/dev/null || true
done

# Detach ReadOnlyAccess if previously attached (too broad)
aws iam detach-role-policy \\
  --role-name "$ROLE_NAME" \\
  --policy-arn "arn:aws:iam::aws:policy/ReadOnlyAccess" 2>/dev/null || true

echo "  Done."

# --- Step 4: Create Inline Policy for scanned service permissions ---
echo "[4/4] Adding inline policy for scanned service and WA Tool access..."

INLINE_POLICY=$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "EC2ReadOnly",
      "Effect": "Allow",
      "Action": [
        "ec2:Describe*",
        "ec2:Get*"
      ],
      "Resource": "*"
    },
    {
      "Sid": "S3ReadOnly",
      "Effect": "Allow",
      "Action": [
        "s3:GetBucket*",
        "s3:GetEncryptionConfiguration",
        "s3:GetLifecycleConfiguration",
        "s3:GetObject",
        "s3:ListBucket",
        "s3:ListAllMyBuckets"
      ],
      "Resource": "*"
    },
    {
      "Sid": "RDSReadOnly",
      "Effect": "Allow",
      "Action": [
        "rds:Describe*",
        "rds:List*"
      ],
      "Resource": "*"
    },
    {
      "Sid": "IAMReadOnly",
      "Effect": "Allow",
      "Action": [
        "iam:Get*",
        "iam:List*",
        "iam:GenerateCredentialReport",
        "iam:GetCredentialReport"
      ],
      "Resource": "*"
    },
    {
      "Sid": "LambdaReadOnly",
      "Effect": "Allow",
      "Action": [
        "lambda:GetFunction*",
        "lambda:GetPolicy",
        "lambda:List*"
      ],
      "Resource": "*"
    },
    {
      "Sid": "DynamoDBReadOnly",
      "Effect": "Allow",
      "Action": [
        "dynamodb:Describe*",
        "dynamodb:List*"
      ],
      "Resource": "*"
    },
    {
      "Sid": "ELBReadOnly",
      "Effect": "Allow",
      "Action": [
        "elasticloadbalancing:Describe*"
      ],
      "Resource": "*"
    },
    {
      "Sid": "CloudFrontReadOnly",
      "Effect": "Allow",
      "Action": [
        "cloudfront:Get*",
        "cloudfront:List*"
      ],
      "Resource": "*"
    },
    {
      "Sid": "ECSReadOnly",
      "Effect": "Allow",
      "Action": [
        "ecs:Describe*",
        "ecs:List*"
      ],
      "Resource": "*"
    },
    {
      "Sid": "EKSReadOnly",
      "Effect": "Allow",
      "Action": [
        "eks:Describe*",
        "eks:List*"
      ],
      "Resource": "*"
    },
    {
      "Sid": "WellArchitectedAndCostReadOnly",
      "Effect": "Allow",
      "Action": [
        "wellarchitected:Get*",
        "wellarchitected:List*",
        "support:DescribeTrustedAdvisorChecks",
        "support:DescribeTrustedAdvisorCheckResult",
        "ce:GetCostAndUsage",
        "ce:GetReservationPurchaseRecommendation",
        "ce:GetSavingsPlansPurchaseRecommendation",
        "ce:GetRightsizingRecommendation",
        "ce:GetCostForecast",
        "cost-optimization-hub:ListRecommendations",
        "cost-optimization-hub:GetRecommendation",
        "compute-optimizer:GetEC2InstanceRecommendations",
        "compute-optimizer:GetAutoScalingGroupRecommendations",
        "compute-optimizer:GetLambdaFunctionRecommendations",
        "compute-optimizer:GetEBSVolumeRecommendations"
      ],
      "Resource": "*"
    }
  ]
}
EOF
)

aws iam put-role-policy \\
  --role-name "$ROLE_NAME" \\
  --policy-name "WAReviewAdditionalReadOnly" \\
  --policy-document "$INLINE_POLICY"

echo "  Done."

# --- Summary ---
ROLE_ARN="arn:aws:iam::$TARGET_ACCOUNT:role/$ROLE_NAME"

echo ""
echo "============================================================"
echo " Setup Complete"
echo "============================================================"
echo ""
echo " Role ARN: $ROLE_ARN"
echo ""
echo " Attached Policies:"
echo "   - SecurityAudit (AWS Managed)"
echo "   - WAReviewAdditionalReadOnly (Inline)"
echo "     - EC2, S3, RDS, IAM, Lambda, DynamoDB, ELB,"
echo "       CloudFront, ECS, EKS read-only access"
echo "     - Well-Architected Tool read access"
echo "     - Cost Explorer recommendations"
echo "     - Cost Optimization Hub"
echo "     - Compute Optimizer"
echo "     - Trusted Advisor checks"
echo ""
echo " Trust Policy:"
echo "   - Trusted Principal: arn:aws:iam::$PLATFORM_ACCOUNT:root"
echo "   - Condition: aws:PrincipalArn must match arn:aws:iam::$PLATFORM_ACCOUNT:role/wa-review-*"
echo "   - External ID: wa-review-$TARGET_ACCOUNT"
echo ""
echo " Next Steps:"
echo "   1. Go back to the WA Review Dashboard"
echo "   2. Enter the following in the Add Account form:"
echo "      Account ID : $TARGET_ACCOUNT"
echo "      Role ARN   : $ROLE_ARN"
echo "      Alias      : ${alias}"
echo "============================================================"
`;
  }

  // --- Render ---
  function render() {
    return `
      <div class="page-header flex-between">
        <div>
          <h2>Accounts</h2>
          <p>จัดการ AWS accounts สำหรับการสแกน</p>
        </div>
        ${isAdmin() ? '<button id="btn-add-account" class="btn btn-primary">+ Add Account</button>' : ''}
      </div>

      <h3 style="margin-bottom:12px;">Account Summary</h3>
      <div class="card-grid mb-24">
        ${accounts.map(renderSummaryCard).join('')}
      </div>

      <div class="card">
        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Account ID</th>
                <th>Alias</th>
                <th>Role ARN</th>
                <th>Status</th>
                <th>Last Verified</th>
                ${isAdmin() ? '<th>Actions</th>' : ''}
              </tr>
            </thead>
            <tbody id="accounts-tbody">
              ${accounts.map(renderRow).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderSummaryCard(acct) {
    const total = acct.critical + acct.high + acct.medium + acct.low;
    return `
      <div class="card">
        <div class="flex-between mb-16">
          <div><h4>${acct.alias}</h4><span class="text-secondary" style="font-size:0.82rem;">${acct.id}</span></div>
          <span class="badge ${statusBadgeClass(acct.status)}">${acct.status}</span>
        </div>
        <div class="flex gap-8" style="flex-wrap:wrap;">
          <span class="badge badge-critical">${acct.critical} Critical</span>
          <span class="badge badge-high">${acct.high} High</span>
          <span class="badge badge-medium">${acct.medium} Medium</span>
          <span class="badge badge-low">${acct.low} Low</span>
        </div>
        <p class="text-secondary mt-8" style="font-size:0.82rem;">Total: ${total} findings</p>
      </div>
    `;
  }

  function renderRow(acct) {
    const actions = isAdmin() ? `<td><div class="flex gap-8">
      <button class="btn btn-secondary btn-sm btn-script" data-id="${acct.id}">Script</button>
      <button class="btn btn-secondary btn-sm btn-verify" data-id="${acct.id}">Verify</button>
      <button class="btn btn-secondary btn-sm btn-edit" data-id="${acct.id}">Edit</button>
      <button class="btn btn-danger btn-sm btn-delete" data-id="${acct.id}">Delete</button>
    </div></td>` : '';
    return `<tr>
      <td style="font-family:var(--font-mono); font-size:0.88rem;">${acct.id}</td>
      <td>${acct.alias}</td>
      <td style="font-family:var(--font-mono); font-size:0.82rem; word-break:break-all;">${acct.roleArn}</td>
      <td><span class="badge ${statusBadgeClass(acct.status)}">${acct.status}</span></td>
      <td>${acct.lastVerified}</td>
      ${actions}
    </tr>`;
  }

  // --- Init ---
  function init() {
    document.getElementById('btn-add-account')?.addEventListener('click', showAddModal);
    document.getElementById('accounts-tbody')?.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const id = btn.dataset.id;
      const acct = accounts.find(a => a.id === id);
      if (!acct) return;
      if (btn.classList.contains('btn-edit')) showEditModal(acct);
      else if (btn.classList.contains('btn-delete')) showDeleteModal(acct);
      else if (btn.classList.contains('btn-verify')) handleVerify(acct);
      else if (btn.classList.contains('btn-script')) showScriptModal(acct.id, acct.alias);
    });
  }

  // --- Add Account Modal (2-step: generate script then register) ---
  function showAddModal() {
    const body = `
      <div id="add-step-1">
        <p class="text-secondary mb-16" style="font-size:0.88rem;">
          Step 1: กรอก Account ID และ Alias เพื่อสร้าง script สำหรับ setup IAM role ใน target account
        </p>
        <form id="add-step1-form">
          <div class="form-group">
            <label for="add-account-id">Target Account ID</label>
            <input type="text" id="add-account-id" placeholder="123456789012" required pattern="\\d{12}" title="12-digit AWS Account ID">
          </div>
          <div class="form-group">
            <label for="add-alias">Alias</label>
            <input type="text" id="add-alias" placeholder="Production" required>
          </div>
          <button type="submit" class="btn btn-primary btn-block mt-16">Generate Setup Script</button>
        </form>
      </div>

      <div id="add-step-2" class="hidden">
        <p class="text-secondary mb-16" style="font-size:0.88rem;">
          Step 2: Copy script ด้านล่างแล้วรันใน AWS CloudShell ของ target account จากนั้นกด "Register Account"
        </p>

        <div style="margin-bottom:12px;">
          <div class="flex-between" style="margin-bottom:4px;">
            <label style="font-size:0.82rem; font-weight:500; color:var(--text-secondary);">CloudShell Script</label>
            <button id="btn-copy-script" class="btn btn-secondary btn-sm">Copy Script</button>
          </div>
          <div id="script-output" style="background:var(--color-near-black); color:#e8e6dc; padding:16px; border-radius:var(--radius-md); font-family:var(--font-mono); font-size:0.75rem; line-height:1.5; max-height:320px; overflow-y:auto; white-space:pre; tab-size:2;"></div>
        </div>

        <div style="margin-bottom:12px;">
          <label style="font-size:0.82rem; font-weight:500; color:var(--text-secondary);">Script สร้าง IAM Role ที่มีสิทธิ์ดังนี้:</label>
          <ul style="font-size:0.82rem; color:var(--text-secondary); padding-left:20px; line-height:1.8; margin-top:4px;">
            <li><strong>SecurityAudit</strong> — ตรวจสอบ security configurations</li>
            <li><strong>Scanned Services</strong> — EC2, S3, RDS, IAM, Lambda, DynamoDB, ELB, CloudFront, ECS, EKS (read-only)</li>
            <li><strong>Well-Architected Tool</strong> — อ่านข้อมูล workloads และ reviews</li>
            <li><strong>Cost Explorer</strong> — RI/Savings Plan recommendations, cost data</li>
            <li><strong>Cost Optimization Hub</strong> — optimization recommendations</li>
            <li><strong>Compute Optimizer</strong> — right-sizing recommendations</li>
            <li><strong>Trusted Advisor</strong> — best practice checks</li>
          </ul>
        </div>

        <div class="alert alert-warning" style="font-size:0.82rem; margin-bottom:12px;">
          Trust policy ใช้ External ID: <code style="font-size:0.82rem;">wa-review-<span id="script-ext-id"></span></code> เพื่อป้องกัน confused deputy attack
        </div>

        <div id="add-step2-info" style="margin-bottom:12px;">
          <div class="form-group">
            <label>Role ARN (auto-filled)</label>
            <input type="text" id="add-role-arn" readonly style="background:var(--bg-page);">
          </div>
        </div>

        <div class="flex gap-8">
          <button id="btn-back-step1" class="btn btn-secondary" style="flex:1;">Back</button>
          <button id="btn-register" class="btn btn-primary" style="flex:1;">Register Account</button>
        </div>
      </div>
    `;

    App.showModal('Add Account', body);

    // Step 1 form submit
    document.getElementById('add-step1-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const accountId = document.getElementById('add-account-id').value.trim();
      const alias = document.getElementById('add-alias').value.trim();
      if (!accountId || !alias) return;

      const script = generateScript(accountId, alias);
      const roleArn = 'arn:aws:iam::' + accountId + ':role/' + ROLE_NAME;

      document.getElementById('script-output').textContent = script;
      document.getElementById('add-role-arn').value = roleArn;
      document.getElementById('script-ext-id').textContent = accountId;
      document.getElementById('add-step-1').classList.add('hidden');
      document.getElementById('add-step-2').classList.remove('hidden');
    });

    // Copy script
    document.getElementById('btn-copy-script')?.addEventListener('click', () => {
      const script = document.getElementById('script-output').textContent;
      navigator.clipboard.writeText(script).then(() => {
        const btn = document.getElementById('btn-copy-script');
        btn.textContent = 'Copied';
        setTimeout(() => { btn.textContent = 'Copy Script'; }, 2000);
      });
    });

    // Back to step 1
    document.getElementById('btn-back-step1')?.addEventListener('click', () => {
      document.getElementById('add-step-1').classList.remove('hidden');
      document.getElementById('add-step-2').classList.add('hidden');
    });

    // Register account
    document.getElementById('btn-register')?.addEventListener('click', () => {
      App.hideModal();
    });
  }

  // --- Show Script for existing account ---
  function showScriptModal(accountId, alias) {
    const script = generateScript(accountId, alias);
    const body = `
      <p class="text-secondary mb-16" style="font-size:0.88rem;">
        CloudShell script สำหรับ setup/update IAM role ใน account ${accountId} (${alias})
      </p>
      <div class="flex-between" style="margin-bottom:4px;">
        <label style="font-size:0.82rem; font-weight:500; color:var(--text-secondary);">Script</label>
        <button id="btn-copy-existing" class="btn btn-secondary btn-sm">Copy Script</button>
      </div>
      <div style="background:var(--color-near-black); color:#e8e6dc; padding:16px; border-radius:var(--radius-md); font-family:var(--font-mono); font-size:0.75rem; line-height:1.5; max-height:400px; overflow-y:auto; white-space:pre; tab-size:2;">${escapeHtml(script)}</div>
    `;
    App.showModal('Setup Script — ' + alias, body);
    document.getElementById('btn-copy-existing')?.addEventListener('click', () => {
      navigator.clipboard.writeText(script).then(() => {
        const btn = document.getElementById('btn-copy-existing');
        btn.textContent = 'Copied';
        setTimeout(() => { btn.textContent = 'Copy Script'; }, 2000);
      });
    });
  }

  function escapeHtml(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // --- Edit / Delete / Verify (unchanged) ---
  function showEditModal(acct) {
    const body = `
      <form id="edit-account-form">
        <div class="form-group"><label>Account ID</label><input type="text" value="${acct.id}" disabled></div>
        <div class="form-group"><label for="edit-role-arn">Role ARN</label><input type="text" id="edit-role-arn" value="${acct.roleArn}" required></div>
        <div class="form-group"><label for="edit-alias">Alias</label><input type="text" id="edit-alias" value="${acct.alias}" required></div>
        <button type="submit" class="btn btn-primary btn-block mt-16">Save Changes</button>
      </form>
    `;
    App.showModal('Edit Account', body);
    document.getElementById('edit-account-form')?.addEventListener('submit', (e) => { e.preventDefault(); App.hideModal(); });
  }

  function showDeleteModal(acct) {
    const body = `
      <p>คุณต้องการลบ account <strong>${acct.alias}</strong> (${acct.id}) หรือไม่?</p>
      <p class="text-secondary mt-8" style="font-size:0.88rem;">การดำเนินการนี้ไม่สามารถย้อนกลับได้</p>
      <div class="flex gap-8 mt-16">
        <button id="confirm-delete" class="btn btn-danger" style="flex:1;">Delete</button>
        <button id="cancel-delete" class="btn btn-secondary" style="flex:1;">Cancel</button>
      </div>
    `;
    App.showModal('Delete Account', body);
    document.getElementById('confirm-delete')?.addEventListener('click', () => App.hideModal());
    document.getElementById('cancel-delete')?.addEventListener('click', () => App.hideModal());
  }

  function handleVerify(acct) {
    const btn = document.querySelector(`.btn-verify[data-id="${acct.id}"]`);
    if (btn) { btn.disabled = true; btn.textContent = 'Verifying...'; setTimeout(() => { btn.disabled = false; btn.textContent = 'Verify'; }, 1500); }
  }

  return { render, init };
})();
