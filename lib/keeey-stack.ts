import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { IRepository } from 'aws-cdk-lib/aws-ecr';

export interface Props extends cdk.StackProps {
  buildRepo: IRepository
}

export class KeeeyStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);
    const digest = new cdk.CfnParameter(this, 'lambda-image-digest').valueAsString;
    new lambda.Function(this, 'Function', {
      runtime: lambda.Runtime.FROM_IMAGE,
      handler: lambda.Handler.FROM_IMAGE,
      code: lambda.Code.fromEcrImage(props.buildRepo, { tagOrDigest: digest }),
    });
  }
}
