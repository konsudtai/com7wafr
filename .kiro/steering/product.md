# Product Overview

AWS Well-Architected Review Tool — an automated tool for scanning and evaluating AWS environments against the 5 pillars of the AWS Well-Architected Framework: Security, Reliability, Operational Excellence, Performance Efficiency, and Cost Optimization.

Inspired by [service-screener-v2](https://github.com/aws-samples/service-screener-v2).

## Two Operating Modes

1. **CLI Mode**: Command-line tool for AWS CloudShell or local environments. Scans resources, evaluates against rules, generates HTML/JSON reports.
2. **Web Dashboard Mode**: Serverless web app (CloudFront + S3 frontend, API Gateway + Lambda + DynamoDB + Cognito backend). Real-time scanning via browser with authentication and team management.

## Key Capabilities

- Multi-region, multi-account (cross-account via STS assume role) scanning
- Resource filtering by services and tags
- Findings categorized by Well-Architected pillar and severity (CRITICAL, HIGH, MEDIUM, LOW, INFORMATIONAL)
- Plugin-based rule engine — add checks without modifying core code
- HTML reports (self-contained, offline-viewable) and JSON output
- Suppression files to exclude known/accepted findings
- Integration with AWS Well-Architected Tool API
- One-command installation via AWS CloudShell
- Role-based access control (Admin / Viewer) via Cognito
- Team management (invite members, assign roles)

## Primary Language

The project documentation and requirements are written in Thai. Code, variable names, and technical identifiers use English.
