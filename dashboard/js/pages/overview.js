/* ============================================
   WA Review Tool — Overview Page
   Radar chart, doughnut chart, stacked bar,
   account summary cards
   ============================================ */

// NOTE: Mock data below is for DEMO MODE only.
// In production, all data is fetched from the backend API via ApiClient.

const OverviewPage = (() => {
  // Chart instances for cleanup
  let radarChart = null;
  let doughnutChart = null;
  let heatmapChart = null;

  // --- Mock Data ---
  const pillarScores = {
    Security: 72,
    Reliability: 65,
    'Operational Excellence': 80,
    'Performance Efficiency': 58,
    'Cost Optimization': 45,
  };

  const severityCounts = {
    CRITICAL: 3,
    HIGH: 12,
    MEDIUM: 25,
    LOW: 18,
    INFORMATIONAL: 8,
  };

  const severityColors = {
    CRITICAL: '#b53333',
    HIGH: '#d97757',
    MEDIUM: '#b8860b',
    LOW: '#2d7d46',
    INFORMATIONAL: '#5e5d59',
  };

  const heatmapData = {
    services: ['EC2', 'S3', 'RDS', 'IAM', 'Lambda', 'DynamoDB'],
    pillars: ['Security', 'Reliability', 'Ops Excellence', 'Performance', 'Cost'],
    // rows = services, cols = pillars
    values: [
      [4, 2, 1, 3, 5],
      [3, 0, 2, 1, 2],
      [2, 3, 1, 2, 1],
      [6, 0, 3, 0, 0],
      [1, 1, 2, 4, 3],
      [0, 2, 1, 1, 2],
    ],
  };

  const accountSummaries = [
    { id: '111122223333', alias: 'Production', critical: 2, high: 5, medium: 10, low: 8, info: 3 },
    { id: '444455556666', alias: 'Staging', critical: 1, high: 4, medium: 8, low: 6, info: 3 },
    { id: '777788889999', alias: 'Development', critical: 0, high: 3, medium: 7, low: 4, info: 2 },
  ];

  // --- Render ---
  function render() {
    return `
      <div class="page-header">
        <h2>ภาพรวม Well-Architected Review</h2>
        <p>สรุปผลการตรวจสอบตาม 5 เสาหลักของ AWS Well-Architected Framework</p>
      </div>

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
      <div class="card-grid">
        ${accountSummaries.map(renderAccountCard).join('')}
      </div>
    `;
  }

  function renderAccountCard(acct) {
    const total = acct.critical + acct.high + acct.medium + acct.low + acct.info;
    return `
      <div class="card">
        <div class="flex-between mb-16">
          <div>
            <h4>${acct.alias}</h4>
            <span class="text-secondary" style="font-size:0.82rem;">${acct.id}</span>
          </div>
          <span style="font-size:1.5rem; font-weight:500;">${total}</span>
        </div>
        <div class="flex gap-8" style="flex-wrap:wrap;">
          <span class="badge badge-critical">${acct.critical} Critical</span>
          <span class="badge badge-high">${acct.high} High</span>
          <span class="badge badge-medium">${acct.medium} Medium</span>
          <span class="badge badge-low">${acct.low} Low</span>
          <span class="badge badge-info">${acct.info} Info</span>
        </div>
      </div>
    `;
  }

  // --- Init (create charts) ---
  function init() {
    destroyCharts();
    createRadarChart();
    createDoughnutChart();
    createHeatmapChart();
  }

  function destroyCharts() {
    if (radarChart) { radarChart.destroy(); radarChart = null; }
    if (doughnutChart) { doughnutChart.destroy(); doughnutChart = null; }
    if (heatmapChart) { heatmapChart.destroy(); heatmapChart = null; }
  }

  // --- Radar Chart ---
  function createRadarChart() {
    const ctx = document.getElementById('radar-chart');
    if (!ctx) return;

    const labels = Object.keys(pillarScores);
    const data = Object.values(pillarScores);

    radarChart = new Chart(ctx, {
      type: 'radar',
      data: {
        labels,
        datasets: [{
          label: 'Pillar Score',
          data,
          backgroundColor: 'rgba(201, 100, 66, 0.2)',
          borderColor: '#c96442',
          borderWidth: 2,
          pointBackgroundColor: '#c96442',
          pointRadius: 4,
        }],
      },
      options: {
        responsive: true,
        scales: {
          r: {
            beginAtZero: true,
            max: 100,
            ticks: { stepSize: 20, font: { size: 11 } },
            pointLabels: { font: { size: 12 } },
          },
        },
        plugins: {
          legend: { display: false },
        },
      },
    });
  }

  // --- Doughnut Chart ---
  function createDoughnutChart() {
    const ctx = document.getElementById('doughnut-chart');
    if (!ctx) return;

    const labels = Object.keys(severityCounts);
    const data = Object.values(severityCounts);
    const colors = labels.map(l => severityColors[l]);

    doughnutChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: colors,
          borderWidth: 2,
          borderColor: 'var(--bg-card)',
        }],
      },
      options: {
        responsive: true,
        cutout: '55%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: { padding: 12, font: { size: 12 } },
          },
        },
      },
    });
  }

  // --- Stacked Bar Chart (Heatmap) ---
  function createHeatmapChart() {
    const ctx = document.getElementById('heatmap-chart');
    if (!ctx) return;

    const pillarColors = ['#c96442', '#d97757', '#b8860b', '#2d7d46', '#5e5d59'];

    const datasets = heatmapData.pillars.map((pillar, i) => ({
      label: pillar,
      data: heatmapData.values.map(row => row[i]),
      backgroundColor: pillarColors[i],
    }));

    heatmapChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: heatmapData.services,
        datasets,
      },
      options: {
        responsive: true,
        indexAxis: 'y',
        scales: {
          x: {
            stacked: true,
            title: { display: true, text: 'จำนวน Findings' },
            ticks: { stepSize: 1 },
          },
          y: {
            stacked: true,
          },
        },
        plugins: {
          legend: {
            position: 'bottom',
            labels: { padding: 12, font: { size: 11 } },
          },
        },
      },
    });
  }

  return { render, init };
})();
