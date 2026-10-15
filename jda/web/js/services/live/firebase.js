// The Firebase SDK is kept in the repository (shared/vendor), not fetched from a CDN, so the tracker
// opens on a network that blocks outside scripts. The project settings are in shared/firebase-config.js.
import { getAuth } from '../../../../../shared/vendor/firebase-auth.js';
import { getFirestore } from '../../../../../shared/vendor/firebase-firestore.js';
import { mainApp } from '../../../../../shared/firebase-main.js';

const app = mainApp();
export const auth = getAuth(app);
export const db = getFirestore(app);
