/* ================ FAKE DATA ================ */
window.DATA = (() => {
  const accounts = [
    { id: '123456789012', alias: 'com7-prod',    env: 'Production',  region: 'ap-southeast-1', critical: 3, high: 11, medium: 18, low: 22, info: 4 },
    { id: '234567890123', alias: 'com7-staging', env: 'Staging',     region: 'ap-southeast-1', critical: 1, high: 6,  medium: 14, low: 19, info: 7 },
    { id: '345678901234', alias: 'com7-dev',     env: 'Development', region: 'ap-southeast-7', critical: 0, high: 2,  medium: 9,  low: 25, info: 11 },
    { id: '456789012345', alias: 'com7-analytics', env: 'Data',      region: 'us-east-1',      critical: 2, high: 5,  medium: 12, low: 17, info: 3 },
  ];

  const pillars = [
    { id: 'OE', name: 'Operational Excellence', score: 78, crit: 1, high: 4, med: 12, low: 18, info: 3 },
    { id: 'SE', name: 'Security',               score: 62, crit: 4, high: 9, med: 15, low: 21, info: 5 },
    { id: 'RE', name: 'Reliability',            score: 81, crit: 0, high: 3, med: 8,  low: 14, info: 6 },
    { id: 'PE', name: 'Performance Efficiency', score: 74, crit: 1, high: 5, med: 11, low: 13, info: 2 },
    { id: 'CO', name: 'Cost Optimization',      score: 69, crit: 0, high: 3, med: 7,  low: 17, info: 9 },
  ];

  const services = ['EC2','S3','IAM','RDS','Lambda','EKS','ECS','VPC','ELB','CloudTrail','CloudFront','KMS','DynamoDB','CloudWatch','Config'];

  const findings = [
    { id:'F-4821', resource:'i-0a84f1c9e28bb412d', service:'EC2', region:'ap-southeast-1', account:'com7-prod', pillar:'Security', severity:'CRITICAL', title:'EC2 instance exposes SSH (22) to 0.0.0.0/0' },
    { id:'F-4819', resource:'sg-0c9e2b6f0ef94ab11', service:'VPC', region:'ap-southeast-1', account:'com7-prod', pillar:'Security', severity:'CRITICAL', title:'Security group allows all inbound traffic' },
    { id:'F-4815', resource:'arn:aws:iam::123456:user/legacy-ops', service:'IAM', region:'global', account:'com7-prod', pillar:'Security', severity:'HIGH', title:'IAM user has console + programmatic access without MFA' },
    { id:'F-4811', resource:'s3://com7-invoice-archive', service:'S3', region:'ap-southeast-1', account:'com7-analytics', pillar:'Security', severity:'HIGH', title:'S3 bucket encryption not enforced (SSE-KMS)' },
    { id:'F-4809', resource:'prod-orders-db', service:'RDS', region:'ap-southeast-1', account:'com7-prod', pillar:'Reliability', severity:'HIGH', title:'RDS instance has no Multi-AZ failover' },
    { id:'F-4806', resource:'billing-webhook-fn', service:'Lambda', region:'ap-southeast-1', account:'com7-prod', pillar:'Performance Efficiency', severity:'MEDIUM', title:'Lambda memory over-provisioned (2048 MB, p95 uses 312 MB)' },
    { id:'F-4803', resource:'i-0f28da12ef9cba412', service:'EC2', region:'us-east-1', account:'com7-analytics', pillar:'Cost Optimization', severity:'MEDIUM', title:'EC2 m5.2xlarge idle >14 days (avg CPU 3%)' },
    { id:'F-4801', resource:'dev-cluster', service:'EKS', region:'ap-southeast-1', account:'com7-dev', pillar:'Operational Excellence', severity:'MEDIUM', title:'EKS control plane logs not enabled' },
    { id:'F-4799', resource:'com7-assets-cdn', service:'CloudFront', region:'global', account:'com7-prod', pillar:'Performance Efficiency', severity:'LOW', title:'CloudFront distribution missing compression' },
    { id:'F-4795', resource:'alias/pii-key', service:'KMS', region:'ap-southeast-1', account:'com7-prod', pillar:'Security', severity:'LOW', title:'KMS key rotation disabled' },
    { id:'F-4792', resource:'orders-table', service:'DynamoDB', region:'ap-southeast-1', account:'com7-prod', pillar:'Cost Optimization', severity:'LOW', title:'DynamoDB provisioned throughput >70% under-utilised' },
    { id:'F-4790', resource:'app-alb-prod', service:'ELB', region:'ap-southeast-1', account:'com7-prod', pillar:'Reliability', severity:'INFORMATIONAL', title:'ALB access logs not configured' },
  ];

  const frameworks = [
    { id:'wafs', name:'AWS Well-Architected', score: 73, controls: 214, passed: 156 },
    { id:'cis',  name:'CIS AWS Foundations v3.0.0', score: 81, controls: 76, passed: 62 },
    { id:'nist', name:'NIST Cybersecurity Framework', score: 68, controls: 108, passed: 73 },
    { id:'soc2', name:'SOC 2 Type II',          score: 77, controls: 91,  passed: 70 },
    { id:'ftr',  name:'AWS FTR (Foundational Technical Review)', score: 84, controls: 42, passed: 35 },
  ];

  const history = [
    { date:'2026-04-18', score: 74, crit: 7, delta: '+3' },
    { date:'2026-04-11', score: 71, crit: 9, delta: '-1' },
    { date:'2026-04-04', score: 72, crit: 9, delta: '+2' },
    { date:'2026-03-28', score: 70, crit: 11, delta: '-4' },
    { date:'2026-03-21', score: 74, crit: 7, delta: '+6' },
    { date:'2026-03-14', score: 68, crit: 13, delta: '-2' },
  ];

  const team = [
    { name:'Kon Sudtai',     email:'konsudtai@com7.co.th', role:'Admin',   last:'now' },
    { name:'Narisara P.',    email:'narisara@com7.co.th',  role:'Auditor', last:'3 min ago' },
    { name:'Preecha V.',     email:'preecha@com7.co.th',   role:'Viewer',  last:'1 hr ago' },
    { name:'SecOps Bot',     email:'bot-secops@com7.co.th',role:'Service', last:'Automation' },
  ];

  const costOpps = [
    { title:'Rightsize idle EC2 m5.2xlarge instances',    saving: 2840, account:'com7-analytics', count: 4 },
    { title:'Switch DynamoDB to on-demand where p50 < 10%', saving: 1120, account:'com7-prod', count: 3 },
    { title:'Delete unattached EBS volumes >30 days',      saving: 430,  account:'com7-dev',  count: 11 },
    { title:'Enable S3 Intelligent-Tiering on archive buckets', saving: 680, account:'com7-analytics', count: 6 },
    { title:'Purchase 1-yr Savings Plans for baseline compute', saving: 5210, account:'All',  count: 1 },
  ];

  return { accounts, pillars, services, findings, frameworks, history, team, costOpps };
})();
