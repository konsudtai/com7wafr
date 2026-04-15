import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import { Construct } from 'constructs';

// Security headers policy for CloudFront responses

/**
 * FrontendStack — S3 + CloudFront distribution
 *
 * Creates an S3 bucket with blocked public access for static site hosting,
 * a CloudFront distribution with Origin Access Control (OAC), HTTPS redirect,
 * and SPA routing (404 → /index.html with 200 status).
 *
 * Outputs: DashboardURL, ApiURL, UserPoolId, UserPoolClientId
 */
export interface FrontendStackProps extends cdk.StackProps {
  apiUrl: string;
  userPoolId: string;
  userPoolClientId: string;
}

export class FrontendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: FrontendStackProps) {
    super(scope, id, props);

    // S3 bucket for static site — block all public access
    const siteBucket = new s3.Bucket(this, 'WAReviewSiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // Security response headers policy (CSP, HSTS, X-Frame-Options, etc.)
    const responseHeadersPolicy = new cloudfront.ResponseHeadersPolicy(this, 'WAReviewSecurityHeaders', {
      responseHeadersPolicyName: 'wa-review-security-headers',
      securityHeadersBehavior: {
        contentSecurityPolicy: {
          contentSecurityPolicy: "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://*.amazonaws.com https://*.amazoncognito.com",
          override: true,
        },
        strictTransportSecurity: {
          accessControlMaxAge: cdk.Duration.seconds(63072000),
          includeSubdomains: true,
          preload: true,
          override: true,
        },
        contentTypeOptions: {
          override: true,
        },
        frameOptions: {
          frameOption: cloudfront.HeadersFrameOption.DENY,
          override: true,
        },
        referrerPolicy: {
          referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
          override: true,
        },
      },
    });

    // CloudFront distribution with OAC via S3BucketOrigin
    const distribution = new cloudfront.Distribution(this, 'WAReviewDistribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        responseHeadersPolicy,
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
        },
      ],
    });

    // Stack outputs for dashboard configuration
    new cdk.CfnOutput(this, 'DashboardURL', {
      value: `https://${distribution.distributionDomainName}`,
    });

    new cdk.CfnOutput(this, 'ApiURL', {
      value: props.apiUrl,
    });

    new cdk.CfnOutput(this, 'UserPoolId', {
      value: props.userPoolId,
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: props.userPoolClientId,
    });
  }
}
