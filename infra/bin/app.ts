#!/usr/bin/env node
/**
 * AWS CDK app entry point for Well-Architected Review Tool.
 *
 * Wires all stacks together with cross-stack references:
 *   AuthStack → DataStack → ApiStack → FrontendStack
 */
import * as cdk from 'aws-cdk-lib';
import { AuthStack } from '../lib/auth-stack';
import { DataStack } from '../lib/data-stack';
import { ApiStack } from '../lib/api-stack';
import { FrontendStack } from '../lib/frontend-stack';

const app = new cdk.App();

const authStack = new AuthStack(app, 'WAReviewAuthStack');
const dataStack = new DataStack(app, 'WAReviewDataStack');

const apiStack = new ApiStack(app, 'WAReviewApiStack', {
  userPool: authStack.userPool,
  table: dataStack.table,
});

new FrontendStack(app, 'WAReviewFrontendStack', {
  apiUrl: apiStack.apiUrl,
  userPoolId: authStack.userPool.userPoolId,
  userPoolClientId: authStack.userPoolClient.userPoolClientId,
});

app.synth();
