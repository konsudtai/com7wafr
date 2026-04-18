/* ============================================
   WA Review Tool — Accounts Page
   Accounts table, Add with CloudShell script
   generation, Edit/Delete, Verify
   ============================================ */

const AccountsPage = (() => {
  let accounts = [];

  let platformAccountId = '';
  const ROLE_NAME = 'WAReviewReadOnly';

  function statusBadgeClass(s) {
    if (s === 'CONNECTED' || s === 'Active') return 'badge-low';
    if (s === 'FAILED') return 'badge-critical';
    return 'badge-info';
  }
  function statusLabel(s) {
    if (s === 'CONNECTED') return 'Active';
    if (s === 'FAILED') return 'Failed';
    if (s === 'UNKNOWN') return 'Unknown';
    return s || 'Unknown';
  }
  function isAdmin() { return App.state.role === 'Admin'; }

  // Normalize backend AccountRecord to a consistent shape for the UI
  function normalizeAccount(raw) {
    return {
      id: raw.accountId || raw.id || '',
      alias: raw.alias || '',
      roleArn: raw.roleArn || raw.role_arn || '',
      status: raw.connectionStatus || raw.status || 'UNKNOWN',
      lastVerified: raw.lastVerified || raw.last_verified || raw.updatedAt || '—',
      critical: raw.critical || 0,
      high: raw.high || 0,
      medium: raw.medium || 0,
      low: raw.low || 0,
    };
  }

  // --- Generate CloudShell Script ---
  function generateScript(targetAccountId, alias, platformAcct) {
    return `#!/bin/bash
# ============================================================
# AWS Well-Architected Review Tool — IAM Role Setup Script
# ============================================================
# Target Account : ${targetAccountId} (${alias})
# Platform Account: ${platformAcct}
# Role Name      : ${ROLE_NAME}
#
# Run this script in AWS CloudShell of the TARGET account
# ============================================================
set -e

ROLE_NAME="${ROLE_NAME}"
PLATFORM_ACCOUNT="${platformAcct}"
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
          <span class="badge ${statusBadgeClass(acct.status)}">${statusLabel(acct.status)}</span>
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
      <td style="font-family:var(--font-mono); font-size:0.82rem; word-break:break-all;">${acct.roleArn}</td>
      <td><span class="badge ${statusBadgeClass(acct.status)}">${statusLabel(acct.status)}</span></td>
      <td>${acct.lastVerified}</td>
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
      // Get platform account ID from config
      platformAccountId = (window.WA_CONFIG && window.WA_CONFIG.PLATFORM_ACCOUNT_ID) || '';

      const data = await ApiClient.get('/accounts');
      const raw = (data && data.accounts) || [];
      accounts = (Array.isArray(raw) ? raw : []).map(normalizeAccount);
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
  function API_BASE_URL_RAW() { return ((window.WA_CONFIG && window.WA_CONFIG.API_BASE_URL) || '/api').replace(/\/+$/, ''); }

  // --- Modals (Add, Script, Edit, Delete, Verify) ---

  function stepIndicator(current) {
    const steps = [
      { num: 1, label: 'Account Info' },
      { num: 2, label: 'Run Script' },
      { num: 3, label: 'Enter ARN' },
      { num: 4, label: 'Verify & Save' },
    ];
    return `<div style="display:flex; gap:0; margin-bottom:20px; position:relative;">
      ${steps.map((s, i) => {
        const isActive = s.num === current;
        const isDone = s.num < current;
        const circleStyle = isActive
          ? 'background:var(--color-terracotta); color:#fff; box-shadow:0 0 0 3px rgba(201,100,66,0.2);'
          : isDone
            ? 'background:var(--color-success); color:#fff;'
            : 'background:var(--bg-page); color:var(--text-tertiary); border:1.5px solid var(--border-default);';
        const lineColor = isDone ? 'var(--color-success)' : 'var(--border-default)';
        const line = i < steps.length - 1
          ? `<div style="flex:1; height:2px; background:${lineColor}; align-self:center; margin:0 -2px;"></div>`
          : '';
        return `<div style="display:flex; align-items:center; ${i < steps.length - 1 ? 'flex:1;' : ''}">
          <div style="display:flex; flex-direction:column; align-items:center; min-width:60px;">
            <div style="width:30px; height:30px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:0.82rem; font-weight:600; transition:all 0.2s; ${circleStyle}">${isDone ? '✓' : s.num}</div>
            <span style="font-size:0.7rem; margin-top:4px; white-space:nowrap; color:${isActive ? 'var(--text-primary)' : 'var(--text-tertiary)'}; font-weight:${isActive ? '500' : '400'};">${s.label}</span>
          </div>
          ${line}
        </div>`;
      }).join('')}
    </div>`;
  }

  function showAddModal() {
    // State for the wizard
    let wizTargetId = '';
    let wizAlias = '';
    let wizPlatformId = platformAccountId;
    let wizRoleArn = '';

    function renderStep1() {
      return `
        ${stepIndicator(1)}
        <p class="text-secondary mb-16" style="font-size:0.88rem;">กรอกข้อมูล AWS Account ที่ต้องการเพิ่มเข้าระบบ</p>
        <form id="wizard-step1-form">
          <div class="form-group">
            <label for="wiz-target-id">Target Account ID <span style="color:var(--color-error);">*</span></label>
            <input type="text" id="wiz-target-id" placeholder="123456789012" required pattern="\\d{12}" title="12-digit AWS Account ID" value="${wizTargetId}">
            <span class="text-secondary" style="font-size:0.75rem;">เลข 12 หลักของ AWS Account ที่ต้องการสแกน</span>
          </div>
          <div class="form-group">
            <label for="wiz-alias">Alias <span style="color:var(--color-error);">*</span></label>
            <input type="text" id="wiz-alias" placeholder="Production" required value="${wizAlias}">
            <span class="text-secondary" style="font-size:0.75rem;">ชื่อเรียกสั้นๆ เช่น Production, Staging, Dev</span>
          </div>
          <div class="form-group">
            <label for="wiz-platform-id">Platform Account ID <span style="color:var(--color-error);">*</span></label>
            <input type="text" id="wiz-platform-id" placeholder="000011112222" required pattern="\\d{12}" title="12-digit AWS Account ID" value="${wizPlatformId}">
            <span class="text-secondary" style="font-size:0.75rem;">เลข Account ของ platform ที่ deploy WA Review Tool อยู่</span>
          </div>
          <button type="submit" class="btn btn-primary btn-block mt-16">ถัดไป →</button>
        </form>
      `;
    }

    function renderStep2() {
      const script = generateScript(wizTargetId, wizAlias, wizPlatformId);
      return `
        ${stepIndicator(2)}
        <p class="text-secondary mb-16" style="font-size:0.88rem;">
          Copy script ด้านล่างแล้วไปรันใน <strong>AWS CloudShell</strong> ของ <strong>Target Account (${wizTargetId})</strong>
        </p>

        <div style="margin-bottom:12px;">
          <div class="flex-between" style="margin-bottom:4px;">
            <label style="font-size:0.82rem; font-weight:500; color:var(--text-secondary);">CloudShell Script</label>
            <button id="wiz-copy-script" class="btn btn-secondary btn-sm">Copy Script</button>
          </div>
          <div id="wiz-script-output" style="background:var(--color-near-black); color:#e8e6dc; padding:16px; border-radius:var(--radius-md); font-family:var(--font-mono); font-size:0.72rem; line-height:1.5; max-height:280px; overflow-y:auto; white-space:pre; tab-size:2;">${escapeHtml(script)}</div>
        </div>

        <div class="alert alert-warning" style="font-size:0.82rem; margin-bottom:12px;">
          <strong>สำคัญ:</strong> Trust policy ใช้ External ID: <code>wa-review-${wizTargetId}</code> เพื่อป้องกัน confused deputy attack
        </div>

        <div style="background:var(--bg-page); border:1px solid var(--border-default); border-radius:var(--radius-md); padding:12px; margin-bottom:16px;">
          <p style="font-size:0.82rem; font-weight:500; margin-bottom:8px;">Script จะสร้าง IAM Role ที่มีสิทธิ์:</p>
          <ul style="font-size:0.78rem; color:var(--text-secondary); padding-left:16px; line-height:1.8; margin:0;">
            <li><strong>SecurityAudit</strong> — ตรวจสอบ security configurations</li>
            <li><strong>10 Services</strong> — EC2, S3, RDS, IAM, Lambda, DynamoDB, ELB, CloudFront, ECS, EKS (read-only)</li>
            <li><strong>Well-Architected Tool + Cost Explorer + Compute Optimizer</strong></li>
          </ul>
        </div>

        <div class="flex gap-8">
          <button id="wiz-back-1" class="btn btn-secondary" style="flex:1;">← ย้อนกลับ</button>
          <button id="wiz-next-2" class="btn btn-primary" style="flex:1;">รันเสร็จแล้ว ถัดไป →</button>
        </div>
      `;
    }

    function renderStep3() {
      const expectedArn = 'arn:aws:iam::' + wizTargetId + ':role/' + ROLE_NAME;
      return `
        ${stepIndicator(3)}
        <p class="text-secondary mb-16" style="font-size:0.88rem;">
          กรอก Role ARN ที่ได้จากการรัน script ใน Target Account
        </p>

        <div class="form-group">
          <label for="wiz-role-arn">Role ARN <span style="color:var(--color-error);">*</span></label>
          <input type="text" id="wiz-role-arn" placeholder="arn:aws:iam::123456789012:role/WAReviewReadOnly" required value="${wizRoleArn || expectedArn}">
          <span class="text-secondary" style="font-size:0.75rem;">ปกติจะเป็น: <code style="font-size:0.75rem;">${expectedArn}</code></span>
        </div>

        <div class="alert alert-success" style="font-size:0.82rem; margin-bottom:16px;">
          <strong>Tip:</strong> หลังรัน script สำเร็จ จะแสดง Role ARN ในบรรทัดสุดท้าย — copy มาวางได้เลย
        </div>

        <div class="flex gap-8">
          <button id="wiz-back-2" class="btn btn-secondary" style="flex:1;">← ย้อนกลับ</button>
          <button id="wiz-next-3" class="btn btn-primary" style="flex:1;">ถัดไป →</button>
        </div>
      `;
    }

    function renderStep4() {
      return `
        ${stepIndicator(4)}
        <p class="text-secondary mb-16" style="font-size:0.88rem;">
          ตรวจสอบข้อมูลและบันทึก Account
        </p>

        <div style="background:var(--bg-page); border:1px solid var(--border-default); border-radius:var(--radius-md); padding:16px; margin-bottom:16px;">
          <div style="display:grid; grid-template-columns:auto 1fr; gap:8px 16px; font-size:0.88rem;">
            <span class="text-secondary">Target Account:</span><span style="font-family:var(--font-mono);">${wizTargetId}</span>
            <span class="text-secondary">Alias:</span><span>${wizAlias}</span>
            <span class="text-secondary">Platform Account:</span><span style="font-family:var(--font-mono);">${wizPlatformId}</span>
            <span class="text-secondary">Role ARN:</span><span style="font-family:var(--font-mono); font-size:0.82rem; word-break:break-all;">${wizRoleArn}</span>
            <span class="text-secondary">External ID:</span><span style="font-family:var(--font-mono);">wa-review-${wizTargetId}</span>
          </div>
        </div>

        <div id="wiz-error" class="alert alert-error hidden" style="margin-bottom:12px;"></div>
        <div id="wiz-sync-result" class="hidden" style="margin-bottom:16px;"></div>

        <div class="flex gap-8">
          <button id="wiz-back-3" class="btn btn-secondary" style="flex:1;">← ย้อนกลับ</button>
          <button id="wiz-save" class="btn btn-primary" style="flex:1;">✓ บันทึกและทดสอบการเชื่อมต่อ</button>
        </div>
      `;
    }

    function showStep(n) {
      let html;
      let title;
      if (n === 1) { html = renderStep1(); title = 'Add Account — ข้อมูล Account'; }
      else if (n === 2) { html = renderStep2(); title = 'Add Account — รัน Script'; }
      else if (n === 3) { html = renderStep3(); title = 'Add Account — กรอก Role ARN'; }
      else { html = renderStep4(); title = 'Add Account — ตรวจสอบและบันทึก'; }

      const modalTitle = document.getElementById('modal-title');
      const modalBody = document.getElementById('modal-body');
      if (modalTitle) modalTitle.textContent = title;
      if (modalBody) modalBody.innerHTML = html;

      // Bind events per step
      if (n === 1) {
        document.getElementById('wizard-step1-form')?.addEventListener('submit', (e) => {
          e.preventDefault();
          wizTargetId = document.getElementById('wiz-target-id').value.trim();
          wizAlias = document.getElementById('wiz-alias').value.trim();
          wizPlatformId = document.getElementById('wiz-platform-id').value.trim();
          if (!wizTargetId || !wizAlias || !wizPlatformId) return;
          showStep(2);
        });
      } else if (n === 2) {
        document.getElementById('wiz-copy-script')?.addEventListener('click', () => {
          const script = generateScript(wizTargetId, wizAlias, wizPlatformId);
          navigator.clipboard.writeText(script).then(() => {
            const btn = document.getElementById('wiz-copy-script');
            if (btn) { btn.textContent = '✓ Copied!'; btn.classList.remove('btn-secondary'); btn.classList.add('btn-primary');
              setTimeout(() => { btn.textContent = 'Copy Script'; btn.classList.remove('btn-primary'); btn.classList.add('btn-secondary'); }, 2000); }
          });
        });
        document.getElementById('wiz-back-1')?.addEventListener('click', () => showStep(1));
        document.getElementById('wiz-next-2')?.addEventListener('click', () => showStep(3));
      } else if (n === 3) {
        document.getElementById('wiz-back-2')?.addEventListener('click', () => showStep(2));
        document.getElementById('wiz-next-3')?.addEventListener('click', () => {
          wizRoleArn = document.getElementById('wiz-role-arn').value.trim();
          if (!wizRoleArn) { document.getElementById('wiz-role-arn').focus(); return; }
          showStep(4);
        });
      } else if (n === 4) {
        document.getElementById('wiz-back-3')?.addEventListener('click', () => showStep(3));
        document.getElementById('wiz-save')?.addEventListener('click', handleSaveAndVerify);
      }
    }

    async function handleSaveAndVerify() {
      const btn = document.getElementById('wiz-save');
      const errEl = document.getElementById('wiz-error');
      const resultEl = document.getElementById('wiz-sync-result');
      if (!btn) return;

      btn.disabled = true;
      btn.textContent = '⏳ กำลังบันทึก...';
      if (errEl) errEl.classList.add('hidden');
      if (resultEl) resultEl.classList.add('hidden');

      // Step 1: Save account
      try {
        await ApiClient.post('/accounts', {
          accountId: wizTargetId,
          alias: wizAlias,
          roleArn: wizRoleArn,
        });
      } catch (err) {
        if (errEl) {
          errEl.textContent = err.message || 'ไม่สามารถบันทึก account ได้';
          errEl.classList.remove('hidden');
        }
        btn.disabled = false;
        btn.textContent = '✓ บันทึกและทดสอบการเชื่อมต่อ';
        return;
      }

      // Step 2: Verify connectivity (optional — don't logout on failure)
      btn.textContent = '⏳ กำลังทดสอบการเชื่อมต่อ...';
      if (resultEl) {
        resultEl.classList.remove('hidden');
        resultEl.innerHTML = '<p class="text-secondary" style="font-size:0.88rem;">✅ บันทึกสำเร็จ — กำลังทดสอบ AssumeRole...</p>';
      }

      try {
        const verifyUrl = API_BASE_URL_RAW() + '/accounts/' + wizTargetId + '/verify';
        const token = typeof Auth !== 'undefined' ? Auth.getIdToken() : null;
        const verifyResp = await fetch(verifyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': 'Bearer ' + token } : {}) },
        });
        const result = verifyResp.ok ? await verifyResp.json().catch(() => null) : null;
        const connected = result && (result.connectionStatus === 'CONNECTED');
        if (resultEl) {
          resultEl.innerHTML = connected
            ? '<div class="alert alert-success" style="font-size:0.88rem;">✅ บันทึกสำเร็จและเชื่อมต่อได้! พร้อมสำหรับการสแกน</div>'
            : `<div class="alert alert-warning" style="font-size:0.88rem;">⚠️ บันทึกสำเร็จ แต่ยังเชื่อมต่อไม่ได้ — ${(result && result.error) || 'ตรวจสอบว่ารัน script ใน target account เรียบร้อยแล้ว'}<br><span style="font-size:0.78rem;">สามารถกด Verify อีกครั้งได้ในหน้า Accounts</span></div>`;
        }
      } catch (err) {
        // Network error (CORS, timeout, etc.) — don't logout, just show warning
        if (resultEl) {
          resultEl.innerHTML = '<div class="alert alert-warning" style="font-size:0.88rem;">⚠️ บันทึกสำเร็จ แต่ทดสอบการเชื่อมต่อล้มเหลว<br><span style="font-size:0.78rem;">สามารถกด Verify อีกครั้งได้ในหน้า Accounts</span></div>';
        }
      }

      // Show close button
      btn.textContent = '✓ เสร็จสิ้น — ปิด';
      btn.disabled = false;
      btn.onclick = () => { App.hideModal(); init(); };
      // Hide back button
      document.getElementById('wiz-back-3')?.classList.add('hidden');
    }

    App.showModal('Add Account', '<div></div>');
    showStep(1);
  }

  function showScriptModal(accountId, alias) {
    const pAcct = platformAccountId || 'PLATFORM_ACCOUNT_ID';
    const script = generateScript(accountId, alias, pAcct);
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
    const url = API_BASE_URL_RAW() + '/accounts/' + acct.id + '/verify';
    const token = typeof Auth !== 'undefined' ? Auth.getIdToken() : null;
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': 'Bearer ' + token } : {}) },
    })
      .then(r => r.json().catch(() => null))
      .then(() => { btn.disabled = false; btn.textContent = 'Verify'; init(); })
      .catch(() => { btn.disabled = false; btn.textContent = 'Verify'; });
  }

  return { render, init };
})();
