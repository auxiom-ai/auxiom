import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import { Construct } from 'constructs';
import { CoreStack } from "./core_stack";
import * as dotenv from 'dotenv';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subs from 'aws-cdk-lib/aws-sns-subscriptions';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';

dotenv.config();

interface ExtendedProps extends cdk.StackProps {
  readonly coreStack: CoreStack;
}

export class ContentStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ExtendedProps) {
    super(scope, id, props);

    const logGroup = new logs.LogGroup(this, "ContentLogGroup", {
      logGroupName: "ContentLogGroup",
      retention: cdk.aws_logs.RetentionDays.ONE_MONTH
    })

    const lambdaFunction = new lambda.DockerImageFunction(this, 'ContentFunction', {
      code: lambda.DockerImageCode.fromImageAsset('src/content-lambda'),
      timeout: cdk.Duration.minutes(15),
      memorySize: 2048,
      environment: {
        ASTRA_BUCKET_NAME: props.coreStack.s3AstraBucket.bucketName,
        CLUSTERER_QUEUE_URL: props.coreStack.clustererSQSQueue.queueUrl,
        CONTENT_QUEUE_URL: props.coreStack.contentSQSQueue.queueUrl,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY!,
        GOVINFO_API_KEY: process.env.GOVINFO_API_KEY!,
        DB_ACCESS_URL: process.env.DB_ACCESS_URL!,
        GOOGLE_API_KEY: process.env.GOOGLE_API_KEY!,
        CONGRESS_API_KEY: process.env.CONGRESS_API_KEY!
      },
      role: props.coreStack.generalLambdaRole,
      logGroup: logGroup
    });

    const ContentlambdaErrorMetric = lambdaFunction.metricErrors({
      period: cdk.Duration.hours(20),
      statistic: 'Sum',
    });

    // Alarm for Lambda function errors
    const ContentLambdaFailureAlarm = new cloudwatch.Alarm(this, 'ContentLambdaFailureAlarm', {
      metric: ContentlambdaErrorMetric,
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      alarmDescription: 'Alarm when Lambda function fails',
    });

    const ContentLambdaFailureAlarmTopic = new sns.Topic(this, 'ContentLambdaFailureAlarmTopic');
    ContentLambdaFailureAlarmTopic.addSubscription(new subs.EmailSubscription('rahilv99@gmail.com'));
    ContentLambdaFailureAlarm.addAlarmAction(new cloudwatchActions.SnsAction(ContentLambdaFailureAlarmTopic))

    // Grant Lambda permissions to send messages to the queue
    props.coreStack.contentSQSQueue.grantSendMessages(lambdaFunction);

    // Grant Lambda permissions to be triggered by the queue
    lambdaFunction.addEventSource(
      new lambdaEventSources.SqsEventSource(props.coreStack.contentSQSQueue, {
        batchSize: 1, // Process one message at a time
      })
    );
  }
}
