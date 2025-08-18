import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { CoreStack } from "./core_stack";
import * as dotenv from 'dotenv';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subs from 'aws-cdk-lib/aws-sns-subscriptions';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';

dotenv.config();

interface ExtendedProps extends cdk.StackProps {
  readonly coreStack: CoreStack;
}

export class ScraperStack extends cdk.Stack {
  private  readonly scraperSQSQueue: sqs.Queue;

  constructor(scope: Construct, id: string, props: ExtendedProps) {
    super(scope, id, props);

    // Create Scraper queue
    this.scraperSQSQueue = new sqs.Queue(this, 'ScraperSqsQueue', {
        visibilityTimeout: cdk.Duration.seconds(60*30),     // 15 minutes
        deadLetterQueue: {
            maxReceiveCount: 5,
            queue: new sqs.Queue(this, 'scraper_DLQ', {
                queueName: 'ScraperSqsDLQ',
                retentionPeriod: cdk.Duration.days(14), // Retain messages in DLQ for 14 days
            })
        },
    });
    
    // Allow cloudwatch events to send messages to the SQS queue
    this.scraperSQSQueue.addToResourcePolicy(
      new cdk.aws_iam.PolicyStatement({
        effect: cdk.aws_iam.Effect.ALLOW,
        principals: [new cdk.aws_iam.ServicePrincipal('events.amazonaws.com')],
        actions: ['sqs:SendMessage'],
        resources: [this.scraperSQSQueue.queueArn],
      })
    );

    // Create a CloudWatch Event Rule for the scraper schedule (weekly)
    const scraperRule = new events.Rule(this, 'ScraperRule', {
      schedule: events.Schedule.cron({
      minute: '0',
      hour: '10',
      weekDay: 'MON', // Every Monday
      month: '*',
      year: '*',
      }),
    });

    const messagePayload = {
      "action": "e_dispatch"
    };

    scraperRule.addTarget(new targets.SqsQueue(this.scraperSQSQueue, {
      message: events.RuleTargetInput.fromObject(messagePayload)
    }));

    // Create a CloudWatch Event Rule for the merge schedule (weekly)
    const mergeRule = new events.Rule(this, 'mergeRule', {
      schedule: events.Schedule.cron({
      minute: '20',
      hour: '10',
      weekDay: 'MON', // Every Monday
      month: '*',
      year: '*',
      }),
    });

    const messagePayload2 = {
      "action": "e_merge"
    };

    mergeRule.addTarget(new targets.SqsQueue(this.scraperSQSQueue, {
      message: events.RuleTargetInput.fromObject(messagePayload2)
    }));

    const logGroup = new logs.LogGroup(this, "ScraperHelperLogGroup", {
      logGroupName: "ScraperHelperLogGroup",
      retention: cdk.aws_logs.RetentionDays.ONE_MONTH
    })

    new logs.MetricFilter(this, 'ErrorFilter', {
      logGroup,
      metricNamespace: 'ScraperHelper/Metrics',
      metricName: 'Error',
      filterPattern: logs.FilterPattern.literal('Error'),
      metricValue: '1',
    });

    const ErrorMetric = new cloudwatch.Metric({
      namespace: 'ScraperHelper/Metrics',
      metricName: 'Error',
      statistic: 'Sum',
      period: cdk.Duration.hours(20),
    });

    const ErrorAlarm = new cloudwatch.Alarm(this, 'ErrorAlarm', {
      metric: ErrorMetric,
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      alarmDescription: 'Alarm when scraper unexpected error occurs',
    });

    const ErrorAlarmTopic = new sns.Topic(this, 'ErrorAlarmTopic');
    ErrorAlarmTopic.addSubscription(new subs.EmailSubscription('rahilv99@gmail.com'));
    ErrorAlarm.addAlarmAction(new cloudwatchActions.SnsAction(ErrorAlarmTopic));
    
    new logs.MetricFilter(this, 'NoArticlesFilter', {
      logGroup,
      metricNamespace: 'ScraperHelper/Metrics',
      metricName: 'NoArticles',
      filterPattern: logs.FilterPattern.literal('No articles'),
      metricValue: '1',
    });

    const NoArticlesMetric = new cloudwatch.Metric({
      namespace: 'ScraperHelper/Metrics',
      metricName: 'NoArticles',
      statistic: 'Sum',
      period: cdk.Duration.hours(20),
    });

    const NoArticlesAlarm = new cloudwatch.Alarm(this, 'NoArticlesAlarm', {
      metric: NoArticlesMetric,
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      alarmDescription: 'Alarm when no articles are found from scraper',
    });

    const NoArticlesAlarmTopic = new sns.Topic(this, 'NoArticlesAlarmTopic');
    NoArticlesAlarmTopic.addSubscription(new subs.EmailSubscription('rahilv99@gmail.com'));
    NoArticlesAlarm.addAlarmAction(new cloudwatchActions.SnsAction(NoArticlesAlarmTopic));

    // Create a separate IAM role for the ScraperStack Lambda to avoid circular dependency
    const scraperLambdaRole = new iam.Role(this, 'ScraperLambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    // Add basic Lambda execution permissions
    scraperLambdaRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
    );

    // Grant S3 permissions to the scraper role
    props.coreStack.s3AstraBucket.grantReadWrite(scraperLambdaRole);
    props.coreStack.s3ScraperBucket.grantReadWrite(scraperLambdaRole);

    const lambdaFunction = new lambda.DockerImageFunction(this, 'ScraperHelperFunction', {
      code: lambda.DockerImageCode.fromImageAsset('src/scraper-lambda'),
      timeout: cdk.Duration.minutes(15),
      memorySize: 2048,
      architecture: lambda.Architecture.X86_64,
      environment: {
        ASTRA_BUCKET_NAME: props.coreStack.s3AstraBucket.bucketName,
        BUCKET_NAME: props.coreStack.s3ScraperBucket.bucketName,
        SCRAPER_QUEUE_URL: this.scraperSQSQueue.queueUrl,
        CLUSTERER_QUEUE_URL: props.coreStack.clustererSQSQueue.queueUrl,
        GOVINFO_API_KEY: process.env.GOVINFO_API_KEY!,
        CONGRESS_API_KEY: process.env.CONGRESS_API_KEY!,
        DB_ACCESS_URL: process.env.DB_ACCESS_URL!,
      },
      role: scraperLambdaRole,
      logGroup: logGroup
    });

    const ScraperHelperlambdaErrorMetric = lambdaFunction.metricErrors({
      period: cdk.Duration.hours(20),
      statistic: 'Sum',
    });

    // Alarm for Lambda function errors
    const ScraperHelperLambdaFailureAlarm = new cloudwatch.Alarm(this, 'ScraperHelperLambdaFailureAlarm', {
      metric: ScraperHelperlambdaErrorMetric,
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      alarmDescription: 'Alarm when Lambda function fails',
    });

    const ScraperHelperLambdaFailureAlarmTopic = new sns.Topic(this, 'ScraperHelperLambdaFailureAlarmTopic');
    ScraperHelperLambdaFailureAlarmTopic.addSubscription(new subs.EmailSubscription('rahilv99@gmail.com'));
    ScraperHelperLambdaFailureAlarm.addAlarmAction(new cloudwatchActions.SnsAction(ScraperHelperLambdaFailureAlarmTopic));


    // Grant Lambda permissions to send messages to the queue
    this.scraperSQSQueue.grantSendMessages(lambdaFunction);
    props.coreStack.clustererSQSQueue.grantSendMessages(lambdaFunction);
    
    // Grant Lambda permissions to be triggered by the queue
    lambdaFunction.addEventSource(
        new lambdaEventSources.SqsEventSource(this.scraperSQSQueue, {
        batchSize: 1, // Process 1 message at a time
        })
    );

  }
}
