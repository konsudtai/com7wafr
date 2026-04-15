/* ============================================
   WA Review Tool — Cost Advisor Page
   Cost optimization recommendations based on
   scan findings, RI recommendations, Savings
   Plans, and Cost Optimization Hub insights.
   ============================================ */

// NOTE: Mock data below is for DEMO MODE only.
// In production, all data is fetched from the backend API via ApiClient.

const CostPage = (() => {

  let savingsChart = null;
  let breakdownChart = null;

  // --- Mock: Current monthly spend from scan data ---
  const currentSpend = {
    total: 12480.00,
    byService: [
      { service: 'EC2', spend: 5200, optimized: 3120, savings: 2080 },
      { service: 'RDS', spend: 2800, optimized: 2100, savings: 700 },
      { service: 'S3', spend: 1450, optimized: 870, savings: 580 },
      { service: 'DynamoDB', spend: 960, optimized: 480, savings: 480 },
      { service: 'Lambda', spend: 320, optimized: 280, savings: 40 },
      { service: 'ELB', spend: 580, optimized: 580, savings: 0 },
      { service: 'CloudFront', spend: 420, optimized: 420, savings: 0 },
      { service: 'EKS', spend: 750, optimized: 750, savings: 0 },
    ],
  };

  const totalSavings = currentSpend.byService.reduce((s, r) => s + r.savings, 0);
  const totalOptimized = currentSpend.byService.reduce((s, r) => s + r.optimized, 0);
  const savingsPct = ((totalSavings / currentSpend.total) * 100).toFixed(1);

  // --- Mock: RI Recommendations (from Cost Explorer RI Recommendations) ---
  const riRecommendations = [
    { service: 'EC2', instanceType: 'm5.xlarge', region: 'us-east-1', currentOnDemand: 1752.00, riCost: 1095.00, savings: 657.00, savingsPct: '37.5%', term: '1 Year', payment: 'Partial Upfront', count: 3, account: '111122223333' },
    { service: 'EC2', instanceType: 'r5.large', region: 'ap-southeast-1', currentOnDemand: 876.00, riCost: 584.00, savings: 292.00, savingsPct: '33.3%', term: '1 Year', payment: 'No Upfront', count: 2, account: '444455556666' },
    { service: 'RDS', instanceType: 'db.r5.large', region: 'us-east-1', currentOnDemand: 1460.00, riCost: 876.00, savings: 584.00, savingsPct: '40.0%', term: '1 Year', payment: 'All Upfront', count: 1, account: '444455556666' },
    { service: 'ElastiCache', instanceType: 'cache.r5.large', region: 'us-east-1', currentOnDemand: 438.00, riCost: 292.00, savings: 146.00, savingsPct: '33.3%', term: '1 Year', payment: 'Partial Upfront', count: 1, account: '111122223333' },
  ];

  const totalRISavings = riRecommendations.reduce((s, r) => s + r.savings, 0);

  // --- Mock: Savings Plan Recommendations ---
  const spRecommendations = [
    { type: 'Compute Savings Plan', commitment: 850.00, estimatedSavings: 340.00, savingsPct: '28.6%', term: '1 Year', coverage: '72% of on-demand compute', services: 'EC2, Lambda, Fargate' },
    { type: 'EC2 Instance Savings Plan', commitment: 620.00, estimatedSavings: 310.00, savingsPct: '33.3%', term: '1 Year', coverage: '85% of EC2 on-demand', services: 'EC2 (m5, r5 families)' },
    { type: 'SageMaker Savings Plan', commitment: 0, estimatedSavings: 0, savingsPct: '0%', term: '-', coverage: 'No SageMaker usage detected', services: 'SageMaker' },
  ];

  const totalSPSavings = spRecommendations.reduce((s, r) => s + r.estimatedSavings, 0);

  // --- Mock: Cost Optimization Hub Recommendations ---
  const hubRecommendations = [
    { category: 'Right-Sizing', resource: 'i-0def456abc789012', service: 'EC2', account: '777788889999', currentType: 'm5.2xlarge', recommendedType: 'm5.large', currentCost: 280.32, recommendedCost: 70.08, monthlySavings: 210.24, reason: 'Average CPU utilization 3.2% over 14 days. Memory utilization 18%.' },
    { category: 'Right-Sizing', resource: 'i-0abc123def456789', service: 'EC2', account: '111122223333', currentType: 'c5.xlarge', recommendedType: 'c5.large', currentCost: 124.10, recommendedCost: 62.05, monthlySavings: 62.05, reason: 'Average CPU utilization 12% over 14 days. Network throughput consistently low.' },
    { category: 'Idle Resources', resource: 'vol-0aaa111bbb222ccc', service: 'EBS', account: '777788889999', currentType: 'gp3 500GB', recommendedType: 'Delete (unattached)', currentCost: 40.00, recommendedCost: 0, monthlySavings: 40.00, reason: 'Volume has been unattached for 45 days. No snapshots reference this volume.' },
    { category: 'Idle Resources', resource: 'eip-12345678', service: 'EC2 (EIP)', account: '444455556666', currentType: 'Elastic IP', recommendedType: 'Release', currentCost: 3.60, recommendedCost: 0, monthlySavings: 3.60, reason: 'Elastic IP not associated with any running instance for 30+ days.' },
    { category: 'Storage Optimization', resource: 'my-app-bucket', service: 'S3', account: '111122223333', currentType: 'Standard (2.3 TB)', recommendedType: 'Intelligent-Tiering', currentCost: 52.90, recommendedCost: 31.74, monthlySavings: 21.16, reason: '68% of objects not accessed in 30+ days. Intelligent-Tiering would auto-tier infrequently accessed data.' },
    { category: 'Storage Optimization', resource: 'logs-bucket', service: 'S3', account: '111122223333', currentType: 'Standard (800 GB)', recommendedType: 'Glacier + Lifecycle', currentCost: 18.40, recommendedCost: 3.20, monthlySavings: 15.20, reason: 'Log files older than 90 days. Configure lifecycle to transition to Glacier after 30 days, delete after 365 days.' },
    { category: 'Capacity Optimization', resource: 'prod-table', service: 'DynamoDB', account: '111122223333', currentType: 'Provisioned (RCU:100, WCU:50)', recommendedType: 'On-Demand', currentCost: 96.36, recommendedCost: 48.18, monthlySavings: 48.18, reason: 'Average consumed RCU: 15, WCU: 8. On-demand pricing would be significantly cheaper for this usage pattern.' },
    { category: 'Previous Generation', resource: 'i-0old999instance', service: 'EC2', account: '444455556666', currentType: 'm4.large', recommendedType: 'm6i.large', currentCost: 73.00, recommendedCost: 69.35, monthlySavings: 3.65, reason: 'm4 is previous generation. m6i offers 15% better price-performance with Graviton3 option available.' },
  ];

  const totalHubSavings = hubRecommendations.reduce((s, r) => s + r.monthlySavings, 0);
  const grandTotalSavings = totalRISavings + totalSPSavings + totalHubSavings;

  // --- Helpers ---
  function fmt(n) { return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  function categoryBadge(cat) {
    const map = {
      'Right-Sizing': 'badge-high',
      'Idle Resources': 'badge-critical',
      'Storage Optimization': 'badge-medium',
      'Capacity Optimization': 'badge-medium',
      'Previous Generation': 'badge-info',
    };
    return `<span class="badge ${map[cat] || 'badge-info'}">${cat}</span>`;
  }

  // --- Render ---
  function render() {
    return `
      <div class="page-header">
        <h2>Cost Advisor</h2>
        <p>คำแนะนำการลดค่าใช้จ่าย AWS จากผลการ scan, Cost Optimization Hub, RI Recommendations, และ Savings Plan Recommendations</p>
      </div>

      ${renderSummary()}
      ${renderCharts()}
      ${renderRIRecommendations()}
      ${renderSPRecommendations()}
      ${renderHubRecommendations()}
      ${renderActionPlan()}
    `;
  }

  function renderSummary() {
    return `
      <div class="card-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); margin-bottom:24px;">
        <div class="card" style="text-align:center;">
          <p class="text-secondary" style="font-size:0.82rem;">Current Monthly Spend</p>
          <p style="font-size:1.6rem; font-weight:500;">${fmt(currentSpend.total)}</p>
        </div>
        <div class="card" style="text-align:center;">
          <p class="text-secondary" style="font-size:0.82rem;">Estimated After Optimization</p>
          <p style="font-size:1.6rem; font-weight:500; color:var(--color-success);">${fmt(currentSpend.total - grandTotalSavings)}</p>
        </div>
        <div class="card" style="text-align:center;">
          <p class="text-secondary" style="font-size:0.82rem;">Total Potential Savings</p>
          <p style="font-size:1.6rem; font-weight:500; color:var(--color-terracotta);">${fmt(grandTotalSavings)}/mo</p>
        </div>
        <div class="card" style="text-align:center;">
          <p class="text-secondary" style="font-size:0.82rem;">Savings Percentage</p>
          <p style="font-size:1.6rem; font-weight:500;">${((grandTotalSavings / currentSpend.total) * 100).toFixed(1)}%</p>
        </div>
      </div>

      <div class="card-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); margin-bottom:24px;">
        <div class="card">
          <p class="text-secondary" style="font-size:0.82rem;">RI Recommendations</p>
          <p style="font-size:1.2rem; font-weight:500;">${fmt(totalRISavings)}/mo</p>
          <p class="text-secondary" style="font-size:0.82rem;">${riRecommendations.length} recommendations</p>
        </div>
        <div class="card">
          <p class="text-secondary" style="font-size:0.82rem;">Savings Plan</p>
          <p style="font-size:1.2rem; font-weight:500;">${fmt(totalSPSavings)}/mo</p>
          <p class="text-secondary" style="font-size:0.82rem;">${spRecommendations.filter(r=>r.estimatedSavings>0).length} recommendations</p>
        </div>
        <div class="card">
          <p class="text-secondary" style="font-size:0.82rem;">Cost Optimization Hub</p>
          <p style="font-size:1.2rem; font-weight:500;">${fmt(totalHubSavings)}/mo</p>
          <p class="text-secondary" style="font-size:0.82rem;">${hubRecommendations.length} recommendations</p>
        </div>
      </div>
    `;
  }

  function renderCharts() {
    return `
      <div class="card-grid" style="grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); margin-bottom:24px;">
        <div class="card">
          <h3 style="margin-bottom:12px;">Savings Breakdown by Source</h3>
          <div class="chart-container" style="max-width:320px;"><canvas id="savings-chart"></canvas></div>
        </div>
        <div class="card">
          <h3 style="margin-bottom:12px;">Spend by Service (Current vs Optimized)</h3>
          <div style="position:relative; width:100%;"><canvas id="breakdown-chart"></canvas></div>
        </div>
      </div>
    `;
  }

  function renderRIRecommendations() {
    return `
      <div class="card mb-24">
        <div class="card-header">
          <h3>Reserved Instance Recommendations</h3>
          <span class="badge badge-high">${fmt(totalRISavings)}/mo savings</span>
        </div>
        <p class="text-secondary mb-16" style="font-size:0.88rem;">
          Based on your usage patterns over the past 14 days. RI purchases provide significant discounts for steady-state workloads.
        </p>
        <div class="table-wrapper"><table>
          <thead><tr><th>Service</th><th>Instance Type</th><th>Region</th><th>Count</th><th>Account</th><th>Term</th><th>Payment</th><th>On-Demand</th><th>RI Cost</th><th>Savings</th></tr></thead>
          <tbody>
            ${riRecommendations.map(r => `<tr>
              <td>${r.service}</td>
              <td style="font-family:var(--font-mono); font-size:0.82rem;">${r.instanceType}</td>
              <td>${r.region}</td>
              <td>${r.count}</td>
              <td style="font-size:0.82rem;">${r.account}</td>
              <td>${r.term}</td>
              <td>${r.payment}</td>
              <td>${fmt(r.currentOnDemand)}</td>
              <td>${fmt(r.riCost)}</td>
              <td style="color:var(--color-success); font-weight:500;">${fmt(r.savings)} (${r.savingsPct})</td>
            </tr>`).join('')}
          </tbody>
          <tfoot><tr style="font-weight:500;">
            <td colspan="7">Total</td>
            <td>${fmt(riRecommendations.reduce((s,r)=>s+r.currentOnDemand,0))}</td>
            <td>${fmt(riRecommendations.reduce((s,r)=>s+r.riCost,0))}</td>
            <td style="color:var(--color-success);">${fmt(totalRISavings)}</td>
          </tr></tfoot>
        </table></div>
      </div>
    `;
  }

  function renderSPRecommendations() {
    return `
      <div class="card mb-24">
        <div class="card-header">
          <h3>Savings Plan Recommendations</h3>
          <span class="badge badge-high">${fmt(totalSPSavings)}/mo savings</span>
        </div>
        <p class="text-secondary mb-16" style="font-size:0.88rem;">
          Savings Plans offer flexible pricing in exchange for a commitment to a consistent amount of usage (measured in $/hour).
        </p>
        <div class="table-wrapper"><table>
          <thead><tr><th>Plan Type</th><th>Hourly Commitment</th><th>Term</th><th>Coverage</th><th>Applicable Services</th><th>Est. Monthly Savings</th></tr></thead>
          <tbody>
            ${spRecommendations.map(r => `<tr>
              <td style="font-weight:500;">${r.type}</td>
              <td>${r.commitment > 0 ? fmt(r.commitment) + '/mo' : '-'}</td>
              <td>${r.term}</td>
              <td>${r.coverage}</td>
              <td style="font-size:0.88rem;">${r.services}</td>
              <td style="color:${r.estimatedSavings > 0 ? 'var(--color-success)' : 'var(--text-tertiary)'}; font-weight:500;">${r.estimatedSavings > 0 ? fmt(r.estimatedSavings) : '-'}</td>
            </tr>`).join('')}
          </tbody>
        </table></div>
      </div>
    `;
  }

  function renderHubRecommendations() {
    const categories = [...new Set(hubRecommendations.map(r => r.category))];
    return `
      <div class="card mb-24">
        <div class="card-header">
          <h3>Cost Optimization Hub Recommendations</h3>
          <span class="badge badge-high">${fmt(totalHubSavings)}/mo savings</span>
        </div>
        <p class="text-secondary mb-16" style="font-size:0.88rem;">
          Actionable recommendations from scan findings and AWS Cost Optimization Hub analysis.
        </p>
        ${categories.map(cat => {
          const items = hubRecommendations.filter(r => r.category === cat);
          const catSavings = items.reduce((s, r) => s + r.monthlySavings, 0);
          return `
            <h4 style="margin:16px 0 8px;">${categoryBadge(cat)} <span style="margin-left:8px;">${items.length} items — ${fmt(catSavings)}/mo</span></h4>
            <div class="table-wrapper" style="margin-bottom:16px;"><table>
              <thead><tr><th>Resource</th><th>Service</th><th>Account</th><th>Current</th><th>Recommended</th><th>Current Cost</th><th>New Cost</th><th>Savings</th></tr></thead>
              <tbody>
                ${items.map(r => `<tr>
                  <td style="font-family:var(--font-mono); font-size:0.82rem; word-break:break-all;">${r.resource}</td>
                  <td>${r.service}</td>
                  <td style="font-size:0.82rem;">${r.account}</td>
                  <td style="font-size:0.88rem;">${r.currentType}</td>
                  <td style="font-size:0.88rem; font-weight:500;">${r.recommendedType}</td>
                  <td>${fmt(r.currentCost)}</td>
                  <td>${fmt(r.recommendedCost)}</td>
                  <td style="color:var(--color-success); font-weight:500;">${fmt(r.monthlySavings)}</td>
                </tr>
                <tr><td colspan="8" style="font-size:0.82rem; color:var(--text-secondary); padding:4px 12px 12px; border:none;">${r.reason}</td></tr>
                `).join('')}
              </tbody>
            </table></div>
          `;
        }).join('')}
      </div>
    `;
  }

  function renderActionPlan() {
    return `
      <div class="card mb-24">
        <h3 style="margin-bottom:12px;">Recommended Action Plan</h3>
        <p class="text-secondary mb-16" style="font-size:0.88rem;">Prioritized actions sorted by estimated savings impact.</p>
        <div class="table-wrapper"><table>
          <thead><tr><th>Priority</th><th>Action</th><th>Category</th><th>Est. Monthly Savings</th><th>Effort</th><th>Risk</th></tr></thead>
          <tbody>
            <tr>
              <td style="font-weight:500;">1</td>
              <td>Purchase EC2 Reserved Instances for steady-state workloads (m5.xlarge x3, r5.large x2)</td>
              <td><span class="badge badge-info">RI Purchase</span></td>
              <td style="color:var(--color-success); font-weight:500;">${fmt(949)}</td>
              <td>Low</td>
              <td>Low</td>
            </tr>
            <tr>
              <td style="font-weight:500;">2</td>
              <td>Activate Compute Savings Plan ($850/mo commitment)</td>
              <td><span class="badge badge-info">Savings Plan</span></td>
              <td style="color:var(--color-success); font-weight:500;">${fmt(340)}</td>
              <td>Low</td>
              <td>Low</td>
            </tr>
            <tr>
              <td style="font-weight:500;">3</td>
              <td>Right-size EC2 instances: m5.2xlarge to m5.large, c5.xlarge to c5.large</td>
              <td>${categoryBadge('Right-Sizing')}</td>
              <td style="color:var(--color-success); font-weight:500;">${fmt(272.29)}</td>
              <td>Medium</td>
              <td>Medium</td>
            </tr>
            <tr>
              <td style="font-weight:500;">4</td>
              <td>Purchase RDS Reserved Instance for db.r5.large</td>
              <td><span class="badge badge-info">RI Purchase</span></td>
              <td style="color:var(--color-success); font-weight:500;">${fmt(584)}</td>
              <td>Low</td>
              <td>Low</td>
            </tr>
            <tr>
              <td style="font-weight:500;">5</td>
              <td>Switch DynamoDB prod-table to on-demand capacity</td>
              <td>${categoryBadge('Capacity Optimization')}</td>
              <td style="color:var(--color-success); font-weight:500;">${fmt(48.18)}</td>
              <td>Low</td>
              <td>Low</td>
            </tr>
            <tr>
              <td style="font-weight:500;">6</td>
              <td>Delete unattached EBS volume and release unused Elastic IP</td>
              <td>${categoryBadge('Idle Resources')}</td>
              <td style="color:var(--color-success); font-weight:500;">${fmt(43.60)}</td>
              <td>Low</td>
              <td>Low</td>
            </tr>
            <tr>
              <td style="font-weight:500;">7</td>
              <td>Enable S3 Intelligent-Tiering and Glacier lifecycle for log buckets</td>
              <td>${categoryBadge('Storage Optimization')}</td>
              <td style="color:var(--color-success); font-weight:500;">${fmt(36.36)}</td>
              <td>Low</td>
              <td>Low</td>
            </tr>
            <tr>
              <td style="font-weight:500;">8</td>
              <td>Migrate m4.large to m6i.large (current generation)</td>
              <td>${categoryBadge('Previous Generation')}</td>
              <td style="color:var(--color-success); font-weight:500;">${fmt(3.65)}</td>
              <td>Medium</td>
              <td>Low</td>
            </tr>
          </tbody>
          <tfoot><tr style="font-weight:500;">
            <td colspan="3">Total Estimated Monthly Savings</td>
            <td style="color:var(--color-success);">${fmt(grandTotalSavings)}</td>
            <td colspan="2"></td>
          </tr></tfoot>
        </table></div>
      </div>
    `;
  }

  // --- Charts ---
  function createCharts() {
    destroyCharts();
    createSavingsChart();
    createBreakdownChart();
  }

  function destroyCharts() {
    if (savingsChart) { savingsChart.destroy(); savingsChart = null; }
    if (breakdownChart) { breakdownChart.destroy(); breakdownChart = null; }
  }

  function createSavingsChart() {
    const ctx = document.getElementById('savings-chart');
    if (!ctx) return;
    savingsChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Reserved Instances', 'Savings Plans', 'Cost Optimization Hub'],
        datasets: [{
          data: [totalRISavings, totalSPSavings, totalHubSavings],
          backgroundColor: ['#c96442', '#d97757', '#b8860b'],
          borderWidth: 2,
          borderColor: 'var(--bg-card)',
        }],
      },
      options: {
        responsive: true,
        cutout: '55%',
        plugins: {
          legend: { position: 'bottom', labels: { padding: 12, font: { size: 11 } } },
          tooltip: { callbacks: { label: (ctx) => ctx.label + ': $' + ctx.parsed.toLocaleString('en-US', {minimumFractionDigits:2}) } },
        },
      },
    });
  }

  function createBreakdownChart() {
    const ctx = document.getElementById('breakdown-chart');
    if (!ctx) return;
    const services = currentSpend.byService.map(r => r.service);
    const current = currentSpend.byService.map(r => r.spend);
    const optimized = currentSpend.byService.map(r => r.optimized);

    breakdownChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: services,
        datasets: [
          { label: 'Current Spend', data: current, backgroundColor: '#c96442' },
          { label: 'After Optimization', data: optimized, backgroundColor: '#2d7d46' },
        ],
      },
      options: {
        responsive: true,
        scales: {
          y: { beginAtZero: true, title: { display: true, text: 'Monthly Cost ($)' } },
        },
        plugins: {
          legend: { position: 'bottom', labels: { padding: 12, font: { size: 11 } } },
          tooltip: { callbacks: { label: (ctx) => ctx.dataset.label + ': $' + ctx.parsed.y.toLocaleString('en-US', {minimumFractionDigits:2}) } },
        },
      },
    });
  }

  // --- Init ---
  function init() {
    createCharts();
  }

  return { render, init };
})();
