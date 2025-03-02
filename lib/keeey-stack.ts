import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Repository } from 'aws-cdk-lib/aws-ecr';

export interface Props extends cdk.StackProps {
  ecrRepo: Repository,
  ecrImageDigestParameterId: string,
}

export class KeeeyStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);
    const ecrDigest = new cdk.CfnParameter(this, props.ecrImageDigestParameterId, {
      type: 'String',
    });
    ecrDigest.overrideLogicalId(props.ecrImageDigestParameterId);
    new lambda.Function(this, 'Function', {
      runtime: lambda.Runtime.FROM_IMAGE,
      handler: lambda.Handler.FROM_IMAGE,
      code: lambda.Code.fromEcrImage(props.ecrRepo, { tagOrDigest: `sha256:${ecrDigest.valueAsString}` }),
    });
  }
}
