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

    const buildRepo = new Repository(this, `${id}BuildArtifacts`);
    const ecrExport = new cdk.CfnOutput(this, `${id}BuildArtifactsExport`, { exportName: 'EcrRepoName', value: buildRepo.repositoryName });

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

    const alpha = pipeline.addWave('KeeeyAlpha')
    alpha.addPre(
      new pipelines.ShellStep('Deploy', {
        input: lambdaBuild.primaryOutput,
        commands: ['export ECR_DIGEST=$(cat digest)'],
      })
    )
    alpha.addStage(
      new class extends cdk.Stage {
        constructor() {
          super(scope, 'Alpha', props);
          new KeeeyStack(this, 'KeeeyAlpha', { ...props, ecrRepoName: ecrExport.importValue });
        }
      }()
    );

    pipeline.buildPipeline();
    buildRepo.grantPullPush(lambdaBuild);
  }
}
