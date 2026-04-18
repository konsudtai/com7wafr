/* ============================================
   WA Review Tool — Service Detail Page
   Per-service findings detail (Service Screener style)
   - Summary cards per finding type
   - Resources grouped by region
   - Detail table: Check / Current Value / Recommendation
   - Low hanging fruit toggle
   ============================================ */

const ServiceDetailPage = (() => {
  let currentService = '';
  let serviceFindings = [];
  let allFindings = [];
  let showLowHangingOnly = false;

  const SERVICE_META = {
    ec2:         { name: 'EC2',         icon: '🖥️' },
    s3:          { name: 'S3',          icon: '🪣' },
    rds:         { name: 'RDS',         icon: '🗄️' },
    iam:         { name: 'IAM',         icon: '🔑' },
    lambda:      { name: 'Lambda',      icon: '⚡' },
    dynamodb:    { name: 'DynamoDB',    icon: '📊' },
    elb:         { name: 'ELB',         icon: '⚖️' },
    cloudfront:  { name: 'CloudFront',  icon: '🌐' },
    ecs:         { name: 'ECS',         icon: '📦' },
    eks:         { name: 'EKS',         icon: '☸️' },
    cloudtrail:  { name: 'CloudTrail',  icon: '📝' },
    vpc:         { name: 'VPC',         icon: '🔒' },
    kms:         { name: 'KMS',         icon: '🔐' },
    cloudwatch:  { name: 'CloudWatch',  icon: '📈' },
    config:      { name: 'Config',      icon: '⚙️' },
  };

  const SEVERITY_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFORMATIONAL: 4 };

  function severityBadge(s) {
    const map = { CRITICAL: 'badge-critical', HIGH: 'badge-high', MEDIUM: 'badge-medium', LOW: 'badge-low', INFORMATIONAL: 'badge-info' };
    return `<span class="badge ${map[s] || 'badge-info'}">${s}</span>`;
  }

  function render(service) {
    currentService = (service || '').toLowerCase();
    const meta = SERVICE_META[currentService] || { name: currentService.toUpperCase(), icon: '📋' };

    return `
      <div class="page-header">
        <div class="flex-between">
          <div>
            <h2>${meta.icon} ${meta.name}</h2>
            <p>ผลการตรวจสอบ ${meta.name} แยกตาม region พร้อมคำแนะนำ</p>
          </div>
          <a href="#findings" class="btn btn-secondary btn-sm">← Back to Findings</a>
        </div>
      </div>

      <div id="svc-loading" class="card mb-24" style="text-align:center; padding:48px;">
        <p class="text-secondary">กำลังโหลดข้อมูล...</p>
      </div>

      <div id="svc-empty" class="card mb-24 hidden" style="text-align:center; padding:48px;">
        <p class="text-secondary">ไม่พบ findings สำหรับ ${meta.name}</p>
      </div>

      <div id="svc-content" class="hidden"></div>
    `;
  }

  async function init(service) {
    currentService = (service || '').toLowerCase();
    showLowHangingOnly = false;

    try {
      const historyData = await ApiClient.get('/scans');
      const scans = (historyData && historyData.scans) || [];
      if (!scans.length) { showState('empty'); return; }

      const latest = scans.find(s => s.status === 'COMPLETED') || scans[0];
      const scanId = latest.scanId || latest.scan_id;
      if (!scanId) { showState('empty'); return; }

      const data = await ApiClient.get('/scans/' + scanId + '/results');
      allFindings = (data && data.findings) || [];
      serviceFindings = allFindings.filter(f =>
        (f.service || '').toLowerCase() === currentService
      );

      if (serviceFindings.length === 0) { showState('empty'); return; }

      showState('content');
      renderContent();
    } catch (err) {
      showState('empty');
    }
  }

  function showState(state) {
    document.getElementById('svc-loading')?.classList.add('hidden');
    document.getElementById('svc-empty')?.classList.add('hidden');
    document.getElementById('svc-content')?.classList.add('hidden');
    const el = document.getElementById('svc-' + state);
    if (el) el.classList.remove('hidden');
  }

  function renderContent() {
    const el = document.getElementById('svc-content');
    if (!el) return;

    const findings = showLowHangingOnly
      ? serviceFindings.filter(f => f.severity === 'LOW' || f.severity === 'INFORMATIONAL')
      : serviceFindings;

    // Group by check type (title)
    const byCheck = {};
    findings.forEach(f => {
      const key = f.check_id || f.title || 'unknown';
      if (!byCheck[key]) byCheck[key] = { title: f.title, severity: f.severity, description: f.description, recommendation: f.recommendation, pillar: f.pillar, check_id: f.check_id, resources: [] };
      byCheck[key].resources.push(f);
    });

    // Group by region
    const byRegion = {};
    findings.forEach(f => {
      const r = f.region || 'unknown';
      if (!byRegion[r]) byRegion[r] = [];
      byRegion[r].push(f);
    });

    const regions = Object.keys(byRegion).sort();
    const checks = Object.values(byCheck).sort((a, b) => (SEVERITY_ORDER[a.severity] || 5) - (SEVERITY_ORDER[b.severity] || 5));

    // Severity summary
    const sevCounts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFORMATIONAL: 0 };
    serviceFindings.forEach(f => { if (f.severity in sevCounts) sevCounts[f.severity]++; });
    const total = serviceFindings.length;

    el.innerHTML = `
      <!-- Severity Summary -->
      <div class="card-grid" style="grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); margin-bottom:24px;">
        ${Object.entries(sevCounts).filter(([,v]) => v > 0).map(([sev, count]) => `
          <div class="card" style="text-align:center; padding:16px;">
            ${severityBadge(sev)}
            <p style="font-size:1.4rem; font-weight:600; margin-top:4px;">${count}</p>
            <p class="text-secondary" style="font-size:0.75rem;">(${total > 0 ? Math.round(count/total*100) : 0}%)</p>
          </div>
        `).join('')}
      </div>

      <!-- Toggle -->
      <div class="card mb-24" style="padding:12px 16px;">
        <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:0.88rem;">
          <input type="checkbox" id="low-hanging-toggle" ${showLowHangingOnly ? 'checked' : ''}>
          Show low hanging fruit(s) only — แสดงเฉพาะ findings ที่แก้ไขง่าย (LOW / INFORMATIONAL)
        </label>
      </div>

      <!-- Summary Cards per Check Type -->
      <div class="mb-24">
        ${checks.map(check => renderCheckCard(check)).join('')}
      </div>

      <!-- Detail by Region -->
      <h3 style="margin-bottom:12px;">Detail</h3>
      ${regions.map(region => renderRegionDetail(region, byRegion[region])).join('')}
    `;

    // Bind toggle
    document.getElementById('low-hanging-toggle')?.addEventListener('change', (e) => {
      showLowHangingOnly = e.target.checked;
      renderContent();
    });
  }

  function renderCheckCard(check) {
    // Group resources by region
    const byRegion = {};
    check.resources.forEach(f => {
      const r = f.region || 'unknown';
      if (!byRegion[r]) byRegion[r] = [];
      byRegion[r].push(f);
    });

    return `
      <div class="card mb-16" style="border-left:4px solid ${check.severity === 'CRITICAL' ? '#b53333' : check.severity === 'HIGH' ? '#d97757' : check.severity === 'MEDIUM' ? '#b8860b' : '#2d7d46'};">
        <div class="flex-between mb-8">
          ${severityBadge(check.severity)}
          <span class="text-secondary" style="font-size:0.78rem;">${check.pillar || ''}</span>
        </div>
        <div style="margin-bottom:8px;">
          <strong style="font-size:0.88rem;">Description</strong>
          <p style="font-size:0.94rem;">${check.title || check.description || ''}</p>
        </div>
        <div style="margin-bottom:8px;">
          <strong style="font-size:0.88rem;">Resources</strong>
          <div style="font-size:0.82rem; margin-top:4px;">
            ${Object.entries(byRegion).map(([region, resources]) =>
              `<div style="margin-bottom:4px;"><span class="text-secondary">${region}:</span> ${resources.map(r =>
                `<span style="font-family:var(--font-mono); padding:1px 6px; background:var(--bg-page); border-radius:3px; margin:0 2px;">${r.service}::${r.resource_id || ''}</span>`
              ).join(', ')}</div>`
            ).join('')}
          </div>
        </div>
        ${check.recommendation ? `
        <div>
          <strong style="font-size:0.88rem;">Recommendation</strong>
          <p style="font-size:0.88rem; color:var(--text-secondary);">${check.recommendation}</p>
        </div>` : ''}
      </div>
    `;
  }

  function renderRegionDetail(region, findings) {
    // Group by resource
    const byResource = {};
    findings.forEach(f => {
      const rid = f.resource_id || 'unknown';
      if (!byResource[rid]) byResource[rid] = [];
      byResource[rid].push(f);
    });

    return `
      <div class="card mb-16">
        <h4 style="margin-bottom:12px; padding:8px 12px; background:var(--bg-page); border-radius:var(--radius-sm);">
          📍 ${region}
        </h4>
        ${Object.entries(byResource).map(([resourceId, rFindings]) => `
          <div style="margin-bottom:16px; padding-left:12px; border-left:2px solid var(--border-default);">
            <p style="font-family:var(--font-mono); font-size:0.88rem; font-weight:500; margin-bottom:8px;">${resourceId}</p>
            <div class="table-wrapper">
              <table>
                <thead><tr>
                  <th style="width:40px;"></th>
                  <th>Check</th>
                  <th>Current Value</th>
                  <th>Recommendation</th>
                </tr></thead>
                <tbody>
                  ${rFindings.map(f => `<tr>
                    <td>${severityBadge(f.severity)}</td>
                    <td style="font-size:0.88rem; font-weight:500;">${f.check_id || f.title || ''}</td>
                    <td style="font-family:var(--font-mono); font-size:0.82rem;">${extractCurrentValue(f)}</td>
                    <td style="font-size:0.82rem;">${f.recommendation || ''}</td>
                  </tr>`).join('')}
                </tbody>
              </table>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  function extractCurrentValue(f) {
    // Try to extract a meaningful "current value" from the finding
    if (f.title) {
      const match = f.title.match(/has public IP (\S+)/);
      if (match) return match[1];
      if (f.title.includes('128MB') || f.title.includes('128 MB')) return '128 MB';
      if (f.title.includes('not have Multi-AZ')) return 'MultiAZ: false';
      if (f.title.includes('not encrypted')) return 'Encrypted: false';
      if (f.title.includes('not have MFA')) return 'MFA: false';
      if (f.title.includes('not multi-region')) return 'MultiRegion: false';
      if (f.title.includes('no flow log')) return 'FlowLogs: none';
      if (f.title.includes('no retention')) return 'Retention: none';
      if (f.title.includes('rotation not enabled')) return 'Rotation: false';
      if (f.title.includes('has rules')) return 'Rules: present';
      if (f.title.includes('not enabled')) return 'Enabled: false';
      if (f.title.includes('not block public')) return 'PublicBlock: false';
      if (f.title.includes('default encryption')) return 'Encryption: none';
    }
    return f.resource_id || '—';
  }

  return { render, init };
})();
