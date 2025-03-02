import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as pipelines from 'aws-cdk-lib/pipelines';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import { Repository } from 'aws-cdk-lib/aws-ecr';
import { Role } from 'aws-cdk-lib/aws-iam';
import { KeeeyStack } from './keeey-stack';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions';

export class KeeeyPipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const cdkLibSource = new codepipeline.Artifact();
    const cdkLambdaSource = new codepipeline.Artifact();

    const pipeline2 = new codepipeline.Pipeline(this, 'Pipeline', {
      
    });

    pipeline2.addStage({
      stageName: 'Source',
      actions: [
        new codepipeline_actions.CodeStarConnectionsSourceAction({
          actionName: 'CDK_Source',
          owner: 'daniel-marshall',
          repo: 'keeey',
          output: cdkLibSource,
          branch: 'main',
          connectionArn: 'arn:aws:codeconnections:us-east-1:794038246157:connection/ea3d36ad-20ec-4d43-8a71-6507352dcda8', // Created using the AWS console
        }),
        new codepipeline_actions.CodeStarConnectionsSourceAction({
          actionName: 'Lambda_Source',
          owner: 'daniel-marshall',
          repo: 'keeey-lambda',
          output: cdkLambdaSource,
          branch: 'main',
          connectionArn: 'arn:aws:codeconnections:us-east-1:794038246157:connection/ea3d36ad-20ec-4d43-8a71-6507352dcda8', // Created using the AWS console
        }),
      ],
    });

    const cdkSynthResult = new codepipeline.Artifact();
    pipeline2.addStage({
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

    const pipeline = new pipelines.CodePipeline(this, 'PipelineWrapper', {
      codePipeline: pipeline2,
      synth: pipelines.CodePipelineFileSet.fromArtifact(cdkSynthResult),
      selfMutation: false
    });

    pipeline.buildPipeline();

    const buildRepo = new Repository(this, `${id}BuildArtifacts`);

    const lambdaBuild2 = new codebuild.PipelineProject(this, `LambdaBuild`, {
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

    const lambdaBuild = new codepipeline_actions.CodeBuildAction({
      actionName: 'LambdaBuild',
      project: lambdaBuild2,
      input: cdkLambdaSource
    });

    pipeline2.addStage({
      stageName: 'LambdaBuild',
      actions: [ lambdaBuild ]
    });

    const keeey = new class extends cdk.Stack {
      parameters = {
        EcrImagePointer: lambdaBuild.variable("BUILT_ECR_IMAGE_DIGEST")
      }
      constructor() {
        super(scope, 'Alpha', props);
        new KeeeyStack(this, 'Keeey', { ...props, ecrImagePointerParameterId: 'EcrImagePointer' });
      }
    }();

    this.appendStackToPipeline({
      pipeline: pipeline2,
      stageName: 'Alpha',
      stack: keeey,
      cdkSynth: cdkSynthResult
    })

    buildRepo.grantPullPush(lambdaBuild2);
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
          templatePath: props.cdkSynth.atPath(props.stack.templateFile),
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
