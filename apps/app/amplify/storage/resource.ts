import { defineSecureStorage } from 'amplify-secure-storage/backend';

export const storage = defineSecureStorage({
  name: 'storage-bucket',
  access: (allow) => ({
    'public/*': [
      allow.guest.to(['read']),
      allow.groups(['creator']).to(['read', 'write']),
      allow.groups(['admin']).to(['read', 'write', 'delete']),
    ],
    'docs/*': [
      allow.authenticated.to(['read']),
      allow.groups(['admin']).to(['read', 'write', 'delete']),
    ],
    'media/{entity_id}/*': [
      allow.entity('identity').to(['read', 'write', 'delete']),
      allow.groups(['admin']).to(['read', 'write', 'delete']),
    ],
  }),
});
