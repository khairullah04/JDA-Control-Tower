// The Firebase SDK is kept in the repository (shared/vendor), not fetched from a CDN, so the pages
// open on a network that blocks outside scripts. The project settings are in web/shared/config/firebase-config.js,
// the one copy the Invoice Tracker and the server use too.
//
// The main project is opened as the default Firebase app, the same one /login and the Invoice Tracker
// use, so these pages share their sign-in: the database rules let only signed-in people on the access
// list read a report. JDA 3's report lives in its own project, which this sign-in does not reach.
import { initializeApp } from '../vendor/firebase-app.js';
import { getAuth } from '../vendor/firebase-auth.js';
import { getFirestore, doc } from '../vendor/firebase-firestore.js';
import { FIREBASE_PROJECTS as CONFIGS } from '../config/firebase-config.js';
import { needFirebaseUser } from './session.js';
import { mainApp } from './firebase-main.js';

const sourceOf = jda => jda.source || { project: 'portal', collection: 'jdaReports', doc: jda.id };
const apps = {};
const appFor = key => (apps[key] ??= key === 'portal' ? mainApp() : initializeApp(CONFIGS[key], key));

export const auth = getAuth(appFor('portal'));
await needFirebaseUser(auth); // reads wait until the sign-in is known, or the person is sent to /login

export const isConfigured = jda => CONFIGS[sourceOf(jda).project].apiKey !== 'YOUR_API_KEY';
export function reportRefFor(jda) {
  const s = sourceOf(jda);
  return doc(getFirestore(appFor(s.project)), s.collection, s.doc);
}
