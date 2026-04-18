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
        <!-- Severity count bar -->
        <div id="findings-severity-bar" class="card mb-24" style="padding:12px 16px;"></div>

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
      // Get latest scan from history, then fetch its results
      const historyData = await ApiClient.get('/scans');
      const scans = (historyData && historyData.scans) || [];
      if (!scans.length) { showEmpty(); return; }

      const latest = scans.find(s => s.status === 'COMPLETED') || scans[0];
      const scanId = latest.scanId || latest.scan_id;
      if (!scanId) { showEmpty(); return; }

      const data = await ApiClient.get('/scans/' + scanId + '/results');
      findings = (data && data.findings) || [];
      if (findings.length === 0) { showEmpty(); return; }
      showContent();

      // Render severity count bar
      const sevBar = document.getElementById('findings-severity-bar');
      if (sevBar) {
        const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFORMATIONAL: 0 };
        findings.forEach(f => { const s = (f.severity || '').toUpperCase(); if (s in counts) counts[s]++; });
        const total = findings.length;
        const colors = { CRITICAL: '#b53333', HIGH: '#d97757', MEDIUM: '#b8860b', LOW: '#2d7d46', INFORMATIONAL: '#5e5d59' };
        sevBar.innerHTML = `
          <div style="display:flex; align-items:center; gap:16px; flex-wrap:wrap;">
            <span style="font-weight:600; font-size:1.1rem;">${total} Findings</span>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              ${Object.entries(counts).filter(([,v]) => v > 0).map(([sev, count]) =>
                `<span class="badge" style="background:${colors[sev]}; color:#fff; font-size:0.78rem; padding:3px 10px;">${count} ${sev}</span>`
              ).join('')}
            </div>
            <div style="flex:1; min-width:200px; height:8px; border-radius:4px; overflow:hidden; display:flex;">
              ${Object.entries(counts).filter(([,v]) => v > 0).map(([sev, count]) =>
                `<div style="width:${(count/total*100).toFixed(1)}%; background:${colors[sev]}; height:100%;"></div>`
              ).join('')}
            </div>
          </div>
        `;
      }

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

  function getRemediationSteps(f) {
    const svc = (f.service || '').toLowerCase();
    const checkId = f.check_id || '';
    const steps = [];

    // Service-specific remediation steps
    if (svc === 'ec2' || checkId.startsWith('ec2')) {
      if (checkId === 'ec2-001' || (f.title || '').includes('public IP')) {
        steps.push('1. เปิด AWS Console → EC2 → Security Groups');
        steps.push('2. เลือก Security Group ที่เกี่ยวข้อง');
        steps.push('3. แก้ไข Inbound Rules — ลบ rule ที่อนุญาต 0.0.0.0/0 บน port 22');
        steps.push('4. เพิ่ม rule ใหม่ที่จำกัด IP เฉพาะที่ต้องการ');
        steps.push('5. พิจารณาใช้ AWS Systems Manager Session Manager แทน SSH');
      } else if (checkId === 'ec2-002' || (f.title || '').includes('encrypt')) {
        steps.push('1. เปิด AWS Console → EC2 → EBS → Volumes');
        steps.push('2. สร้าง snapshot ของ volume ที่ไม่ได้เข้ารหัส');
        steps.push('3. Copy snapshot โดยเลือก Encrypt this snapshot');
        steps.push('4. สร้าง volume ใหม่จาก encrypted snapshot');
        steps.push('5. เปิด EBS encryption by default สำหรับ region นี้');
      }
    } else if (svc === 's3' || checkId.startsWith('s3')) {
      if ((f.title || '').includes('public access')) {
        steps.push('1. เปิด AWS Console → S3 → เลือก bucket');
        steps.push('2. ไปที่ Permissions → Block public access');
        steps.push('3. เปิด Block all public access');
        steps.push('4. ตรวจสอบ Bucket Policy ว่าไม่มี Principal: "*"');
      } else if ((f.title || '').includes('encryption')) {
        steps.push('1. เปิด AWS Console → S3 → เลือก bucket');
        steps.push('2. ไปที่ Properties → Default encryption');
        steps.push('3. เลือก SSE-S3 (AES-256) หรือ SSE-KMS');
        steps.push('4. Save changes');
      }
    } else if (svc === 'rds' || checkId.startsWith('rds')) {
      if ((f.title || '').includes('Multi-AZ')) {
        steps.push('1. เปิด AWS Console → RDS → Databases');
        steps.push('2. เลือก DB instance → Modify');
        steps.push('3. เปิด Multi-AZ deployment');
        steps.push('4. Apply immediately หรือ during maintenance window');
      } else if ((f.title || '').includes('encrypt')) {
        steps.push('1. สร้าง snapshot ของ DB instance');
        steps.push('2. Copy snapshot โดยเลือก Enable encryption');
        steps.push('3. Restore DB instance จาก encrypted snapshot');
        steps.push('4. Update application connection string');
      }
    } else if (svc === 'iam' || checkId.startsWith('iam')) {
      steps.push('1. เปิด AWS Console → IAM → Users');
      steps.push('2. เลือก user ที่เกี่ยวข้อง');
      if ((f.title || '').includes('MFA')) {
        steps.push('3. ไปที่ Security credentials → Assign MFA device');
        steps.push('4. เลือก Virtual MFA device และ scan QR code');
      } else {
        steps.push('3. ตรวจสอบ Permissions policies');
        steps.push('4. ลบ inline policies ที่มี wildcard permissions');
        steps.push('5. ใช้ AWS managed policies แทน');
      }
    } else if (svc === 'cloudtrail' || checkId.startsWith('cloudtrail')) {
      steps.push('1. เปิด AWS Console → CloudTrail → Trails');
      steps.push('2. เลือก trail ที่เกี่ยวข้อง');
      if ((f.title || '').includes('multi-region')) {
        steps.push('3. Edit → เปิด Apply trail to all regions');
      } else if ((f.title || '').includes('KMS')) {
        steps.push('3. Edit → Log file SSE-KMS encryption → เลือก KMS key');
      } else if ((f.title || '').includes('validation')) {
        steps.push('3. Edit → เปิด Log file validation');
      }
      steps.push('4. Save changes');
    } else if (svc === 'vpc' || checkId.startsWith('vpc')) {
      if ((f.title || '').includes('flow log')) {
        steps.push('1. เปิด AWS Console → VPC → Your VPCs');
        steps.push('2. เลือก VPC → Actions → Create flow log');
        steps.push('3. เลือก Filter: All, Destination: CloudWatch Logs');
        steps.push('4. สร้าง IAM role สำหรับ flow logs');
      } else {
        steps.push('1. เปิด AWS Console → VPC → Security Groups');
        steps.push('2. เลือก default security group');
        steps.push('3. ลบ inbound และ outbound rules ทั้งหมด');
      }
    }

    if (steps.length === 0) {
      steps.push('1. ตรวจสอบ resource ที่ระบุใน AWS Console');
      steps.push('2. อ่านคำแนะนำด้านบนและดำเนินการแก้ไข');
      steps.push('3. รัน scan อีกครั้งเพื่อยืนยันว่าแก้ไขสำเร็จ');
    }

    return steps;
  }

  function showFindingDetail(f) {
    const steps = getRemediationSteps(f);
    const body = `
      <div style="display:flex; flex-direction:column; gap:12px;">
        <div><span class="badge ${severityBadgeClass(f.severity)}">${f.severity}</span> <span class="text-secondary" style="margin-left:8px; font-size:0.82rem;">${f.pillar}</span></div>
        <div><strong style="font-size:0.82rem; color:var(--text-secondary);">Resource</strong><p style="font-family:var(--font-mono); font-size:0.88rem; word-break:break-all;">${f.resource_id || f.resourceId || ''}</p></div>
        <div><strong style="font-size:0.82rem; color:var(--text-secondary);">Service / Region / Account</strong><p>${f.service} · ${f.region} · ${f.account_id || f.account || ''}</p></div>
        <div><strong style="font-size:0.82rem; color:var(--text-secondary);">Description</strong><p style="font-size:0.94rem;">${f.description || ''}</p></div>
        <div style="background:var(--bg-page); border:1px solid var(--border-default); border-radius:var(--radius-md); padding:16px;">
          <strong style="font-size:0.82rem; color:var(--color-terracotta);">Recommendation</strong>
          <p style="font-size:0.94rem; margin-top:4px;">${f.recommendation || ''}</p>
        </div>
        <div style="background:var(--bg-page); border:1px solid var(--border-default); border-radius:var(--radius-md); padding:16px;">
          <strong style="font-size:0.82rem; color:var(--color-success);">Remediation Steps</strong>
          <ol style="margin:8px 0 0 0; padding-left:20px; font-size:0.88rem; line-height:1.8;">
            ${steps.map(s => `<li>${s.replace(/^\d+\.\s*/, '')}</li>`).join('')}
          </ol>
        </div>
        <div style="background:rgba(201,100,66,0.06); border:1px solid rgba(201,100,66,0.15); border-radius:var(--radius-md); padding:16px;">
          <strong style="font-size:0.82rem; color:var(--color-terracotta);">Next Steps</strong>
          <ol style="margin:8px 0 0 0; padding-left:20px; font-size:0.88rem; line-height:1.8;">
            <li>ดำเนินการแก้ไขตามขั้นตอนด้านบน</li>
            <li>รัน Scan อีกครั้งเพื่อยืนยันว่า finding นี้ถูกแก้ไขแล้ว</li>
            <li>ตรวจสอบหน้า Compliance ว่า control ที่เกี่ยวข้องเปลี่ยนเป็น PASS</li>
            <li>บันทึกการแก้ไขใน Change Management system ขององค์กร</li>
          </ol>
        </div>
        ${f.documentation_url ? `<div><a href="${f.documentation_url}" target="_blank" rel="noopener noreferrer" style="font-size:0.88rem;">AWS Documentation →</a></div>` : ''}
      </div>
    `;
    App.showModal(f.title || 'Finding Detail', body);
  }

  return { render, init };
})();
