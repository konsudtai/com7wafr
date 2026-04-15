import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import * as path from 'path';
import { Construct } from 'constructs';

/**
 * ApiStack — API Gateway + Lambda + Cognito Authorizer
 *
 * Creates a REST API Gateway with Cognito-based JWT authorization,
 * Lambda handlers for scan, account, and team management endpoints,
 * and grants DynamoDB read/write permissions to all handlers.
 */
export interface ApiStackProps extends cdk.StackProps {
  userPool: cognito.IUserPool;
  table: dynamodb.ITable;
}

export class ApiStack extends cdk.Stack {
  public readonly apiUrl: string;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const { userPool, table } = props;

    // --- Cognito Authorizer ---
    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'WAReviewAuthorizer', {
      cognitoUserPools: [userPool],
      authorizerName: 'wa-review-cognito-authorizer',
    });

    const authMethodOptions: apigateway.MethodOptions = {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    };

    // --- REST API ---
    const api = new apigateway.RestApi(this, 'WAReviewApi', {
      restApiName: 'wa-review-api',
      defaultCorsPreflightOptions: {
        allowOrigins: ['https://*.cloudfront.net'],
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    // --- Lambda Functions ---
    const backendDir = path.join(__dirname, '..', '..', 'backend');

    const commonLambdaProps: Omit<lambda.FunctionProps, 'handler' | 'functionName'> = {
      runtime: lambda.Runtime.NODEJS_20_X,
      code: lambda.Code.fromAsset(backendDir),
      timeout: cdk.Duration.seconds(60),
      memorySize: 256,
      environment: {
        TABLE_NAME: table.tableName,
        USER_POOL_ID: userPool.userPoolId,
      },
    };

    const scanHandler = new lambda.Function(this, 'ScanHandler', {
      ...commonLambdaProps,
      functionName: 'wa-review-scan-handler',
      handler: 'dist/handlers/scan-handler.handler',
    });

    const accountHandler = new lambda.Function(this, 'AccountHandler', {
      ...commonLambdaProps,
      functionName: 'wa-review-account-handler',
      handler: 'dist/handlers/account-handler.handler',
    });

    const teamHandler = new lambda.Function(this, 'TeamHandler', {
      ...commonLambdaProps,
      functionName: 'wa-review-team-handler',
      handler: 'dist/handlers/team-handler.handler',
    });

    // --- DynamoDB Permissions ---
    table.grantReadWriteData(scanHandler);
    table.grantReadWriteData(accountHandler);
    table.grantReadWriteData(teamHandler);

    // --- API Resources & Methods ---

    // /scans
    const scans = api.root.addResource('scans');
    scans.addMethod('POST', new apigateway.LambdaIntegration(scanHandler), authMethodOptions);
    scans.addMethod('GET', new apigateway.LambdaIntegration(scanHandler), authMethodOptions);

    // /scans/{id}
    const scanById = scans.addResource('{id}');

    // /scans/{id}/status
    const scanStatus = scanById.addResource('status');
    scanStatus.addMethod('GET', new apigateway.LambdaIntegration(scanHandler), authMethodOptions);

    // /scans/{id}/results
    const scanResults = scanById.addResource('results');
    scanResults.addMethod('GET', new apigateway.LambdaIntegration(scanHandler), authMethodOptions);

    // /accounts
    const accounts = api.root.addResource('accounts');
    accounts.addMethod('POST', new apigateway.LambdaIntegration(accountHandler), authMethodOptions);
    accounts.addMethod('GET', new apigateway.LambdaIntegration(accountHandler), authMethodOptions);

    // /accounts/{id}
    const accountById = accounts.addResource('{id}');
    accountById.addMethod('PUT', new apigateway.LambdaIntegration(accountHandler), authMethodOptions);
    accountById.addMethod('DELETE', new apigateway.LambdaIntegration(accountHandler), authMethodOptions);

    // /accounts/{id}/verify
    const accountVerify = accountById.addResource('verify');
    accountVerify.addMethod('POST', new apigateway.LambdaIntegration(accountHandler), authMethodOptions);

    // /team
    const team = api.root.addResource('team');

    // /team/members
    const teamMembers = team.addResource('members');
    teamMembers.addMethod('POST', new apigateway.LambdaIntegration(teamHandler), authMethodOptions);
    teamMembers.addMethod('GET', new apigateway.LambdaIntegration(teamHandler), authMethodOptions);

    // /team/members/{email}
    const teamMemberByEmail = teamMembers.addResource('{email}');

    // /team/members/{email}/role
    const teamMemberRole = teamMemberByEmail.addResource('role');
    teamMemberRole.addMethod('PUT', new apigateway.LambdaIntegration(teamHandler), authMethodOptions);

    // /team/members/{email} DELETE
    teamMemberByEmail.addMethod('DELETE', new apigateway.LambdaIntegration(teamHandler), authMethodOptions);

    // --- Expose API URL ---
    this.apiUrl = api.url;

    // --- AWS WAF WebACL ---
    const webAcl = new wafv2.CfnWebACL(this, 'WAReviewWebACL', {
      name: 'wa-review-api-waf',
      scope: 'REGIONAL',
      defaultAction: { allow: {} },
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: 'wa-review-api-waf',
        sampledRequestsEnabled: true,
      },
      rules: [
        {
          name: 'AWSManagedRulesCommonRuleSet',
          priority: 1,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesCommonRuleSet',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'AWSManagedRulesCommonRuleSet',
            sampledRequestsEnabled: true,
          },
        },
        {
          name: 'AWSManagedRulesKnownBadInputsRuleSet',
          priority: 2,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesKnownBadInputsRuleSet',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'AWSManagedRulesKnownBadInputsRuleSet',
            sampledRequestsEnabled: true,
          },
        },
        {
          name: 'RateLimitRule',
          priority: 3,
          action: { block: {} },
          statement: {
            rateBasedStatement: {
              limit: 1000,
              aggregateKeyType: 'IP',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'RateLimitRule',
            sampledRequestsEnabled: true,
          },
        },
      ],
    });

    // Associate WAF WebACL with API Gateway stage
    new wafv2.CfnWebACLAssociation(this, 'WAReviewWebACLAssociation', {
      resourceArn: api.deploymentStage.stageArn,
      webAclArn: webAcl.attrArn,
    });
  }
}
