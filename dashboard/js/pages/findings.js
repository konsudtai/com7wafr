/* ============================================
   WA Review Tool — Findings Page
   Table with dropdown filters, text search,
   detail modal
   ============================================ */

// NOTE: Mock data below is for DEMO MODE only.
// In production, all data is fetched from the backend API via ApiClient.

const FindingsPage = (() => {
  // --- Mock Findings Data ---
  const findings = [
    {
      id: 'FIND-001',
      resourceId: 'i-0abc123def456789',
      service: 'EC2',
      region: 'us-east-1',
      account: '111122223333',
      pillar: 'Security',
      severity: 'CRITICAL',
      title: 'EC2 instance has public IP with unrestricted SSH access',
      description: 'The EC2 instance has a public IP address and its security group allows inbound SSH (port 22) from 0.0.0.0/0, exposing it to brute-force attacks.',
      recommendation: 'Restrict SSH access to specific IP ranges using security group rules. Consider using AWS Systems Manager Session Manager for remote access instead.',
      docLink: 'https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-security-groups.html',
    },
    {
      id: 'FIND-002',
      resourceId: 'my-app-bucket',
      service: 'S3',
      region: 'us-east-1',
      account: '111122223333',
      pillar: 'Security',
      severity: 'HIGH',
      title: 'S3 bucket does not have server-side encryption enabled',
      description: 'The S3 bucket does not have default server-side encryption configured, leaving objects unencrypted at rest.',
      recommendation: 'Enable default encryption on the S3 bucket using SSE-S3 or SSE-KMS.',
      docLink: 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucket-encryption.html',
    },
    {
      id: 'FIND-003',
      resourceId: 'db-instance-prod',
      service: 'RDS',
      region: 'ap-southeast-1',
      account: '444455556666',
      pillar: 'Reliability',
      severity: 'HIGH',
      title: 'RDS instance does not have Multi-AZ enabled',
      description: 'The RDS instance is running in a single Availability Zone without Multi-AZ deployment, reducing fault tolerance.',
      recommendation: 'Enable Multi-AZ deployment for production RDS instances to improve availability and failover support.',
      docLink: 'https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZ.html',
    },
    {
      id: 'FIND-004',
      resourceId: 'arn:aws:iam::111122223333:user/deploy-bot',
      service: 'IAM',
      region: 'global',
      account: '111122223333',
      pillar: 'Security',
      severity: 'CRITICAL',
      title: 'IAM user has inline policy with wildcard permissions',
      description: 'The IAM user has an inline policy granting Action: "*" on Resource: "*", violating the principle of least privilege.',
      recommendation: 'Replace wildcard permissions with specific actions and resources. Use IAM Access Analyzer to identify required permissions.',
      docLink: 'https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#grant-least-privilege',
    },
    {
      id: 'FIND-005',
      resourceId: 'my-api-function',
      service: 'Lambda',
      region: 'eu-west-1',
      account: '777788889999',
      pillar: 'Performance Efficiency',
      severity: 'MEDIUM',
      title: 'Lambda function memory is set to default 128 MB',
      description: 'The Lambda function uses the default 128 MB memory allocation which may cause slower execution and higher duration costs.',
      recommendation: 'Use AWS Lambda Power Tuning to find the optimal memory configuration for cost and performance.',
      docLink: 'https://docs.aws.amazon.com/lambda/latest/dg/configuration-memory.html',
    },
    {
      id: 'FIND-006',
      resourceId: 'prod-table',
      service: 'DynamoDB',
      region: 'us-east-1',
      account: '111122223333',
      pillar: 'Cost Optimization',
      severity: 'LOW',
      title: 'DynamoDB table uses provisioned capacity with low utilization',
      description: 'The DynamoDB table is using provisioned capacity mode but average utilization is below 20%, resulting in unnecessary costs.',
      recommendation: 'Switch to on-demand capacity mode or enable auto-scaling to match actual usage patterns.',
      docLink: 'https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/HowItWorks.ReadWriteCapacityMode.html',
    },
    {
      id: 'FIND-007',
      resourceId: 'arn:aws:elasticloadbalancing:us-east-1:444455556666:loadbalancer/app/my-alb/abc123',
      service: 'ELB',
      region: 'us-east-1',
      account: '444455556666',
      pillar: 'Operational Excellence',
      severity: 'MEDIUM',
      title: 'ALB access logging is not enabled',
      description: 'The Application Load Balancer does not have access logging enabled, making it difficult to troubleshoot and audit traffic.',
      recommendation: 'Enable access logging on the ALB and configure an S3 bucket to store the logs.',
      docLink: 'https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-access-logs.html',
    },
    {
      id: 'FIND-008',
      resourceId: 'd-abc123xyz',
      service: 'CloudFront',
      region: 'global',
      account: '777788889999',
      pillar: 'Security',
      severity: 'MEDIUM',
      title: 'CloudFront distribution does not enforce HTTPS',
      description: 'The CloudFront distribution viewer protocol policy allows HTTP connections, which can expose data in transit.',
      recommendation: 'Set the viewer protocol policy to "redirect-to-https" or "https-only" for all cache behaviors.',
      docLink: 'https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-https.html',
    },
    {
      id: 'FIND-009',
      resourceId: 'prod-cluster',
      service: 'ECS',
      region: 'ap-southeast-1',
      account: '444455556666',
      pillar: 'Reliability',
      severity: 'LOW',
      title: 'ECS service desired count is set to 1',
      description: 'The ECS service has a desired count of 1, meaning there is no redundancy if the single task fails.',
      recommendation: 'Set the desired count to at least 2 and spread tasks across multiple Availability Zones.',
      docLink: 'https://docs.aws.amazon.com/AmazonECS/latest/bestpracticesguide/reliability.html',
    },
    {
      id: 'FIND-010',
      resourceId: 'eks-dev-cluster',
      service: 'EKS',
      region: 'eu-west-1',
      account: '777788889999',
      pillar: 'Security',
      severity: 'HIGH',
      title: 'EKS cluster endpoint is publicly accessible',
      description: 'The EKS cluster API server endpoint is publicly accessible, increasing the attack surface.',
      recommendation: 'Restrict the cluster endpoint to private access only or limit public access to specific CIDR blocks.',
      docLink: 'https://docs.aws.amazon.com/eks/latest/userguide/cluster-endpoint.html',
    },
  ];

  // --- Helpers ---
  function unique(arr) {
    return [...new Set(arr)].sort();
  }

  function severityBadgeClass(severity) {
    const map = {
      CRITICAL: 'badge-critical',
      HIGH: 'badge-high',
      MEDIUM: 'badge-medium',
      LOW: 'badge-low',
      INFORMATIONAL: 'badge-info',
    };
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
      if (account && f.account !== account) return false;
      if (region && f.region !== region) return false;
      if (service && f.service !== service) return false;
      if (pillar && f.pillar !== pillar) return false;
      if (severity && f.severity !== severity) return false;
      if (search && !f.resourceId.toLowerCase().includes(search) && !f.title.toLowerCase().includes(search)) return false;
      return true;
    });
  }

  function renderTableBody(filtered) {
    if (filtered.length === 0) {
      return '<tr><td colspan="7" class="text-center text-secondary" style="padding:24px;">ไม่พบ findings ที่ตรงกับเงื่อนไข</td></tr>';
    }
    return filtered.map(f => `
      <tr class="finding-row" data-id="${f.id}" style="cursor:pointer;">
        <td style="font-family:var(--font-mono); font-size:0.82rem;">${f.resourceId}</td>
        <td>${f.service}</td>
        <td>${f.region}</td>
        <td>${f.account}</td>
        <td>${f.pillar}</td>
        <td><span class="badge ${severityBadgeClass(f.severity)}">${f.severity}</span></td>
        <td>${f.title}</td>
      </tr>
    `).join('');
  }

  function buildSelectOptions(values, label) {
    const opts = values.map(v => `<option value="${v}">${v}</option>`).join('');
    return `<option value="">All ${label}</option>${opts}`;
  }

  // --- Render ---
  function render() {
    const accounts = unique(findings.map(f => f.account));
    const regions = unique(findings.map(f => f.region));
    const services = unique(findings.map(f => f.service));
    const pillars = unique(findings.map(f => f.pillar));
    const severities = unique(findings.map(f => f.severity));

    return `
      <div class="page-header">
        <h2>Findings</h2>
        <p>ผลการตรวจสอบทั้งหมด — กรองตาม account, region, service, pillar หรือ severity</p>
      </div>

      <div class="card mb-24">
        <div class="flex gap-8" style="flex-wrap:wrap; align-items:flex-end;">
          <div class="form-group" style="margin-bottom:0; min-width:140px;">
            <label for="filter-account">Account</label>
            <select id="filter-account">${buildSelectOptions(accounts, 'Accounts')}</select>
          </div>
          <div class="form-group" style="margin-bottom:0; min-width:140px;">
            <label for="filter-region">Region</label>
            <select id="filter-region">${buildSelectOptions(regions, 'Regions')}</select>
          </div>
          <div class="form-group" style="margin-bottom:0; min-width:120px;">
            <label for="filter-service">Service</label>
            <select id="filter-service">${buildSelectOptions(services, 'Services')}</select>
          </div>
          <div class="form-group" style="margin-bottom:0; min-width:140px;">
            <label for="filter-pillar">Pillar</label>
            <select id="filter-pillar">${buildSelectOptions(pillars, 'Pillars')}</select>
          </div>
          <div class="form-group" style="margin-bottom:0; min-width:130px;">
            <label for="filter-severity">Severity</label>
            <select id="filter-severity">${buildSelectOptions(severities, 'Severities')}</select>
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
                <th>Resource ID</th>
                <th>Service</th>
                <th>Region</th>
                <th>Account</th>
                <th>Pillar</th>
                <th>Severity</th>
                <th>Title</th>
              </tr>
            </thead>
            <tbody id="findings-tbody">
              ${renderTableBody(findings)}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // --- Init ---
  function init() {
    // Filter change listeners
    const filterIds = ['filter-account', 'filter-region', 'filter-service', 'filter-pillar', 'filter-severity'];
    filterIds.forEach(id => {
      document.getElementById(id)?.addEventListener('change', applyFilters);
    });

    // Text search with debounce
    let searchTimer = null;
    document.getElementById('filter-search')?.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(applyFilters, 250);
    });

    // Row click → detail modal
    document.getElementById('findings-tbody')?.addEventListener('click', (e) => {
      const row = e.target.closest('.finding-row');
      if (!row) return;
      const findingId = row.dataset.id;
      const finding = findings.find(f => f.id === findingId);
      if (finding) showFindingDetail(finding);
    });
  }

  function applyFilters() {
    const filtered = getFilteredFindings();
    const tbody = document.getElementById('findings-tbody');
    if (tbody) tbody.innerHTML = renderTableBody(filtered);

    // Re-attach is not needed — we use event delegation on tbody
  }

  function showFindingDetail(f) {
    const body = `
      <div style="display:flex; flex-direction:column; gap:12px;">
        <div>
          <span class="badge ${severityBadgeClass(f.severity)}">${f.severity}</span>
          <span class="text-secondary" style="margin-left:8px; font-size:0.82rem;">${f.pillar}</span>
        </div>
        <div>
          <strong style="font-size:0.82rem; color:var(--text-secondary);">Resource</strong>
          <p style="font-family:var(--font-mono); font-size:0.88rem; word-break:break-all;">${f.resourceId}</p>
        </div>
        <div>
          <strong style="font-size:0.82rem; color:var(--text-secondary);">Service / Region / Account</strong>
          <p>${f.service} · ${f.region} · ${f.account}</p>
        </div>
        <div>
          <strong style="font-size:0.82rem; color:var(--text-secondary);">Description</strong>
          <p style="font-size:0.94rem;">${f.description}</p>
        </div>
        <div>
          <strong style="font-size:0.82rem; color:var(--text-secondary);">Recommendation</strong>
          <p style="font-size:0.94rem;">${f.recommendation}</p>
        </div>
        <div>
          <a href="${f.docLink}" target="_blank" rel="noopener noreferrer" style="font-size:0.88rem;">AWS Documentation &rarr;</a>
        </div>
      </div>
    `;
    App.showModal(f.title, body);
  }

  return { render, init };
})();
