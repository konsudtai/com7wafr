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

      // Try to find a COMPLETED scan from history first (fast path)
      let latest = scans.find(s => s.status === 'COMPLETED');

      // If no COMPLETED in history, enrich with real status from metadata (history may be stale)
      if (!latest) {
        for (const s of scans) {
          const sid = s.scanId || s.scan_id;
          if (sid && s.status !== 'COMPLETED' && s.status !== 'FAILED') {
            try {
              const st = await ApiClient.get('/scans/' + sid + '/status');
              if (st && st.status) s.status = st.status;
              if (st.status === 'COMPLETED') { latest = s; break; }
            } catch (_) { /* ignore */ }
          }
        }
      }

      // History
      this.history = scans.map(s => ({
        date: (s.createdAt || '').split('T')[0],
        scanId: s.scanId || s.scan_id,
        status: s.status,
        score: 0, crit: 0, delta: '—',
      }));
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

      // Load registered accounts — always runs regardless of scan data
      try {
        const acctData = await ApiClient.get('/accounts');
        const registered = (acctData && acctData.accounts) || [];
        registered.forEach(ra => {
          const rid = ra.accountId || ra.id || '';
          if (!rid) return;
          const existing = this.accounts.find(a => a.id === rid);
          if (existing) {
            existing.alias = ra.alias || existing.alias;
            existing.env = ra.connectionStatus || '';
          } else {
            this.accounts.push({
              id: rid,
              alias: ra.alias || rid,
              env: ra.connectionStatus || '',
              region: '',
              critical: 0, high: 0, medium: 0, low: 0, info: 0,
            });
          }
        });
      } catch (acctErr) {
        console.error('Failed to load registered accounts:', acctErr);
      }

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
    const findingMap = {};
    findings.forEach(f => { if (f.check_id) findingMap[f.check_id] = f; });

    const fwDefs = [
      { id:'wafs', name:'AWS Well-Architected Framework - Security Pillar', desc:'Focuses on the security pillar to protect data, systems, and assets.', categories:{
        'Security Operations':{'SEC01-BP01':['iam-001'],'SEC01-BP02':['iam-003','guardduty-001','cloudtrail-001'],'SEC01-BP03':['config-001','cloudwatch-001'],'SEC01-BP04':['guardduty-001']},
        'Identity & Access':{'SEC02-BP01':['iam-003'],'SEC02-BP02':['ec2-001'],'SEC02-BP03':['iam-001'],'SEC02-BP05':['iam-001','iam-003']},
        'Permissions':{'SEC03-BP01':['iam-001'],'SEC03-BP02':['iam-001','iam-002']},
        'Detection':{'SEC04-BP01':['cloudtrail-001','cloudtrail-002','cloudtrail-003'],'SEC04-BP02':['cloudwatch-001','config-001'],'SEC04-BP03':['guardduty-001']},
        'Network Protection':{'SEC05-BP01':['vpc-001','vpc-002','vpc-003'],'SEC05-BP02':['ec2-001','ec2-002']},
        'Data Protection':{'SEC08-BP01':['s3-002','rds-002','kms-001','kms-002'],'SEC08-BP02':['s3-001','cloudfront-001','elb-002']},
      }},
      { id:'cis', name:'CIS AWS Foundations Benchmark v1.4', desc:'Consensus-driven security configuration benchmarks.', categories:{
        'IAM':{'CIS-1.4':['iam-003'],'CIS-1.5':['iam-001'],'CIS-1.10':['iam-003'],'CIS-1.14':['iam-001']},
        'Logging':{'CIS-3.1':['cloudtrail-001'],'CIS-3.2':['cloudtrail-003'],'CIS-3.4':['cloudtrail-002'],'CIS-3.7':['kms-001']},
        'Monitoring':{'CIS-4.1':['cloudwatch-001'],'CIS-4.3':['config-001']},
        'Networking':{'CIS-5.1':['vpc-001'],'CIS-5.2':['vpc-002'],'CIS-5.3':['vpc-003'],'CIS-5.4':['ec2-002']},
        'Storage':{'CIS-2.1.1':['s3-001'],'CIS-2.1.2':['s3-002'],'CIS-2.3.1':['rds-002']},
      }},
      { id:'nist', name:'NIST Cybersecurity Framework', desc:'Framework for improving critical infrastructure cybersecurity.', categories:{
        'Identify (ID)':{'ID.AM-2':['ec2-001'],'ID.RA-1':['guardduty-001']},
        'Protect (PR)':{'PR.AC-1':['iam-001','iam-002','iam-003'],'PR.AC-3':['vpc-001','vpc-002'],'PR.DS-1':['s3-002','rds-002','kms-001'],'PR.DS-2':['cloudfront-001','elb-002'],'PR.PT-1':['cloudtrail-001','cloudtrail-003']},
        'Detect (DE)':{'DE.CM-1':['cloudwatch-001'],'DE.CM-7':['guardduty-001','config-001']},
        'Respond (RS)':{'RS.AN-1':['cloudtrail-001']},
        'Recover (RC)':{'RC.RP-1':['rds-001']},
      }},
      { id:'soc2', name:'SOC 2 Type II', desc:'Trust service criteria for security, availability, confidentiality.', categories:{
        'Common Criteria':{'CC6.1':['iam-001','iam-002','iam-003'],'CC6.3':['vpc-002','vpc-003'],'CC6.6':['cloudfront-001','elb-002'],'CC6.7':['ec2-001','ec2-002']},
        'Availability':{'A1.2':['rds-001','rds-002']},
        'Confidentiality':{'C1.1':['s3-001','s3-002','kms-001']},
        'Monitoring':{'CC7.1':['cloudtrail-001','cloudwatch-001','config-001'],'CC7.2':['guardduty-001','vpc-001']},
      }},
      { id:'ftr', name:'AWS Foundational Technical Review', desc:'Assesses AWS Partner solutions against best practices.', categories:{
        'AWS Root Account':{'ARC-001.1':['iam-001'],'ARC-004.1':['iam-001']},
        'Identity & Access Mgmt':{'IAM-001.1':['iam-003'],'IAM-002.1':['iam-001'],'IAM-002.3':['cloudtrail-001','guardduty-001'],'IAM-003.1':['iam-001'],'IAM-006.1':['iam-001','iam-002'],'IAM-010.1':['cloudtrail-001'],'IAM-012.1':['ec2-001']},
        'Network Security':{'NETSEC-001.1':['vpc-002','vpc-003','ec2-002'],'NETSEC-001.2':['ec2-002'],'NETSEC-002.1':['ec2-001']},
        'Backups & Recovery':{'BAR-001.1':['rds-001','s3-001']},
        'Data Protection':{'SDAT-002.1':['s3-002','rds-002','kms-001'],'SDAT-003.1':['cloudfront-001','elb-002']},
        'Operational Security':{'SECOPS-001':['cloudwatch-001','config-001']},
      }},
      { id:'spip', name:'AWS Security Posture Improvement Program', desc:'Structured program to improve AWS security posture.', categories:{
        'Account Security':{'SPIP-ACCT-01':['iam-001','iam-002','iam-003'],'SPIP-ACCT-02':['cloudtrail-001','cloudtrail-003']},
        'Data Protection':{'SPIP-DATA-01':['s3-001','s3-002'],'SPIP-DATA-02':['rds-002','kms-001','kms-002']},
        'Network':{'SPIP-NET-01':['vpc-001','vpc-002','vpc-003'],'SPIP-NET-02':['ec2-001','ec2-002','cloudfront-001','elb-002']},
        'Monitoring':{'SPIP-MON-01':['cloudwatch-001','config-001']},
      }},
      { id:'ssb', name:'Startup Security Baseline', desc:'Essential security controls for AWS startups.', categories:{
        'Account':{'SSB-ACCT-01':['iam-001','iam-002','iam-003'],'SSB-ACCT-02':['cloudtrail-001','cloudtrail-002','cloudtrail-003']},
        'Workload':{'SSB-WORK-01':['ec2-001','ec2-002','vpc-002','vpc-003'],'SSB-WORK-02':['s3-001','s3-002','rds-002','kms-001']},
        'Detection':{'SSB-DET-01':['guardduty-001','cloudwatch-001','config-001','vpc-001']},
        'Reliability':{'SSB-REL-01':['rds-001']},
      }},
    ];

    return fwDefs.map(fw => {
      const allControls = [];
      let totalChecked = 0, totalPassed = 0;
      Object.entries(fw.categories).forEach(([catName, rules]) => {
        Object.entries(rules).forEach(([ruleId, checkList]) => {
          if (!checkList.length) { allControls.push({category:catName,id:ruleId,status:'N/A',title:'Manual review required',severity:'',recommendation:'',resources:''}); return; }
          const failedChecks = checkList.filter(cid => checkIds.has(cid));
          const scannedChecks = checkList.filter(cid => { const p=cid.split('-')[0]; return scannedSvcs.has(p); });
          if (!scannedChecks.length) { allControls.push({category:catName,id:ruleId,status:'N/A',title:'Service not scanned',severity:'',recommendation:'',resources:''}); return; }
          totalChecked++;
          if (!failedChecks.length) { totalPassed++; allControls.push({category:catName,id:ruleId,status:'Compliant',title:'All checks passed',severity:'',recommendation:'',resources:checkList.join(', ')}); }
          else {
            const rf = failedChecks.map(c=>findingMap[c]).filter(Boolean);
            const top = rf.sort((a,b)=>{const o={CRITICAL:0,HIGH:1,MEDIUM:2,LOW:3};return(o[a.severity]||4)-(o[b.severity]||4);})[0];
            const res = rf.map(f=>f.resource).filter(Boolean).slice(0,5).join(', ');
            allControls.push({category:catName,id:ruleId,status:'Need Attention',title:top?top.title:failedChecks.join(', '),severity:top?top.severity:'MEDIUM',recommendation:top?(top.recommendation||top.description||''):'',resources:res});
          }
        });
      });
      return { id:fw.id, name:fw.name, desc:fw.desc||'', score:totalChecked>0?Math.round(totalPassed/totalChecked*100):0, controls:allControls.length, passed:totalPassed, details:allControls };
    });
  },
};
