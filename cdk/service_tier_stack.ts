import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { LogGroup } from 'aws-cdk-lib/aws-logs';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import { Construct } from 'constructs';
import { CoreStack } from "./core_stack";
import * as dotenv from 'dotenv';

dotenv.config();

interface ExtendedProps extends cdk.StackProps {
  readonly coreStack: CoreStack;
}

export class ServiceTierLambdaStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ExtendedProps) {
    super(scope, id, props);

    const logGroup = new LogGroup(this, "ServiceTierLogGroup", {
      logGroupName: "ServiceTierLogGroup"
    })

    const lambdaFunction = new lambda.DockerImageFunction(this, 'ServiceTierFunction', {
      //code: lambda.DockerImageCode.fromImageAsset('.', {file:'./src/service_tier/Dockerfile'}),
      code: lambda.DockerImageCode.fromImageAsset('src/service_tier'),
      timeout: cdk.Duration.minutes(15),
      memorySize: 2*1024,
      environment: {
        ASTRA_BUCKET_NAME: props.coreStack.s3AstraBucket.bucketName,
        ASTRA_QUEUE_URL: props.coreStack.astraSQSQueue.queueUrl,
        SEMANTIC_SCHOLAR_API_KEY: process.env.SEMANTIC_SCHOLAR_API_KEY!,
        GOOGLE_API_KEY: process.env.GOOGLE_API_KEY!,
        CARTESIA_API_KEY: process.env.CARTESIA_API_KEY!,
        PERPLEXITY_API_KEY: process.env.PERPLEXITY_API_KEY!,
      },
      role: props.coreStack.astraLambdaRole,
      logGroup: logGroup
    });

    // Grant Lambda permissions to send messages to the queue
    props.coreStack.astraSQSQueue.grantSendMessages(lambdaFunction);

    // Grant Lambda permissions to be triggered by the queue
    lambdaFunction.addEventSource(
      new lambdaEventSources.SqsEventSource(props.coreStack.astraSQSQueue, {
        batchSize: 1, // Process one message at a time
      })
    );
  }
}
