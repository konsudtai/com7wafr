/* ============================================
   WA Review Tool — Report Page
   Well-Architected audit report with:
   - Table of Contents
   - Per-pillar sections
   - Thai / English language toggle
   - PDF export with page breaks
   ============================================ */

// NOTE: Report data is fetched from the backend API via ApiClient.
// i18n labels, pillar summaries, and control details are static reference data.

const ReportPage = (() => {

  let currentLang = 'th';

  // --- i18n ---
  const i18n = {
    th: {
      pageTitle: 'Report',
      pageDesc: 'รายงานผลการตรวจสอบ Well-Architected แยกตาม Pillar สำหรับ Audit Response',
      exportPdf: 'Export PDF',
      generating: 'กำลังสร้าง PDF...',
      reportTitle: 'รายงานผลการตรวจสอบ AWS Well-Architected',
      reportSubtitle: 'รายงานสำหรับการตอบ Audit',
      scanId: 'รหัสการสแกน',
      scanDate: 'วันที่สแกน',
      generated: 'วันที่สร้างรายงาน',
      accountsLabel: 'จำนวน Accounts',
      regionsLabel: 'Regions',
      servicesLabel: 'Services',
      toc: 'สารบัญ',
      execSummary: 'บทสรุปผู้บริหาร',
      resourcesScanned: 'Resources ที่สแกน',
      totalFindings: 'Findings ทั้งหมด',
      critical: 'Critical',
      high: 'High',
      avgScore: 'คะแนนเฉลี่ย',
      execDesc: 'การตรวจสอบครอบคลุม {accounts} AWS accounts, {regions} regions, และ {services} services พบ findings ทั้งหมด {total} รายการ โดยมี {critical} รายการที่เป็น Critical ต้องแก้ไขเร่งด่วน',
      pillarOverview: 'ภาพรวมคะแนนตาม Pillar',
      pillar: 'Pillar',
      score: 'คะแนน',
      status: 'สถานะ',
      findings: 'Findings',
      controlCompliance: 'สถานะการปฏิบัติตาม Control',
      controlId: 'รหัส',
      control: 'Control',
      detail: 'รายละเอียด',
      findingsDetail: 'รายละเอียด Findings',
      resource: 'Resource',
      impact: 'ผลกระทบ',
      evidence: 'หลักฐาน',
      recommendation: 'คำแนะนำ',
      remediationStatus: 'สถานะการแก้ไข',
      awsDocs: 'เอกสาร AWS',
      signOff: 'ลงนาม',
      reviewedBy: 'ผู้ตรวจสอบ',
      approvedBy: 'ผู้อนุมัติ',
      nameDate: 'ชื่อ / วันที่',
      service: 'Service',
      severity: 'Severity',
      issue: 'ปัญหา',
      langLabel: 'ภาษา',
      confidential: 'เอกสารลับ — สำหรับใช้ภายในองค์กรเท่านั้น',
      page: 'หน้า',
    },
    en: {
      pageTitle: 'Report',
      pageDesc: 'Well-Architected assessment report organized by Pillar for Audit Response',
      exportPdf: 'Export PDF',
      generating: 'Generating PDF...',
      reportTitle: 'AWS Well-Architected Review Report',
      reportSubtitle: 'Audit-Ready Assessment Report',
      scanId: 'Scan ID',
      scanDate: 'Scan Date',
      generated: 'Report Generated',
      accountsLabel: 'Accounts',
      regionsLabel: 'Regions',
      servicesLabel: 'Services',
      toc: 'Table of Contents',
      execSummary: 'Executive Summary',
      resourcesScanned: 'Resources Scanned',
      totalFindings: 'Total Findings',
      critical: 'Critical',
      high: 'High',
      avgScore: 'Average Score',
      execDesc: 'This assessment covers {accounts} AWS accounts, {regions} regions, and {services} services. A total of {total} findings were identified, including {critical} Critical findings requiring immediate remediation.',
      pillarOverview: 'Pillar Score Overview',
      pillar: 'Pillar',
      score: 'Score',
      status: 'Status',
      findings: 'Findings',
      controlCompliance: 'Control Compliance Status',
      controlId: 'ID',
      control: 'Control',
      detail: 'Detail',
      findingsDetail: 'Findings Detail',
      resource: 'Resource',
      impact: 'Impact',
      evidence: 'Evidence',
      recommendation: 'Recommendation',
      remediationStatus: 'Remediation Status',
      awsDocs: 'AWS Documentation',
      signOff: 'Sign-Off',
      reviewedBy: 'Reviewed By',
      approvedBy: 'Approved By',
      nameDate: 'Name / Date',
      service: 'Service',
      severity: 'Severity',
      issue: 'Issue',
      langLabel: 'Language',
      confidential: 'Confidential — For internal use only',
      page: 'Page',
    },
  };

  function t(key) { return i18n[currentLang][key] || key; }

  // --- Pillar names per language ---
  const pillarNames = {
    th: { Security: 'ความปลอดภัย (Security)', Reliability: 'ความน่าเชื่อถือ (Reliability)', 'Operational Excellence': 'ความเป็นเลิศด้านการดำเนินงาน (Operational Excellence)', 'Performance Efficiency': 'ประสิทธิภาพด้านการทำงาน (Performance Efficiency)', 'Cost Optimization': 'การเพิ่มประสิทธิภาพด้านต้นทุน (Cost Optimization)' },
    en: { Security: 'Security', Reliability: 'Reliability', 'Operational Excellence': 'Operational Excellence', 'Performance Efficiency': 'Performance Efficiency', 'Cost Optimization': 'Cost Optimization' },
  };

  function pillarName(name) { return pillarNames[currentLang][name] || name; }

  // --- Pillar status per language ---
  const statusNames = {
    th: { Good: 'ดี', 'Needs Improvement': 'ต้องปรับปรุง', 'At Risk': 'มีความเสี่ยง' },
    en: { Good: 'Good', 'Needs Improvement': 'Needs Improvement', 'At Risk': 'At Risk' },
  };
  function statusName(s) { return statusNames[currentLang][s] || s; }

  // --- Pillar summaries per language ---
  const pillarSummaries = {
    th: {
      Security: 'พบปัญหาด้านความปลอดภัยที่ต้องแก้ไขเร่งด่วน โดยเฉพาะการเข้าถึงแบบ public, การเข้ารหัสข้อมูล, และ IAM permissions ที่กว้างเกินไป',
      Reliability: 'พบปัญหาด้าน high availability และ disaster recovery โดยเฉพาะ RDS ที่ไม่ได้เปิด Multi-AZ, ECS ที่ไม่มี circuit breaker, และ Lambda ที่ไม่มี dead letter queue',
      'Operational Excellence': 'ส่วนใหญ่ผ่านเกณฑ์ แต่ยังมีบาง service ที่ขาด monitoring และ logging ที่เพียงพอ',
      'Performance Efficiency': 'พบ resources หลายตัวที่ไม่ได้ optimize สำหรับ workload จริง ทำให้ performance ไม่ดีและเสียค่าใช้จ่ายเกินจำเป็น',
      'Cost Optimization': 'พบ resources จำนวนมากที่ใช้งานไม่เต็มประสิทธิภาพ ทำให้เสียค่าใช้จ่ายเกินจำเป็น ควรดำเนินการ right-sizing และ lifecycle management',
    },
    en: {
      Security: 'Critical security issues identified requiring urgent remediation, particularly around public access, data encryption, and overly permissive IAM policies.',
      Reliability: 'High availability and disaster recovery gaps found, including RDS without Multi-AZ, ECS without circuit breakers, and Lambda without dead letter queues.',
      'Operational Excellence': 'Most controls are met, but some services lack adequate monitoring and logging capabilities.',
      'Performance Efficiency': 'Multiple resources are not optimized for their actual workloads, leading to suboptimal performance and unnecessary costs.',
      'Cost Optimization': 'Significant number of underutilized resources identified. Right-sizing and lifecycle management actions are recommended to reduce costs.',
    },
  };

  // --- Control details per language ---
  const controlDetails = {
    th: {
      'SEC-C1': 'พบ 2 resources ที่เปิด public access โดยไม่จำเป็น (EC2 SSH, EKS endpoint)',
      'SEC-C2': 'S3 และ DynamoDB บางส่วนยังไม่ได้เข้ารหัสด้วย KMS',
      'SEC-C3': 'พบ IAM user ที่มี wildcard permissions และไม่เปิด MFA',
      'SEC-C4': 'ALB access logging ยังไม่เปิด, EKS control plane logging ยังไม่เปิด',
      'SEC-C5': 'CloudFront ยังไม่บังคับ HTTPS',
      'REL-C1': 'RDS production ไม่ได้เปิด Multi-AZ',
      'REL-C2': 'RDS backup retention ต่ำเกินไป, EC2 ไม่มี backup plan',
      'REL-C3': 'ECS ไม่มี circuit breaker, Lambda ไม่มี DLQ',
      'OPS-C1': 'EC2 detailed monitoring และ ECS Container Insights ยังไม่เปิด',
      'OPS-C2': 'EKS control plane logging ยังไม่เปิด',
      'OPS-C3': 'Lambda ใช้ deprecated runtime',
      'PERF-C1': 'Lambda ใช้ default memory, EC2 อาจ over-provisioned',
      'PERF-C2': 'S3 ไม่มี lifecycle policy หรือ intelligent tiering',
      'COST-C1': 'EC2 underutilized, DynamoDB over-provisioned',
      'COST-C2': 'S3 ไม่มี lifecycle policy',
      'COST-C3': 'ไม่ได้ใช้ Reserved Instances หรือ Savings Plans',
    },
    en: {
      'SEC-C1': '2 resources with unnecessary public access (EC2 SSH, EKS endpoint)',
      'SEC-C2': 'Some S3 and DynamoDB resources not encrypted with KMS',
      'SEC-C3': 'IAM user with wildcard permissions and MFA not enabled',
      'SEC-C4': 'ALB access logging and EKS control plane logging not enabled',
      'SEC-C5': 'CloudFront not enforcing HTTPS',
      'REL-C1': 'Production RDS does not have Multi-AZ enabled',
      'REL-C2': 'RDS backup retention too low, EC2 has no backup plan',
      'REL-C3': 'ECS has no circuit breaker, Lambda has no DLQ',
      'OPS-C1': 'EC2 detailed monitoring and ECS Container Insights not enabled',
      'OPS-C2': 'EKS control plane logging not enabled',
      'OPS-C3': 'Lambda using deprecated runtime',
      'PERF-C1': 'Lambda using default memory, EC2 may be over-provisioned',
      'PERF-C2': 'S3 has no lifecycle policy or intelligent tiering',
      'COST-C1': 'EC2 underutilized, DynamoDB over-provisioned',
      'COST-C2': 'S3 has no lifecycle policy',
      'COST-C3': 'Not using Reserved Instances or Savings Plans',
    },
  };

  function ctrlDetail(id) { return controlDetails[currentLang][id] || ''; }

  // --- Data (loaded from API) ---
  let latestScan = null;
  let pillars = [];
  let totalFindings = 0;

  // --- Helpers ---
  function badgeClass(sev) { return { CRITICAL:'badge-critical', HIGH:'badge-high', MEDIUM:'badge-medium', LOW:'badge-low', INFORMATIONAL:'badge-info' }[sev] || 'badge-info'; }
  function ctrlBadge(s) { if (s==='Compliant') return '<span class="badge badge-low">Compliant</span>'; if (s==='Partially Compliant') return '<span class="badge badge-medium">Partially Compliant</span>'; return '<span class="badge badge-critical">Non-Compliant</span>'; }
  function scoreColor(s) { return s >= 70 ? 'var(--color-success)' : s >= 50 ? 'var(--color-warning)' : 'var(--color-error)'; }
  function fImpact(f) { return currentLang === 'th' ? f.impact_th : f.impact_en; }
  function fRec(f) { return currentLang === 'th' ? f.rec_th : f.rec_en; }

  // --- Render ---
  function render() {
    return `
      <div class="page-header flex-between">
        <div>
          <h2>${t('pageTitle')}</h2>
          <p>${t('pageDesc')}</p>
        </div>
        <div class="flex gap-8">
          <select id="report-lang" class="btn btn-secondary btn-sm" style="padding:6px 12px; cursor:pointer;">
            <option value="th" ${currentLang==='th'?'selected':''}>TH</option>
            <option value="en" ${currentLang==='en'?'selected':''}>EN</option>
          </select>
          <button id="btn-export-pdf" class="btn btn-primary">${t('exportPdf')}</button>
        </div>
      </div>

      <div id="report-loading" class="card mb-24" style="text-align:center; padding:48px;">
        <p class="text-secondary">กำลังโหลดข้อมูล...</p>
      </div>

      <div id="report-empty" class="card mb-24 hidden" style="text-align:center; padding:48px;">
        <p class="text-secondary">ยังไม่มีข้อมูลรายงาน กรุณาเริ่มการสแกนก่อน</p>
      </div>

      <div id="report-content" class="hidden"></div>
    `;
  }

  function renderReport() {
    const critCount = pillars.reduce((s,p) => s + p.findings.filter(f=>f.severity==='CRITICAL').length, 0);
    const highCount = pillars.reduce((s,p) => s + p.findings.filter(f=>f.severity==='HIGH').length, 0);
    const avgScore = Math.round(pillars.reduce((s,p) => s + p.score, 0) / pillars.length);
    const now = currentLang === 'th' ? new Date().toLocaleString('th-TH') : new Date().toLocaleString('en-US');

    return `
      <!-- Cover -->
      <div class="report-page" style="text-align:center; padding:60px 24px 40px;">
        <img src="img/com7-logo.avif" alt="Com7 Business" style="height:40px; margin-bottom:24px;">
        <h2 style="font-size:1.8rem; margin-bottom:8px;">${t('reportTitle')}</h2>
        <p style="font-size:1.1rem; color:var(--text-secondary); margin-bottom:32px;">${t('reportSubtitle')}</p>
        <div style="display:inline-block; text-align:left; font-size:0.94rem; line-height:2.2;">
          <p><strong>${t('scanId')}:</strong> ${latestScan.id}</p>
          <p><strong>${t('scanDate')}:</strong> ${latestScan.date}</p>
          <p><strong>${t('generated')}:</strong> ${now}</p>
          <p><strong>${t('accountsLabel')}:</strong> ${latestScan.accounts.length}</p>
          <p><strong>${t('regionsLabel')}:</strong> ${latestScan.regions.join(', ')}</p>
          <p><strong>${t('servicesLabel')}:</strong> ${latestScan.services.length} services</p>
        </div>
        <p style="margin-top:32px; font-size:0.82rem; color:var(--text-tertiary);">${t('confidential')}</p>
      </div>

      <!-- Table of Contents -->
      <div class="report-page">
        <h3 style="margin-bottom:16px;">${t('toc')}</h3>
        <table style="width:100%; border:none;">
          <tbody style="font-size:0.94rem;">
            <tr><td style="border:none; padding:6px 0;">1.</td><td style="border:none; padding:6px 0;">${t('execSummary')}</td></tr>
            <tr><td style="border:none; padding:6px 0;">2.</td><td style="border:none; padding:6px 0;">${t('pillarOverview')}</td></tr>
            ${pillars.map((p,i) => `<tr><td style="border:none; padding:6px 0;">${i+3}.</td><td style="border:none; padding:6px 0;">${pillarName(p.name)}</td></tr>`).join('')}
            <tr><td style="border:none; padding:6px 0;">${pillars.length+3}.</td><td style="border:none; padding:6px 0;">${t('signOff')}</td></tr>
          </tbody>
        </table>
      </div>

      <!-- 1. Executive Summary -->
      <div class="report-page">
        <h3 style="margin-bottom:16px;">1. ${t('execSummary')}</h3>
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap:16px; margin-bottom:16px;">
          <div><p class="text-secondary" style="font-size:0.82rem;">${t('resourcesScanned')}</p><p style="font-size:1.4rem; font-weight:500;">${latestScan.resourcesScanned}</p></div>
          <div><p class="text-secondary" style="font-size:0.82rem;">${t('totalFindings')}</p><p style="font-size:1.4rem; font-weight:500;">${totalFindings}</p></div>
          <div><p class="text-secondary" style="font-size:0.82rem;">${t('critical')}</p><p style="font-size:1.4rem; font-weight:500; color:var(--color-error);">${critCount}</p></div>
          <div><p class="text-secondary" style="font-size:0.82rem;">${t('high')}</p><p style="font-size:1.4rem; font-weight:500; color:var(--color-warning);">${highCount}</p></div>
          <div><p class="text-secondary" style="font-size:0.82rem;">${t('avgScore')}</p><p style="font-size:1.4rem; font-weight:500;">${avgScore}/100</p></div>
        </div>
        <p style="font-size:0.94rem; line-height:1.7;">${t('execDesc').replace('{accounts}',latestScan.accounts.length).replace('{regions}',latestScan.regions.length).replace('{services}',latestScan.services.length).replace('{total}',totalFindings).replace('{critical}',critCount)}</p>
      </div>

      <!-- 2. Pillar Overview -->
      <div class="report-page">
        <h3 style="margin-bottom:12px;">2. ${t('pillarOverview')}</h3>
        <div class="table-wrapper"><table>
          <thead><tr><th>${t('pillar')}</th><th>${t('score')}</th><th>${t('status')}</th><th>${t('findings')}</th><th></th></tr></thead>
          <tbody>${pillars.map(p => `<tr>
            <td style="font-weight:500;">${pillarName(p.name)}</td>
            <td>${p.score}/100</td>
            <td>${statusName(p.status)}</td>
            <td>${p.findings.length}</td>
            <td style="width:30%;"><div class="progress-bar"><div class="progress-bar-fill" style="width:${p.score}%; background:${scoreColor(p.score)};"></div></div></td>
          </tr>`).join('')}</tbody>
        </table></div>
      </div>

      <!-- Per-Pillar Sections -->
      ${pillars.map((p,i) => renderPillarSection(p, i)).join('')}

      <!-- Sign-Off -->
      <div class="report-page">
        <h3 style="margin-bottom:16px;">${pillars.length+3}. ${t('signOff')}</h3>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:40px;">
          <div>
            <p class="text-secondary" style="font-size:0.82rem;">${t('reviewedBy')}</p>
            <div style="border-bottom:1px solid var(--border-strong); height:48px; margin-bottom:4px;"></div>
            <p class="text-secondary" style="font-size:0.82rem;">${t('nameDate')}</p>
          </div>
          <div>
            <p class="text-secondary" style="font-size:0.82rem;">${t('approvedBy')}</p>
            <div style="border-bottom:1px solid var(--border-strong); height:48px; margin-bottom:4px;"></div>
            <p class="text-secondary" style="font-size:0.82rem;">${t('nameDate')}</p>
          </div>
        </div>
      </div>
    `;
  }

  function renderPillarSection(pillar, idx) {
    const num = idx + 3;
    const crit = pillar.findings.filter(f=>f.severity==='CRITICAL').length;
    const high = pillar.findings.filter(f=>f.severity==='HIGH').length;
    const med = pillar.findings.filter(f=>f.severity==='MEDIUM').length;
    const low = pillar.findings.filter(f=>f.severity==='LOW').length;
    const summary = pillarSummaries[currentLang][pillar.name] || '';

    return `
      <div class="report-page">
        <h3 style="margin-bottom:4px;">${num}. ${pillarName(pillar.name)}</h3>
        <div style="display:flex; gap:12px; align-items:center; margin-bottom:12px;">
          <div class="progress-bar" style="width:120px;"><div class="progress-bar-fill" style="width:${pillar.score}%; background:${scoreColor(pillar.score)};"></div></div>
          <span style="font-weight:500;">${pillar.score}/100</span>
          <span class="text-secondary">${statusName(pillar.status)}</span>
        </div>
        <p style="font-size:0.94rem; line-height:1.7; margin-bottom:16px;">${summary}</p>
        <div style="display:flex; gap:12px; margin-bottom:20px; flex-wrap:wrap;">
          ${crit?`<span class="badge badge-critical">${crit} Critical</span>`:''}
          ${high?`<span class="badge badge-high">${high} High</span>`:''}
          ${med?`<span class="badge badge-medium">${med} Medium</span>`:''}
          ${low?`<span class="badge badge-low">${low} Low</span>`:''}
        </div>

        <h4 style="margin-bottom:8px;">${num}.1 ${t('controlCompliance')}</h4>
        <div class="table-wrapper" style="margin-bottom:20px;"><table>
          <thead><tr><th>${t('controlId')}</th><th>${t('control')}</th><th>${t('status')}</th><th>${t('detail')}</th></tr></thead>
          <tbody>${pillar.controls.map(c => `<tr>
            <td style="font-family:var(--font-mono); font-size:0.82rem;">${c.id}</td>
            <td style="font-weight:500;">${c.control}</td>
            <td>${ctrlBadge(c.status)}</td>
            <td style="font-size:0.88rem;">${ctrlDetail(c.id)}</td>
          </tr>`).join('')}</tbody>
        </table></div>

        <h4 style="margin-bottom:8px;">${num}.2 ${t('findingsDetail')}</h4>
        ${pillar.findings.map(f => `
          <div style="border:1px solid var(--border-default); border-radius:var(--radius-md); padding:16px; margin-bottom:12px; break-inside:avoid;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px; flex-wrap:wrap; gap:8px;">
              <div><span class="badge ${badgeClass(f.severity)}">${f.severity}</span> <span style="font-family:var(--font-mono); font-size:0.82rem; margin-left:8px;">${f.id}</span></div>
              <span class="text-secondary" style="font-size:0.82rem;">${f.service} | ${f.account}</span>
            </div>
            <p style="font-weight:500; margin-bottom:8px;">${f.title}</p>
            <div style="display:grid; grid-template-columns:1fr; gap:6px; font-size:0.88rem;">
              <div><strong>${t('resource')}:</strong> <code style="font-size:0.82rem; word-break:break-all;">${f.resource}</code></div>
              <div><strong>${t('impact')}:</strong> ${fImpact(f)}</div>
              <div><strong>${t('evidence')}:</strong> <code style="font-size:0.82rem;">${f.evidence}</code></div>
              <div><strong>${t('recommendation')}:</strong> ${fRec(f)}</div>
              <div><strong>${t('remediationStatus')}:</strong> ${f.remediation_status}</div>
              <div><a href="${f.docLink}" target="_blank" rel="noopener noreferrer" style="font-size:0.82rem;">${t('awsDocs')}</a></div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  // --- Export PDF ---
  function exportPDF() {
    const el = document.getElementById('report-content');
    if (!el) return;
    const btn = document.getElementById('btn-export-pdf');
    if (btn) { btn.disabled = true; btn.textContent = t('generating'); }

    const opt = {
      margin: [12, 10, 12, 10],
      filename: 'wa-review-audit-report-' + latestScan.id + '-' + currentLang + '.pdf',
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: 2, useCORS: true, logging: false },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css'], before: '.report-page', avoid: ['tr', '[style*="break-inside:avoid"]'] },
    };

    html2pdf().set(opt).from(el).save().then(() => {
      if (btn) { btn.disabled = false; btn.textContent = t('exportPdf'); }
    }).catch(() => {
      if (btn) { btn.disabled = false; btn.textContent = t('exportPdf'); }
    });
  }

  // --- Init ---
  async function init() {
    document.getElementById('btn-export-pdf')?.addEventListener('click', exportPDF);
    document.getElementById('report-lang')?.addEventListener('change', (e) => {
      currentLang = e.target.value;
      App.renderPage();
    });

    try {
      const data = await ApiClient.get('/scans/latest/results');
      if (!data || !data.findings || data.findings.length === 0) {
        showReportEmpty();
        return;
      }
      latestScan = {
        id: data.scan_id || data.scanId || '—',
        date: data.started_at || data.date || '—',
        status: data.status || 'COMPLETED',
        resourcesScanned: data.resources_scanned || data.resourcesScanned || 0,
        accounts: data.accounts || [],
        regions: data.regions || [],
        services: data.services || [],
      };
      pillars = data.pillars || buildPillarsFromFindings(data.findings);
      totalFindings = pillars.reduce((s, p) => s + p.findings.length, 0);

      document.getElementById('report-loading')?.classList.add('hidden');
      document.getElementById('report-empty')?.classList.add('hidden');
      const el = document.getElementById('report-content');
      if (el) { el.classList.remove('hidden'); el.innerHTML = renderReport(); }
    } catch (err) {
      showReportEmpty();
    }
  }

  function showReportEmpty() {
    document.getElementById('report-loading')?.classList.add('hidden');
    document.getElementById('report-empty')?.classList.remove('hidden');
    document.getElementById('report-content')?.classList.add('hidden');
  }

  function buildPillarsFromFindings(findings) {
    const pillarMap = {};
    findings.forEach(f => {
      const p = f.pillar || 'Unknown';
      if (!pillarMap[p]) pillarMap[p] = { name: p, score: 100, status: 'Good', findings: [], controls: [] };
      pillarMap[p].findings.push({
        id: f.finding_id || f.id || '',
        resource: f.resource_id || f.resourceId || '',
        account: f.account_id || f.account || '',
        service: f.service || '',
        severity: f.severity || '',
        title: f.title || '',
        impact_th: f.description || '',
        impact_en: f.description || '',
        rec_th: f.recommendation || '',
        rec_en: f.recommendation || '',
        evidence: '',
        remediation_status: 'Open',
        docLink: f.documentation_url || '#',
      });
    });
    Object.values(pillarMap).forEach(p => {
      const count = p.findings.length;
      p.score = Math.max(0, 100 - count * 5);
      p.status = p.score >= 70 ? 'Good' : p.score >= 50 ? 'Needs Improvement' : 'At Risk';
    });
    return Object.values(pillarMap);
  }

  return { render, init };
})();
