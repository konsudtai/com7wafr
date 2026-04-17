/* ============================================
   WA Review Tool — Cost Advisor Page
   Cost optimization recommendations from API
   ============================================ */

const CostPage = (() => {
  let savingsChart = null;
  let breakdownChart = null;
  let costData = null;

  function fmt(n) { return '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  function categoryBadge(cat) {
    const map = { 'Right-Sizing': 'badge-high', 'Idle Resources': 'badge-critical', 'Storage Optimization': 'badge-medium', 'Capacity Optimization': 'badge-medium', 'Previous Generation': 'badge-info' };
    return `<span class="badge ${map[cat] || 'badge-info'}">${cat}</span>`;
  }

  function render() {
    return `
      <div class="page-header">
        <h2>Cost Advisor</h2>
        <p>คำแนะนำการลดค่าใช้จ่าย AWS จากผลการ scan และ Cost Optimization Hub</p>
      </div>

      <div id="cost-loading" class="card mb-24" style="text-align:center; padding:48px;">
        <p class="text-secondary">กำลังโหลดข้อมูล...</p>
      </div>

      <div id="cost-empty" class="card mb-24 hidden" style="text-align:center; padding:48px;">
        <p class="text-secondary">ยังไม่มีข้อมูล cost recommendations กรุณาเริ่มการสแกนก่อน</p>
      </div>

      <div id="cost-content" class="hidden"></div>
    `;
  }

  async function init() {
    destroyCharts();
    try {
      costData = await ApiClient.get('/cost-recommendations').catch(() => null);
      if (!costData) {
        // Fallback: cost recommendations endpoint may not be deployed yet
        showEmpty();
        return;
      }
      if (!costData || (!costData.riRecommendations && !costData.hubRecommendations && !costData.spRecommendations)) {
        showEmpty();
        return;
      }
      showContent();
      createCharts();
    } catch (err) {
      showEmpty();
    }
  }

  function showEmpty() {
    document.getElementById('cost-loading')?.classList.add('hidden');
    document.getElementById('cost-empty')?.classList.remove('hidden');
    document.getElementById('cost-content')?.classList.add('hidden');
  }

  function showContent() {
    document.getElementById('cost-loading')?.classList.add('hidden');
    document.getElementById('cost-empty')?.classList.add('hidden');
    const el = document.getElementById('cost-content');
    if (!el) return;
    el.classList.remove('hidden');

    const ri = costData.riRecommendations || [];
    const sp = costData.spRecommendations || [];
    const hub = costData.hubRecommendations || [];
    const totalRI = ri.reduce((s, r) => s + (r.savings || 0), 0);
    const totalSP = sp.reduce((s, r) => s + (r.estimatedSavings || 0), 0);
    const totalHub = hub.reduce((s, r) => s + (r.monthlySavings || 0), 0);
    const grand = totalRI + totalSP + totalHub;
    const currentTotal = costData.currentSpend?.total || 0;

    el.innerHTML = `
      <div class="card-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); margin-bottom:24px;">
        <div class="card" style="text-align:center;"><p class="text-secondary" style="font-size:0.82rem;">Current Monthly Spend</p><p style="font-size:1.6rem; font-weight:500;">${fmt(currentTotal)}</p></div>
        <div class="card" style="text-align:center;"><p class="text-secondary" style="font-size:0.82rem;">After Optimization</p><p style="font-size:1.6rem; font-weight:500; color:var(--color-success);">${fmt(currentTotal - grand)}</p></div>
        <div class="card" style="text-align:center;"><p class="text-secondary" style="font-size:0.82rem;">Total Potential Savings</p><p style="font-size:1.6rem; font-weight:500; color:var(--color-terracotta);">${fmt(grand)}/mo</p></div>
      </div>

      <div class="card-grid" style="grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); margin-bottom:24px;">
        <div class="card"><h3 style="margin-bottom:12px;">Savings Breakdown</h3><div class="chart-container" style="max-width:320px;"><canvas id="savings-chart"></canvas></div></div>
      </div>

      ${ri.length > 0 ? renderRITable(ri, totalRI) : ''}
      ${sp.length > 0 ? renderSPTable(sp, totalSP) : ''}
      ${hub.length > 0 ? renderHubTable(hub, totalHub) : ''}
    `;
  }

  function renderRITable(ri, total) {
    return `<div class="card mb-24"><h3>Reserved Instance Recommendations <span class="badge badge-high">${fmt(total)}/mo</span></h3>
      <div class="table-wrapper"><table><thead><tr><th>Service</th><th>Instance Type</th><th>Region</th><th>On-Demand</th><th>RI Cost</th><th>Savings</th></tr></thead>
      <tbody>${ri.map(r => `<tr><td>${r.service}</td><td style="font-family:var(--font-mono);">${r.instanceType}</td><td>${r.region}</td><td>${fmt(r.currentOnDemand)}</td><td>${fmt(r.riCost)}</td><td style="color:var(--color-success);">${fmt(r.savings)}</td></tr>`).join('')}</tbody></table></div></div>`;
  }

  function renderSPTable(sp, total) {
    return `<div class="card mb-24"><h3>Savings Plan Recommendations <span class="badge badge-high">${fmt(total)}/mo</span></h3>
      <div class="table-wrapper"><table><thead><tr><th>Plan Type</th><th>Commitment</th><th>Term</th><th>Coverage</th><th>Savings</th></tr></thead>
      <tbody>${sp.filter(r => r.estimatedSavings > 0).map(r => `<tr><td>${r.type}</td><td>${fmt(r.commitment)}/mo</td><td>${r.term}</td><td>${r.coverage}</td><td style="color:var(--color-success);">${fmt(r.estimatedSavings)}</td></tr>`).join('')}</tbody></table></div></div>`;
  }

  function renderHubTable(hub, total) {
    return `<div class="card mb-24"><h3>Cost Optimization Hub <span class="badge badge-high">${fmt(total)}/mo</span></h3>
      <div class="table-wrapper"><table><thead><tr><th>Category</th><th>Resource</th><th>Service</th><th>Current</th><th>Recommended</th><th>Savings</th></tr></thead>
      <tbody>${hub.map(r => `<tr><td>${categoryBadge(r.category)}</td><td style="font-family:var(--font-mono); font-size:0.82rem;">${r.resource}</td><td>${r.service}</td><td>${r.currentType}</td><td>${r.recommendedType}</td><td style="color:var(--color-success);">${fmt(r.monthlySavings)}</td></tr>`).join('')}</tbody></table></div></div>`;
  }

  function destroyCharts() {
    if (savingsChart) { savingsChart.destroy(); savingsChart = null; }
    if (breakdownChart) { breakdownChart.destroy(); breakdownChart = null; }
  }

  function createCharts() {
    const ctx = document.getElementById('savings-chart');
    if (!ctx || !costData) return;
    const ri = (costData.riRecommendations || []).reduce((s, r) => s + (r.savings || 0), 0);
    const sp = (costData.spRecommendations || []).reduce((s, r) => s + (r.estimatedSavings || 0), 0);
    const hub = (costData.hubRecommendations || []).reduce((s, r) => s + (r.monthlySavings || 0), 0);
    savingsChart = new Chart(ctx, {
      type: 'doughnut',
      data: { labels: ['Reserved Instances', 'Savings Plans', 'Cost Optimization Hub'], datasets: [{ data: [ri, sp, hub], backgroundColor: ['#c96442', '#d97757', '#b8860b'], borderWidth: 2, borderColor: 'var(--bg-card)' }] },
      options: { responsive: true, cutout: '55%', plugins: { legend: { position: 'bottom', labels: { padding: 12, font: { size: 11 } } } } },
    });
  }

  return { render, init };
})();
