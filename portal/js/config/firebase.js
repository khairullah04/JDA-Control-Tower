import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getFirestore, doc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const CONFIGS = {
  // The SAME Firebase project used by the rest of the JDA system (Invoice Tracker, etc.)
  portal: {
    apiKey: "AIzaSyA9ZXd8UlIvF_RrqZralqFC5lNA2YX2qv8",
    authDomain: "test-invoice-c38a4.firebaseapp.com",
    projectId: "test-invoice-c38a4",
    storageBucket: "test-invoice-c38a4.firebasestorage.app",
    messagingSenderId: "506909398579",
    appId: "1:506909398579:web:e3596141071c1aff1f7546"
  },
  // The original JDA3 report's own Firebase project (report/current)
  jda3: {
    apiKey: "AIzaSyAs9Jg5RDaaU9yH_2e38EOd3nAvLIhz_HM",
    authDomain: "jda3-9c0c5.firebaseapp.com",
    projectId: "jda3-9c0c5",
    storageBucket: "jda3-9c0c5.firebasestorage.app",
    messagingSenderId: "842256934283",
    appId: "1:842256934283:web:c2f5610ca5b37ed0d13b8e",
    measurementId: "G-PJPPYFZ4MW"
  }
};

const sourceOf = jda => jda.source || { project: 'portal', collection: 'jdaReports', doc: jda.id };
const dbs = {};
const dbFor = key => (dbs[key] ??= getFirestore(initializeApp(CONFIGS[key], key)));

export const isConfigured = jda => CONFIGS[sourceOf(jda).project].apiKey !== 'YOUR_API_KEY';
export function reportRefFor(jda) {
  const s = sourceOf(jda);
  return doc(dbFor(s.project), s.collection, s.doc);
}
