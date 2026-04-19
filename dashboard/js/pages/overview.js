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
        <!-- Total Summary Banner -->
        <div id="total-banner" class="card mb-24" style="padding:20px 24px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:16px;"></div>

        <!-- Severity Summary Cards -->
        <div id="severity-cards" class="card-grid" style="grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); margin-bottom:24px;"></div>

        <!-- Top Issues (quick glance) -->
        <div id="top-issues" class="card mb-24 hidden"></div>

        <!-- Pillar Cards with severity breakdown -->
        <h3 style="margin-bottom:12px;">Well-Architected Pillars</h3>
        <div id="pillar-cards" class="card-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); margin-bottom:24px;"></div>

        <!-- Charts side by side -->
        <h3 style="margin-bottom:12px;">Compliance Overview</h3>
        <div id="compliance-summary" class="card-grid" style="grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); margin-bottom:24px;"></div>

        <div class="card-grid" style="grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); margin-bottom:24px;">
          <div class="card">
            <h3 style="margin-bottom:12px;">Pillar Score</h3>
            <div class="chart-container" style="max-width:300px;">
              <canvas id="radar-chart"></canvas>
            </div>
          </div>
          <div class="card">
            <h3 style="margin-bottom:12px;">Severity Distribution</h3>
            <div class="chart-container" style="max-width:300px;">
              <canvas id="doughnut-chart"></canvas>
            </div>
          </div>
        </div>

        <!-- Heatmap -->
        <div class="card mb-24">
          <h3 style="margin-bottom:12px;">Service x Pillar Heatmap</h3>
          <div style="position:relative; width:100%; max-width:700px;">
            <canvas id="heatmap-chart"></canvas>
          </div>
        </div>

        <!-- Services -->
        <h3 style="margin-bottom:12px;">Services Scanned</h3>
        <div id="service-links" class="card-grid" style="grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); margin-bottom:24px;"></div>

        <!-- Account Summary -->
        <h3 style="margin-bottom:12px;">Account Summary</h3>
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
      // Get latest scan from history, then fetch its results
      const historyData = await ApiClient.get('/scans');
      const scans = (historyData && historyData.scans) || [];
      if (!scans.length) { showEmpty(); return; }

      // Find latest completed scan
      const latest = scans.find(s => s.status === 'COMPLETED') || scans[0];
      const scanId = latest.scanId || latest.scan_id;
      if (!scanId) { showEmpty(); return; }

      const data = await ApiClient.get('/scans/' + scanId + '/results');
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

    // Severity counts
    severityCounts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFORMATIONAL: 0 };
    findings.forEach(f => {
      const s = (f.severity || '').toUpperCase();
      if (s in severityCounts) severityCounts[s]++;
    });
    const totalFindings = findings.length;

    // Total Summary Banner
    const bannerEl = document.getElementById('total-banner');
    if (bannerEl) {
      const critHigh = (severityCounts.CRITICAL || 0) + (severityCounts.HIGH || 0);
      const scanDate = data.createdAt || '';
      const numServices = new Set(findings.map(f => f.service)).size;
      const numRegions = new Set(findings.map(f => f.region)).size;
      const numAccounts = new Set(findings.map(f => f.account_id || f.account).filter(Boolean)).size;
      bannerEl.innerHTML = `
        <div>
          <p style="font-size:2rem; font-weight:600; line-height:1;">${totalFindings}</p>
          <p class="text-secondary" style="font-size:0.82rem;">Total Findings</p>
        </div>
        <div style="display:flex; gap:24px; flex-wrap:wrap;">
          <div style="text-align:center;"><p style="font-size:1.2rem; font-weight:600; color:var(--color-error);">${critHigh}</p><p class="text-secondary" style="font-size:0.72rem;">Critical + High</p></div>
          <div style="text-align:center;"><p style="font-size:1.2rem; font-weight:600;">${numServices}</p><p class="text-secondary" style="font-size:0.72rem;">Services</p></div>
          <div style="text-align:center;"><p style="font-size:1.2rem; font-weight:600;">${numRegions}</p><p class="text-secondary" style="font-size:0.72rem;">Regions</p></div>
          <div style="text-align:center;"><p style="font-size:1.2rem; font-weight:600;">${numAccounts}</p><p class="text-secondary" style="font-size:0.72rem;">Accounts</p></div>
        </div>
        ${scanDate ? `<p class="text-secondary" style="font-size:0.75rem;">Last scan: ${scanDate}</p>` : ''}
      `;
    }

    // Severity summary cards
    const sevCardsEl = document.getElementById('severity-cards');
    if (sevCardsEl) {
      const sevColors = { CRITICAL: '#b53333', HIGH: '#d97757', MEDIUM: '#b8860b', LOW: '#2d7d46', INFORMATIONAL: '#5e5d59' };
      sevCardsEl.innerHTML = Object.entries(severityCounts)
        .filter(([, v]) => v > 0)
        .map(([sev, count]) => `
          <div class="card" style="text-align:center; border-top:3px solid ${sevColors[sev]}; padding:16px;">
            <span class="badge" style="background:${sevColors[sev]}; color:#fff;">${sev}</span>
            <p style="font-size:1.8rem; font-weight:600; margin:4px 0;">${count}</p>
            <p class="text-secondary" style="font-size:0.78rem;">(${totalFindings > 0 ? Math.round(count/totalFindings*100) : 0}%)</p>
          </div>
        `).join('');
    }

    // Top Issues — show top 5 critical/high findings for quick glance
    const topIssuesEl = document.getElementById('top-issues');
    if (topIssuesEl) {
      const critHighFindings = findings
        .filter(f => f.severity === 'CRITICAL' || f.severity === 'HIGH')
        .slice(0, 5);
      if (critHighFindings.length > 0) {
        topIssuesEl.classList.remove('hidden');
        topIssuesEl.innerHTML = `
          <h3 style="margin-bottom:12px;">Top Issues to Address</h3>
          <div class="table-wrapper"><table>
            <thead><tr><th style="width:80px;">Severity</th><th>Service</th><th>Issue</th><th>Resource</th></tr></thead>
            <tbody>
              ${critHighFindings.map(f => `<tr>
                <td><span class="badge ${f.severity === 'CRITICAL' ? 'badge-critical' : 'badge-high'}">${f.severity}</span></td>
                <td>${f.service || ''}</td>
                <td style="font-size:0.88rem;">${f.title || ''}</td>
                <td style="font-family:var(--font-mono); font-size:0.78rem; max-width:150px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${f.resource_id || ''}</td>
              </tr>`).join('')}
            </tbody>
          </table></div>
          ${findings.filter(f => f.severity === 'CRITICAL' || f.severity === 'HIGH').length > 5 ? `<p class="text-secondary mt-8" style="font-size:0.82rem;"><a href="#findings">View all ${findings.filter(f => f.severity === 'CRITICAL' || f.severity === 'HIGH').length} critical/high findings →</a></p>` : ''}
        `;
      }
    }

    // Pillar scores + cards
    const pillarMap = {};
    findings.forEach(f => {
      const p = f.pillar || 'Unknown';
      if (!pillarMap[p]) pillarMap[p] = { total: 0, CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFORMATIONAL: 0 };
      pillarMap[p].total++;
      const s = (f.severity || '').toUpperCase();
      if (s in pillarMap[p]) pillarMap[p][s]++;
    });

    const allPillars = ['Security', 'Reliability', 'Operational Excellence', 'Performance Efficiency', 'Cost Optimization'];
    pillarScores = {};
    allPillars.forEach(p => {
      const count = pillarMap[p]?.total || 0;
      pillarScores[p] = Math.max(0, 100 - count * 5);
    });

    // Render pillar cards with severity breakdown
    const pillarCardsEl = document.getElementById('pillar-cards');
    if (pillarCardsEl) {
      const pillarColors = { Security: '#DD344C', Reliability: '#3334B9', 'Operational Excellence': '#3F8624', 'Performance Efficiency': '#8C4FFF', 'Cost Optimization': '#ED7100' };
      pillarCardsEl.innerHTML = allPillars.map(p => {
        const d = pillarMap[p] || { total: 0, CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFORMATIONAL: 0 };
        return `
          <div class="card" style="border-top:3px solid ${pillarColors[p] || '#999'}; padding:16px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
              <span style="font-size:1.4rem; font-weight:600;">${d.total}</span>
              <span style="font-size:0.82rem; font-weight:500;">${p}</span>
            </div>
            <div style="display:flex; gap:4px; font-size:0.72rem;">
              ${d.CRITICAL ? `<span class="badge badge-critical">${d.CRITICAL}</span>` : ''}
              ${d.HIGH ? `<span class="badge badge-high">${d.HIGH}</span>` : ''}
              ${d.MEDIUM ? `<span class="badge badge-medium">${d.MEDIUM}</span>` : ''}
              ${d.LOW ? `<span class="badge badge-low">${d.LOW}</span>` : ''}
              ${d.INFORMATIONAL ? `<span class="badge badge-info">${d.INFORMATIONAL}</span>` : ''}
            </div>
          </div>
        `;
      }).join('');
    }

    // Compliance summary — evaluate frameworks against findings
    const compSummaryEl = document.getElementById('compliance-summary');
    if (compSummaryEl) {
      const fwDefs = [
        { id: 'wafs', name: 'Well-Architected', color: '#2d7d46', checks: ['iam-001','iam-002','iam-003','cloudtrail-001','cloudtrail-002','cloudtrail-003','vpc-001','ec2-001','vpc-002','vpc-003','s3-002','rds-002','ec2-002','kms-001','cloudfront-001','elb-002','s3-001','cloudtrail-004','kms-002'] },
        { id: 'cis', name: 'CIS AWS', color: '#c96442', checks: ['iam-001','iam-003','cloudtrail-001','cloudtrail-002','cloudtrail-003','config-001','vpc-001','vpc-002','vpc-003','ec2-002','kms-001','s3-001','rds-002'] },
        { id: 'spip', name: 'AWS SPIP', color: '#ED7100', checks: ['iam-001','iam-002','iam-003','s3-001','s3-002','ec2-002','rds-002','cloudfront-001','elb-002','ec2-001','vpc-002','vpc-003','vpc-001','cloudtrail-001','cloudtrail-003','cloudwatch-001','config-001','kms-001','kms-002'] },
        { id: 'nist', name: 'NIST CSF', color: '#3334B9', checks: ['iam-001','iam-002','iam-003','s3-002','rds-002','ec2-002','cloudfront-001','elb-002','cloudtrail-001','cloudtrail-003','vpc-001','cloudwatch-001','rds-001'] },
        { id: 'soc2', name: 'SOC 2', color: '#DD344C', checks: ['iam-001','iam-002','iam-003','vpc-002','ec2-001','vpc-001','vpc-003','cloudfront-001','elb-002','cloudtrail-001','cloudwatch-001','config-001','s3-001','s3-002','rds-002','kms-001'] },
        { id: 'ftr', name: 'FTR', color: '#ED7100', checks: ['iam-001','iam-002','iam-003','s3-002','rds-002','ec2-002','kms-001','cloudfront-001','elb-002','ec2-001','vpc-002','vpc-003','cloudtrail-001','cloudtrail-003','vpc-001','cloudwatch-001','guardduty-001','config-001','s3-001','rds-001','ec2-003'] },
        { id: 'ssb', name: 'Startup Baseline', color: '#3F8624', checks: ['iam-001','iam-002','iam-003','cloudtrail-001','cloudtrail-002','cloudtrail-003','vpc-001','cloudwatch-001','config-001','guardduty-001','ec2-001','vpc-002','vpc-003','cloudfront-001','elb-002','s3-002','rds-002','ec2-002','s3-001','kms-001','rds-001'] },
      ];
      const scannedServices = new Set(findings.map(f => (f.service || '').toLowerCase()));
      const findingCheckIds = new Set(findings.map(f => f.check_id).filter(Boolean));

      compSummaryEl.innerHTML = fwDefs.map(fw => {
        const uniqueChecks = [...new Set(fw.checks)];
        let pass = 0, fail = 0, na = 0;
        uniqueChecks.forEach(cid => {
          if (findingCheckIds.has(cid)) { fail++; }
          else {
            const prefix = cid.split('-')[0];
            if (scannedServices.has(prefix)) { pass++; } else { na++; }
          }
        });
        const total = pass + fail;
        const pct = total > 0 ? Math.round((pass / total) * 100) : 0;
        return `
          <a href="#compliance" class="card" style="text-decoration:none; color:inherit; border-top:3px solid ${fw.color}; padding:12px; text-align:center; cursor:pointer;">
            <p style="font-size:1.4rem; font-weight:600; color:${pct >= 70 ? 'var(--color-success)' : pct >= 40 ? 'var(--color-warning)' : 'var(--color-error)'};">${pct}%</p>
            <p style="font-size:0.78rem; font-weight:500;">${fw.name}</p>
            <div style="margin-top:4px; display:flex; gap:3px; justify-content:center; font-size:0.68rem;">
              <span class="badge badge-low" style="padding:1px 4px;">${pass}</span>
              <span class="badge badge-critical" style="padding:1px 4px;">${fail}</span>
            </div>
          </a>
        `;
      }).join('');
    }

    // Heatmap data
    const serviceSet = new Set();
    findings.forEach(f => serviceSet.add(f.service || 'Unknown'));
    const services = [...serviceSet].sort();
    const pillarList = ['Security', 'Reliability', 'Ops Excellence', 'Performance', 'Cost'];
    const pillarKeyMap = { 'Security': 'Security', 'Reliability': 'Reliability', 'Ops Excellence': 'Operational Excellence', 'Performance': 'Performance Efficiency', 'Cost': 'Cost Optimization' };
    const values = services.map(svc => pillarList.map(p => findings.filter(f => f.service === svc && f.pillar === pillarKeyMap[p]).length));
    heatmapData = { services, pillars: pillarList, values };

    // Service links (clickable → service detail page)
    const serviceLinksEl = document.getElementById('service-links');
    if (serviceLinksEl) {
      const svcCounts = {};
      findings.forEach(f => { const s = f.service || 'Unknown'; svcCounts[s] = (svcCounts[s] || 0) + 1; });
      serviceLinksEl.innerHTML = Object.entries(svcCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([svc, count]) => `
          <a href="#service/${svc.toLowerCase()}" class="card" style="text-decoration:none; color:inherit; padding:16px; text-align:center; cursor:pointer; transition:box-shadow 0.15s;">
            <p style="font-size:1.2rem; font-weight:600;">${count}</p>
            <p style="font-size:0.88rem; font-weight:500;">${svc}</p>
            <p class="text-secondary" style="font-size:0.72rem;">Click to view details →</p>
          </a>
        `).join('');
    }

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
