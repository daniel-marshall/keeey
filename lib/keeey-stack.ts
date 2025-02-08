import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as pipelines from 'aws-cdk-lib/pipelines';

export class KeeeyPipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const pipeline = new pipelines.CodePipeline(this, 'Pipeline', {
      synth: new pipelines.ShellStep('Synth', {
        // Use a connection created using the AWS console to authenticate to GitHub
        // Other sources are available.
        input: pipelines.CodePipelineSource.connection(
          'daniel-marshall/keeey',
          'main',
          {
            connectionArn:
              'arn:aws:codeconnections:us-east-1:794038246157:connection/ea3d36ad-20ec-4d43-8a71-6507352dcda8', // Created using the AWS console
          }
        ),
        commands: ['npm ci', 'npm run build', 'npx cdk synth'],
      }),
    });
  }
}
