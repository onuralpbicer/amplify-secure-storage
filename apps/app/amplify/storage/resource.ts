import { defineSecureStorage } from 'amplify-secure-storage/backend';

export const storage = defineSecureStorage({
  name: 'storage-bucket',
});
