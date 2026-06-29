import type { GuardDutyNotificationEvent } from 'aws-lambda';
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

const client = new S3Client();

export const handler = async (event: GuardDutyNotificationEvent) => {
  const finding = event.detail;

  if (finding.scanResultDetails.scanResultStatus !== 'NO_THREATS_FOUND') {
    console.log(JSON.stringify(finding.scanResultDetails));
    throw new Error(
      `File ${finding.s3ObjectDetails.bucketName}/${finding.s3ObjectDetails.objectKey} is not clean!!`,
    );
  }

  const cleanBucketName = process.env['CLEAN_BUCKET'];

  if (!cleanBucketName) {
    throw new Error('Could not find clean bucket name');
  }

  const copyCommand = new CopyObjectCommand({
    Bucket: cleanBucketName,
    Key: finding.s3ObjectDetails.objectKey,
    CopySource: `${finding.s3ObjectDetails.bucketName}/${finding.s3ObjectDetails.objectKey}`,
  });
  const deleteCommand = new DeleteObjectCommand({
    Bucket: finding.s3ObjectDetails.bucketName,
    Key: finding.s3ObjectDetails.objectKey,
  });

  await client.send(copyCommand);
  await client.send(deleteCommand);
};
