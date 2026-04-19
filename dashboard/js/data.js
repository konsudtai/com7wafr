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
  selectedAccount: '',

  // Get findings filtered by selected account
  getFindings() {
    if (!this.selectedAccount) return this.findings;
    return this.findings.filter(f => f.account === this.selectedAccount || f.account_id === this.selectedAccount);
  },

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

    // Map our check_ids to Service Screener check names for matching
    // Our scan produces check_ids like 'ec2-001', 'cloudtrail-001' etc.
    // Service Screener uses 'ec2.SGDefaultDisallowTraffic', 'cloudtrail.NeedToEnableCloudTrail' etc.
    // We map by category: if we have a finding for a service, we can evaluate controls that reference that service
    const ourCheckToSS = {
      'cloudtrail-001': ['cloudtrail.NeedToEnableCloudTrail','cloudtrail.HasOneMultiRegionTrail'],
      'cloudtrail-002': ['cloudtrail.RequiresKmsKey'],
      'cloudtrail-003': ['cloudtrail.LogFileValidationEnabled'],
      'ec2-001': ['ec2.EC2InstancePublicIP','ec2.EC2IamProfile'],
      'ec2-002': ['ec2.SGDefaultDisallowTraffic','ec2.SGDefaultInUsed','ec2.SGSensitivePortOpenToAll','ec2.SGAllOpenToAll','ec2.SGAllOpen'],
      'ec2-003': ['ec2.DetailedMonitoring'],
      'vpc-001': ['ec2.VPCFlowLogEnabled'],
      'vpc-002': ['ec2.SGDefaultDisallowTraffic','ec2.SGDefaultInUsed'],
      'vpc-003': ['ec2.SGSensitivePortOpenToAll','ec2.SGAllOpenToAll'],
      's3-001': ['s3.PublicAccessBlock','s3.S3AccountPublicAccessBlock','s3.PublicReadAccessBlock','s3.PublicWriteAccessBlock'],
      's3-002': ['s3.ServerSideEncrypted','s3.SSEWithKMS'],
      'rds-001': ['rds.MultiAZ','rds.Backup'],
      'rds-002': ['rds.StorageEncrypted'],
      'iam-001': ['iam.rootHasAccessKey','iam.FullAdminAccess','iam.InlinePolicyFullAdminAccess','iam.InlinePolicyFullAccessOneServ'],
      'iam-002': ['iam.InlinePolicy','iam.ManagedPolicyFullAccessOneServ'],
      'iam-003': ['iam.mfaActive','iam.rootMfaActive','iam.passwordPolicy','iam.passwordPolicyWeak'],
      'kms-001': ['kms.KeyRotationEnabled'],
      'kms-002': ['kms.KeyRotationEnabled'],
      'cloudwatch-001': ['cloudwatch.trailWithoutCWLogs','cloudwatch.alarmsWithoutSNS'],
      'config-001': ['iam.EnableConfigService'],
      'cloudfront-001': ['cloudfront.viewerPolicyHttps','cloudfront.WAFAssociation'],
      'elb-002': ['ec2.ELBListenerInsecure'],
      'guardduty-001': ['iam.enableGuardDuty'],
      'apigw-001': ['apigateway.AccessLogging'],
      'sqs-001': ['sqs.EncryptionAtRest'],
      'opensearch-001': ['opensearch.EncyptionAtRest'],
      'opensearch-002': ['opensearch.NodeToNodeEncryption'],
      'opensearch-003': ['opensearch.TLSEnforced'],
      'efs-001': ['efs.EncryptedAtRest'],
      'elasticache-001': ['elasticache.EncInTransitAndRest'],
      'redshift-001': ['redshift.EncryptedAtRest'],
      'redshift-002': ['redshift.PubliclyAcessible'],
    };
    // Reverse map: SS check name → our check_id
    const ssToOur = {};
    Object.entries(ourCheckToSS).forEach(([ours, ssList]) => { ssList.forEach(ss => { ssToOur[ss] = ours; }); });

    // Complete framework definitions from Service Screener v2 map.json
    const fwDefs = [
      { id:'cis', name:'CIS Amazon Web Services Foundations Benchmark', desc:'Security configuration best practices for AWS accounts and resources.', categories:{
        'CloudTrail':{'CloudTrail.1':['cloudtrail.NeedToEnableCloudTrail','cloudtrail.HasOneMultiRegionTrail'],'CloudTrail.2':['cloudtrail.RequiresKmsKey'],'CloudTrail.4':['cloudtrail.LogFileValidationEnabled'],'CloudTrail.5':['cloudtrail.CloudWatchLogsLogGroupArn'],'CloudTrail.6':['cloudtrail.EnableS3PublicAccessBlock'],'CloudTrail.7':['cloudtrail.EnableTrailS3BucketLogging']},
        'CloudWatch':{'CloudWatch.1':['cloudwatch.trailWithoutCWLogs','cloudwatch.trailWOMAroot1'],'CloudWatch.4':['cloudwatch.trailWOMAalarm4'],'CloudWatch.5':['cloudwatch.trailWOMATrail5'],'CloudWatch.6':['cloudwatch.trailWOMAAuthFail6'],'CloudWatch.7':['cloudwatch.trailWOMACMK7'],'CloudWatch.8':['cloudwatch.trailWOMAS3Policy8'],'CloudWatch.9':['cloudwatch.trailWOMAConfig9'],'CloudWatch.10':['cloudwatch.trailWOMASecGroup10'],'CloudWatch.11':['cloudwatch.trailWOMANACL11'],'CloudWatch.12':['cloudwatch.trailWOMAGateway12'],'CloudWatch.13':['cloudwatch.trailWOMARouteTable13'],'CloudWatch.14':['cloudwatch.trailWOMAVPC14']},
        'Config':{'Config.1':['iam.EnableConfigService']},
        'EC2':{'EC2.2':['ec2.SGDefaultDisallowTraffic'],'EC2.6':['ec2.VPCFlowLogEnabled'],'EC2.7':['ec2.EBSEncrypted'],'EC2.21':['ec2.NACLSensitivePort']},
        'IAM':{'IAM.1':['iam.FullAdminAccess'],'IAM.3':['iam.hasAccessKeyNoRotate90days'],'IAM.4':['iam.rootHasAccessKey'],'IAM.5':['iam.mfaActive'],'IAM.9':['iam.rootMfaActive'],'IAM.15':['iam.passwordPolicyLength'],'IAM.16':['iam.passwordPolicyReuse'],'IAM.18':[],'IAM.22':['iam.consoleLastAccess45','iam.consoleLastAccess90']},
        'KMS':{'KMS.4':['kms.KeyRotationEnabled']},
        'RDS':{'RDS.3':['rds.StorageEncrypted']},
        'S3':{'S3.1':['s3.S3AccountPublicAccessBlock'],'S3.5':['s3.TlsEnforced'],'S3.8':['s3.PublicAccessBlock'],'S3.20':['s3.MFADelete']},
      }},
      { id:'wafs', name:'AWS Well-Architected Framework - Security Pillar', desc:'Focuses on the security pillar to protect data, systems, and assets.', categories:{
        'SEC01 - Securely operate':{'SEC01-BP01':['iam.hasOrganization'],'SEC01-BP02':['iam.rootMfaActive','iam.hasAlternateContact','iam.rootHasAccessKey','iam.passwordPolicy','iam.enableGuardDuty'],'SEC01-BP03':['iam.SCPEnabled','iam.EnableConfigService','cloudwatch.alarmsWithoutSNS'],'SEC01-BP04':['iam.enableGuardDuty'],'SEC01-BP05':[],'SEC01-BP06':['lambda.$length','rds.$length'],'SEC01-BP07':['iam.hasOrganization'],'SEC01-BP08':[]},
        'SEC02 - Identities':{'SEC02-BP01':['iam.mfaActive','iam.passwordPolicyWeak'],'SEC02-BP02':['ec2.EC2IamProfile'],'SEC02-BP03':['iam.hasAccessKeyNoRotate30days','rds.DBwithoutSecretManager'],'SEC02-BP04':['iam.hasSSORoles','iam.hasExternalIdentityProvider'],'SEC02-BP05':['iam.InlinePolicyFullAccessOneServ','iam.FullAdminAccess','lambda.lambdaRoleReused'],'SEC02-BP06':['iam.userNotUsingGroup']},
        'SEC03 - Permissions':{'SEC03-BP01':['iam.InlinePolicy'],'SEC03-BP02':['iam.InlinePolicyFullAccessOneServ','iam.FullAdminAccess','iam.ManagedPolicyFullAccessOneServ'],'SEC03-BP03':['iam.EnableConfigService'],'SEC03-BP04':[],'SEC03-BP05':['iam.unusedRole'],'SEC03-BP06':[],'SEC03-BP07':[],'SEC03-BP08':[],'SEC03-BP09':[]},
        'SEC04 - Detection':{'SEC04-BP01':['cloudtrail.NeedToEnableCloudTrail','cloudtrail.HasOneMultiRegionTrail'],'SEC04-BP02':['cloudwatch.alarmsWithoutSNS','cloudwatch.missingCompositeAlarms'],'SEC04-BP03':['iam.enableGuardDuty'],'SEC04-BP04':[]},
        'SEC05 - Network':{'SEC05-BP01':['ec2.SGDefaultInUsed','ec2.SGSensitivePortOpenToAll','ec2.SGAllOpenToAll'],'SEC05-BP02':['ec2.EC2InstancePublicIP','ec2.VPCFlowLogEnabled'],'SEC05-BP03':[],'SEC05-BP04':[]},
        'SEC06 - Compute':{'SEC06-BP01':[],'SEC06-BP02':['lambda.lambdaRuntimeUpdate'],'SEC06-BP03':[],'SEC06-BP04':[],'SEC06-BP05':[],'SEC06-BP06':[]},
        'SEC07 - Data classification':{'SEC07-BP01':[],'SEC07-BP02':['s3.MacieToEnable'],'SEC07-BP03':[],'SEC07-BP04':[]},
        'SEC08 - Data protection at rest':{'SEC08-BP01':['s3.ServerSideEncrypted','ec2.EBSEncrypted','rds.StorageEncrypted','cloudtrail.RequiresKmsKey'],'SEC08-BP02':['kms.KeyRotationEnabled'],'SEC08-BP03':[],'SEC08-BP04':[]},
        'SEC09 - Data protection in transit':{'SEC09-BP01':['s3.TlsEnforced','cloudfront.viewerPolicyHttps','ec2.SGEncryptionInTransit'],'SEC09-BP02':[],'SEC09-BP03':[]},
        'SEC10 - Incident response':{'SEC10-BP01':[],'SEC10-BP02':['iam.enableGuardDuty'],'SEC10-BP03':[],'SEC10-BP04':[],'SEC10-BP05':[],'SEC10-BP06':[],'SEC10-BP07':[]},
      }},
      { id:'ftr', name:'AWS Foundational Technical Review', desc:'Assesses AWS Partner solutions against best practices for security, performance, and operations.', categories:{
        'Partner hosted':{'HOST-001.1':[],'HOST-001.2':[],'HOST-001.3':[]},
        'Support level':{'SUP-001.1':['iam.supportPlanLowTier']},
        'Architecture review':{'WAFR-001.1':[],'WAFR-001.2':[],'WAFR-002.1':[]},
        'AWS root account':{'ARC-001.1':['iam.rootConsoleLogin30days'],'ARC-004.1':['iam.rootHasAccessKey'],'ARC-005.1':[]},
        'Communications from AWS':{'ACOM-001.1':['iam.hasAlternateContact'],'ACOM-002.1':[]},
        'Identity and Access Management':{'IAM-001.1':['iam.mfaActive','iam.rootMfaActive'],'IAM-002.1':['iam.passwordLastChange90','iam.hasAccessKeyNoRotate30days'],'IAM-002.2':[],'IAM-002.3':['cloudtrail.NeedToEnableCloudTrail','cloudtrail.HasOneMultiRegionTrail','iam.enableGuardDuty'],'IAM-002.4':[],'IAM-003.1':['iam.passwordPolicyWeak','iam.passwordPolicy'],'IAM-004.1':['iam.noUsersFound'],'IAM-005.1':['iam.hasExternalIdentityProvider','iam.hasSSORoles'],'IAM-005.2':['iam.hasExternalIdentityProvider','iam.hasSSORoles'],'IAM-006.1':['iam.InlinePolicyFullAccessOneServ','iam.InlinePolicyFullAdminAccess','iam.FullAdminAccess','iam.ManagedPolicyFullAccessOneServ'],'IAM-007.1':['iam.consoleLastAccess90','iam.unusedRole'],'IAM-008.1':[],'IAM-009.1':[],'IAM-010.1':['cloudtrail.NeedToEnableCloudTrail'],'IAM-011.1':[],'IAM-012.1':['ec2.EC2IamProfile'],'IAM-012.2':[]},
        'Operational security':{'SECOPS-001':['cloudwatch.alarmsWithoutSNS']},
        'Network security':{'NETSEC-001.1':['ec2.SGDefaultInUsed','ec2.SGSensitivePortOpenToAll','ec2.SGAllOpenToAll','ec2.SGAllOpen'],'NETSEC-001.2':['ec2.SGSensitivePortOpenToAll'],'NETSEC-002.1':['ec2.EC2InstancePublicIP']},
        'Backups and recovery':{'BAR-001.1':['ec2.EBSSnapshot','rds.Backup','dynamodb.backupStatus','iam.hasAWSBackupPlans','s3.BucketVersioning'],'BAR-002.1':[],'BAR-002.2':[]},
        'Resiliency':{'RES-001.1':[],'RES-002.1':[],'RES-004.1':[],'RES-005.1':[],'RES-006.1':[],'RES-006.2':[],'RES-007.1':[]},
        'Amazon S3 bucket access':{'S3-001.1':['s3.PublicAccessBlock','s3.S3AccountPublicAccessBlock']},
        'Cross-account access':{'CAA-001.1':[],'CAA-002.1':[],'CAA-003.1':[],'CAA-004.1':[],'CAA-005.1':[],'CAA-006.1':[],'CAA-007.1':[]},
        'Sensitive data':{'SDAT-001.1':['s3.MacieToEnable'],'SDAT-002.1':['ec2.EBSEncrypted','s3.ServerSideEncrypted','rds.StorageEncrypted','cloudtrail.RequiresKmsKey'],'SDAT-003.1':['ec2.SGEncryptionInTransit','s3.TlsEnforced']},
        'Regulatory compliance':{'RCVP-001.1':[],'RCVP-001.2':[]},
      }},
      { id:'spip', name:'AWS Security Posture Improvement Program (SPIP)', desc:'Thorough review across six critical phases of cloud security posture management.', categories:{
        'Identity Protection':{'P1.1':['iam.rootMfaActive','iam.mfaActive'],'P1.2':['iam.hasAccessKeyNoRotate30days','iam.hasAccessKeyNoRotate90days'],'P1.3':['iam.passwordPolicy','iam.passwordPolicyWeak','iam.passwordPolicyReuse'],'P1.4':['iam.hasSSORoles','iam.hasExternalIdentityProvider'],'P1.5':['iam.SCPEnabled','iam.hasOrganization'],'P1.6':[],'P1.7':[]},
        'Data Protection':{'P2.1':['s3.PublicAccessBlock','s3.PublicReadAccessBlock','s3.PublicWriteAccessBlock'],'P2.2':['ec2.EBSSnapshot','rds.Backup','dynamodb.backupStatus'],'P2.3':['s3.ServerSideEncrypted','ec2.EBSEncrypted','rds.StorageEncrypted','cloudfront.fieldLevelEncryption'],'P2.4':['s3.MacieToEnable'],'P2.5':['s3.TlsEnforced','opensearch.NodeToNodeEncryption','ec2.SGEncryptionInTransit','cloudfront.viewerPolicyHttps']},
        'Infrastructure Protection':{'P3.1':['ec2.SGDefaultInUsed','ec2.SGSensitivePortOpenToAll','ec2.SGAllOpenToAll'],'P3.2':['cloudfront.WAFAssociation'],'P3.3':['cloudfront.defaultRootObject'],'P3.4':[],'P3.5':['ec2.SGSensitivePortOpenToAll'],'P3.6':[]},
        'Detection & Mitigation':{'P4.1':['cloudtrail.NeedToEnableCloudTrail','cloudtrail.LogFileValidationEnabled'],'P4.2':['iam.enableGuardDuty'],'P4.3':['cloudtrail.EnableTrailS3BucketLogging'],'P4.4':['s3.MFADelete','s3.BucketVersioning'],'P4.5':[],'P4.6':[],'P4.7':[]},
        'AppSec & DevSecOps':{'P5.1':['rds.DBwithoutSecretManager'],'P5.2':[],'P5.3':[],'P5.4':[],'P5.5':[]},
      }},
      { id:'ssb', name:'AWS Startup Security Baseline', desc:'Minimum security foundation for businesses building on AWS without decreasing agility.', categories:{
        'Account':{'ACCT.01':['iam.hasAlternateContact'],'ACCT.02':['iam.noUsersFound','iam.rootHasAccessKey'],'ACCT.03':['iam.noUsersFound','iam.hasExternalIdentityProvider','iam.hasSSORoles'],'ACCT.04':['iam.InlinePolicyFullAccessOneServ','iam.InlinePolicyFullAdminAccess','iam.FullAdminAccess'],'ACCT.05':['iam.rootMfaActive','iam.mfaActive'],'ACCT.06':['iam.passwordPolicy'],'ACCT.07':[],'ACCT.08':['s3.PublicAccessBlock','s3.S3AccountPublicAccessBlock'],'ACCT.09':[],'ACCT.10':['iam.enableCostBudget'],'ACCT.11':['iam.enableGuardDuty'],'ACCT.12':[]},
        'Workloads':{'WKLD.01':['ec2.EC2IamProfile'],'WKLD.02':[],'WKLD.03':[],'WKLD.04':[],'WKLD.05':[],'WKLD.06':[],'WKLD.07':[],'WKLD.08':['ec2.EBSEncrypted','rds.StorageEncrypted'],'WKLD.09':[],'WKLD.10':[],'WKLD.11':['ec2.SGSensitivePortOpenToAll','ec2.SGAllOpen','ec2.SGAllOpenToAll','rds.PubliclyAccessible'],'WKLD.12':[],'WKLD.13':[],'WKLD.14':[],'WKLD.15':[]},
      }},
      { id:'nist', name:'NIST Cybersecurity Framework', desc:'Framework for improving critical infrastructure cybersecurity.', categories:{
        'CloudTrail':{'CloudTrail.1':['cloudtrail.HasOneMultiRegionTrail'],'CloudTrail.2':['cloudtrail.RequiresKmsKey'],'CloudTrail.4':['cloudtrail.LogFileValidationEnabled'],'CloudTrail.5':['cloudtrail.CloudWatchLogsLogGroupArn']},
        'CloudFront':{'CloudFront.1':['cloudfront.defaultRootObject'],'CloudFront.3':['cloudfront.viewerPolicyHttps'],'CloudFront.4':['cloudfront.originFailover'],'CloudFront.5':['cloudfront.accessLogging'],'CloudFront.6':['cloudfront.WAFAssociation'],'CloudFront.10':['cloudfront.DeprecatedSSLProtocol']},
        'Config':{'Config.1':['iam.EnableConfigService']},
        'DynamoDB':{'DynamoDB.1':['dynamodb.autoScalingStatus'],'DynamoDB.2':['dynamodb.disabledPointInTimeRecovery']},
        'EC2':{'EC2.1':['ec2.EBSSnapshotIsPublic'],'EC2.2':['ec2.SGDefaultDisallowTraffic'],'EC2.3':['ec2.EBSEncrypted'],'EC2.4':['ec2.EC2Active'],'EC2.7':['ec2.EBSEncrypted'],'EC2.8':['ec2.ASGIMDSv2'],'EC2.9':['ec2.EC2InstancePublicIP'],'EC2.12':['ec2.EC2EIPNotInUse'],'EC2.13':['ec2.SGSensitivePortOpenToAll'],'EC2.15':['ec2.EC2SubnetAutoPublicIP']},
        'EKS':{'EKS.1':['eks.eksEndpointPublicAccess'],'EKS.2':['eks.eksClusterVersionEol'],'EKS.8':['eks.eksClusterLogging']},
        'ElastiCache':{'ElastiCache.4':['elasticache.EncInTransitAndRest'],'ElastiCache.5':['elasticache.EncInTransitAndRest']},
        'ELB':{'ELB.7':['ec2.ELBConnectionDraining'],'ELB.9':['ec2.ELBCrossZone'],'ELB.16':['ec2.ELBEnableWAF']},
        'IAM':{'IAM.1':['iam.FullAdminAccess'],'IAM.2':['iam.userNotUsingGroup','iam.InlinePolicy'],'IAM.3':['iam.hasAccessKeyNoRotate90days'],'IAM.4':['iam.rootHasAccessKey'],'IAM.5':['iam.mfaActive'],'IAM.7':['iam.passwordPolicyWeak'],'IAM.8':['iam.consoleLastAccess90'],'IAM.9':['iam.rootMfaActive'],'IAM.19':['iam.mfaActive'],'IAM.21':['iam.ManagedPolicyFullAccessOneServ']},
        'KMS':{'KMS.3':['kms.KeyInPendingDeletion'],'KMS.4':['kms.KeyRotationEnabled']},
        'Lambda':{'Lambda.1':['lambda.lambdaPublicAccess'],'Lambda.2':['lambda.lambdaRuntimeUpdate']},
        'OpenSearch':{'Opensearch.1':['opensearch.EncyptionAtRest'],'Opensearch.2':['opensearch.DomainWithinVPC'],'Opensearch.3':['opensearch.NodeToNodeEncryption'],'Opensearch.5':['opensearch.AuditLogs'],'Opensearch.7':['opensearch.FineGrainedAccessControl'],'Opensearch.8':['opensearch.TLSEnforced']},
        'RDS':{'RDS.1':['rds.SnapshotRDSIsPublic'],'RDS.2':['rds.PubliclyAccessible'],'RDS.3':['rds.StorageEncrypted'],'RDS.5':['rds.MultiAZ'],'RDS.6':['rds.EnhancedMonitor'],'RDS.11':['rds.Backup'],'RDS.13':['rds.AutoMinorVersionUpgrade']},
        'Redshift':{'Redshift.1':['redshift.PubliclyAcessible'],'Redshift.2':['redshift.EncryptedInTransit'],'Redshift.3':['redshift.AutomaticSnapshots'],'Redshift.4':['redshift.AuditLogging'],'Redshift.10':['redshift.EncryptedAtRest']},
        'S3':{'S3.1':['s3.S3AccountPublicAccessBlock'],'S3.2':['s3.PublicAccessBlock'],'S3.5':['s3.TlsEnforced'],'S3.8':['s3.PublicAccessBlock'],'S3.9':['s3.BucketLogging'],'S3.10':['s3.BucketVersioning','s3.BucketLifecycle'],'S3.12':['s3.AccessControlList'],'S3.13':['s3.BucketLifecycle'],'S3.14':['s3.BucketVersioning'],'S3.15':['s3.ObjectLock'],'S3.17':['s3.ServerSideEncrypted'],'S3.20':['s3.MFADelete']},
        'SQS':{'SQS.1':['sqs.EncryptionAtRest']},
        'Account':{'Account.1':['iam.hasAlternateContact'],'Account.2':['iam.hasOrganization']},
        'Macie':{'Macie.1':['s3.MacieToEnable']},
      }},
      { id:'soc2', name:'SOC 2 Type II', desc:'Trust service criteria for security, availability, processing integrity, confidentiality, and privacy.', categories:{
        'CC6 - Logical & Physical Access':{'CC6.1':['iam.mfaActive','iam.rootMfaActive','iam.passwordPolicy','iam.hasSSORoles'],'CC6.3':['ec2.SGDefaultInUsed','ec2.SGSensitivePortOpenToAll','ec2.SGAllOpenToAll'],'CC6.6':['cloudfront.viewerPolicyHttps','s3.TlsEnforced','ec2.SGEncryptionInTransit'],'CC6.7':['ec2.EC2InstancePublicIP','rds.PubliclyAccessible'],'CC6.8':['iam.InlinePolicyFullAccessOneServ','iam.FullAdminAccess']},
        'CC7 - System Operations':{'CC7.1':['cloudtrail.NeedToEnableCloudTrail','cloudtrail.HasOneMultiRegionTrail','iam.EnableConfigService'],'CC7.2':['iam.enableGuardDuty','ec2.VPCFlowLogEnabled'],'CC7.3':['cloudwatch.alarmsWithoutSNS']},
        'CC8 - Change Management':{'CC8.1':['cloudtrail.LogFileValidationEnabled','cloudtrail.RequiresKmsKey']},
        'A1 - Availability':{'A1.2':['rds.MultiAZ','rds.Backup','ec2.EBSSnapshot','dynamodb.backupStatus']},
        'C1 - Confidentiality':{'C1.1':['s3.ServerSideEncrypted','ec2.EBSEncrypted','rds.StorageEncrypted','kms.KeyRotationEnabled'],'C1.2':['s3.PublicAccessBlock','s3.S3AccountPublicAccessBlock']},
      }},
    ];

    return fwDefs.map(fw => {
      const allControls = [];
      let totalChecked = 0, totalPassed = 0;
      Object.entries(fw.categories).forEach(([catName, rules]) => {
        Object.entries(rules).forEach(([ruleId, ssChecks]) => {
          if (!ssChecks.length) {
            allControls.push({category:catName,id:ruleId,status:'N/A',title:'Manual review required',severity:'',recommendation:'',resources:''});
            return;
          }
          // Map SS check names back to our check_ids to see if we have findings
          const ourMatchedIds = ssChecks.map(ss => ssToOur[ss]).filter(Boolean);
          const uniqueOurIds = [...new Set(ourMatchedIds)];
          // Check if any of our matched check_ids appear in scan findings (= fail)
          const failedOurIds = uniqueOurIds.filter(cid => checkIds.has(cid));
          // Check if we scanned the relevant services
          const relevantSvcs = ssChecks.map(ss => ss.split('.')[0].toLowerCase());
          const scannedAny = relevantSvcs.some(s => scannedSvcs.has(s) || scannedSvcs.has(s.replace('_','')));
          // Also check if we have any of our check_ids for these services
          const hasOurChecks = uniqueOurIds.length > 0;

          if (!scannedAny && !hasOurChecks) {
            allControls.push({category:catName,id:ruleId,status:'N/A',title:'Service not scanned',severity:'',recommendation:'',resources:ssChecks.join(', ')});
            return;
          }
          totalChecked++;
          if (failedOurIds.length === 0) {
            totalPassed++;
            allControls.push({category:catName,id:ruleId,status:'Compliant',title:'All checks passed',severity:'',recommendation:'',resources:ssChecks.join(', ')});
          } else {
            const rf = failedOurIds.map(c=>findingMap[c]).filter(Boolean);
            const top = rf.sort((a,b)=>{const o={CRITICAL:0,HIGH:1,MEDIUM:2,LOW:3};return(o[a.severity]||4)-(o[b.severity]||4);})[0];
            const res = rf.map(f=>f.resource).filter(Boolean).slice(0,3).join(', ');
            allControls.push({category:catName,id:ruleId,status:'Need Attention',title:top?top.title:failedOurIds.join(', '),severity:top?top.severity:'MEDIUM',recommendation:top?(top.recommendation||top.description||''):'',resources:res||ssChecks.join(', ')});
          }
        });
      });
      return { id:fw.id, name:fw.name, desc:fw.desc||'', score:totalChecked>0?Math.round(totalPassed/totalChecked*100):0, controls:allControls.length, passed:totalPassed, details:allControls };
    });
  },
};
