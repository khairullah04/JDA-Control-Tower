// The Firebase SDK is kept in the repository (shared/vendor), not fetched from a CDN, so the pages
// open on a network that blocks outside scripts. The project settings are in shared/firebase-config.js,
// the one copy the Invoice Tracker and the server use too.
import { initializeApp } from '../../../shared/vendor/firebase-app.js';
import { getFirestore, doc } from '../../../shared/vendor/firebase-firestore.js';
import { FIREBASE_PROJECTS as CONFIGS } from '../../../shared/firebase-config.js';

const sourceOf = jda => jda.source || { project: 'portal', collection: 'jdaReports', doc: jda.id };
const dbs = {};
const dbFor = key => (dbs[key] ??= getFirestore(initializeApp(CONFIGS[key], key)));

export const isConfigured = jda => CONFIGS[sourceOf(jda).project].apiKey !== 'YOUR_API_KEY';
export function reportRefFor(jda) {
  const s = sourceOf(jda);
  return doc(dbFor(s.project), s.collection, s.doc);
}
