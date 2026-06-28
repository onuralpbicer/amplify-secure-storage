import { defineSecureStorage } from 'amplify-secure-storage/backend';
import { defineFunction } from '@aws-amplify/backend';

const fn = defineFunction({});

export const storage = defineSecureStorage({
  name: 'storage-bucket',
  isDefault: true,
  access: (allow) => ({
    'public/*': [
      allow.guest.to(['read']),
      allow.groups(['creator']).to(['read', 'write']),
      allow.groups(['admin']).to(['read', 'write', 'delete']),
    ],
    'docs/*': [
      allow.authenticated.to(['read']),
      allow.groups(['admin']).to(['read', 'write', 'delete']),
      allow.resource(fn).to(['read', 'write']),
    ],
    'media/{entity_id}/*': [
      allow.entity('identity').to(['read', 'write', 'delete']),
      allow.groups(['admin']).to(['read', 'write', 'delete']),
    ],
  }),
});
