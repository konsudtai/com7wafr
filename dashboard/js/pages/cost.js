/* ============================================
   WA Review Tool — Cost Advisor Page
   Cost optimization findings from scan results
   ============================================ */

const CostPage = (() => {
  let severityChart = null;
  let serviceChart = null;

  function fmt(n) { return '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  function severityBadgeClass(s) {
    const map = { CRITICAL: 'badge-critical', HIGH: 'badge-high', MEDIUM: 'badge-medium', LOW: 'badge-low', INFORMATIONAL: 'badge-info' };
    return map[s] || 'badge-info';
  }

  function render() {
    return `
      <div class="page-header">
        <h2>Cost Advisor</h2>
        <p>คำแนะนำการลดค่าใช้จ่าย AWS จากผลการสแกน Well-Architected Review</p>
      </div>

      <div id="cost-loading" class="card mb-24" style="text-align:center; padding:48px;">
        <p class="text-secondary">กำลังโหลดข้อมูล...</p>
      </div>

      <div id="cost-empty" class="card mb-24 hidden" style="text-align:center; padding:48px;">
        <p class="text-secondary">ยังไม่มีข้อมูล cost findings — กรุณาเริ่มการสแกนก่อน</p>
      </div>

      <div id="cost-content" class="hidden"></div>
    `;
  }

  async function init() {
    destroyCharts();
    try {
      // Get latest completed scan
      const historyData = await ApiClient.get('/scans');
      const scans = (historyData && historyData.scans) || [];
      if (!scans.length) { showEmpty(); return; }

      const latest = scans.find(s => s.status === 'COMPLETED') || scans[0];
      const scanId = latest.scanId || latest.scan_id;
      if (!scanId) { showEmpty(); return; }

      const data = await ApiClient.get('/scans/' + scanId + '/results');
      const allFindings = (data && data.findings) || [];
      if (allFindings.length === 0) { showEmpty(); return; }

      // Filter cost-related findings (Cost Optimization pillar + Performance Efficiency for right-sizing)
      const costFindings = allFindings.filter(f =>
        f.pillar === 'Cost Optimization' || f.pillar === 'Performance Efficiency'
      );

      if (costFindings.length === 0) { showEmpty(); return; }

      renderContent(allFindings, costFindings, scanId);
      createCharts(costFindings);
    } catch (err) {
      showEmpty();
    }
  }

  function showEmpty() {
    document.getElementById('cost-loading')?.classList.add('hidden');
    document.getElementById('cost-empty')?.classList.remove('hidden');
    document.getElementById('cost-content')?.classList.add('hidden');
  }

  function renderContent(allFindings, costFindings, scanId) {
    document.getElementById('cost-loading')?.classList.add('hidden');
    document.getElementById('cost-empty')?.classList.add('hidden');
    const el = document.getElementById('cost-content');
    if (!el) return;
    el.classList.remove('hidden');

    // Summary stats
    const totalAll = allFindings.length;
    const totalCost = costFindings.filter(f => f.pillar === 'Cost Optimization').length;
    const totalPerf = costFindings.filter(f => f.pillar === 'Performance Efficiency').length;
    const critical = costFindings.filter(f => f.severity === 'CRITICAL').length;
    const high = costFindings.filter(f => f.severity === 'HIGH').length;
    const medium = costFindings.filter(f => f.severity === 'MEDIUM').length;
    const low = costFindings.filter(f => f.severity === 'LOW').length;

    // Group by service
    const byService = {};
    costFindings.forEach(f => {
      const svc = f.service || 'Unknown';
      if (!byService[svc]) byService[svc] = [];
      byService[svc].push(f);
    });

    // Group by account
    const byAccount = {};
    costFindings.forEach(f => {
      const acct = f.account_id || f.account || 'Unknown';
      if (!byAccount[acct]) byAccount[acct] = [];
      byAccount[acct].push(f);
    });

    el.innerHTML = `
      <div class="card-grid" style="grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); margin-bottom:24px;">
        <div class="card" style="text-align:center;">
          <p class="text-secondary" style="font-size:0.82rem;">Cost Optimization Findings</p>
          <p style="font-size:1.6rem; font-weight:500; color:var(--color-terracotta);">${totalCost}</p>
        </div>
        <div class="card" style="text-align:center;">
          <p class="text-secondary" style="font-size:0.82rem;">Performance Findings</p>
          <p style="font-size:1.6rem; font-weight:500; color:var(--color-warning);">${totalPerf}</p>
        </div>
        <div class="card" style="text-align:center;">
          <p class="text-secondary" style="font-size:0.82rem;">Critical + High</p>
          <p style="font-size:1.6rem; font-weight:500; color:var(--color-error);">${critical + high}</p>
        </div>
        <div class="card" style="text-align:center;">
          <p class="text-secondary" style="font-size:0.82rem;">Services Affected</p>
          <p style="font-size:1.6rem; font-weight:500;">${Object.keys(byService).length}</p>
        </div>
      </div>

      <div class="card-grid" style="grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); margin-bottom:24px;">
        <div class="card">
          <h3 style="margin-bottom:12px;">Findings by Severity</h3>
          <div class="chart-container" style="max-width:300px;"><canvas id="cost-severity-chart"></canvas></div>
        </div>
        <div class="card">
          <h3 style="margin-bottom:12px;">Findings by Service</h3>
          <div class="chart-container" style="max-width:400px;"><canvas id="cost-service-chart"></canvas></div>
        </div>
      </div>

      ${renderAccountSections(byAccount)}

      <div class="card mb-24">
        <h3 style="margin-bottom:12px;">Recommended Actions</h3>
        <p class="text-secondary mb-16" style="font-size:0.88rem;">จัดลำดับตาม severity — แก้ไข Critical และ High ก่อน</p>
        <div class="table-wrapper">
          <table>
            <thead><tr><th>Priority</th><th>Severity</th><th>Service</th><th>Resource</th><th>Issue</th><th>Recommendation</th></tr></thead>
            <tbody>
              ${costFindings
                .sort((a, b) => severityOrder(a.severity) - severityOrder(b.severity))
                .map((f, i) => `<tr>
                  <td style="font-weight:500;">${i + 1}</td>
                  <td><span class="badge ${severityBadgeClass(f.severity)}">${f.severity}</span></td>
                  <td>${f.service || ''}</td>
                  <td style="font-family:var(--font-mono); font-size:0.82rem; max-width:200px; overflow:hidden; text-overflow:ellipsis;">${f.resource_id || f.resourceId || ''}</td>
                  <td style="font-size:0.88rem;">${f.title || ''}</td>
                  <td style="font-size:0.88rem;">${f.recommendation || ''}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderAccountSections(byAccount) {
    const accountIds = Object.keys(byAccount);
    if (accountIds.length <= 1) return '';

    return `<div class="card mb-24">
      <h3 style="margin-bottom:12px;">Findings by Account</h3>
      <div class="table-wrapper">
        <table>
          <thead><tr><th>Account</th><th>Total</th><th>Critical</th><th>High</th><th>Medium</th><th>Low</th></tr></thead>
          <tbody>
            ${accountIds.map(acct => {
              const items = byAccount[acct];
              return `<tr>
                <td style="font-family:var(--font-mono);">${acct}</td>
                <td>${items.length}</td>
                <td><span class="badge badge-critical">${items.filter(f => f.severity === 'CRITICAL').length}</span></td>
                <td><span class="badge badge-high">${items.filter(f => f.severity === 'HIGH').length}</span></td>
                <td><span class="badge badge-medium">${items.filter(f => f.severity === 'MEDIUM').length}</span></td>
                <td><span class="badge badge-low">${items.filter(f => f.severity === 'LOW').length}</span></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
  }

  function severityOrder(s) {
    const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFORMATIONAL: 4 };
    return order[s] ?? 5;
  }

  function destroyCharts() {
    if (severityChart) { severityChart.destroy(); severityChart = null; }
    if (serviceChart) { serviceChart.destroy(); serviceChart = null; }
  }

  function createCharts(costFindings) {
    // Severity doughnut
    const sevCtx = document.getElementById('cost-severity-chart');
    if (sevCtx) {
      const sevCounts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
      costFindings.forEach(f => { if (f.severity in sevCounts) sevCounts[f.severity]++; });
      const labels = Object.keys(sevCounts).filter(k => sevCounts[k] > 0);
      const colors = { CRITICAL: '#b53333', HIGH: '#d97757', MEDIUM: '#b8860b', LOW: '#2d7d46' };
      severityChart = new Chart(sevCtx, {
        type: 'doughnut',
        data: {
          labels,
          datasets: [{ data: labels.map(l => sevCounts[l]), backgroundColor: labels.map(l => colors[l]), borderWidth: 2, borderColor: 'var(--bg-card)' }],
        },
        options: { responsive: true, cutout: '55%', plugins: { legend: { position: 'bottom', labels: { padding: 12, font: { size: 11 } } } } },
      });
    }

    // Service bar chart
    const svcCtx = document.getElementById('cost-service-chart');
    if (svcCtx) {
      const byService = {};
      costFindings.forEach(f => { const s = f.service || 'Unknown'; byService[s] = (byService[s] || 0) + 1; });
      const svcLabels = Object.keys(byService).sort((a, b) => byService[b] - byService[a]);
      serviceChart = new Chart(svcCtx, {
        type: 'bar',
        data: {
          labels: svcLabels,
          datasets: [{ label: 'Findings', data: svcLabels.map(l => byService[l]), backgroundColor: '#c96442' }],
        },
        options: {
          responsive: true,
          indexAxis: 'y',
          scales: { x: { beginAtZero: true, ticks: { stepSize: 1 }, title: { display: true, text: 'จำนวน Findings' } } },
          plugins: { legend: { display: false } },
        },
      });
    }
  }

  return { render, init };
})();
