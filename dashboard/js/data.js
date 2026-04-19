/* ================ DATA LAYER ================ */
/* Loads real data from backend API, provides same interface as mock DATA */
window.DATA = {
  accounts: [],
  pillars: [],
  services: [],
  findings: [],
  frameworks: [],
  history: [],
  team: [],
  costOpps: [],
  loaded: false,

  async load() {
    if (this.loaded) return;
    try {
      // Load scan history
      const histData = await ApiClient.get('/scans');
      const scans = (histData && histData.scans) || [];

      // History
      this.history = scans.map(s => ({
        date: (s.createdAt || '').split('T')[0],
        scanId: s.scanId || s.scan_id,
        status: s.status,
        score: 0, crit: 0, delta: '—',
      }));

      // Load latest scan results
      const latest = scans.find(s => s.status === 'COMPLETED');
      if (latest) {
        const scanId = latest.scanId || latest.scan_id;
        const data = await ApiClient.get('/scans/' + scanId + '/results');
        const findings = (data && data.findings) || [];
        this.findings = findings.map(f => ({
          id: f.finding_id || f.id || '',
          resource: f.resource_id || f.resourceId || '',
          service: f.service || '',
          region: f.region || '',
          account: f.account_id || f.account || '',
          pillar: f.pillar || '',
          severity: f.severity || '',
          title: f.title || '',
          description: f.description || '',
          recommendation: f.recommendation || '',
          check_id: f.check_id || '',
          finding_type: f.finding_type || '',
          monthlySavings: f.monthlySavings || 0,
          actualSpend: f.actualSpend || 0,
          totalSpend: f.totalSpend || 0,
          serviceBreakdown: f.serviceBreakdown || [],
        }));

        // Derive services
        this.services = [...new Set(findings.map(f => f.service).filter(Boolean))].sort();

        // Derive pillars
        const pillarMap = {};
        findings.forEach(f => {
          const p = f.pillar || 'Unknown';
          if (!pillarMap[p]) pillarMap[p] = { id: p.slice(0,2).toUpperCase(), name: p, score: 100, crit: 0, high: 0, med: 0, low: 0, info: 0 };
          const s = (f.severity || '').toUpperCase();
          if (s === 'CRITICAL') pillarMap[p].crit++;
          else if (s === 'HIGH') pillarMap[p].high++;
          else if (s === 'MEDIUM') pillarMap[p].med++;
          else if (s === 'LOW') pillarMap[p].low++;
          else pillarMap[p].info++;
        });
        const allPillars = ['Security', 'Reliability', 'Operational Excellence', 'Performance Efficiency', 'Cost Optimization'];
        this.pillars = allPillars.map(name => {
          const d = pillarMap[name] || { id: name.slice(0,2).toUpperCase(), name, score: 100, crit: 0, high: 0, med: 0, low: 0, info: 0 };
          const total = d.crit + d.high + d.med + d.low + d.info;
          d.score = Math.max(0, 100 - d.crit * 15 - d.high * 8 - d.med * 3 - d.low * 1);
          return d;
        });

        // Derive accounts from findings
        const acctMap = {};
        findings.forEach(f => {
          const a = f.account_id || f.account || '';
          if (!a) return;
          if (!acctMap[a]) acctMap[a] = { id: a, alias: a, env: '', region: '', critical: 0, high: 0, medium: 0, low: 0, info: 0 };
          const s = (f.severity || '').toUpperCase();
          if (s === 'CRITICAL') acctMap[a].critical++;
          else if (s === 'HIGH') acctMap[a].high++;
          else if (s === 'MEDIUM') acctMap[a].medium++;
          else if (s === 'LOW') acctMap[a].low++;
          else acctMap[a].info++;
        });
        this.accounts = Object.values(acctMap);

        // Derive cost opportunities
        this.costOpps = findings
          .filter(f => f.finding_type === 'COST_OPTIMIZATION' || f.finding_type === 'RI_RECOMMENDATION' || f.finding_type === 'SP_RECOMMENDATION')
          .map(f => ({
            title: f.title || '',
            saving: f.monthlySavings || f.actualSpend || 0,
            account: f.account_id || f.account || '',
            count: 1,
          }));

        // Derive frameworks compliance
        this.frameworks = this._evaluateFrameworks(findings);
      }

      // Load registered accounts
      try {
        const acctData = await ApiClient.get('/accounts');
        const registered = (acctData && acctData.accounts) || [];
        if (registered.length > 0) {
          registered.forEach(ra => {
            const existing = this.accounts.find(a => a.id === (ra.accountId || ra.id));
            if (existing) {
              existing.alias = ra.alias || existing.alias;
              existing.env = ra.connectionStatus || '';
              existing.region = '';
            } else {
              this.accounts.push({
                id: ra.accountId || ra.id || '',
                alias: ra.alias || '',
                env: ra.connectionStatus || '',
                region: '',
                critical: 0, high: 0, medium: 0, low: 0, info: 0,
              });
            }
          });
        }
      } catch (_) {}

      // Load team
      try {
        const teamData = await ApiClient.get('/team/members');
        this.team = ((teamData && teamData.members) || []).map(m => ({
          name: m.email ? m.email.split('@')[0] : '',
          email: m.email || '',
          role: m.role || 'Viewer',
          last: m.status || 'Active',
        }));
      } catch (_) {}

      this.loaded = true;
    } catch (err) {
      console.error('DATA.load error:', err);
    }
  },

  _evaluateFrameworks(findings) {
    const checkIds = new Set(findings.map(f => f.check_id).filter(Boolean));
    const scannedSvcs = new Set(findings.map(f => (f.service || '').toLowerCase()));

    const fwDefs = [
      { id: 'wafs', name: 'AWS Well-Architected', checks: ['iam-001','iam-002','iam-003','cloudtrail-001','cloudtrail-002','cloudtrail-003','vpc-001','ec2-001','vpc-002','vpc-003','s3-002','rds-002','ec2-002','kms-001','cloudfront-001','elb-002','s3-001','cloudtrail-004','kms-002','config-001','cloudwatch-001'] },
      { id: 'cis', name: 'CIS AWS Foundations v1.4', checks: ['iam-001','iam-003','cloudtrail-001','cloudtrail-002','cloudtrail-003','config-001','vpc-001','vpc-002','vpc-003','ec2-002','kms-001','s3-001','rds-002'] },
      { id: 'nist', name: 'NIST Cybersecurity Framework', checks: ['iam-001','iam-002','iam-003','s3-002','rds-002','ec2-002','cloudfront-001','elb-002','cloudtrail-001','cloudtrail-003','vpc-001','cloudwatch-001','rds-001'] },
      { id: 'soc2', name: 'SOC 2 Type II', checks: ['iam-001','iam-002','iam-003','vpc-002','ec2-001','vpc-001','vpc-003','cloudfront-001','elb-002','cloudtrail-001','cloudwatch-001','config-001','s3-001','s3-002','rds-002','kms-001'] },
      { id: 'ftr', name: 'AWS FTR', checks: ['iam-001','iam-002','iam-003','s3-002','rds-002','ec2-002','kms-001','cloudfront-001','elb-002','ec2-001','vpc-002','vpc-003','cloudtrail-001','cloudtrail-003','vpc-001','cloudwatch-001','guardduty-001','config-001','s3-001','rds-001','ec2-003'] },
      { id: 'spip', name: 'AWS SPIP', checks: ['iam-001','iam-002','iam-003','s3-001','s3-002','ec2-002','rds-002','cloudfront-001','elb-002','ec2-001','vpc-002','vpc-003','vpc-001','cloudtrail-001','cloudtrail-003','cloudwatch-001','config-001','kms-001','kms-002'] },
      { id: 'ssb', name: 'Startup Security Baseline', checks: ['iam-001','iam-002','iam-003','cloudtrail-001','cloudtrail-002','cloudtrail-003','vpc-001','cloudwatch-001','config-001','guardduty-001','ec2-001','vpc-002','vpc-003','cloudfront-001','elb-002','s3-002','rds-002','ec2-002','s3-001','kms-001','rds-001'] },
    ];

    return fwDefs.map(fw => {
      const unique = [...new Set(fw.checks)];
      let passed = 0, total = 0;
      unique.forEach(cid => {
        const prefix = cid.split('-')[0];
        if (scannedSvcs.has(prefix)) {
          total++;
          if (!checkIds.has(cid)) passed++;
        }
      });
      return {
        id: fw.id,
        name: fw.name,
        score: total > 0 ? Math.round(passed / total * 100) : 0,
        controls: unique.length,
        passed,
      };
    });
  },
};
