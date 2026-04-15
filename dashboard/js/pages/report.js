/* ============================================
   WA Review Tool — Report Page
   Well-Architected audit report with:
   - Table of Contents
   - Per-pillar sections
   - Thai / English language toggle
   - PDF export with page breaks
   ============================================ */

// NOTE: Mock data below is for DEMO MODE only.
// In production, all data is fetched from the backend API via ApiClient.

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

  // --- Mock Data ---
  const latestScan = {
    id: 'SCAN-007', date: '2024-12-15 10:30', status: 'COMPLETED', resourcesScanned: 142,
    accounts: ['111122223333 (Production)', '444455556666 (Staging)', '777788889999 (Development)'],
    regions: ['us-east-1', 'ap-southeast-1', 'eu-west-1'],
    services: ['EC2', 'S3', 'RDS', 'IAM', 'Lambda', 'DynamoDB', 'ELB', 'CloudFront', 'ECS', 'EKS'],
  };

  const pillars = [
    { name: 'Security', score: 72, status: 'Needs Improvement',
      findings: [
        { id:'SEC-001', resource:'i-0abc123def456789', account:'111122223333', service:'EC2', severity:'CRITICAL', title:'EC2 instance has public IP with unrestricted SSH access (0.0.0.0/0 on port 22)', impact_th:'ผู้โจมตีสามารถ brute-force SSH เข้าถึง instance ได้โดยตรง', impact_en:'Attackers can directly brute-force SSH into the instance', rec_th:'จำกัด SSH access ให้เฉพาะ IP ที่อนุญาต หรือใช้ AWS Systems Manager Session Manager แทน', rec_en:'Restrict SSH access to specific IP ranges or use AWS Systems Manager Session Manager', evidence:'Security Group sg-0abc123 allows inbound TCP/22 from 0.0.0.0/0', remediation_status:'Open', docLink:'https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-security-groups.html' },
        { id:'SEC-002', resource:'arn:aws:iam::111122223333:user/deploy-bot', account:'111122223333', service:'IAM', severity:'CRITICAL', title:'IAM user has inline policy with Action:* and Resource:*', impact_th:'ละเมิดหลัก least privilege — user มีสิทธิ์เข้าถึงทุก resource ทุก action', impact_en:'Violates least privilege — user has access to all resources and actions', rec_th:'แทนที่ inline policy ด้วย managed policy ที่ระบุ actions และ resources เฉพาะที่จำเป็น', rec_en:'Replace inline policy with managed policies specifying only required actions and resources', evidence:'Inline policy "FullAccess" grants {"Effect":"Allow","Action":"*","Resource":"*"}', remediation_status:'Open', docLink:'https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html' },
        { id:'SEC-003', resource:'my-app-bucket', account:'111122223333', service:'S3', severity:'CRITICAL', title:'S3 bucket does not have server-side encryption enabled', impact_th:'ข้อมูลใน bucket ไม่ได้เข้ารหัส at rest ซึ่งอาจไม่ผ่าน compliance requirements', impact_en:'Data in bucket is not encrypted at rest, potentially failing compliance requirements', rec_th:'เปิด default encryption ด้วย SSE-S3 (AES-256) หรือ SSE-KMS', rec_en:'Enable default encryption using SSE-S3 (AES-256) or SSE-KMS', evidence:'GetBucketEncryption returns ServerSideEncryptionConfigurationNotFoundError', remediation_status:'Open', docLink:'https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucket-encryption.html' },
        { id:'SEC-004', resource:'eks-dev-cluster', account:'777788889999', service:'EKS', severity:'HIGH', title:'EKS cluster API endpoint is publicly accessible', impact_th:'Kubernetes API server เปิดรับ traffic จาก internet', impact_en:'Kubernetes API server is exposed to internet traffic', rec_th:'ปิด public endpoint access และเปิดเฉพาะ private endpoint', rec_en:'Disable public endpoint access and enable private endpoint only', evidence:'endpointPublicAccess: true, endpointPrivateAccess: false', remediation_status:'Open', docLink:'https://docs.aws.amazon.com/eks/latest/userguide/cluster-endpoint.html' },
        { id:'SEC-005', resource:'alb-prod-web', account:'444455556666', service:'ELB', severity:'HIGH', title:'ALB does not have access logging enabled', impact_th:'ไม่สามารถตรวจสอบ traffic patterns และ audit trail ได้', impact_en:'Cannot audit traffic patterns or maintain audit trail', rec_th:'เปิด access logging ไปยัง S3 bucket สำหรับ audit', rec_en:'Enable access logging to an S3 bucket for auditing', evidence:'access_logs.s3.enabled = false', remediation_status:'Open', docLink:'https://docs.aws.amazon.com/elasticloadbalancing/latest/application/enable-access-logging.html' },
        { id:'SEC-006', resource:'d-abc123xyz', account:'777788889999', service:'CloudFront', severity:'MEDIUM', title:'CloudFront distribution does not enforce HTTPS', impact_th:'ข้อมูลระหว่าง client และ CloudFront อาจถูกดักฟังได้', impact_en:'Data between client and CloudFront may be intercepted', rec_th:'ตั้ง viewer protocol policy เป็น redirect-to-https', rec_en:'Set viewer protocol policy to redirect-to-https or https-only', evidence:'ViewerProtocolPolicy: allow-all', remediation_status:'Open', docLink:'https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-https.html' },
        { id:'SEC-007', resource:'arn:aws:iam::444455556666:user/dev-user', account:'444455556666', service:'IAM', severity:'HIGH', title:'IAM user with console access does not have MFA enabled', impact_th:'Account อาจถูก compromise ได้ง่ายหากรหัสผ่านรั่วไหล', impact_en:'Account may be easily compromised if password is leaked', rec_th:'เปิด MFA สำหรับทุก IAM user ที่มี console access', rec_en:'Enable MFA for all IAM users with console access', evidence:'MFADevices: [], PasswordLastUsed: 2024-12-10', remediation_status:'Open', docLink:'https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_mfa.html' },
        { id:'SEC-008', resource:'prod-table', account:'111122223333', service:'DynamoDB', severity:'MEDIUM', title:'DynamoDB table not encrypted with customer-managed KMS key', impact_th:'ใช้ AWS owned key ซึ่งไม่สามารถ audit key usage ได้เอง', impact_en:'Uses AWS owned key which cannot be independently audited or rotated', rec_th:'เปลี่ยนเป็น customer-managed KMS key', rec_en:'Switch to a customer-managed KMS key for key lifecycle control', evidence:'SSEDescription.SSEType: AES256 (AWS owned)', remediation_status:'Open', docLink:'https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/EncryptionAtRest.html' },
      ],
      controls: [
        { id:'SEC-C1', control:'Network Access Control', status:'Non-Compliant' },
        { id:'SEC-C2', control:'Encryption at Rest', status:'Partially Compliant' },
        { id:'SEC-C3', control:'Identity & Access Management', status:'Non-Compliant' },
        { id:'SEC-C4', control:'Logging & Monitoring', status:'Partially Compliant' },
        { id:'SEC-C5', control:'Data in Transit', status:'Partially Compliant' },
      ],
    },
    { name: 'Reliability', score: 65, status: 'Needs Improvement',
      findings: [
        { id:'REL-001', resource:'db-instance-prod', account:'444455556666', service:'RDS', severity:'HIGH', title:'RDS instance does not have Multi-AZ deployment enabled', impact_th:'หาก AZ ล่ม จะไม่มี automatic failover', impact_en:'No automatic failover if the AZ goes down', rec_th:'เปิด Multi-AZ deployment สำหรับ production databases', rec_en:'Enable Multi-AZ deployment for production databases', evidence:'MultiAZ: false, Engine: mysql', remediation_status:'Open', docLink:'https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZ.html' },
        { id:'REL-002', resource:'db-instance-prod', account:'444455556666', service:'RDS', severity:'MEDIUM', title:'RDS automated backup retention period is only 1 day', impact_th:'สามารถ restore ได้เพียง 1 วันย้อนหลัง', impact_en:'Can only restore to 1 day back', rec_th:'เพิ่ม backup retention period เป็นอย่างน้อย 7 วัน', rec_en:'Increase backup retention period to at least 7 days', evidence:'BackupRetentionPeriod: 1', remediation_status:'Open', docLink:'https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_WorkingWithAutomatedBackups.html' },
        { id:'REL-003', resource:'prod-cluster', account:'444455556666', service:'ECS', severity:'MEDIUM', title:'ECS service does not have deployment circuit breaker enabled', impact_th:'หาก deployment fail จะไม่มี automatic rollback', impact_en:'No automatic rollback if deployment fails', rec_th:'เปิด deployment circuit breaker พร้อม rollback', rec_en:'Enable deployment circuit breaker with rollback', evidence:'DeploymentCircuitBreaker.Enable: false', remediation_status:'Open', docLink:'https://docs.aws.amazon.com/AmazonECS/latest/developerguide/deployment-circuit-breaker.html' },
        { id:'REL-004', resource:'my-api-function', account:'777788889999', service:'Lambda', severity:'MEDIUM', title:'Lambda function does not have a dead letter queue configured', impact_th:'Events ที่ fail จะหายไปโดยไม่มี trace', impact_en:'Failed events are lost without any trace', rec_th:'ตั้ง DLQ (SQS หรือ SNS) เพื่อ capture failed events', rec_en:'Configure a DLQ (SQS or SNS) to capture failed events', evidence:'DeadLetterConfig: null', remediation_status:'Open', docLink:'https://docs.aws.amazon.com/lambda/latest/dg/invocation-async.html' },
        { id:'REL-005', resource:'i-0abc123def456789', account:'111122223333', service:'EC2', severity:'HIGH', title:'EC2 instance is not part of an Auto Scaling group or backup plan', impact_th:'หาก instance fail จะไม่มี automatic recovery', impact_en:'No automatic recovery if instance fails', rec_th:'เพิ่ม instance เข้า Auto Scaling group หรือตั้ง AWS Backup plan', rec_en:'Add instance to Auto Scaling group or configure AWS Backup plan', evidence:'AutoScalingGroup: null, BackupPlanId: null', remediation_status:'Open', docLink:'https://docs.aws.amazon.com/aws-backup/latest/devguide/whatisbackup.html' },
      ],
      controls: [
        { id:'REL-C1', control:'High Availability', status:'Non-Compliant' },
        { id:'REL-C2', control:'Backup & Recovery', status:'Partially Compliant' },
        { id:'REL-C3', control:'Fault Isolation', status:'Partially Compliant' },
      ],
    },
    { name: 'Operational Excellence', score: 80, status: 'Good',
      findings: [
        { id:'OPS-001', resource:'i-0abc123def456789', account:'111122223333', service:'EC2', severity:'MEDIUM', title:'EC2 instance does not have detailed monitoring enabled', impact_th:'ได้ metrics เพียง 5-minute intervals', impact_en:'Only 5-minute interval metrics available', rec_th:'เปิด detailed monitoring เพื่อรับ metrics ทุก 1 นาที', rec_en:'Enable detailed monitoring for 1-minute metrics', evidence:'Monitoring.State: disabled', remediation_status:'Open', docLink:'https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/using-cloudwatch-new.html' },
        { id:'OPS-002', resource:'eks-dev-cluster', account:'777788889999', service:'EKS', severity:'MEDIUM', title:'EKS cluster does not have control plane logging enabled', impact_th:'ไม่สามารถ audit API server requests ได้', impact_en:'Cannot audit API server requests', rec_th:'เปิด control plane logging ทุก log types', rec_en:'Enable all control plane log types', evidence:'ClusterLogging: all types disabled', remediation_status:'Open', docLink:'https://docs.aws.amazon.com/eks/latest/userguide/control-plane-logs.html' },
        { id:'OPS-003', resource:'prod-cluster', account:'444455556666', service:'ECS', severity:'LOW', title:'ECS cluster does not have Container Insights enabled', impact_th:'ขาด container-level metrics', impact_en:'Missing container-level metrics', rec_th:'เปิด Container Insights บน ECS cluster', rec_en:'Enable Container Insights on the ECS cluster', evidence:'Settings.containerInsights: disabled', remediation_status:'Open', docLink:'https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/deploy-container-insights-ECS.html' },
        { id:'OPS-004', resource:'my-api-function', account:'777788889999', service:'Lambda', severity:'HIGH', title:'Lambda function is using a deprecated runtime (nodejs14.x)', impact_th:'Runtime ที่ deprecated จะไม่ได้รับ security patches', impact_en:'Deprecated runtime will not receive security patches', rec_th:'อัปเกรดเป็น nodejs20.x', rec_en:'Upgrade to nodejs20.x runtime', evidence:'Runtime: nodejs14.x (deprecated since Nov 2023)', remediation_status:'Open', docLink:'https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html' },
      ],
      controls: [
        { id:'OPS-C1', control:'Monitoring & Observability', status:'Partially Compliant' },
        { id:'OPS-C2', control:'Audit Logging', status:'Partially Compliant' },
        { id:'OPS-C3', control:'Operational Readiness', status:'Non-Compliant' },
      ],
    },
    { name: 'Performance Efficiency', score: 58, status: 'Needs Improvement',
      findings: [
        { id:'PERF-001', resource:'my-api-function', account:'777788889999', service:'Lambda', severity:'MEDIUM', title:'Lambda function memory is set to default 128 MB', impact_th:'Memory ต่ำเกินไปอาจทำให้ execution time นานขึ้น', impact_en:'Low memory may cause longer execution times', rec_th:'ใช้ AWS Lambda Power Tuning เพื่อหา memory ที่เหมาะสม', rec_en:'Use AWS Lambda Power Tuning to find optimal memory', evidence:'MemorySize: 128 (default)', remediation_status:'Open', docLink:'https://docs.aws.amazon.com/lambda/latest/dg/configuration-memory.html' },
        { id:'PERF-002', resource:'i-0def456abc789012', account:'777788889999', service:'EC2', severity:'MEDIUM', title:'EC2 instance type may not be optimal for workload', impact_th:'Instance อาจ over-provisioned สำหรับ workload จริง', impact_en:'Instance may be over-provisioned for actual workload', rec_th:'ใช้ AWS Compute Optimizer เพื่อวิเคราะห์', rec_en:'Use AWS Compute Optimizer for analysis', evidence:'InstanceType: m5.2xlarge, Avg CPU: 12%', remediation_status:'Open', docLink:'https://docs.aws.amazon.com/compute-optimizer/latest/ug/what-is-compute-optimizer.html' },
        { id:'PERF-003', resource:'my-app-bucket', account:'111122223333', service:'S3', severity:'LOW', title:'S3 bucket does not use Intelligent-Tiering', impact_th:'อาจเสียค่า storage สูงกว่าจำเป็น', impact_en:'May incur higher storage costs than necessary', rec_th:'พิจารณาใช้ S3 Intelligent-Tiering', rec_en:'Consider using S3 Intelligent-Tiering', evidence:'StorageClass: STANDARD, No lifecycle rules', remediation_status:'Open', docLink:'https://docs.aws.amazon.com/AmazonS3/latest/userguide/intelligent-tiering.html' },
      ],
      controls: [
        { id:'PERF-C1', control:'Right-Sizing', status:'Non-Compliant' },
        { id:'PERF-C2', control:'Storage Optimization', status:'Partially Compliant' },
      ],
    },
    { name: 'Cost Optimization', score: 45, status: 'At Risk',
      findings: [
        { id:'COST-001', resource:'i-0def456abc789012', account:'777788889999', service:'EC2', severity:'MEDIUM', title:'EC2 instance is underutilized (average CPU < 5%)', impact_th:'เสียค่า compute สำหรับ instance ที่แทบไม่ได้ใช้งาน', impact_en:'Paying for compute on a nearly idle instance', rec_th:'Downsize เป็น instance type ที่เล็กลง', rec_en:'Downsize to a smaller instance type', evidence:'Avg CPU 14d: 3.2%', remediation_status:'Open', docLink:'https://docs.aws.amazon.com/cost-management/latest/userguide/ce-rightsizing.html' },
        { id:'COST-002', resource:'prod-table', account:'111122223333', service:'DynamoDB', severity:'MEDIUM', title:'DynamoDB table uses provisioned capacity with low utilization', impact_th:'จ่ายค่า provisioned capacity ที่ไม่ได้ใช้งาน', impact_en:'Paying for unused provisioned capacity', rec_th:'เปลี่ยนเป็น on-demand capacity mode', rec_en:'Switch to on-demand capacity mode', evidence:'ReadCapacity: 100 (used: 15), WriteCapacity: 50 (used: 8)', remediation_status:'Open', docLink:'https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/HowItWorks.ReadWriteCapacityMode.html' },
        { id:'COST-003', resource:'my-app-bucket', account:'111122223333', service:'S3', severity:'MEDIUM', title:'S3 bucket does not have lifecycle policy configured', impact_th:'Objects เก่าที่ไม่ได้ใช้งานยังคงอยู่ใน Standard storage', impact_en:'Old unused objects remain in Standard storage class', rec_th:'ตั้ง lifecycle rule เพื่อย้ายไป Glacier หรือลบอัตโนมัติ', rec_en:'Configure lifecycle rules to transition to Glacier or auto-delete', evidence:'LifecycleRules: none, BucketSize: 2.3 TB', remediation_status:'Open', docLink:'https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lifecycle-mgmt.html' },
        { id:'COST-004', resource:'i-0abc123def456789', account:'111122223333', service:'EC2', severity:'LOW', title:'EC2 instance is not using Reserved Instance or Savings Plan', impact_th:'จ่าย on-demand price ซึ่งแพงกว่า RI/SP ถึง 30-60%', impact_en:'Paying on-demand price which is 30-60% more expensive than RI/SP', rec_th:'พิจารณาซื้อ Reserved Instance หรือ Savings Plan', rec_en:'Consider purchasing Reserved Instances or Savings Plans', evidence:'PricingModel: On-Demand, RunningDays: 365+', remediation_status:'Open', docLink:'https://docs.aws.amazon.com/savingsplans/latest/userguide/what-is-savings-plans.html' },
      ],
      controls: [
        { id:'COST-C1', control:'Resource Right-Sizing', status:'Non-Compliant' },
        { id:'COST-C2', control:'Storage Lifecycle', status:'Non-Compliant' },
        { id:'COST-C3', control:'Pricing Optimization', status:'Partially Compliant' },
      ],
    },
  ];

  const totalFindings = pillars.reduce((s, p) => s + p.findings.length, 0);

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
      <div id="report-content">${renderReport()}</div>
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
  function init() {
    document.getElementById('btn-export-pdf')?.addEventListener('click', exportPDF);
    document.getElementById('report-lang')?.addEventListener('change', (e) => {
      currentLang = e.target.value;
      App.renderPage();
    });
  }

  return { render, init };
})();
