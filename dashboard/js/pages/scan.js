/* ============================================
   WA Review Tool — Scan Page
   Account/region/service selection,
   Run Check button, progress bar
   ============================================ */

const ScanPage = (() => {
  let pollInterval = null;
  let accounts = [];

  const ALL_SERVICES = [
    'EC2', 'S3', 'RDS', 'IAM', 'Lambda', 'DynamoDB', 'ELB', 'CloudFront', 'ECS', 'EKS',
    'CloudTrail', 'VPC', 'KMS', 'CloudWatch', 'Config',
    'API Gateway', 'SQS', 'OpenSearch', 'GuardDuty', 'EFS', 'ElastiCache', 'Redshift',
  ];
  const ALL_REGIONS = [
    'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
    'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1', 'ap-northeast-2', 'ap-south-1',
    'eu-west-1', 'eu-west-2', 'eu-central-1',
    'sa-east-1',
  ];

  function isAdmin() { return App.state.role === 'Admin'; }

  function render() {
    return `
      <div class="page-header">
        <h2>Scan</h2>
        <p>เริ่มการสแกน AWS resources ตาม Well-Architected Framework</p>
      </div>

      ${!isAdmin() ? '<div class="alert alert-warning mb-24">เฉพาะ Admin เท่านั้นที่สามารถเริ่มการสแกนได้</div>' : ''}

      <div class="card mb-24">
        <h3 style="margin-bottom:12px;">Scan Configuration</h3>

        <div id="scan-accounts-loading" class="text-secondary" style="padding:12px 0;">กำลังโหลด accounts...</div>

        <div id="scan-config-form" class="hidden">
          <div class="form-group">
            <label>เลือก Accounts ที่ต้องการสแกน</label>
            <div id="account-checkboxes" style="display:flex; flex-direction:column; gap:8px; margin-top:4px;"></div>
          </div>

          <div class="form-group">
            <label>เลือก Regions</label>
            <div style="display:flex; gap:8px; margin-bottom:4px;">
              <button type="button" id="btn-select-all-regions" class="btn btn-secondary btn-sm">เลือกทั้งหมด</button>
              <button type="button" id="btn-deselect-all-regions" class="btn btn-secondary btn-sm">ยกเลิกทั้งหมด</button>
            </div>
            <div id="region-checkboxes" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(160px, 1fr)); gap:6px; margin-top:4px;"></div>
          </div>

          <div class="form-group">
            <label>เลือก Services</label>
            <div style="display:flex; gap:8px; margin-bottom:4px;">
              <button type="button" id="btn-select-all-services" class="btn btn-secondary btn-sm">เลือกทั้งหมด</button>
              <button type="button" id="btn-deselect-all-services" class="btn btn-secondary btn-sm">ยกเลิกทั้งหมด</button>
            </div>
            <div id="service-checkboxes" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(140px, 1fr)); gap:6px; margin-top:4px;"></div>
          </div>
        </div>

        <div id="scan-no-accounts" class="hidden" style="padding:12px 0;">
          <div class="alert alert-warning">ยังไม่มี account ที่ลงทะเบียน — กรุณาไปที่หน้า <a href="#accounts">Accounts</a> เพื่อเพิ่ม account ก่อน</div>
        </div>
      </div>

      <div class="card mb-24">
        <div class="flex-between mb-16">
          <h3>Run Check</h3>
          <button id="btn-run-scan" class="btn btn-primary" ${!isAdmin() ? 'disabled' : ''}>Run Check</button>
        </div>

        <div class="form-group">
          <label>Status</label>
          <p id="scan-status" style="font-weight:500;">PENDING</p>
        </div>

        <div class="form-group">
          <label>Progress</label>
          <div class="progress-bar">
            <div id="scan-progress-fill" class="progress-bar-fill" style="width:0%;"></div>
          </div>
          <p id="scan-progress-text" class="text-secondary mt-8" style="font-size:0.82rem;">0%</p>
        </div>

        <div class="form-group">
          <label>Current</label>
          <p id="scan-current" class="text-secondary">—</p>
        </div>

        <div id="scan-error" class="alert alert-error hidden" style="margin-top:12px;"></div>
      </div>
    `;
  }

  async function init() {
    document.getElementById('btn-run-scan')?.addEventListener('click', startScan);
    await loadAccounts();
  }

  async function loadAccounts() {
    try {
      const data = await ApiClient.get('/accounts');
      accounts = (data && data.accounts) || [];
      if (!Array.isArray(accounts)) accounts = [];

      document.getElementById('scan-accounts-loading')?.classList.add('hidden');

      if (accounts.length === 0) {
        document.getElementById('scan-no-accounts')?.classList.remove('hidden');
        document.getElementById('scan-config-form')?.classList.add('hidden');
        return;
      }

      document.getElementById('scan-config-form')?.classList.remove('hidden');
      renderCheckboxes();
      bindSelectButtons();
    } catch (err) {
      document.getElementById('scan-accounts-loading')?.classList.add('hidden');
      document.getElementById('scan-no-accounts')?.classList.remove('hidden');
    }
  }

  function renderCheckboxes() {
    // Accounts
    const acctEl = document.getElementById('account-checkboxes');
    if (acctEl) {
      acctEl.innerHTML = accounts.map(a => {
        const id = a.accountId || a.id || '';
        const alias = a.alias || id;
        const status = a.connectionStatus || 'UNKNOWN';
        const badge = status === 'CONNECTED'
          ? '<span class="badge badge-low" style="font-size:0.72rem;">Active</span>'
          : '<span class="badge badge-info" style="font-size:0.72rem;">' + status + '</span>';
        return `<label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
          <input type="checkbox" name="scan-account" value="${id}" checked>
          <span style="font-family:var(--font-mono); font-size:0.88rem;">${id}</span>
          <span>${alias}</span>
          ${badge}
        </label>`;
      }).join('');
    }

    // Regions — default select ap-southeast-1
    const regionEl = document.getElementById('region-checkboxes');
    if (regionEl) {
      const defaultRegion = (window.WA_CONFIG && window.WA_CONFIG.REGION) || 'ap-southeast-1';
      regionEl.innerHTML = ALL_REGIONS.map(r => `<label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-size:0.88rem;">
        <input type="checkbox" name="scan-region" value="${r}" ${r === defaultRegion ? 'checked' : ''}> ${r}
      </label>`).join('');
    }

    // Services — all selected by default
    const svcEl = document.getElementById('service-checkboxes');
    if (svcEl) {
      svcEl.innerHTML = ALL_SERVICES.map(s => `<label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-size:0.88rem;">
        <input type="checkbox" name="scan-service" value="${s.toLowerCase()}" checked> ${s}
      </label>`).join('');
    }
  }

  function bindSelectButtons() {
    document.getElementById('btn-select-all-regions')?.addEventListener('click', () => {
      document.querySelectorAll('input[name="scan-region"]').forEach(cb => cb.checked = true);
    });
    document.getElementById('btn-deselect-all-regions')?.addEventListener('click', () => {
      document.querySelectorAll('input[name="scan-region"]').forEach(cb => cb.checked = false);
    });
    document.getElementById('btn-select-all-services')?.addEventListener('click', () => {
      document.querySelectorAll('input[name="scan-service"]').forEach(cb => cb.checked = true);
    });
    document.getElementById('btn-deselect-all-services')?.addEventListener('click', () => {
      document.querySelectorAll('input[name="scan-service"]').forEach(cb => cb.checked = false);
    });
  }

  function getSelectedValues(name) {
    return [...document.querySelectorAll(`input[name="${name}"]:checked`)].map(cb => cb.value);
  }

  async function startScan() {
    const btn = document.getElementById('btn-run-scan');
    const errEl = document.getElementById('scan-error');
    if (!btn || btn.disabled) return;
    if (errEl) errEl.classList.add('hidden');

    const selectedAccounts = getSelectedValues('scan-account');
    const selectedRegions = getSelectedValues('scan-region');
    const selectedServices = getSelectedValues('scan-service');

    if (selectedAccounts.length === 0) {
      if (errEl) { errEl.textContent = 'กรุณาเลือกอย่างน้อย 1 account'; errEl.classList.remove('hidden'); }
      return;
    }
    if (selectedRegions.length === 0) {
      if (errEl) { errEl.textContent = 'กรุณาเลือกอย่างน้อย 1 region'; errEl.classList.remove('hidden'); }
      return;
    }
    if (selectedServices.length === 0) {
      if (errEl) { errEl.textContent = 'กรุณาเลือกอย่างน้อย 1 service'; errEl.classList.remove('hidden'); }
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Scanning...';
    updateStatus('IN_PROGRESS');
    updateProgress(0);
    updateCurrent('กำลังเริ่มต้น...');

    try {
      const result = await ApiClient.post('/scans', {
        accounts: selectedAccounts,
        regions: selectedRegions,
        services: selectedServices,
      });
      const scanId = result && (result.scanId || result.scan_id);
      if (scanId) {
        pollProgress(scanId);
      } else {
        updateStatus('FAILED');
        btn.disabled = false;
        btn.textContent = 'Run Check';
      }
    } catch (err) {
      updateStatus('FAILED');
      if (errEl) { errEl.textContent = err.message || 'เกิดข้อผิดพลาด'; errEl.classList.remove('hidden'); }
      btn.disabled = false;
      btn.textContent = 'Run Check';
    }
  }

  function pollProgress(scanId) {
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(async () => {
      try {
        const data = await ApiClient.get('/scans/' + scanId + '/status');
        const status = data && data.status;
        const pct = Math.round((data && data.progress) || 0);
        updateStatus(status || 'IN_PROGRESS');
        updateProgress(pct);
        updateCurrent(data && data.currentService ? `${data.currentService} — ${data.currentRegion || ''}` : '—');

        if (status === 'COMPLETED' || status === 'FAILED') {
          clearInterval(pollInterval);
          pollInterval = null;
          const btn = document.getElementById('btn-run-scan');
          if (btn) { btn.disabled = false; btn.textContent = 'Run Check'; }
          if (status === 'COMPLETED') {
            updateCurrent('สแกนเสร็จสิ้น — ดูผลลัพธ์ได้ที่หน้า Overview และ Findings');
          }
        }
      } catch (err) {
        clearInterval(pollInterval);
        pollInterval = null;
        const btn = document.getElementById('btn-run-scan');
        if (btn) { btn.disabled = false; btn.textContent = 'Run Check'; }
      }
    }, 2000);
  }

  function updateStatus(status) { const el = document.getElementById('scan-status'); if (el) el.textContent = status; }
  function updateProgress(pct) {
    const fill = document.getElementById('scan-progress-fill');
    const text = document.getElementById('scan-progress-text');
    if (fill) fill.style.width = pct + '%';
    if (text) text.textContent = pct + '%';
  }
  function updateCurrent(text) { const el = document.getElementById('scan-current'); if (el) el.textContent = text; }

  return { render, init };
})();
