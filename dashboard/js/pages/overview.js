/* ============================================
   WA Review Tool — Overview Page
   Radar chart, doughnut chart, stacked bar,
   account summary cards
   ============================================ */

const OverviewPage = (() => {
  let radarChart = null;
  let doughnutChart = null;
  let heatmapChart = null;

  let pillarScores = {};
  let severityCounts = {};
  let heatmapData = { services: [], pillars: [], values: [] };
  let accountSummaries = [];

  const severityColors = {
    CRITICAL: '#b53333',
    HIGH: '#d97757',
    MEDIUM: '#b8860b',
    LOW: '#2d7d46',
    INFORMATIONAL: '#5e5d59',
  };

  // --- Render ---
  function render() {
    return `
      <div class="page-header">
        <h2>ภาพรวม Well-Architected Review</h2>
        <p>สรุปผลการตรวจสอบตาม 5 เสาหลักของ AWS Well-Architected Framework</p>
      </div>

      <div id="overview-loading" class="card mb-24" style="text-align:center; padding:48px;">
        <p class="text-secondary">กำลังโหลดข้อมูล...</p>
      </div>

      <div id="overview-empty" class="card mb-24 hidden" style="text-align:center; padding:48px;">
        <p class="text-secondary">ยังไม่มีข้อมูลการสแกน กรุณาเพิ่ม Account และเริ่มการสแกนก่อน</p>
      </div>

      <div id="overview-content" class="hidden">
        <div class="card-grid" style="grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));">
          <div class="card">
            <h3 style="margin-bottom: 12px;">คะแนนตาม Pillar</h3>
            <div class="chart-container" style="max-width:340px;">
              <canvas id="radar-chart"></canvas>
            </div>
          </div>
          <div class="card">
            <h3 style="margin-bottom: 12px;">การกระจายตาม Severity</h3>
            <div class="chart-container" style="max-width:340px;">
              <canvas id="doughnut-chart"></canvas>
            </div>
          </div>
        </div>

        <div class="card mb-24">
          <h3 style="margin-bottom: 12px;">Heatmap: Service × Pillar</h3>
          <div style="position:relative; width:100%; max-width:700px;">
            <canvas id="heatmap-chart"></canvas>
          </div>
        </div>

        <h3 style="margin-bottom: 12px;">Account Summary</h3>
        <div id="account-cards" class="card-grid"></div>
      </div>
    `;
  }

  function renderAccountCard(acct) {
    const total = (acct.critical||0) + (acct.high||0) + (acct.medium||0) + (acct.low||0) + (acct.info||0);
    return `
      <div class="card">
        <div class="flex-between mb-16">
          <div>
            <h4>${acct.alias || acct.id}</h4>
            <span class="text-secondary" style="font-size:0.82rem;">${acct.id}</span>
          </div>
          <span style="font-size:1.5rem; font-weight:500;">${total}</span>
        </div>
        <div class="flex gap-8" style="flex-wrap:wrap;">
          <span class="badge badge-critical">${acct.critical||0} Critical</span>
          <span class="badge badge-high">${acct.high||0} High</span>
          <span class="badge badge-medium">${acct.medium||0} Medium</span>
          <span class="badge badge-low">${acct.low||0} Low</span>
          <span class="badge badge-info">${acct.info||0} Info</span>
        </div>
      </div>
    `;
  }

  // --- Init ---
  async function init() {
    destroyCharts();
    try {
      const data = await ApiClient.get('/scans/latest/results');
      if (!data || !data.findings || data.findings.length === 0) {
        showEmpty();
        return;
      }
      processData(data);
      showContent();
      createRadarChart();
      createDoughnutChart();
      createHeatmapChart();
    } catch (err) {
      showEmpty();
    }
  }

  function processData(data) {
    const findings = data.findings || [];
    const accounts = data.accounts || [];

    // Pillar scores
    const pillarMap = {};
    const pillarTotal = {};
    findings.forEach(f => {
      const p = f.pillar || 'Unknown';
      pillarMap[p] = (pillarMap[p] || 0) + 1;
      pillarTotal[p] = (pillarTotal[p] || 0) + 1;
    });
    const allPillars = ['Security', 'Reliability', 'Operational Excellence', 'Performance Efficiency', 'Cost Optimization'];
    pillarScores = {};
    allPillars.forEach(p => {
      const count = pillarMap[p] || 0;
      pillarScores[p] = Math.max(0, 100 - count * 5);
    });

    // Severity counts
    severityCounts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFORMATIONAL: 0 };
    findings.forEach(f => {
      const s = (f.severity || '').toUpperCase();
      if (s in severityCounts) severityCounts[s]++;
    });

    // Heatmap
    const serviceSet = new Set();
    findings.forEach(f => serviceSet.add(f.service || 'Unknown'));
    const services = [...serviceSet].sort();
    const pillarList = ['Security', 'Reliability', 'Ops Excellence', 'Performance', 'Cost'];
    const pillarKeyMap = { 'Security': 'Security', 'Reliability': 'Reliability', 'Ops Excellence': 'Operational Excellence', 'Performance': 'Performance Efficiency', 'Cost': 'Cost Optimization' };
    const values = services.map(svc => pillarList.map(p => findings.filter(f => f.service === svc && f.pillar === pillarKeyMap[p]).length));
    heatmapData = { services, pillars: pillarList, values };

    // Account summaries
    accountSummaries = accounts.length > 0 ? accounts : [];
    if (accountSummaries.length === 0) {
      const acctMap = {};
      findings.forEach(f => {
        const a = f.account_id || f.account || 'unknown';
        if (!acctMap[a]) acctMap[a] = { id: a, alias: a, critical: 0, high: 0, medium: 0, low: 0, info: 0 };
        const s = (f.severity || '').toUpperCase();
        if (s === 'CRITICAL') acctMap[a].critical++;
        else if (s === 'HIGH') acctMap[a].high++;
        else if (s === 'MEDIUM') acctMap[a].medium++;
        else if (s === 'LOW') acctMap[a].low++;
        else acctMap[a].info++;
      });
      accountSummaries = Object.values(acctMap);
    }

    const cardsEl = document.getElementById('account-cards');
    if (cardsEl) cardsEl.innerHTML = accountSummaries.map(renderAccountCard).join('');
  }

  function showEmpty() {
    const loading = document.getElementById('overview-loading');
    const empty = document.getElementById('overview-empty');
    const content = document.getElementById('overview-content');
    if (loading) loading.classList.add('hidden');
    if (empty) empty.classList.remove('hidden');
    if (content) content.classList.add('hidden');
  }

  function showContent() {
    const loading = document.getElementById('overview-loading');
    const empty = document.getElementById('overview-empty');
    const content = document.getElementById('overview-content');
    if (loading) loading.classList.add('hidden');
    if (empty) empty.classList.add('hidden');
    if (content) content.classList.remove('hidden');
  }

  function destroyCharts() {
    if (radarChart) { radarChart.destroy(); radarChart = null; }
    if (doughnutChart) { doughnutChart.destroy(); doughnutChart = null; }
    if (heatmapChart) { heatmapChart.destroy(); heatmapChart = null; }
  }

  function createRadarChart() {
    const ctx = document.getElementById('radar-chart');
    if (!ctx) return;
    radarChart = new Chart(ctx, {
      type: 'radar',
      data: {
        labels: Object.keys(pillarScores),
        datasets: [{ label: 'Pillar Score', data: Object.values(pillarScores), backgroundColor: 'rgba(201, 100, 66, 0.2)', borderColor: '#c96442', borderWidth: 2, pointBackgroundColor: '#c96442', pointRadius: 4 }],
      },
      options: { responsive: true, scales: { r: { beginAtZero: true, max: 100, ticks: { stepSize: 20, font: { size: 11 } }, pointLabels: { font: { size: 12 } } } }, plugins: { legend: { display: false } } },
    });
  }

  function createDoughnutChart() {
    const ctx = document.getElementById('doughnut-chart');
    if (!ctx) return;
    const labels = Object.keys(severityCounts);
    const data = Object.values(severityCounts);
    doughnutChart = new Chart(ctx, {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: labels.map(l => severityColors[l]), borderWidth: 2, borderColor: 'var(--bg-card)' }] },
      options: { responsive: true, cutout: '55%', plugins: { legend: { position: 'bottom', labels: { padding: 12, font: { size: 12 } } } } },
    });
  }

  function createHeatmapChart() {
    const ctx = document.getElementById('heatmap-chart');
    if (!ctx || heatmapData.services.length === 0) return;
    const pillarColors = ['#c96442', '#d97757', '#b8860b', '#2d7d46', '#5e5d59'];
    const datasets = heatmapData.pillars.map((pillar, i) => ({ label: pillar, data: heatmapData.values.map(row => row[i]), backgroundColor: pillarColors[i] }));
    heatmapChart = new Chart(ctx, {
      type: 'bar',
      data: { labels: heatmapData.services, datasets },
      options: { responsive: true, indexAxis: 'y', scales: { x: { stacked: true, title: { display: true, text: 'จำนวน Findings' }, ticks: { stepSize: 1 } }, y: { stacked: true } }, plugins: { legend: { position: 'bottom', labels: { padding: 12, font: { size: 11 } } } } },
    });
  }

  return { render, init };
})();
