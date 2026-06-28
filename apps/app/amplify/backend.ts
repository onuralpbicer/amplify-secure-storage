import { defineBackend } from '@aws-amplify/backend';
import { storage } from './storage/resource';
import { auth } from './auth/resource';

const backend = defineBackend({
  auth,
  storage,
});

console.log('testing', backend.storage.resources.quarantineBucket);
