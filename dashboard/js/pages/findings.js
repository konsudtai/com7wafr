/* ============================================
   WA Review Tool — Findings Page
   Table with dropdown filters, text search,
   detail modal
   ============================================ */

const FindingsPage = (() => {
  let findings = [];

  // --- Helpers ---
  function unique(arr) { return [...new Set(arr)].sort(); }

  function severityBadgeClass(severity) {
    const map = { CRITICAL: 'badge-critical', HIGH: 'badge-high', MEDIUM: 'badge-medium', LOW: 'badge-low', INFORMATIONAL: 'badge-info' };
    return map[severity] || 'badge-info';
  }

  function getFilteredFindings() {
    const account = document.getElementById('filter-account')?.value || '';
    const region = document.getElementById('filter-region')?.value || '';
    const service = document.getElementById('filter-service')?.value || '';
    const pillar = document.getElementById('filter-pillar')?.value || '';
    const severity = document.getElementById('filter-severity')?.value || '';
    const search = (document.getElementById('filter-search')?.value || '').toLowerCase();

    return findings.filter(f => {
      if (account && (f.account_id || f.account) !== account) return false;
      if (region && f.region !== region) return false;
      if (service && f.service !== service) return false;
      if (pillar && f.pillar !== pillar) return false;
      if (severity && f.severity !== severity) return false;
      if (search && !(f.resource_id || f.resourceId || '').toLowerCase().includes(search) && !(f.title || '').toLowerCase().includes(search)) return false;
      return true;
    });
  }

  function renderTableBody(filtered) {
    if (filtered.length === 0) {
      return '<tr><td colspan="7" class="text-center text-secondary" style="padding:24px;">ไม่พบ findings ที่ตรงกับเงื่อนไข</td></tr>';
    }
    return filtered.map(f => `
      <tr class="finding-row" data-id="${f.finding_id || f.id}" style="cursor:pointer;">
        <td style="font-family:var(--font-mono); font-size:0.82rem;">${f.resource_id || f.resourceId || ''}</td>
        <td>${f.service || ''}</td>
        <td>${f.region || ''}</td>
        <td>${f.account_id || f.account || ''}</td>
        <td>${f.pillar || ''}</td>
        <td><span class="badge ${severityBadgeClass(f.severity)}">${f.severity || ''}</span></td>
        <td>${f.title || ''}</td>
      </tr>
    `).join('');
  }

  function buildSelectOptions(values, label) {
    return `<option value="">All ${label}</option>` + values.map(v => `<option value="${v}">${v}</option>`).join('');
  }

  // --- Render ---
  function render() {
    return `
      <div class="page-header">
        <h2>Findings</h2>
        <p>ผลการตรวจสอบทั้งหมด — กรองตาม account, region, service, pillar หรือ severity</p>
      </div>

      <div id="findings-loading" class="card mb-24" style="text-align:center; padding:48px;">
        <p class="text-secondary">กำลังโหลดข้อมูล...</p>
      </div>

      <div id="findings-empty" class="card mb-24 hidden" style="text-align:center; padding:48px;">
        <p class="text-secondary">ยังไม่มี findings กรุณาเริ่มการสแกนก่อน</p>
      </div>

      <div id="findings-content" class="hidden">
        <div class="card mb-24">
          <div class="flex gap-8" style="flex-wrap:wrap; align-items:flex-end;">
            <div class="form-group" style="margin-bottom:0; min-width:140px;">
              <label for="filter-account">Account</label>
              <select id="filter-account"></select>
            </div>
            <div class="form-group" style="margin-bottom:0; min-width:140px;">
              <label for="filter-region">Region</label>
              <select id="filter-region"></select>
            </div>
            <div class="form-group" style="margin-bottom:0; min-width:120px;">
              <label for="filter-service">Service</label>
              <select id="filter-service"></select>
            </div>
            <div class="form-group" style="margin-bottom:0; min-width:140px;">
              <label for="filter-pillar">Pillar</label>
              <select id="filter-pillar"></select>
            </div>
            <div class="form-group" style="margin-bottom:0; min-width:130px;">
              <label for="filter-severity">Severity</label>
              <select id="filter-severity"></select>
            </div>
            <div class="form-group" style="margin-bottom:0; flex:1; min-width:180px;">
              <label for="filter-search">Search</label>
              <input type="text" id="filter-search" placeholder="Resource ID or title…">
            </div>
          </div>
        </div>

        <div class="card">
          <div class="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Resource ID</th><th>Service</th><th>Region</th><th>Account</th><th>Pillar</th><th>Severity</th><th>Title</th>
                </tr>
              </thead>
              <tbody id="findings-tbody"></tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  // --- Init ---
  async function init() {
    try {
      const data = await ApiClient.get('/scans/latest/results');
      findings = (data && data.findings) || [];
      if (findings.length === 0) { showEmpty(); return; }
      showContent();
      populateFilters();
      applyFilters();
      bindEvents();
    } catch (err) {
      showEmpty();
    }
  }

  function showEmpty() {
    document.getElementById('findings-loading')?.classList.add('hidden');
    document.getElementById('findings-empty')?.classList.remove('hidden');
    document.getElementById('findings-content')?.classList.add('hidden');
  }

  function showContent() {
    document.getElementById('findings-loading')?.classList.add('hidden');
    document.getElementById('findings-empty')?.classList.add('hidden');
    document.getElementById('findings-content')?.classList.remove('hidden');
  }

  function populateFilters() {
    const acctKey = f => f.account_id || f.account || '';
    document.getElementById('filter-account').innerHTML = buildSelectOptions(unique(findings.map(acctKey)), 'Accounts');
    document.getElementById('filter-region').innerHTML = buildSelectOptions(unique(findings.map(f => f.region)), 'Regions');
    document.getElementById('filter-service').innerHTML = buildSelectOptions(unique(findings.map(f => f.service)), 'Services');
    document.getElementById('filter-pillar').innerHTML = buildSelectOptions(unique(findings.map(f => f.pillar)), 'Pillars');
    document.getElementById('filter-severity').innerHTML = buildSelectOptions(unique(findings.map(f => f.severity)), 'Severities');
  }

  function bindEvents() {
    ['filter-account', 'filter-region', 'filter-service', 'filter-pillar', 'filter-severity'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', applyFilters);
    });
    let searchTimer = null;
    document.getElementById('filter-search')?.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(applyFilters, 250); });
    document.getElementById('findings-tbody')?.addEventListener('click', (e) => {
      const row = e.target.closest('.finding-row');
      if (!row) return;
      const fid = row.dataset.id;
      const finding = findings.find(f => (f.finding_id || f.id) === fid);
      if (finding) showFindingDetail(finding);
    });
  }

  function applyFilters() {
    const filtered = getFilteredFindings();
    const tbody = document.getElementById('findings-tbody');
    if (tbody) tbody.innerHTML = renderTableBody(filtered);
  }

  function showFindingDetail(f) {
    const body = `
      <div style="display:flex; flex-direction:column; gap:12px;">
        <div><span class="badge ${severityBadgeClass(f.severity)}">${f.severity}</span> <span class="text-secondary" style="margin-left:8px; font-size:0.82rem;">${f.pillar}</span></div>
        <div><strong style="font-size:0.82rem; color:var(--text-secondary);">Resource</strong><p style="font-family:var(--font-mono); font-size:0.88rem; word-break:break-all;">${f.resource_id || f.resourceId || ''}</p></div>
        <div><strong style="font-size:0.82rem; color:var(--text-secondary);">Service / Region / Account</strong><p>${f.service} · ${f.region} · ${f.account_id || f.account || ''}</p></div>
        <div><strong style="font-size:0.82rem; color:var(--text-secondary);">Description</strong><p style="font-size:0.94rem;">${f.description || ''}</p></div>
        <div><strong style="font-size:0.82rem; color:var(--text-secondary);">Recommendation</strong><p style="font-size:0.94rem;">${f.recommendation || ''}</p></div>
      </div>
    `;
    App.showModal(f.title || 'Finding Detail', body);
  }

  return { render, init };
})();
