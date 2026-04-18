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
        <h2>CloudFinOps</h2>
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

      // Separate finding types
      const costUsage = allFindings.filter(f => f.finding_type === 'COST_USAGE');
      const costOpt = allFindings.filter(f => f.finding_type === 'COST_OPTIMIZATION');
      const riFindings = allFindings.filter(f => f.finding_type === 'RI_RECOMMENDATION');
      const spFindings = allFindings.filter(f => f.finding_type === 'SP_RECOMMENDATION');
      const regularCostFindings = allFindings.filter(f =>
        (f.pillar === 'Cost Optimization' || f.pillar === 'Performance Efficiency') && !f.finding_type
      );

      const hasCostData = costUsage.length > 0 || costOpt.length > 0 || riFindings.length > 0 || spFindings.length > 0 || regularCostFindings.length > 0;
      if (!hasCostData) { showEmpty(); return; }

      renderContent(allFindings, costUsage, costOpt, riFindings, spFindings, regularCostFindings);
      createCharts(costOpt.concat(riFindings).concat(spFindings).concat(regularCostFindings));
    } catch (err) {
      showEmpty();
    }
  }

  function showEmpty() {
    document.getElementById('cost-loading')?.classList.add('hidden');
    document.getElementById('cost-empty')?.classList.remove('hidden');
    document.getElementById('cost-content')?.classList.add('hidden');
  }

  function renderContent(allFindings, costUsage, costOpt, riFindings, spFindings, regularCostFindings) {
    document.getElementById('cost-loading')?.classList.add('hidden');
    document.getElementById('cost-empty')?.classList.add('hidden');
    const el = document.getElementById('cost-content');
    if (!el) return;
    el.classList.remove('hidden');

    // Actual spend data
    const usageData = costUsage[0] || {};
    const totalSpend = usageData.totalSpend || 0;
    const serviceBreakdown = usageData.serviceBreakdown || [];
    const period = usageData.period || {};

    // RI/SP savings
    const riSavings = riFindings.reduce((s, f) => s + (f.monthlySavings || 0), 0);
    const spSavings = spFindings.reduce((s, f) => s + (f.monthlySavings || 0), 0);
    const totalSavings = riSavings + spSavings;

    // All cost findings for action table
    const allCost = costOpt.concat(riFindings).concat(spFindings).concat(regularCostFindings);
    const critical = allCost.filter(f => f.severity === 'CRITICAL').length;
    const high = allCost.filter(f => f.severity === 'HIGH').length;

    el.innerHTML = `
      ${totalSpend > 0 ? `
      <div class="card mb-24" style="background:linear-gradient(135deg, rgba(201,100,66,0.06), rgba(45,125,70,0.06));">
        <h3 style="margin-bottom:12px;">Actual Monthly Spend</h3>
        <p style="font-size:2.2rem; font-weight:600; color:var(--text-primary);">$${totalSpend.toFixed(2)}<span style="font-size:1rem; font-weight:400; color:var(--text-secondary);">/month</span></p>
        <p class="text-secondary" style="font-size:0.82rem;">Period: ${period.start || '?'} to ${period.end || '?'} (unblended cost)</p>
      </div>

      <div class="card mb-24">
        <h3 style="margin-bottom:12px;">Spend by Service</h3>
        <div class="table-wrapper"><table>
          <thead><tr><th>Service</th><th style="text-align:right;">Monthly Cost</th><th style="text-align:right;">% of Total</th><th>Optimization Tip</th></tr></thead>
          <tbody>
            ${serviceBreakdown.slice(0, 15).map(s => {
              const pct = totalSpend > 0 ? ((s.amount / totalSpend) * 100).toFixed(1) : '0';
              return `<tr>
                <td style="font-weight:500;">${costSimplifyName(s.service)}</td>
                <td style="text-align:right; font-family:var(--font-mono);">$${s.amount.toFixed(2)}</td>
                <td style="text-align:right;">${pct}%</td>
                <td style="font-size:0.82rem; color:var(--text-secondary);">${costOptimizationTip(s.service)}</td>
              </tr>`;
            }).join('')}
          </tbody>
          <tfoot><tr style="font-weight:600;">
            <td>Total</td>
            <td style="text-align:right; font-family:var(--font-mono);">$${totalSpend.toFixed(2)}</td>
            <td style="text-align:right;">100%</td>
            <td></td>
          </tr></tfoot>
        </table></div>
      </div>` : ''}

      <div class="card-grid" style="grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); margin-bottom:24px;">
        ${totalSpend > 0 ? `<div class="card" style="text-align:center;">
          <p class="text-secondary" style="font-size:0.82rem;">Actual Spend</p>
          <p style="font-size:1.4rem; font-weight:500;">$${totalSpend.toFixed(2)}</p>
        </div>` : ''}
        <div class="card" style="text-align:center;">
          <p class="text-secondary" style="font-size:0.82rem;">RI Savings</p>
          <p style="font-size:1.4rem; font-weight:500; color:var(--color-success);">${riFindings.length > 0 ? '$' + riSavings.toFixed(2) + '/mo' : 'N/A'}</p>
          <p class="text-secondary" style="font-size:0.72rem;">${riFindings.length} recommendations</p>
        </div>
        <div class="card" style="text-align:center;">
          <p class="text-secondary" style="font-size:0.82rem;">SP Savings</p>
          <p style="font-size:1.4rem; font-weight:500; color:var(--color-success);">${spFindings.length > 0 ? '$' + spSavings.toFixed(2) + '/mo' : 'N/A'}</p>
          <p class="text-secondary" style="font-size:0.72rem;">${spFindings.length} recommendations</p>
        </div>
        ${totalSavings > 0 ? `<div class="card" style="text-align:center; border-color:var(--color-success);">
          <p class="text-secondary" style="font-size:0.82rem;">Total Potential Savings</p>
          <p style="font-size:1.4rem; font-weight:600; color:var(--color-success);">$${totalSavings.toFixed(2)}/mo</p>
          ${totalSpend > 0 ? `<p class="text-secondary" style="font-size:0.72rem;">${((totalSavings / totalSpend) * 100).toFixed(1)}% of spend</p>` : ''}
        </div>` : ''}
        <div class="card" style="text-align:center;">
          <p class="text-secondary" style="font-size:0.82rem;">Critical + High</p>
          <p style="font-size:1.4rem; font-weight:500; color:var(--color-error);">${critical + high}</p>
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

      ${riFindings.length > 0 ? renderRISection(riFindings) : ''}
      ${spFindings.length > 0 ? renderSPSection(spFindings) : ''}

      ${allCost.length > 0 ? `
      <div class="card mb-24">
        <h3 style="margin-bottom:12px;">Recommended Actions</h3>
        <p class="text-secondary mb-16" style="font-size:0.88rem;">จัดลำดับตาม severity — แก้ไข Critical และ High ก่อน</p>
        <div class="table-wrapper">
          <table>
            <thead><tr><th>#</th><th>Severity</th><th>Service</th><th>Resource</th><th>Issue</th><th>Recommendation</th></tr></thead>
            <tbody>
              ${allCost
                .sort((a, b) => severityOrder(a.severity) - severityOrder(b.severity))
                .map((f, i) => `<tr>
                  <td style="font-weight:500;">${i + 1}</td>
                  <td><span class="badge ${severityBadgeClass(f.severity)}">${f.severity}</span></td>
                  <td>${f.service || ''}</td>
                  <td style="font-family:var(--font-mono); font-size:0.82rem; max-width:200px; overflow:hidden; text-overflow:ellipsis;">${f.resource_id || ''}</td>
                  <td style="font-size:0.88rem;">${f.title || ''}</td>
                  <td style="font-size:0.88rem;">${f.recommendation || ''}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>` : ''}
    `;
  }

  function costSimplifyName(n) {
    const m = { 'Amazon Elastic Compute Cloud - Compute': 'EC2', 'Amazon Simple Storage Service': 'S3', 'Amazon Relational Database Service': 'RDS', 'Amazon DynamoDB': 'DynamoDB', 'AWS Lambda': 'Lambda', 'Amazon CloudFront': 'CloudFront', 'Elastic Load Balancing': 'ELB', 'Amazon CloudWatch': 'CloudWatch', 'Amazon API Gateway': 'API Gateway', 'AWS Data Transfer': 'Data Transfer' };
    return m[n] || n.replace(/^Amazon\s+/, '').replace(/^AWS\s+/, '');
  }

  function costOptimizationTip(n) {
    const l = (n || '').toLowerCase();
    if (l.includes('ec2') || l.includes('compute')) return 'Right-size, use RI/SP/Spot';
    if (l.includes('rds')) return 'Use RI, review Multi-AZ';
    if (l.includes('s3')) return 'Lifecycle policies, Intelligent-Tiering';
    if (l.includes('lambda')) return 'Optimize memory';
    if (l.includes('dynamodb')) return 'On-demand vs provisioned';
    if (l.includes('nat')) return 'VPC endpoints';
    return '';
  }

  function renderRISection(riFindings) {
    const totalSavings = riFindings.reduce((s, f) => s + (f.monthlySavings || 0), 0);
    return `<div class="card mb-24">
      <div class="flex-between mb-16">
        <h3>Reserved Instance Recommendations</h3>
        <span class="badge badge-high" style="font-size:0.88rem;">~$${totalSavings.toFixed(2)}/mo savings</span>
      </div>
      <p class="text-secondary mb-16" style="font-size:0.88rem;">Based on your usage patterns. RI purchases provide significant discounts for steady-state workloads.</p>
      <div class="table-wrapper"><table>
        <thead><tr><th>Service</th><th>Resource</th><th>Account</th><th>Term</th><th>Est. Monthly Savings</th><th>Recommendation</th></tr></thead>
        <tbody>
          ${riFindings.map(f => `<tr>
            <td>${f.service}</td>
            <td style="font-family:var(--font-mono); font-size:0.82rem;">${f.resource_id || ''}</td>
            <td style="font-size:0.82rem;">${f.account_id || ''}</td>
            <td>${f.term || '1 Year'}</td>
            <td style="color:var(--color-success); font-weight:500;">$${(f.monthlySavings || 0).toFixed(2)}</td>
            <td style="font-size:0.88rem;">${f.recommendation || ''}</td>
          </tr>`).join('')}
        </tbody>
      </table></div>
    </div>`;
  }

  function renderSPSection(spFindings) {
    const totalSavings = spFindings.reduce((s, f) => s + (f.monthlySavings || 0), 0);
    return `<div class="card mb-24">
      <div class="flex-between mb-16">
        <h3>Savings Plan Recommendations</h3>
        <span class="badge badge-high" style="font-size:0.88rem;">~$${totalSavings.toFixed(2)}/mo savings</span>
      </div>
      <p class="text-secondary mb-16" style="font-size:0.88rem;">Savings Plans offer flexible pricing in exchange for a commitment to consistent usage.</p>
      <div class="table-wrapper"><table>
        <thead><tr><th>Plan Type</th><th>Account</th><th>Term</th><th>Est. Monthly Savings</th><th>Recommendation</th></tr></thead>
        <tbody>
          ${spFindings.map(f => `<tr>
            <td style="font-weight:500;">${f.resource_id || 'Compute SP'}</td>
            <td style="font-size:0.82rem;">${f.account_id || ''}</td>
            <td>${f.term || '1 Year'}</td>
            <td style="color:var(--color-success); font-weight:500;">$${(f.monthlySavings || 0).toFixed(2)}</td>
            <td style="font-size:0.88rem;">${f.recommendation || ''}</td>
          </tr>`).join('')}
        </tbody>
      </table></div>
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
