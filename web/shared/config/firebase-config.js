// The Firebase web configs, in one place for the Invoice Tracker, the portal and the server's
// scripts. These are the public "web app" settings from the Firebase console (Project settings >
// Your apps); they identify a project, they do not grant access to it.
export const firebaseConfig = {
  apiKey: "AIzaSyA9ZXd8UlIvF_RrqZralqFC5lNA2YX2qv8",
  authDomain: "test-invoice-c38a4.firebaseapp.com",
  projectId: "test-invoice-c38a4",
  storageBucket: "test-invoice-c38a4.firebasestorage.app",
  messagingSenderId: "506909398579",
  appId: "1:506909398579:web:e3596141071c1aff1f7546"
};
// The original JDA3 report's own Firebase project (its report document is report/current).
export const jda3FirebaseConfig = {
  apiKey: "AIzaSyAs9Jg5RDaaU9yH_2e38EOd3nAvLIhz_HM",
  authDomain: "jda3-9c0c5.firebaseapp.com",
  projectId: "jda3-9c0c5",
  storageBucket: "jda3-9c0c5.firebasestorage.app",
  messagingSenderId: "842256934283",
  appId: "1:842256934283:web:c2f5610ca5b37ed0d13b8e",
  measurementId: "G-PJPPYFZ4MW"
};
// Which config a JDA's `source.project` names (portal/js/config/app-config.js).
export const FIREBASE_PROJECTS = { portal: firebaseConfig, jda3: jda3FirebaseConfig };
// Firebase sign-in needs an email. A username typed at /login ("aina") is this address ("aina@jda.app").
export const USERNAME_DOMAIN = 'jda.app';
