import { defineStorage } from '@aws-amplify/backend';
import {
  AmplifyStorageProps,
  StorageResources,
} from '@aws-amplify/backend-storage';
import {
  ConstructFactory,
  ResourceProvider,
  StackProvider,
} from '@aws-amplify/plugin-types';
import { storageOutputKey } from '@aws-amplify/backend-output-schemas';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Names, RemovalPolicy, Tags } from 'aws-cdk-lib';

export type SecureStorageProps = AmplifyStorageProps;

export interface SecureStorageResources extends StorageResources {
  quarantineBucket: s3.IBucket;
}

export function defineSecureStorage(
  props: SecureStorageProps,
): ConstructFactory<ResourceProvider<SecureStorageResources> & StackProvider> {
  console.log(JSON.stringify(props));

  const originalPrepare = Error.prepareStackTrace;
  Error.prepareStackTrace = () => {
    // Force the stack trace lookup to return the exact string Amplify expects
    return 'at Object.<anonymous> (amplify/storage/resource.ts:5:21)';
  };

  const originalStorageFactory = defineStorage(props);

  Error.prepareStackTrace = originalPrepare;
  return {
    ...originalStorageFactory,
    getInstance: (context) => {
      const storageInstance = originalStorageFactory.getInstance(context);

      const cleanBucket = storageInstance.resources.bucket;

      const randomLength = 8;
      const quarantineBucketName =
        `quarantine-${props.name}`.slice(0, 63 - randomLength) +
        Names.uniqueId(storageInstance.stack)
          .slice(-randomLength)
          .toLowerCase();

      const quarantineBucket = new s3.Bucket(
        storageInstance.stack,
        `${cleanBucket.node.id}_QUARANTINE`,
        {
          bucketName: quarantineBucketName,
          removalPolicy: RemovalPolicy.DESTROY,
          publicReadAccess: false,
          versioned: false,
          cors: [
            {
              allowedMethods: [
                s3.HttpMethods.GET,
                s3.HttpMethods.PUT,
                s3.HttpMethods.POST,
                s3.HttpMethods.HEAD,
                s3.HttpMethods.DELETE,
              ],
              allowedOrigins: ['*'],
            },
          ],
        },
      );

      Tags.of(cleanBucket).add(
        'quarantine-bucket',
        quarantineBucket.bucketName,
      );
      context.outputStorageStrategy.appendToBackendOutputList(
        storageOutputKey,
        {
          version: '1',
          payload: {
            buckets: JSON.stringify({
              name: cleanBucket.bucketName,
              bucketName: quarantineBucket.bucketName,
              storageRegion: storageInstance.stack.region,
            }),
          },
        },
      );

      // 4. Return the instance so defineBackend can register it seamlessly
      return {
        stack: storageInstance.stack,
        resources: {
          ...storageInstance.resources,
          quarantineBucket,
        },
      };
    },
  };
}
