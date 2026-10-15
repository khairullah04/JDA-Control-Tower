// The main Firebase project as one app, however many scripts on a page ask for it: the JDA Control
// Tower landing page runs both its own code and the Invoice Tracker's, and Firebase refuses to open
// the same (default) app twice. Sharing it also shares the sign-in made at /login.
import { initializeApp, getApps } from '../vendor/firebase-app.js';
import { firebaseConfig } from '../config/firebase-config.js';

export const mainApp = () => getApps().find(a => a.name === '[DEFAULT]') || initializeApp(firebaseConfig);
