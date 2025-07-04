import * as cdk from 'aws-cdk-lib';
import { CoreStack } from './core_stack';
import { ServiceTierLambdaStack } from './service_tier_stack';
import { CronStack } from './cron_stack';
import { ScraperStack } from './scraper_stack';
import { ScraperHelperStack } from './scraper_helper';

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION
}
console.log(`CDK Working with Account ${process.env.CDK_DEFAULT_ACCOUNT} Region ${process.env.CDK_DEFAULT_REGION}`);
const app = new cdk.App();

const coreStack = new CoreStack(app, "CoreStack", {env});
new ServiceTierLambdaStack(app, 'ServiceTierStack', {env, coreStack});
new CronStack(app, 'CronStack', {env, coreStack});
new ScraperStack(app, 'ScraperStack', {env, coreStack});
new ScraperHelperStack(app, 'ScraperHelperStack', {env, coreStack});
