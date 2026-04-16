/* ============================================
   WA Review Tool — History Page
   Scan history table, trend line chart
   ============================================ */

const HistoryPage = (() => {
  let trendChart = null;
  let scans = [];

  function statusBadgeClass(status) {
    const map = { COMPLETED: 'badge-low', FAILED: 'badge-critical', IN_PROGRESS: 'badge-medium', PENDING: 'badge-info' };
    return map[status] || 'badge-info';
  }

  function render() {
    return `
      <div class="page-header">
        <h2>Scan History</h2>
        <p>ประวัติการสแกนและแนวโน้มของ findings</p>
      </div>

      <div id="history-loading" class="card mb-24" style="text-align:center; padding:48px;">
        <p class="text-secondary">กำลังโหลดข้อมูล...</p>
      </div>

      <div id="history-empty" class="card mb-24 hidden" style="text-align:center; padding:48px;">
        <p class="text-secondary">ยังไม่มีประวัติการสแกน</p>
      </div>

      <div id="history-content" class="hidden">
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
                <tr><th>Scan ID</th><th>Date</th><th>Status</th><th>Total</th><th>Critical</th><th>High</th><th>Medium</th><th>Low</th></tr>
              </thead>
              <tbody id="history-tbody"></tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  function renderRow(scan) {
    const id = scan.scan_id || scan.id || '';
    const date = scan.started_at || scan.date || '';
    const status = scan.status || '';
    return `<tr>
      <td style="font-family:var(--font-mono); font-size:0.88rem;">${id}</td>
      <td>${date}</td>
      <td><span class="badge ${statusBadgeClass(status)}">${status}</span></td>
      <td>${scan.total || 0}</td>
      <td><span class="badge badge-critical">${scan.critical || 0}</span></td>
      <td><span class="badge badge-high">${scan.high || 0}</span></td>
      <td><span class="badge badge-medium">${scan.medium || 0}</span></td>
      <td><span class="badge badge-low">${scan.low || 0}</span></td>
    </tr>`;
  }

  async function init() {
    if (trendChart) { trendChart.destroy(); trendChart = null; }
    try {
      const data = await ApiClient.get('/scans/history');
      scans = (data && (data.scans || data)) || [];
      if (!Array.isArray(scans)) scans = [];
      if (scans.length === 0) { showEmpty(); return; }
      showContent();
      document.getElementById('history-tbody').innerHTML = scans.map(renderRow).join('');
      createTrendChart();
    } catch (err) {
      showEmpty();
    }
  }

  function showEmpty() {
    document.getElementById('history-loading')?.classList.add('hidden');
    document.getElementById('history-empty')?.classList.remove('hidden');
    document.getElementById('history-content')?.classList.add('hidden');
  }

  function showContent() {
    document.getElementById('history-loading')?.classList.add('hidden');
    document.getElementById('history-empty')?.classList.add('hidden');
    document.getElementById('history-content')?.classList.remove('hidden');
  }

  function createTrendChart() {
    const ctx = document.getElementById('trend-chart');
    if (!ctx) return;
    const completed = scans.filter(s => (s.status || '') === 'COMPLETED').reverse();
    if (completed.length === 0) return;
    const labels = completed.map(s => (s.started_at || s.date || '').split(' ')[0] || '');
    trendChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Critical', data: completed.map(s => s.critical || 0), borderColor: '#b53333', tension: 0.3, fill: false },
          { label: 'High',     data: completed.map(s => s.high || 0),     borderColor: '#d97757', tension: 0.3, fill: false },
          { label: 'Medium',   data: completed.map(s => s.medium || 0),   borderColor: '#b8860b', tension: 0.3, fill: false },
          { label: 'Low',      data: completed.map(s => s.low || 0),      borderColor: '#2d7d46', tension: 0.3, fill: false },
        ],
      },
      options: {
        responsive: true,
        interaction: { mode: 'index', intersect: false },
        scales: { y: { beginAtZero: true, title: { display: true, text: 'จำนวน Findings' } }, x: { title: { display: true, text: 'วันที่สแกน' } } },
        plugins: { legend: { position: 'bottom', labels: { padding: 12, font: { size: 11 } } } },
      },
    });
  }

  return { render, init };
})();
