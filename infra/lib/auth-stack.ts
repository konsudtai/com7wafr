import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';

/**
 * AuthStack — Cognito User Pool + Client
 *
 * Creates a Cognito User Pool with strict password policy, custom role attribute,
 * and a User Pool Client configured for USER_PASSWORD_AUTH and USER_SRP_AUTH flows.
 * Self-signup is disabled; users are created by admins only.
 */
export class AuthStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.userPool = new cognito.UserPool(this, 'WAReviewUserPool', {
      userPoolName: 'wa-review-user-pool',
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      mfa: cognito.Mfa.REQUIRED,
      mfaSecondFactor: {
        sms: false,
        otp: true,
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      customAttributes: {
        role: new cognito.StringAttribute({ mutable: true }),
      },
      userInvitation: {
        emailSubject: 'Welcome to AWS Well-Architected Review Tool',
        emailBody:
          'You have been invited to the AWS Well-Architected Review Tool. Your temporary password is {####}. Please log in with your email {username} and change your password. You will also need to set up MFA using an authenticator app.',
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Enable prevent_user_existence_errors via CfnUserPool override
    const cfnUserPool = this.userPool.node.defaultChild as cognito.CfnUserPool;
    cfnUserPool.userPoolAddOns = {
      advancedSecurityMode: 'OFF',
    };

    this.userPoolClient = this.userPool.addClient('WAReviewUserPoolClient', {
      userPoolClientName: 'wa-review-client',
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      preventUserExistenceErrors: true,
      idTokenValidity: cdk.Duration.hours(1),
      accessTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
    });
  }
}
