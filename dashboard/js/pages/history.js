/* ============================================
   WA Review Tool — History Page
   Scan history table, trend line chart
   ============================================ */

// NOTE: Mock data below is for DEMO MODE only.
// In production, all data is fetched from the backend API via ApiClient.

const HistoryPage = (() => {
  let trendChart = null;

  // --- Mock Data ---
  const scans = [
    { id: 'SCAN-007', date: '2024-12-15 10:30', status: 'COMPLETED', total: 66, critical: 3, high: 12, medium: 25, low: 18 },
    { id: 'SCAN-006', date: '2024-12-08 09:15', status: 'COMPLETED', total: 72, critical: 4, high: 14, medium: 28, low: 20 },
    { id: 'SCAN-005', date: '2024-12-01 11:00', status: 'COMPLETED', total: 80, critical: 5, high: 16, medium: 30, low: 22 },
    { id: 'SCAN-004', date: '2024-11-24 08:45', status: 'COMPLETED', total: 85, critical: 6, high: 18, medium: 32, low: 21 },
    { id: 'SCAN-003', date: '2024-11-17 14:20', status: 'COMPLETED', total: 90, critical: 7, high: 20, medium: 35, low: 20 },
    { id: 'SCAN-002', date: '2024-11-10 10:00', status: 'FAILED',    total: 0,  critical: 0, high: 0,  medium: 0,  low: 0 },
    { id: 'SCAN-001', date: '2024-11-03 09:30', status: 'COMPLETED', total: 95, critical: 8, high: 22, medium: 38, low: 19 },
  ];

  function statusBadgeClass(status) {
    const map = { COMPLETED: 'badge-low', FAILED: 'badge-critical', IN_PROGRESS: 'badge-medium', PENDING: 'badge-info' };
    return map[status] || 'badge-info';
  }

  // --- Render ---
  function render() {
    return `
      <div class="page-header">
        <h2>Scan History</h2>
        <p>ประวัติการสแกนและแนวโน้มของ findings</p>
      </div>

      <div class="card mb-24">
        <h3 style="margin-bottom:12px;">Findings Trend</h3>
        <div style="position:relative; width:100%; max-width:700px;">
          <canvas id="trend-chart"></canvas>
        </div>
      </div>

      <div class="card">
        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Scan ID</th>
                <th>Date</th>
                <th>Status</th>
                <th>Total</th>
                <th>Critical</th>
                <th>High</th>
                <th>Medium</th>
                <th>Low</th>
              </tr>
            </thead>
            <tbody>
              ${scans.map(renderRow).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderRow(scan) {
    return `
      <tr>
        <td style="font-family:var(--font-mono); font-size:0.88rem;">${scan.id}</td>
        <td>${scan.date}</td>
        <td><span class="badge ${statusBadgeClass(scan.status)}">${scan.status}</span></td>
        <td>${scan.total}</td>
        <td><span class="badge badge-critical">${scan.critical}</span></td>
        <td><span class="badge badge-high">${scan.high}</span></td>
        <td><span class="badge badge-medium">${scan.medium}</span></td>
        <td><span class="badge badge-low">${scan.low}</span></td>
      </tr>
    `;
  }

  // --- Init ---
  function init() {
    if (trendChart) { trendChart.destroy(); trendChart = null; }
    createTrendChart();
  }

  function createTrendChart() {
    const ctx = document.getElementById('trend-chart');
    if (!ctx) return;

    // Use only completed scans, sorted chronologically
    const completed = scans.filter(s => s.status === 'COMPLETED').reverse();
    const labels = completed.map(s => s.date.split(' ')[0]);

    trendChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Critical', data: completed.map(s => s.critical), borderColor: '#b53333', backgroundColor: 'rgba(181,51,51,0.1)', tension: 0.3, fill: false },
          { label: 'High',     data: completed.map(s => s.high),     borderColor: '#d97757', backgroundColor: 'rgba(217,119,87,0.1)', tension: 0.3, fill: false },
          { label: 'Medium',   data: completed.map(s => s.medium),   borderColor: '#b8860b', backgroundColor: 'rgba(184,134,11,0.1)', tension: 0.3, fill: false },
          { label: 'Low',      data: completed.map(s => s.low),      borderColor: '#2d7d46', backgroundColor: 'rgba(45,125,70,0.1)',  tension: 0.3, fill: false },
        ],
      },
      options: {
        responsive: true,
        interaction: { mode: 'index', intersect: false },
        scales: {
          y: { beginAtZero: true, title: { display: true, text: 'จำนวน Findings' } },
          x: { title: { display: true, text: 'วันที่สแกน' } },
        },
        plugins: {
          legend: { position: 'bottom', labels: { padding: 12, font: { size: 11 } } },
        },
      },
    });
  }

  return { render, init };
})();
