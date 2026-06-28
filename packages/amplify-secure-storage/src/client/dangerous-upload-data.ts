import { Amplify } from 'aws-amplify';
import type { StorageConfig } from '@aws-amplify/core';
import {
  uploadData as originalUploadData,
  type UploadDataWithPathInput,
} from 'aws-amplify/storage';

interface BucketInfo {
  bucketName: string;
  region: string;
}

export function dangerousUploadData(input: UploadDataWithPathInput) {
  const amplifyConfig = Amplify.getConfig().Storage?.S3;

  if (!amplifyConfig) {
    throw new Error(
      'Could not get amplify config. Please call Amplify.configure() before using this function',
    );
  }

  const cleanBucketName = getCleanBucketName(
    input.options?.bucket,
    amplifyConfig,
  );
  if (!cleanBucketName) {
    throw new Error('Could not find the clean bucket in the Amplify config');
  }

  const dangerousBucket = amplifyConfig.buckets?.[cleanBucketName];

  if (!dangerousBucket) {
    throw new Error(
      `Could not find the quarantine bucket in the Amplify config for ${cleanBucketName}`,
    );
  }

  return originalUploadData({
    ...input,
    options: {
      ...input.options,
      bucket: dangerousBucket,
      checksumAlgorithm: 'crc-32',
    },
  });
}

function getCleanBucketName(
  input: BucketInfo | string | undefined,
  config: StorageConfig['S3'],
) {
  if (!input) {
    // no input, assume default bucket
    return config.bucket;
  }

  if (typeof input === 'string') {
    // string input, assume friendly name of the clean bucket
    const bucket = config.buckets?.[input];

    return bucket?.bucketName;
  }

  // assume the BucketInfo of the clean bucket
  return input.bucketName;
}
