import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';

export class CoreStack extends cdk.Stack {
  public readonly generalLambdaRole: iam.Role;
  public readonly s3AstraBucket: s3.Bucket;
  public readonly s3ScraperBucket: s3.Bucket;
  public readonly clustererSQSQueue: sqs.Queue;
  public readonly contentSQSQueue: sqs.Queue;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create primary bucket
    this.s3AstraBucket = new s3.Bucket(this, 's3AstraBucket', {
      bucketName: `${this.account}-astra-bucket`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      notificationsSkipDestinationValidation: true
    });

    // Create bucket for scraper
    this.s3ScraperBucket = new s3.Bucket(this, 's3ScraperBucket', {
      bucketName: `${this.account}-scraper-bucket`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      notificationsSkipDestinationValidation: true
    });

    // Create Lambda Role with S3 Permissions
    this.generalLambdaRole = new iam.Role(this, 'GeneralLambdaRole', {
        assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      });


    this.generalLambdaRole.addManagedPolicy(
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
      );

    this.s3AstraBucket.grantReadWrite(this.generalLambdaRole);
    this.s3ScraperBucket.grantReadWrite(this.generalLambdaRole);

    // Create Clusterer queue
    this.clustererSQSQueue = new sqs.Queue(this, 'clustererSQSQueue', {
        visibilityTimeout: cdk.Duration.seconds(60*15), // 15 minutes
        deadLetterQueue: {
            maxReceiveCount: 2,
            queue: new sqs.Queue(this, 'custererDLQ', {
                queueName: 'clustererSQSQueue_DLQ',
                retentionPeriod: cdk.Duration.days(14), // Retain messages in DLQ for 14 days
            })
        },
    });

    this.contentSQSQueue = new sqs.Queue(this, 'contentSQSQueue', {
        visibilityTimeout: cdk.Duration.seconds(60*15), // 15 minutes
        deadLetterQueue: {
            maxReceiveCount: 2,
            queue: new sqs.Queue(this, 'contentDLQ', {
                queueName: 'contentSQSQueue_DLQ',
                retentionPeriod: cdk.Duration.days(14), // Retain messages in DLQ for 14 days
            })
        },
    });

    // Outputs
    new cdk.CfnOutput(this, 'BucketName', {
        value: this.s3AstraBucket.bucketName,
        description: 'Astra S3 Bucket to store data',
      });
    new cdk.CfnOutput(this, 'ScraperBucketName', {
        value: this.s3ScraperBucket.bucketName,
        description: 'Scraper bucket for news indexing',
      });
  }
}
