import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as dynamo from 'aws-cdk-lib/aws-dynamodb';
import { Repository } from 'aws-cdk-lib/aws-ecr';

export interface Props extends cdk.StackProps {
  ecrRepo: Repository,
  ecrImageDigestParameterId: string,
}

export class KeeeyStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);

    const table = new dynamo.TableV2(this, 'GlobalTable', {
      partitionKey: { name: 'key', type: dynamo.AttributeType.STRING },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      replicas: [
        { region: 'us-east-1' },
      ],
    });

    const ecrDigest = new cdk.CfnParameter(this, props.ecrImageDigestParameterId, {
      type: 'String',
    });
    ecrDigest.overrideLogicalId(props.ecrImageDigestParameterId);
    const lambdaFunc = new lambda.Function(this, 'Function', {
      runtime: lambda.Runtime.FROM_IMAGE,
      handler: lambda.Handler.FROM_IMAGE,
      code: lambda.Code.fromEcrImage(props.ecrRepo, { tagOrDigest: `sha256:${ecrDigest.valueAsString}` }),
      timeout: cdk.Duration.seconds(30),
      environment: {
        DYNAMO_TABLE_NAME: table.tableName
      }
    });

    table.grantReadWriteData(lambdaFunc);

    const url = lambdaFunc.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.AWS_IAM
    })

    new cloudfront.Distribution(this, "KeeeyDistribution", {
      defaultBehavior: {
        origin: origins.FunctionUrlOrigin.withOriginAccessControl(url)
      }
    });

    const user = new iam.User(this, 'FunctionInvokeUser');

    url.grantInvokeUrl(user);
  }
}
