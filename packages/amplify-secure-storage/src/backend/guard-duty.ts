import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as guardduty from 'aws-cdk-lib/aws-guardduty';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as path from 'node:path';

interface GuardDutyScanningProps {
  quarantineBucket: s3.IBucket;
  cleanBucket: s3.IBucket;
}

export class GuartDutyScanning extends Construct {
  constructor(scope: Construct, id: string, props: GuardDutyScanningProps) {
    super(scope, id);

    const { quarantineBucket, cleanBucket } = props;

    const malwareScanRole = new iam.Role(this, 'GuardDutyS3ScanRole', {
      assumedBy: new iam.ServicePrincipal(
        'malware-protection-plan.guardduty.amazonaws.com',
      ),
      inlinePolicies: {
        GuardDutyS3MalwarePolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: [
                's3:GetObject',
                's3:ListBucket',
                's3:PutObjectTagging',
                's3:PutObjectVersionTagging',
              ],
              resources: [
                quarantineBucket.bucketArn,
                quarantineBucket.arnForObjects('*'),
              ],
            }),
            new iam.PolicyStatement({
              actions: ['s3:GetBucketOwnershipControls'],
              resources: [quarantineBucket.bucketArn],
            }),
          ],
        }),
      },
    });

    const malwareProtectionPlan = new guardduty.CfnMalwareProtectionPlan(
      this,
      'S3MalwareProtectionPlan',
      {
        protectedResource: {
          s3Bucket: {
            bucketName: quarantineBucket.bucketName,
          },
        },
        role: malwareScanRole.roleArn,
        actions: {
          tagging: {
            status: 'ENABLED',
          },
        },
      },
    );

    malwareProtectionPlan.node.addDependency(malwareScanRole);

    const cleanFileLambda = new nodejs.NodejsFunction(
      this,
      'CopyCleanFileHandler',
      {
        runtime: lambda.Runtime.NODEJS_LATEST,
        entry: path.join(
          import.meta.dirname,
          `guard-duty/handler${path.extname(import.meta.filename)}`,
        ),
        handler: 'handler',
        bundling: {
          bundleAwsSDK: false,
          externalModules: ['@aws-sdk/client-s3'],
        },
        environment: {
          CLEAN_BUCKET: cleanBucket.bucketName,
        },
      },
    );

    quarantineBucket.grantReadWrite(cleanFileLambda);
    quarantineBucket.grantDelete(
      cleanFileLambda,
      quarantineBucket.arnForObjects('*'),
    );
    cleanBucket.grantWrite(cleanFileLambda);

    const scanResultRule = new events.Rule(this, 'GuardDutyScanResultRule', {
      description:
        'Triggered when GuardDuty detects malware or unsupported files',
      eventPattern: {
        source: ['aws.guardduty'],
        detailType: ['GuardDuty Malware Protection Plan Scan Result'],
        detail: {
          // Triggers only for problematic files.
          // Omit this "scanResultStatus" line if you want to process safe files too.
          scanResultStatus: ['NO_THREATS_FOUND'],
        },
      },
    });

    scanResultRule.addTarget(new targets.LambdaFunction(cleanFileLambda));
  }
}
