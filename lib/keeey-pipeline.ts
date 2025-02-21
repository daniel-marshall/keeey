import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as pipelines from 'aws-cdk-lib/pipelines';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import { Repository } from 'aws-cdk-lib/aws-ecr';
import { KeeeyStack } from './keeey-stack';

export class KeeeyPipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const synthStep = new pipelines.ShellStep('Synth', {
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
    });

    const pipeline = new pipelines.CodePipeline(this, 'Pipeline', {
      synth: synthStep,
      selfMutation: false
    });

    const buildRepo = new Repository(pipeline, `${id}BuildArtifacts`);

    const lambdaBuild = new pipelines.CodeBuildStep('Build', {
      commands: [ `./gradlew docker-publish -Paccount_id=${this.account} -Pregion=${this.region} -Prepo_name=${buildRepo.repositoryName}` ],
      buildEnvironment: {
        buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2023_5,
      },
      primaryOutputDirectory: 'build',
      input: pipelines.CodePipelineSource.connection(
        'daniel-marshall/keeey-lambda',
        'main',
        {
          connectionArn:
            'arn:aws:codeconnections:us-east-1:794038246157:connection/ea3d36ad-20ec-4d43-8a71-6507352dcda8', // Created using the AWS console
          triggerOnPush: true,
        }
      ),
    });

    pipeline.addWave('LambdaBuild', {
      post: [ lambdaBuild ],
    });

    lambdaBuild.consumedStackOutputs

    pipeline.addWave('KeeeyAlpha', {
      post: [new pipelines.ShellStep('Deploy', {
        input: synthStep.primaryOutput,
        additionalInputs: {
          "lambda_sorce_build": lambdaBuild.primaryOutput!
        },
        installCommands: ['npm install --global aws-cdk'],
        commands: ['cdk deploy KeeeyAlpha --parameters lambda-image-digest=$(cat lambda_sorce_build/digest)'],
      })]
    })

    new KeeeyStack(scope, 'KeeeyAlpha', { ...props, buildRepo });

    pipeline.buildPipeline();
    buildRepo.grantPullPush(lambdaBuild);
  }
}
