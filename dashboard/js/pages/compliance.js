/* ============================================
   WA Review Tool — Compliance Page
   Framework compliance based on scan findings
   Format: Service Screener v2 style
   ============================================ */

const CompliancePage = (() => {
  let findings = [];
  let allFindings = [];
  let activeFramework = 0;
  let selectedAccount = ''; // '' = all accounts

  function render() {
    return `
      <div class="page-header">
        <h2>Compliance / Frameworks</h2>
        <p>สถานะ compliance จากผลการ scan — map กับ frameworks มาตรฐาน</p>
      </div>

      <div id="compliance-account-filter" class="card mb-24 hidden" style="padding:12px 16px;">
        <div class="flex gap-8" style="align-items:center;">
          <label style="font-size:0.88rem; font-weight:500; white-space:nowrap;">Account:</label>
          <select id="compliance-account-select" style="flex:1; max-width:400px;"></select>
        </div>
      </div>

      <div id="compliance-loading" class="card mb-24" style="text-align:center; padding:48px;">
        <p class="text-secondary">กำลังโหลดข้อมูล...</p>
      </div>

      <div id="compliance-empty" class="card mb-24 hidden" style="text-align:center; padding:48px;">
        <p class="text-secondary">ยังไม่มีข้อมูล — กรุณาเริ่มการสแกนก่อน</p>
      </div>

      <div id="compliance-content" class="hidden"></div>
    `;
  }

  async function init() {
    try {
      const historyData = await ApiClient.get('/scans');
      const scans = (historyData && historyData.scans) || [];
      if (!scans.length) { showState('empty'); return; }

      const latest = scans.find(s => s.status === 'COMPLETED') || scans[0];
      const scanId = latest.scanId || latest.scan_id;
      if (!scanId) { showState('empty'); return; }

      const data = await ApiClient.get('/scans/' + scanId + '/results');
      allFindings = (data && data.findings) || [];
      findings = allFindings;

      // Populate account filter
      const accounts = [...new Set(allFindings.map(f => f.account_id || f.account || '').filter(Boolean))].sort();
      if (accounts.length > 0) {
        const filterEl = document.getElementById('compliance-account-filter');
        const selectEl = document.getElementById('compliance-account-select');
        if (filterEl && selectEl) {
          filterEl.classList.remove('hidden');
          selectEl.innerHTML = `<option value="">All Accounts (${accounts.length})</option>` +
            accounts.map(a => `<option value="${a}">${a}</option>`).join('');
          selectEl.addEventListener('change', (e) => {
            selectedAccount = e.target.value;
            findings = selectedAccount ? allFindings.filter(f => (f.account_id || f.account) === selectedAccount) : allFindings;
            renderAll();
          });
        }
      }

      showState('content');
      renderAll();
    } catch (err) {
      console.error('Compliance init error:', err);
      showState('empty');
    }
  }

  function showState(state) {
    document.getElementById('compliance-loading')?.classList.add('hidden');
    document.getElementById('compliance-empty')?.classList.add('hidden');
    document.getElementById('compliance-content')?.classList.add('hidden');
    if (state === 'content') document.getElementById('compliance-content')?.classList.remove('hidden');
    else if (state === 'empty') document.getElementById('compliance-empty')?.classList.remove('hidden');
  }

  // ============================================================
  // Framework Definitions (Service Screener v2 style)
  // Each control has: id, title (WA question), check_ids, description, ref_url
  // Status logic: findings exist for check_ids → Need Attention
  //               no findings but service was scanned → Compliant
  //               service not scanned → Not available
  // ============================================================
  function getFrameworks() {
    return [
      // --- WAFS: Well-Architected Framework Security ---
      {
        id: 'wafs', name: 'Well-Architected Framework', color: '#2d7d46',
        description: 'AWS Well-Architected Framework — Security Pillar best practices',
        categories: [
          { category: 'SEC01', title: 'Securely operate your workload', controls: [
            { id: 'SEC01BP01', title: 'Separate workloads using accounts', check_ids: [], description: 'Use AWS Organizations to separate workloads', ref: 'https://docs.aws.amazon.com/wellarchitected/latest/security-pillar/sec_securely_operate_multi_accounts.html' },
            { id: 'SEC01BP02', title: 'Secure account root user and properties', check_ids: ['iam-001', 'iam-003'], description: 'Enable MFA on root, remove root access keys', ref: 'https://docs.aws.amazon.com/IAM/latest/UserGuide/id_root-user.html' },
            { id: 'SEC01BP04', title: 'Stay up to date with security threats', check_ids: [], description: 'Enable GuardDuty for threat detection', ref: 'https://docs.aws.amazon.com/guardduty/latest/ug/what-is-guardduty.html' },
          ]},
          { category: 'SEC02', title: 'Manage identities for people and machines', controls: [
            { id: 'SEC02BP01', title: 'Use strong sign-in mechanisms', check_ids: ['iam-003'], description: 'Enable MFA, enforce password policy', ref: 'https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_mfa.html' },
            { id: 'SEC02BP05', title: 'Audit and rotate credentials periodically', check_ids: ['iam-001', 'iam-002'], description: 'Rotate access keys, review permissions', ref: 'https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html' },
          ]},
          { category: 'SEC03', title: 'Manage permissions for people and machines', controls: [
            { id: 'SEC03BP02', title: 'Grant least privilege access', check_ids: ['iam-002', 'kms-002'], description: 'Use managed policies, avoid wildcards', ref: 'https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#grant-least-privilege' },
          ]},
          { category: 'SEC04', title: 'Detect and investigate security events', controls: [
            { id: 'SEC04BP01', title: 'Configure service and application logging', check_ids: ['cloudtrail-001', 'cloudtrail-003', 'vpc-001', 'cloudwatch-001'], description: 'Enable CloudTrail, VPC Flow Logs, CloudWatch', ref: 'https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-getting-started.html' },
          ]},
          { category: 'SEC05', title: 'Protect your network resources', controls: [
            { id: 'SEC05BP02', title: 'Control traffic within network layers', check_ids: ['ec2-001', 'vpc-002', 'vpc-003'], description: 'Restrict security groups, NACLs', ref: 'https://docs.aws.amazon.com/vpc/latest/userguide/VPC_SecurityGroups.html' },
          ]},
          { category: 'SEC08', title: 'Protect your data at rest', controls: [
            { id: 'SEC08BP02', title: 'Enforce encryption at rest', check_ids: ['s3-002', 'rds-002', 'ec2-002', 'kms-001', 'cloudtrail-002'], description: 'Encrypt S3, RDS, EBS, CloudTrail with KMS', ref: 'https://docs.aws.amazon.com/wellarchitected/latest/security-pillar/protecting-data-at-rest.html' },
          ]},
          { category: 'SEC09', title: 'Protect your data in transit', controls: [
            { id: 'SEC09BP02', title: 'Enforce encryption in transit', check_ids: ['cloudfront-001', 'elb-002'], description: 'Enforce HTTPS on CloudFront and ELB', ref: 'https://docs.aws.amazon.com/wellarchitected/latest/security-pillar/protecting-data-in-transit.html' },
          ]},
        ],
      },
      // --- CIS AWS Foundations Benchmark ---
      {
        id: 'cis-aws', name: 'CIS AWS Foundations', color: '#c96442',
        description: 'CIS Amazon Web Services Foundations Benchmark v1.4',
        categories: [
          { category: 'IAM', title: 'Identity and Access Management', controls: [
            { id: 'CIS.IAM.1', title: 'Avoid use of root account', check_ids: ['iam-001'], description: 'Root account should not have access keys', ref: 'https://docs.aws.amazon.com/securityhub/latest/userguide/iam-controls.html' },
            { id: 'CIS.IAM.5', title: 'Ensure MFA is enabled for all IAM users', check_ids: ['iam-003'], description: 'All IAM users with console access should have MFA', ref: 'https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_mfa.html' },
          ]},
          { category: 'Logging', title: 'Logging and Monitoring', controls: [
            { id: 'CIS.CT.1', title: 'Ensure CloudTrail is enabled in all regions', check_ids: ['cloudtrail-001'], description: 'Multi-region trail should be enabled', ref: 'https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-create-and-update-a-trail.html' },
            { id: 'CIS.CT.2', title: 'Ensure log file validation is enabled', check_ids: ['cloudtrail-003'], description: 'Log file validation detects tampering', ref: 'https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-log-file-validation-intro.html' },
            { id: 'CIS.CT.4', title: 'Ensure trails are encrypted with KMS', check_ids: ['cloudtrail-002'], description: 'CloudTrail logs should be encrypted', ref: 'https://docs.aws.amazon.com/awscloudtrail/latest/userguide/encrypting-cloudtrail-log-files-with-aws-kms.html' },
            { id: 'CIS.CFG.1', title: 'Ensure AWS Config is enabled', check_ids: ['config-001'], description: 'AWS Config records resource configurations', ref: 'https://docs.aws.amazon.com/config/latest/developerguide/gs-console.html' },
          ]},
          { category: 'Networking', title: 'Networking', controls: [
            { id: 'CIS.EC2.2', title: 'Default SG restricts all traffic', check_ids: ['vpc-002'], description: 'Default security group should have no rules', ref: 'https://docs.aws.amazon.com/vpc/latest/userguide/default-security-group.html' },
            { id: 'CIS.EC2.6', title: 'Ensure VPC flow logging is enabled', check_ids: ['vpc-001'], description: 'VPC flow logs capture network traffic', ref: 'https://docs.aws.amazon.com/vpc/latest/userguide/flow-logs.html' },
            { id: 'CIS.EC2.7', title: 'Ensure EBS volumes are encrypted', check_ids: ['ec2-002'], description: 'EBS volumes should use encryption', ref: 'https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/EBSEncryption.html' },
            { id: 'CIS.EC2.21', title: 'NACL does not allow unrestricted SSH', check_ids: ['vpc-003'], description: 'NACLs should not allow 0.0.0.0/0 on port 22', ref: 'https://docs.aws.amazon.com/vpc/latest/userguide/vpc-network-acls.html' },
          ]},
          { category: 'Encryption', title: 'Encryption and Data Protection', controls: [
            { id: 'CIS.KMS.4', title: 'Ensure KMS key rotation is enabled', check_ids: ['kms-001'], description: 'Customer-managed KMS keys should auto-rotate', ref: 'https://docs.aws.amazon.com/kms/latest/developerguide/rotate-keys.html' },
            { id: 'CIS.S3.1', title: 'Ensure S3 buckets block public access', check_ids: ['s3-001'], description: 'S3 Block Public Access should be enabled', ref: 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html' },
            { id: 'CIS.RDS.3', title: 'Ensure RDS encryption enabled', check_ids: ['rds-002'], description: 'RDS instances should be encrypted at rest', ref: 'https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Overview.Encryption.html' },
          ]},
        ],
      },
      // --- SPIP ---
      {
        id: 'spip', name: 'AWS SPIP', color: '#ED7100',
        description: 'AWS Security Posture Improvement Program — 6 phases of security posture management',
        categories: [
          { category: 'P1', title: 'Identity Protection', controls: [
            { id: 'P1.1', title: 'Enable MFA for root and IAM users', check_ids: ['iam-003'], description: 'All users with console access must have MFA', ref: 'https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_mfa.html' },
            { id: 'P1.6', title: 'Implement least privilege access', check_ids: ['iam-002'], description: 'Use managed policies, avoid inline wildcards', ref: 'https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html' },
            { id: 'P1.7', title: 'Review and remove unused credentials', check_ids: ['iam-001'], description: 'Remove root access keys, unused IAM users', ref: 'https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_finding-unused.html' },
          ]},
          { category: 'P2', title: 'Data Protection', controls: [
            { id: 'P2.1', title: 'Block public access to S3 buckets', check_ids: ['s3-001'], description: 'Enable S3 Block Public Access', ref: 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html' },
            { id: 'P2.3', title: 'Encrypt data at rest', check_ids: ['s3-002', 'ec2-002', 'rds-002'], description: 'Encrypt S3, EBS, RDS', ref: 'https://docs.aws.amazon.com/wellarchitected/latest/security-pillar/protecting-data-at-rest.html' },
            { id: 'P2.5', title: 'Enforce encryption in transit', check_ids: ['cloudfront-001', 'elb-002'], description: 'Enforce HTTPS everywhere', ref: 'https://docs.aws.amazon.com/wellarchitected/latest/security-pillar/protecting-data-in-transit.html' },
          ]},
          { category: 'P3', title: 'Infrastructure Protection', controls: [
            { id: 'P3.1', title: 'Restrict security group rules', check_ids: ['ec2-001', 'vpc-002', 'vpc-003'], description: 'No open ports to 0.0.0.0/0', ref: 'https://docs.aws.amazon.com/vpc/latest/userguide/VPC_SecurityGroups.html' },
            { id: 'P3.4', title: 'Enable VPC flow logs', check_ids: ['vpc-001'], description: 'Capture network traffic for monitoring', ref: 'https://docs.aws.amazon.com/vpc/latest/userguide/flow-logs.html' },
          ]},
          { category: 'P4', title: 'Detection & Mitigation', controls: [
            { id: 'P4.1', title: 'Enable CloudTrail with log validation', check_ids: ['cloudtrail-001', 'cloudtrail-003'], description: 'Multi-region trail with validation', ref: 'https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-getting-started.html' },
            { id: 'P4.5', title: 'Configure CloudWatch alarms', check_ids: ['cloudwatch-001', 'cloudwatch-002'], description: 'Set retention and metric filters', ref: 'https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/AlarmThatSendsEmail.html' },
            { id: 'P4.6', title: 'Enable AWS Config', check_ids: ['config-001'], description: 'Track resource configuration changes', ref: 'https://docs.aws.amazon.com/config/latest/developerguide/gs-console.html' },
          ]},
          { category: 'P5', title: 'AppSec & DevSecOps', controls: [
            { id: 'P5.2', title: 'Use latest runtime versions', check_ids: ['lambda-003'], description: 'Avoid deprecated Lambda runtimes', ref: 'https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html' },
            { id: 'P5.3', title: 'Enable KMS key rotation', check_ids: ['kms-001'], description: 'Auto-rotate customer-managed keys', ref: 'https://docs.aws.amazon.com/kms/latest/developerguide/rotate-keys.html' },
            { id: 'P5.4', title: 'Restrict KMS key policies', check_ids: ['kms-002'], description: 'No wildcard principals in key policies', ref: 'https://docs.aws.amazon.com/kms/latest/developerguide/key-policies.html' },
          ]},
        ],
      },
      // --- NIST CSF ---
      {
        id: 'nist-csf', name: 'NIST CSF', color: '#3334B9',
        description: 'NIST Cybersecurity Framework v1.1',
        categories: [
          { category: 'Protect', title: 'Protect', controls: [
            { id: 'PR.AC-1', title: 'Identities and credentials managed', check_ids: ['iam-001', 'iam-002', 'iam-003'], description: 'Manage identities, credentials, and access', ref: 'https://www.nist.gov/cyberframework' },
            { id: 'PR.DS-1', title: 'Data-at-rest is protected', check_ids: ['s3-002', 'rds-002', 'ec2-002'], description: 'Encrypt data at rest', ref: 'https://www.nist.gov/cyberframework' },
            { id: 'PR.DS-2', title: 'Data-in-transit is protected', check_ids: ['cloudfront-001', 'elb-002'], description: 'Encrypt data in transit', ref: 'https://www.nist.gov/cyberframework' },
            { id: 'PR.PT-1', title: 'Audit/log records maintained', check_ids: ['cloudtrail-001', 'cloudtrail-003', 'vpc-001', 'cloudwatch-001'], description: 'Maintain audit logs', ref: 'https://www.nist.gov/cyberframework' },
          ]},
          { category: 'Detect', title: 'Detect', controls: [
            { id: 'DE.CM-1', title: 'Network is monitored', check_ids: ['vpc-001', 'elb-001'], description: 'Monitor network for anomalies', ref: 'https://www.nist.gov/cyberframework' },
            { id: 'DE.CM-7', title: 'Monitoring for unauthorized activity', check_ids: ['cloudtrail-001', 'cloudwatch-002'], description: 'Detect unauthorized access', ref: 'https://www.nist.gov/cyberframework' },
          ]},
          { category: 'Recover', title: 'Recover', controls: [
            { id: 'RC.RP-1', title: 'Recovery plan is executed', check_ids: ['rds-001', 'rds-003'], description: 'Multi-AZ and backup for recovery', ref: 'https://www.nist.gov/cyberframework' },
          ]},
        ],
      },
      // --- SOC 2 ---
      {
        id: 'soc2', name: 'SOC 2', color: '#DD344C',
        description: 'SOC 2 Trust Services Criteria',
        categories: [
          { category: 'CC6', title: 'Logical and Physical Access', controls: [
            { id: 'CC6.1', title: 'Logical access controls', check_ids: ['iam-001', 'iam-002', 'iam-003', 'vpc-002'], description: 'Control access to systems', ref: 'https://us.aicpa.org/interestareas/frc/assuranceadvisoryservices/trustservicescriteria' },
            { id: 'CC6.6', title: 'System boundaries protected', check_ids: ['ec2-001', 'vpc-001', 'vpc-003'], description: 'Protect network boundaries', ref: 'https://us.aicpa.org/interestareas/frc/assuranceadvisoryservices/trustservicescriteria' },
            { id: 'CC6.7', title: 'Data transmission protected', check_ids: ['cloudfront-001', 'elb-002'], description: 'Encrypt data in transit', ref: 'https://us.aicpa.org/interestareas/frc/assuranceadvisoryservices/trustservicescriteria' },
          ]},
          { category: 'CC7', title: 'System Operations', controls: [
            { id: 'CC7.1', title: 'Detection and monitoring', check_ids: ['cloudtrail-001', 'cloudwatch-001', 'vpc-001'], description: 'Monitor for security events', ref: 'https://us.aicpa.org/interestareas/frc/assuranceadvisoryservices/trustservicescriteria' },
            { id: 'CC7.2', title: 'Anomalies monitored', check_ids: ['cloudtrail-001', 'cloudwatch-002'], description: 'Evaluate anomalies', ref: 'https://us.aicpa.org/interestareas/frc/assuranceadvisoryservices/trustservicescriteria' },
          ]},
          { category: 'CC8', title: 'Change Management', controls: [
            { id: 'CC8.1', title: 'Changes authorized and tested', check_ids: ['config-001'], description: 'Track configuration changes', ref: 'https://us.aicpa.org/interestareas/frc/assuranceadvisoryservices/trustservicescriteria' },
          ]},
          { category: 'C1', title: 'Confidentiality', controls: [
            { id: 'C1.1', title: 'Confidential information protected', check_ids: ['s3-001', 's3-002', 'rds-002', 'kms-001'], description: 'Protect confidential data', ref: 'https://us.aicpa.org/interestareas/frc/assuranceadvisoryservices/trustservicescriteria' },
          ]},
        ],
      },
    ];
  }

  // ============================================================
  // Compliance evaluation logic
  // ============================================================
  function evaluateControl(control) {
    if (!control.check_ids || control.check_ids.length === 0) return { status: 'Not available', resources: [] };

    // Match by check_id (primary)
    const byCheckId = findings.filter(f => f.check_id && control.check_ids.includes(f.check_id));
    if (byCheckId.length > 0) {
      return { status: 'Need Attention', resources: byCheckId };
    }

    // Fallback: match by service prefix from check_id
    // e.g. check_id 'ec2-001' → service 'ec2', 's3-002' → service 's3'
    const serviceMap = {
      ec2: 'EC2', s3: 'S3', rds: 'RDS', iam: 'IAM', lambda: 'Lambda',
      dynamodb: 'DynamoDB', elb: 'ELB', cloudfront: 'CloudFront',
      ecs: 'ECS', eks: 'EKS', cloudtrail: 'CloudTrail', vpc: 'VPC',
      kms: 'KMS', cloudwatch: 'CloudWatch', config: 'Config',
    };

    // Check if any related service was scanned
    const scannedServices = new Set(findings.map(f => (f.service || '').toLowerCase()));
    const controlServices = control.check_ids.map(id => id.split('-')[0]);
    const anyScanned = controlServices.some(prefix => scannedServices.has(prefix));

    if (anyScanned) {
      // Service was scanned but no findings for these check_ids → Compliant
      return { status: 'Compliant', resources: [] };
    }

    return { status: 'Not available', resources: [] };
  }

  function statusBadge(status) {
    if (status === 'Compliant') return '<span class="badge badge-low">Compliant</span>';
    if (status === 'Need Attention') return '<span class="badge badge-critical">Need Attention</span>';
    return '<span class="badge badge-info">Not available</span>';
  }

  // ============================================================
  // Render
  // ============================================================
  function renderAll() {
    const el = document.getElementById('compliance-content');
    if (!el) return;

    const fws = getFrameworks();

    // Summary cards
    const summaries = fws.map((fw, i) => {
      let compliant = 0, needAttention = 0, notAvailable = 0;
      fw.categories.forEach(cat => cat.controls.forEach(ctrl => {
        const r = evaluateControl(ctrl);
        if (r.status === 'Compliant') compliant++;
        else if (r.status === 'Need Attention') needAttention++;
        else notAvailable++;
      }));
      const total = compliant + needAttention;
      const pct = total > 0 ? Math.round((compliant / total) * 100) : 0;
      return { fw, i, compliant, needAttention, notAvailable, pct };
    });

    el.innerHTML = `
      <div class="card-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); margin-bottom:24px;">
        ${summaries.map(s => `
          <div class="card" style="cursor:pointer; border-left:4px solid ${s.fw.color}; ${activeFramework === s.i ? 'box-shadow:0 0 0 2px ' + s.fw.color + '40;' : ''}" onclick="CompliancePage.selectFramework(${s.i})">
            <h4 style="margin-bottom:4px; font-size:0.94rem;">${s.fw.name}</h4>
            <div style="display:flex; align-items:center; gap:8px; margin:8px 0;">
              <span style="font-size:1.6rem; font-weight:600; color:${s.pct >= 70 ? 'var(--color-success)' : s.pct >= 40 ? 'var(--color-warning)' : 'var(--color-error)'};">${s.pct}%</span>
              <div style="flex:1;"><div class="progress-bar"><div class="progress-bar-fill" style="width:${s.pct}%; background:${s.fw.color};"></div></div></div>
            </div>
            <div class="flex gap-8" style="font-size:0.72rem;">
              <span class="badge badge-low">${s.compliant}</span>
              <span class="badge badge-critical">${s.needAttention}</span>
              <span class="badge badge-info">${s.notAvailable}</span>
            </div>
          </div>
        `).join('')}
      </div>

      ${renderFrameworkDetail(fws[activeFramework])}
    `;
  }

  function renderFrameworkDetail(fw) {
    if (!fw) return '';

    return `
      <div class="card">
        <div class="flex-between mb-16">
          <div>
            <h3 style="border-left:4px solid ${fw.color}; padding-left:12px;">${fw.name}</h3>
            <p class="text-secondary" style="font-size:0.82rem; padding-left:16px;">${fw.description}</p>
          </div>
        </div>

        ${fw.categories.map(cat => renderCategory(cat, fw.color)).join('')}
      </div>
    `;
  }

  function renderCategory(cat, color) {
    const results = cat.controls.map(ctrl => ({ ...ctrl, eval: evaluateControl(ctrl) }));

    return `
      <div style="margin-bottom:24px;">
        <h4 style="margin-bottom:8px; padding:8px 12px; background:var(--bg-page); border-radius:var(--radius-sm); border-left:3px solid ${color};">
          ${cat.category} — ${cat.title}
        </h4>
        <div class="table-wrapper">
          <table>
            <thead><tr>
              <th style="width:120px;">Rule ID</th>
              <th>Compliance Status</th>
              <th>Description</th>
              <th style="width:80px;">Reference</th>
            </tr></thead>
            <tbody>
              ${results.map(ctrl => {
                const resourceList = ctrl.eval.resources.length > 0
                  ? `<div style="margin-top:6px; font-size:0.78rem; color:var(--text-secondary);">
                      ${ctrl.eval.resources.slice(0, 5).map(r =>
                        `<span style="display:inline-block; margin:2px 4px 2px 0; padding:1px 6px; background:rgba(181,51,51,0.08); border-radius:3px; font-family:var(--font-mono);">[${r.region || ''}] ${r.service}::${r.resource_id || ''}</span>`
                      ).join('')}
                      ${ctrl.eval.resources.length > 5 ? `<span class="text-secondary">+${ctrl.eval.resources.length - 5} more</span>` : ''}
                    </div>`
                  : '';

                return `<tr style="${ctrl.eval.status === 'Need Attention' ? 'cursor:pointer;' : ''}" ${ctrl.eval.status === 'Need Attention' ? `onclick="CompliancePage.showControlDetail('${ctrl.id}', '${ctrl.title}', ${JSON.stringify(ctrl.check_ids).replace(/"/g, '&quot;')})"` : ''}>
                  <td style="font-family:var(--font-mono); font-size:0.82rem; font-weight:500;">${ctrl.id}</td>
                  <td>${statusBadge(ctrl.eval.status)}</td>
                  <td>
                    <span style="font-weight:500;">${ctrl.title}</span>
                    <br><span class="text-secondary" style="font-size:0.82rem;">${ctrl.description}</span>
                    ${resourceList}
                  </td>
                  <td>${ctrl.ref ? `<a href="${ctrl.ref}" target="_blank" rel="noopener" style="font-size:0.78rem;">AWS Docs</a>` : ''}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function selectFramework(index) {
    activeFramework = index;
    renderAll();
  }

  function showControlDetail(controlId, title, checkIds) {
    const related = findings.filter(f => checkIds.includes(f.check_id));
    if (related.length === 0) return;

    const body = `
      <div style="margin-bottom:12px;">
        <span class="badge badge-critical">Need Attention</span>
        <span style="font-family:var(--font-mono); margin-left:8px;">${controlId}</span>
      </div>
      <p style="font-weight:500; margin-bottom:12px;">${title}</p>
      <p class="text-secondary mb-16" style="font-size:0.88rem;">${related.length} finding(s) ที่ต้องแก้ไขเพื่อให้ผ่าน control นี้</p>
      <div class="table-wrapper"><table>
        <thead><tr><th>Severity</th><th>Service</th><th>Region</th><th>Resource</th><th>Issue</th></tr></thead>
        <tbody>
          ${related.map(f => `<tr>
            <td><span class="badge ${f.severity === 'CRITICAL' ? 'badge-critical' : f.severity === 'HIGH' ? 'badge-high' : f.severity === 'MEDIUM' ? 'badge-medium' : 'badge-low'}">${f.severity}</span></td>
            <td>${f.service || ''}</td>
            <td>${f.region || ''}</td>
            <td style="font-family:var(--font-mono); font-size:0.82rem;">${f.resource_id || ''}</td>
            <td style="font-size:0.88rem;">${f.title || ''}</td>
          </tr>`).join('')}
        </tbody>
      </table></div>
      <div style="margin-top:16px; padding:12px; background:rgba(201,100,66,0.06); border-radius:var(--radius-md);">
        <strong style="font-size:0.82rem; color:var(--color-terracotta);">Next Steps</strong>
        <ol style="margin:8px 0 0; padding-left:20px; font-size:0.88rem; line-height:1.8;">
          <li>แก้ไข findings ทั้งหมดด้านบน</li>
          <li>รัน Scan อีกครั้ง</li>
          <li>ตรวจสอบว่า control นี้เปลี่ยนเป็น Compliant</li>
        </ol>
      </div>
    `;
    App.showModal('Control Detail — ' + controlId, body);
  }

  return { render, init, selectFramework, showControlDetail };
})();
