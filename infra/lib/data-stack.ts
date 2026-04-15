import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

/**
 * DataStack — DynamoDB table (single-table design)
 *
 * Creates a DynamoDB table with PK/SK keys, a GSI (GSI1PK/GSI1SK),
 * TTL support, and PAY_PER_REQUEST billing.
 *
 * Key Patterns:
 *   SCAN#{scan_id}    | META                          — Scan metadata
 *   SCAN#{scan_id}    | FINDING#{finding_id}          — Scan finding
 *   SCAN#{scan_id}    | ERROR#{index}                 — Scan error
 *   ACCOUNT#{id}      | META                          — Account config
 *   HISTORY           | SCAN#{timestamp}#{scan_id}    — Scan history
 */
export class DataStack extends cdk.Stack {
  public readonly table: dynamodb.Table;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.table = new dynamodb.Table(this, 'WAReviewTable', {
      tableName: 'wa-review-tool',
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      timeToLiveAttribute: 'ttl',
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecovery: true,
    });

    this.table.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI1SK', type: dynamodb.AttributeType.STRING },
    });
  }
}
