/* ============================================
   WA Review Tool — Scan Page
   Run Check button, progress bar, status
   indicator, current service/region display
   ============================================ */

// NOTE: Mock data below is for DEMO MODE only.
// In production, scan operations are performed via the backend API.

const ScanPage = (() => {
  let scanInterval = null;

  const services = ['EC2', 'S3', 'RDS', 'IAM', 'Lambda', 'DynamoDB', 'ELB', 'CloudFront', 'ECS', 'EKS'];
  const regions = ['us-east-1', 'ap-southeast-1', 'eu-west-1'];

  function isAdmin() {
    return App.state.role === 'Admin';
  }

  // --- Render ---
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

      <div class="card">
        <h3 style="margin-bottom:12px;">Scan Configuration</h3>
        <div class="card-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));">
          <div>
            <p class="text-secondary" style="font-size:0.82rem;">Services</p>
            <p>${services.join(', ')}</p>
          </div>
          <div>
            <p class="text-secondary" style="font-size:0.82rem;">Regions</p>
            <p>${regions.join(', ')}</p>
          </div>
          <div>
            <p class="text-secondary" style="font-size:0.82rem;">Accounts</p>
            <p>3 accounts configured</p>
          </div>
        </div>
      </div>
    `;
  }

  // --- Init ---
  function init() {
    document.getElementById('btn-run-scan')?.addEventListener('click', startScan);
  }

  function startScan() {
    const btn = document.getElementById('btn-run-scan');
    if (!btn || btn.disabled) return;

    btn.disabled = true;
    btn.textContent = 'Scanning...';

    let step = 0;
    const totalSteps = 10;

    updateStatus('IN_PROGRESS');
    updateProgress(0);

    scanInterval = setInterval(() => {
      step++;
      const pct = Math.round((step / totalSteps) * 100);
      const svcIdx = step % services.length;
      const regIdx = step % regions.length;

      updateProgress(pct);
      updateCurrent(`${services[svcIdx]} — ${regions[regIdx]}`);

      if (step >= totalSteps) {
        clearInterval(scanInterval);
        scanInterval = null;
        updateStatus('COMPLETED');
        updateCurrent('—');
        btn.disabled = false;
        btn.textContent = 'Run Check';
      }
    }, 800);
  }

  function updateStatus(status) {
    const el = document.getElementById('scan-status');
    if (el) el.textContent = status;
  }

  function updateProgress(pct) {
    const fill = document.getElementById('scan-progress-fill');
    const text = document.getElementById('scan-progress-text');
    if (fill) fill.style.width = pct + '%';
    if (text) text.textContent = pct + '%';
  }

  function updateCurrent(text) {
    const el = document.getElementById('scan-current');
    if (el) el.textContent = text;
  }

  return { render, init };
})();
