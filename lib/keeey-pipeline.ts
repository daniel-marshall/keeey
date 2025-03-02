import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as pipelines from 'aws-cdk-lib/pipelines';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import { Repository } from 'aws-cdk-lib/aws-ecr';
import { KeeeyStack } from './keeey-stack';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions';

export class KeeeyPipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const cdkSynthResult = new codepipeline.Artifact();
    const pipelineActual = new codepipeline.Pipeline(this, 'Pipeline', {})
    const pipeline = new pipelines.CodePipeline(this, 'PipelineWrapper', {
      codePipeline: pipelineActual,
      synth: pipelines.CodePipelineFileSet.fromArtifact(cdkSynthResult),
      selfMutation: false
    });

    const githubActionParams = {
      branch: 'main',
      connectionArn: 'arn:aws:codeconnections:us-east-1:794038246157:connection/ea3d36ad-20ec-4d43-8a71-6507352dcda8', // Created using the AWS console
    }

    const cdkLibSource = new codepipeline.Artifact();
    const cdkLambdaSource = new codepipeline.Artifact();
    pipelineActual.addStage({
      stageName: 'Source',
      actions: [
        new codepipeline_actions.CodeStarConnectionsSourceAction({
          ...githubActionParams,
          actionName: 'CDK_Source',
          owner: 'daniel-marshall',
          repo: 'keeey',
          output: cdkLibSource,
        }),
        new codepipeline_actions.CodeStarConnectionsSourceAction({
          ...githubActionParams,
          actionName: 'Lambda_Source',
          owner: 'daniel-marshall',
          repo: 'keeey-lambda',
          output: cdkLambdaSource,
        }),
      ],
    });

    pipelineActual.addStage({
      stageName: 'CdkSynthesise',
      actions: [
        new codepipeline_actions.CodeBuildAction({
          actionName: 'CdkBuild',
          project: new codebuild.PipelineProject(this, `CdkBuild`, {
            buildSpec: codebuild.BuildSpec.fromObject({
              version: '0.2',
              phases: {
                build: {
                  commands:[
                    'npm ci', 'npm run build', 'npx cdk synth',
                  ],
                },
              },
              artifacts: {
                files: 'cdk.out/**/*'
              },
            }),
          }),
          input: cdkLibSource,
          outputs: [ cdkSynthResult ],
        }),
      ]
    });

    pipeline.buildPipeline();

    const buildRepo = new Repository(this, `${id}BuildArtifacts`);

    const lambdaBuildProject = new codebuild.PipelineProject(this, `LambdaBuild`, {
      environment: {
        buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2023_5,
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        env: {
          'exported-variables': [
            'BUILT_ECR_IMAGE_DIGEST'
          ]
        },
        phases: {
          build: {
            commands:[
              `./gradlew docker-publish -Paccount_id=${this.account} -Pregion=${this.region} -Prepo_name=${buildRepo.repositoryName}`,
              'ls -la',
              'export BUILT_ECR_IMAGE_DIGEST=$(cat ./build/digest)'
            ],
          },
        },
      }),
    });
    buildRepo.grantPullPush(lambdaBuildProject);

    const lambdaBuild = new codepipeline_actions.CodeBuildAction({
      actionName: 'LambdaBuild',
      project: lambdaBuildProject,
      input: cdkLambdaSource
    });

    pipelineActual.addStage({
      stageName: 'LambdaBuild',
      actions: [ lambdaBuild ]
    });

    const keeey = new class extends KeeeyStack {
      parameters = {
        EcrImageDigest: lambdaBuild.variable("BUILT_ECR_IMAGE_DIGEST")
      }
      constructor() {
        super(scope, 'Alpha/Keeey', { ...props, ecrRepo: buildRepo, ecrImageDigestParameterId: 'EcrImageDigest' });
      }
    }();

    this.appendStackToPipeline({
      pipeline: pipelineActual,
      stageName: 'Alpha',
      stack: keeey,
      cdkSynth: cdkSynthResult
    })
  }

  private appendStackToPipeline(props: { pipeline: codepipeline.Pipeline, stageName: string, stack: cdk.Stack & { parameters?: { [name: string]: any }  }, cdkSynth: codepipeline.Artifact }) {
    props.pipeline.addStage({
      stageName: props.stageName,
      actions: [
        new codepipeline_actions.CloudFormationCreateReplaceChangeSetAction({
          actionName: 'PrepareChanges',
          stackName: props.stack.stackName,
          changeSetName: 'PipelineChange',
          adminPermissions: true,
          templatePath: props.cdkSynth.atPath(`cdk.out/${props.stack.templateFile}`),
          parameterOverrides: props.stack.parameters,
          runOrder: 1,
          extraInputs: [ props.cdkSynth ],
        }),
        new codepipeline_actions.CloudFormationExecuteChangeSetAction({
          actionName: 'ExecuteChanges',
          stackName: props.stack.stackName,
          changeSetName: 'PipelineChange',
          runOrder: 2,
        }),
      ],
    });
  }
}
