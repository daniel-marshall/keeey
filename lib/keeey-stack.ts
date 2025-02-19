import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as pipelines from 'aws-cdk-lib/pipelines';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';

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
            triggerOnPush: true,
          }
        ),
        commands: ['npm ci', 'npm run build', 'npx cdk synth'],
      }),
      selfMutation: false
    });

    const stackScope = this;
    pipeline.addWave('LambdaBuild',
      {
        post: [
          new pipelines.CodeBuildStep('LambdaBuildStep', {
            commands: ['./gradlew docker-publish -Paccount_id=794038246157 -Pregion=us-east-1 -Prepo_name=hello'],
            buildEnvironment: {
              buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2023_5,
            },
            input: pipelines.CodePipelineSource.connection(
              'daniel-marshall/keeey-lambda',
              'main',
              {
                connectionArn:
                  'arn:aws:codeconnections:us-east-1:794038246157:connection/ea3d36ad-20ec-4d43-8a71-6507352dcda8', // Created using the AWS console
                triggerOnPush: true,
              }
            ),
          }),
        ],
      }
    );
  }
}
