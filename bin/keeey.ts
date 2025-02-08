#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { KeeeyPipelineStack } from '../lib/keeey-stack';

const app = new cdk.App();
new KeeeyPipelineStack(app, 'KeeeyPipelineStack', {
  env: { account: '794038246157', region: 'us-east-1' },
});
