/* ============================================
   WA Review Tool — Accounts Page
   Accounts table, Add with CloudShell script
   generation, Edit/Delete, Verify
   ============================================ */

const AccountsPage = (() => {
  let accounts = [];

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

TRUST_POLICY=$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::$PLATFORM_ACCOUNT:root" },
      "Action": "sts:AssumeRole",
      "Condition": {
        "StringEquals": { "sts:ExternalId": "wa-review-$TARGET_ACCOUNT" },
        "ArnLike": { "aws:PrincipalArn": "arn:aws:iam::$PLATFORM_ACCOUNT:role/wa-review-*" }
      }
    }
  ]
}
EOF
)

echo "[1/4] Creating trust policy..."

echo "[2/4] Creating IAM role: $ROLE_NAME ..."
if aws iam get-role --role-name "$ROLE_NAME" > /dev/null 2>&1; then
  echo "  Role already exists. Updating trust policy..."
  aws iam update-assume-role-policy --role-name "$ROLE_NAME" --policy-document "$TRUST_POLICY"
else
  aws iam create-role --role-name "$ROLE_NAME" --assume-role-policy-document "$TRUST_POLICY" --description "Read-only role for AWS Well-Architected Review Tool" --max-session-duration 3600 --tags Key=ManagedBy,Value=WAReviewTool Key=Purpose,Value=SecurityAudit
fi
echo "  Done."

echo "[3/4] Attaching read-only policies..."
aws iam attach-role-policy --role-name "$ROLE_NAME" --policy-arn "arn:aws:iam::aws:policy/SecurityAudit" 2>/dev/null || true
aws iam detach-role-policy --role-name "$ROLE_NAME" --policy-arn "arn:aws:iam::aws:policy/ReadOnlyAccess" 2>/dev/null || true
echo "  Done."

echo "[4/4] Adding inline policy..."
INLINE_POLICY=$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    { "Sid": "EC2ReadOnly", "Effect": "Allow", "Action": ["ec2:Describe*","ec2:Get*"], "Resource": "*" },
    { "Sid": "S3ReadOnly", "Effect": "Allow", "Action": ["s3:GetBucket*","s3:GetEncryptionConfiguration","s3:GetLifecycleConfiguration","s3:GetObject","s3:ListBucket","s3:ListAllMyBuckets"], "Resource": "*" },
    { "Sid": "RDSReadOnly", "Effect": "Allow", "Action": ["rds:Describe*","rds:List*"], "Resource": "*" },
    { "Sid": "IAMReadOnly", "Effect": "Allow", "Action": ["iam:Get*","iam:List*","iam:GenerateCredentialReport","iam:GetCredentialReport"], "Resource": "*" },
    { "Sid": "LambdaReadOnly", "Effect": "Allow", "Action": ["lambda:GetFunction*","lambda:GetPolicy","lambda:List*"], "Resource": "*" },
    { "Sid": "DynamoDBReadOnly", "Effect": "Allow", "Action": ["dynamodb:Describe*","dynamodb:List*"], "Resource": "*" },
    { "Sid": "ELBReadOnly", "Effect": "Allow", "Action": ["elasticloadbalancing:Describe*"], "Resource": "*" },
    { "Sid": "CloudFrontReadOnly", "Effect": "Allow", "Action": ["cloudfront:Get*","cloudfront:List*"], "Resource": "*" },
    { "Sid": "ECSReadOnly", "Effect": "Allow", "Action": ["ecs:Describe*","ecs:List*"], "Resource": "*" },
    { "Sid": "EKSReadOnly", "Effect": "Allow", "Action": ["eks:Describe*","eks:List*"], "Resource": "*" },
    { "Sid": "WellArchitectedAndCostReadOnly", "Effect": "Allow", "Action": ["wellarchitected:Get*","wellarchitected:List*","support:DescribeTrustedAdvisorChecks","support:DescribeTrustedAdvisorCheckResult","ce:GetCostAndUsage","ce:GetReservationPurchaseRecommendation","ce:GetSavingsPlansPurchaseRecommendation","ce:GetRightsizingRecommendation","ce:GetCostForecast","cost-optimization-hub:ListRecommendations","cost-optimization-hub:GetRecommendation","compute-optimizer:GetEC2InstanceRecommendations","compute-optimizer:GetAutoScalingGroupRecommendations","compute-optimizer:GetLambdaFunctionRecommendations","compute-optimizer:GetEBSVolumeRecommendations"], "Resource": "*" }
  ]
}
EOF
)
aws iam put-role-policy --role-name "$ROLE_NAME" --policy-name "WAReviewAdditionalReadOnly" --policy-document "$INLINE_POLICY"
echo "  Done."

ROLE_ARN="arn:aws:iam::$TARGET_ACCOUNT:role/$ROLE_NAME"
echo ""
echo "============================================================"
echo " Setup Complete"
echo " Role ARN: $ROLE_ARN"
echo " External ID: wa-review-$TARGET_ACCOUNT"
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

      <div id="accounts-loading" class="card mb-24" style="text-align:center; padding:48px;">
        <p class="text-secondary">กำลังโหลดข้อมูล...</p>
      </div>

      <div id="accounts-empty" class="card mb-24 hidden" style="text-align:center; padding:48px;">
        <p class="text-secondary">ยังไม่มี account ที่ลงทะเบียน กรุณาเพิ่ม account เพื่อเริ่มการสแกน</p>
      </div>

      <div id="accounts-content" class="hidden">
        <h3 style="margin-bottom:12px;">Account Summary</h3>
        <div id="accounts-cards" class="card-grid mb-24"></div>

        <div class="card">
          <div class="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Account ID</th><th>Alias</th><th>Role ARN</th><th>Status</th><th>Last Verified</th>
                  ${isAdmin() ? '<th>Actions</th>' : ''}
                </tr>
              </thead>
              <tbody id="accounts-tbody"></tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  function renderSummaryCard(acct) {
    const total = (acct.critical||0) + (acct.high||0) + (acct.medium||0) + (acct.low||0);
    return `
      <div class="card">
        <div class="flex-between mb-16">
          <div><h4>${acct.alias || acct.id}</h4><span class="text-secondary" style="font-size:0.82rem;">${acct.id}</span></div>
          <span class="badge ${statusBadgeClass(acct.status)}">${acct.status || 'Unknown'}</span>
        </div>
        <div class="flex gap-8" style="flex-wrap:wrap;">
          <span class="badge badge-critical">${acct.critical||0} Critical</span>
          <span class="badge badge-high">${acct.high||0} High</span>
          <span class="badge badge-medium">${acct.medium||0} Medium</span>
          <span class="badge badge-low">${acct.low||0} Low</span>
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
      <td>${acct.alias || ''}</td>
      <td style="font-family:var(--font-mono); font-size:0.82rem; word-break:break-all;">${acct.roleArn || acct.role_arn || ''}</td>
      <td><span class="badge ${statusBadgeClass(acct.status)}">${acct.status || 'Unknown'}</span></td>
      <td>${acct.lastVerified || acct.last_verified || '—'}</td>
      ${actions}
    </tr>`;
  }

  function renderTable() {
    const cards = document.getElementById('accounts-cards');
    const tbody = document.getElementById('accounts-tbody');
    if (cards) cards.innerHTML = accounts.map(renderSummaryCard).join('');
    if (tbody) tbody.innerHTML = accounts.map(renderRow).join('');
  }

  // --- Init ---
  async function init() {
    document.getElementById('btn-add-account')?.addEventListener('click', showAddModal);
    try {
      const data = await ApiClient.get('/accounts');
      accounts = (data && (data.accounts || data)) || [];
      if (!Array.isArray(accounts)) accounts = [];
      if (accounts.length === 0) { showEmpty(); return; }
      showContent();
      renderTable();
      bindTableEvents();
    } catch (err) {
      showEmpty();
    }
  }

  function showEmpty() {
    document.getElementById('accounts-loading')?.classList.add('hidden');
    document.getElementById('accounts-empty')?.classList.remove('hidden');
    document.getElementById('accounts-content')?.classList.add('hidden');
  }

  function showContent() {
    document.getElementById('accounts-loading')?.classList.add('hidden');
    document.getElementById('accounts-empty')?.classList.add('hidden');
    document.getElementById('accounts-content')?.classList.remove('hidden');
  }

  function bindTableEvents() {
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

  function escapeHtml(str) { return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  // --- Modals (Add, Script, Edit, Delete, Verify) ---
  function showAddModal() {
    const body = `
      <div id="add-step-1">
        <p class="text-secondary mb-16" style="font-size:0.88rem;">Step 1: กรอก Account ID และ Alias เพื่อสร้าง script สำหรับ setup IAM role</p>
        <form id="add-step1-form">
          <div class="form-group"><label for="add-account-id">Target Account ID</label><input type="text" id="add-account-id" placeholder="123456789012" required pattern="\\d{12}" title="12-digit AWS Account ID"></div>
          <div class="form-group"><label for="add-alias">Alias</label><input type="text" id="add-alias" placeholder="Production" required></div>
          <button type="submit" class="btn btn-primary btn-block mt-16">Generate Setup Script</button>
        </form>
      </div>
      <div id="add-step-2" class="hidden">
        <p class="text-secondary mb-16" style="font-size:0.88rem;">Step 2: Copy script แล้วรันใน AWS CloudShell ของ target account จากนั้นกด "Register Account"</p>
        <div style="margin-bottom:12px;">
          <div class="flex-between" style="margin-bottom:4px;"><label style="font-size:0.82rem; font-weight:500; color:var(--text-secondary);">CloudShell Script</label><button id="btn-copy-script" class="btn btn-secondary btn-sm">Copy Script</button></div>
          <div id="script-output" style="background:var(--color-near-black); color:#e8e6dc; padding:16px; border-radius:var(--radius-md); font-family:var(--font-mono); font-size:0.75rem; line-height:1.5; max-height:320px; overflow-y:auto; white-space:pre; tab-size:2;"></div>
        </div>
        <div class="alert alert-warning" style="font-size:0.82rem; margin-bottom:12px;">Trust policy ใช้ External ID: <code style="font-size:0.82rem;">wa-review-<span id="script-ext-id"></span></code></div>
        <div id="add-step2-info" style="margin-bottom:12px;"><div class="form-group"><label>Role ARN (auto-filled)</label><input type="text" id="add-role-arn" readonly style="background:var(--bg-page);"></div></div>
        <div class="flex gap-8"><button id="btn-back-step1" class="btn btn-secondary" style="flex:1;">Back</button><button id="btn-register" class="btn btn-primary" style="flex:1;">Register Account</button></div>
      </div>
    `;
    App.showModal('Add Account', body);

    document.getElementById('add-step1-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const accountId = document.getElementById('add-account-id').value.trim();
      const alias = document.getElementById('add-alias').value.trim();
      if (!accountId || !alias) return;
      document.getElementById('script-output').textContent = generateScript(accountId, alias);
      document.getElementById('add-role-arn').value = 'arn:aws:iam::' + accountId + ':role/' + ROLE_NAME;
      document.getElementById('script-ext-id').textContent = accountId;
      document.getElementById('add-step-1').classList.add('hidden');
      document.getElementById('add-step-2').classList.remove('hidden');
    });
    document.getElementById('btn-copy-script')?.addEventListener('click', () => {
      navigator.clipboard.writeText(document.getElementById('script-output').textContent).then(() => {
        const btn = document.getElementById('btn-copy-script'); btn.textContent = 'Copied'; setTimeout(() => { btn.textContent = 'Copy Script'; }, 2000);
      });
    });
    document.getElementById('btn-back-step1')?.addEventListener('click', () => {
      document.getElementById('add-step-1').classList.remove('hidden');
      document.getElementById('add-step-2').classList.add('hidden');
    });
    document.getElementById('btn-register')?.addEventListener('click', async () => {
      const accountId = document.getElementById('add-account-id').value.trim();
      const alias = document.getElementById('add-alias').value.trim();
      const roleArn = document.getElementById('add-role-arn').value;
      try {
        await ApiClient.post('/accounts', { id: accountId, alias, roleArn });
        App.hideModal();
        init();
      } catch (err) {
        alert(err.message || 'ไม่สามารถลงทะเบียน account ได้');
      }
    });
  }

  function showScriptModal(accountId, alias) {
    const script = generateScript(accountId, alias);
    const body = `
      <p class="text-secondary mb-16" style="font-size:0.88rem;">CloudShell script สำหรับ account ${accountId} (${alias})</p>
      <div class="flex-between" style="margin-bottom:4px;"><label style="font-size:0.82rem; font-weight:500; color:var(--text-secondary);">Script</label><button id="btn-copy-existing" class="btn btn-secondary btn-sm">Copy Script</button></div>
      <div style="background:var(--color-near-black); color:#e8e6dc; padding:16px; border-radius:var(--radius-md); font-family:var(--font-mono); font-size:0.75rem; line-height:1.5; max-height:400px; overflow-y:auto; white-space:pre; tab-size:2;">${escapeHtml(script)}</div>
    `;
    App.showModal('Setup Script — ' + alias, body);
    document.getElementById('btn-copy-existing')?.addEventListener('click', () => {
      navigator.clipboard.writeText(script).then(() => { const btn = document.getElementById('btn-copy-existing'); btn.textContent = 'Copied'; setTimeout(() => { btn.textContent = 'Copy Script'; }, 2000); });
    });
  }

  function showEditModal(acct) {
    const body = `
      <form id="edit-account-form">
        <div class="form-group"><label>Account ID</label><input type="text" value="${acct.id}" disabled></div>
        <div class="form-group"><label for="edit-role-arn">Role ARN</label><input type="text" id="edit-role-arn" value="${acct.roleArn || acct.role_arn || ''}" required></div>
        <div class="form-group"><label for="edit-alias">Alias</label><input type="text" id="edit-alias" value="${acct.alias || ''}" required></div>
        <button type="submit" class="btn btn-primary btn-block mt-16">Save Changes</button>
      </form>
    `;
    App.showModal('Edit Account', body);
    document.getElementById('edit-account-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await ApiClient.put('/accounts/' + acct.id, { alias: document.getElementById('edit-alias').value, roleArn: document.getElementById('edit-role-arn').value });
        App.hideModal();
        init();
      } catch (err) { alert(err.message || 'ไม่สามารถบันทึกได้'); }
    });
  }

  function showDeleteModal(acct) {
    const body = `
      <p>คุณต้องการลบ account <strong>${acct.alias}</strong> (${acct.id}) หรือไม่?</p>
      <p class="text-secondary mt-8" style="font-size:0.88rem;">การดำเนินการนี้ไม่สามารถย้อนกลับได้</p>
      <div class="flex gap-8 mt-16"><button id="confirm-delete" class="btn btn-danger" style="flex:1;">Delete</button><button id="cancel-delete" class="btn btn-secondary" style="flex:1;">Cancel</button></div>
    `;
    App.showModal('Delete Account', body);
    document.getElementById('confirm-delete')?.addEventListener('click', async () => {
      try { await ApiClient.del('/accounts/' + acct.id); App.hideModal(); init(); } catch (err) { alert(err.message || 'ไม่สามารถลบได้'); }
    });
    document.getElementById('cancel-delete')?.addEventListener('click', () => App.hideModal());
  }

  function handleVerify(acct) {
    const btn = document.querySelector(`.btn-verify[data-id="${acct.id}"]`);
    if (!btn) return;
    btn.disabled = true; btn.textContent = 'Verifying...';
    ApiClient.post('/accounts/' + acct.id + '/verify').then(() => { btn.disabled = false; btn.textContent = 'Verify'; init(); }).catch(() => { btn.disabled = false; btn.textContent = 'Verify'; });
  }

  return { render, init };
})();
