/* ============================================
   WA Review Tool — Scan Page
   Run Check button, progress bar, status
   indicator, current service/region display
   ============================================ */

const ScanPage = (() => {
  let pollInterval = null;

  function isAdmin() { return App.state.role === 'Admin'; }

  function render() {
    return `
      <div class="page-header">
        <h2>Scan</h2>
        <p>เริ่มการสแกน AWS resources ตาม Well-Architected Framework</p>
      </div>

      ${!isAdmin() ? '<div class="alert alert-warning mb-24">เฉพาะ Admin เท่านั้นที่สามารถเริ่มการสแกนได้</div>' : ''}

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
      </div>

      <div id="scan-config" class="card">
        <h3 style="margin-bottom:12px;">Scan Configuration</h3>
        <p class="text-secondary">กำลังโหลด...</p>
      </div>
    `;
  }

  async function init() {
    document.getElementById('btn-run-scan')?.addEventListener('click', startScan);
    loadConfig();
  }

  async function loadConfig() {
    try {
      const data = await ApiClient.get('/accounts');
      const accounts = (data && data.accounts) || [];
      const count = Array.isArray(accounts) ? accounts.length : 0;
      const configEl = document.getElementById('scan-config');
      if (configEl) {
        configEl.innerHTML = `
          <h3 style="margin-bottom:12px;">Scan Configuration</h3>
          <div class="card-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));">
            <div><p class="text-secondary" style="font-size:0.82rem;">Services</p><p>EC2, S3, RDS, IAM, Lambda, DynamoDB, ELB, CloudFront, ECS, EKS</p></div>
            <div><p class="text-secondary" style="font-size:0.82rem;">Accounts</p><p>${count} account${count !== 1 ? 's' : ''} configured</p></div>
          </div>
        `;
      }
    } catch (err) { /* ignore */ }
  }

  async function startScan() {
    const btn = document.getElementById('btn-run-scan');
    if (!btn || btn.disabled) return;
    btn.disabled = true;
    btn.textContent = 'Scanning...';
    updateStatus('IN_PROGRESS');
    updateProgress(0);

    try {
      const result = await ApiClient.post('/scans');
      const scanId = result && (result.scanId || result.scan_id);
      if (scanId) {
        pollProgress(scanId);
      }
    } catch (err) {
      updateStatus('FAILED');
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
        updateCurrent(data && data.current_service ? `${data.current_service} — ${data.current_region || ''}` : '—');

        if (status === 'COMPLETED' || status === 'FAILED') {
          clearInterval(pollInterval);
          pollInterval = null;
          const btn = document.getElementById('btn-run-scan');
          if (btn) { btn.disabled = false; btn.textContent = 'Run Check'; }
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
