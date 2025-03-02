import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Repository } from 'aws-cdk-lib/aws-ecr';

export interface Props extends cdk.StackProps {
  ecrImagePointerParameterId: string,
}

export class KeeeyStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);
    const ecrPointer = new cdk.CfnParameter(this, 'EcrPointer', {
      type: 'String',
    });
    ecrPointer.overrideLogicalId(props.ecrImagePointerParameterId);
    const ecrRepo = ecrPointer.valueAsString.split('@')[0]!;
    const ecrDigest = ecrPointer.valueAsString.split('@')[1]!;
    const repo = Repository.fromRepositoryName(this, 'ImageSource', ecrRepo);
    new lambda.Function(this, 'Function', {
      runtime: lambda.Runtime.FROM_IMAGE,
      handler: lambda.Handler.FROM_IMAGE,
      code: lambda.Code.fromEcrImage(repo, { tagOrDigest: ecrDigest }),
    });
  }
}
