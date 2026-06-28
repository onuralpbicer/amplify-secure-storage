import { defineStorage as originalDefineStorage } from '@aws-amplify/backend';
import {
  AmplifyStorageProps,
  StorageResources,
} from '@aws-amplify/backend-storage';
import type {
  ConstructFactory,
  ResourceProvider,
  StackProvider,
} from '@aws-amplify/plugin-types';
import { storageOutputKey } from '@aws-amplify/backend-output-schemas';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Tags } from 'aws-cdk-lib';
import {
  StorageAccessBuilder,
  StorageAccessRecord,
} from '@aws-amplify/backend-storage/lib/types';

export type SecureStorageProps = Omit<
  AmplifyStorageProps,
  'outputStorageStrategy'
> & {
  access?: (allow: StorageAccessBuilder) => StorageAccessRecord;
};

export interface SecureStorageResources extends StorageResources {
  quarantineBucket: s3.IBucket;
}

export function defineSecureStorage(
  props: SecureStorageProps,
): ConstructFactory<ResourceProvider<SecureStorageResources> & StackProvider> {
  console.log(props);
  const originalAccess = props.access;

  const originalPrepare = Error.prepareStackTrace;
  Error.prepareStackTrace = () => {
    // Force the stack trace lookup to return the exact string Amplify expects
    return 'at Object.<anonymous> (amplify/storage/resource.ts:5:21)';
  };

  const originalStorageFactory = originalDefineStorage({
    ...props,
    access: originalAccess
      ? (allow) => allowOnlyNonWritablePermissions(originalAccess(allow))
      : undefined,
  });

  const quarantineFactory = originalDefineStorage({
    isDefault: false,
    name: `quarantine-${props.name}`,
    versioned: false,
    access: originalAccess
      ? (allow) => allowOnlyWritablePermissions(originalAccess(allow))
      : undefined,
  });

  Error.prepareStackTrace = originalPrepare;
  return {
    ...originalStorageFactory,
    getInstance: (context) => {
      const storageInstance = originalStorageFactory.getInstance(context);

      const cleanBucket = storageInstance.resources.bucket;

      const quarantineBucket =
        quarantineFactory.getInstance(context).resources.bucket;

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

function allowOnlyWritablePermissions(accessDefinition: StorageAccessRecord) {
  return Object.fromEntries(
    Object.entries(accessDefinition)
      .map(([path, permissions]) => [
        path,
        permissions
          .map((p) => {
            // skip filtering for lambda/resource permissions
            if (p.uniqueDefinitionIdValidations.length === 0) {
              return {
                ...p,
                actions: [],
              };
            }
            return {
              ...p,
              actions: p.actions.filter((a) => a === 'write'),
            };
          })
          .filter((p) => p.actions.length > 0),
      ])
      .filter(([, permissions]) => permissions.length > 0),
  );
}

function allowOnlyNonWritablePermissions(
  accessDefinition: StorageAccessRecord,
) {
  return Object.fromEntries(
    Object.entries(accessDefinition)
      .map(([path, permissions]) => [
        path,
        permissions
          .map((p) => {
            // skip filtering for lambda/resource permissions
            if (p.uniqueDefinitionIdValidations.length === 0) {
              return p;
            }
            return {
              ...p,
              actions: p.actions.filter((a) => a !== 'write'),
            };
          })
          .filter((p) => p.actions.length > 0),
      ])
      .filter(([, permissions]) => permissions.length > 0),
  );
}
