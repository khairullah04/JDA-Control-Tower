import fs from 'node:fs';
import { FIREBASE_PROJECTS } from '../web/shared/config/firebase-config.js';

// The one place the server opens a Firebase project with a service-account key.
//   portal - the main project (invoices, payments, the reports of JDA 1 and 2, the access list).
//            Key: GOOGLE_APPLICATION_CREDENTIALS in .env.
//   jda3   - the original JDA 3 report's own project. Key: JDA3_GOOGLE_APPLICATION_CREDENTIALS.
// Where there is no file to point at (Vercel), the key's contents go in a setting instead:
// FIREBASE_SERVICE_ACCOUNT (and JDA3_FIREBASE_SERVICE_ACCOUNT): the JSON as it is, or in base64.
// With FIRESTORE_EMULATOR_HOST set, both go to the local emulator and no key is needed.
const KEY_ENV = { portal: 'GOOGLE_APPLICATION_CREDENTIALS', jda3: 'JDA3_GOOGLE_APPLICATION_CREDENTIALS' };
const KEY_JSON_ENV = { portal: 'FIREBASE_SERVICE_ACCOUNT', jda3: 'JDA3_FIREBASE_SERVICE_ACCOUNT' };
const emulator = () => !!process.env.FIRESTORE_EMULATOR_HOST;
const keyFile = project => process.env[KEY_ENV[project]];
const keyText = project => {
  const v = String(process.env[KEY_JSON_ENV[project]] || '').trim();
  return !v ? '' : v.startsWith('{') ? v : Buffer.from(v, 'base64').toString('utf8');
};
export const hasKey = project => emulator() || !!keyText(project) || !!(keyFile(project) && fs.existsSync(keyFile(project)));

const open = {};
export async function adminDb(project = 'portal') {
  if (open[project]) return open[project];
  if (!hasKey(project)) throw Object.assign(new Error(`The server has no Firebase key for this (${KEY_ENV[project]} or ${KEY_JSON_ENV[project]}), so nothing can be saved. See docs/server-and-invoices.md, "Running in production".`), { status: 503, expose: true });
  const { initializeApp, cert } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const projectId = (project === 'portal' && process.env.FIREBASE_PROJECT_ID) || FIREBASE_PROJECTS[project].projectId;
  const app = initializeApp(emulator() ? { projectId } : { credential: cert(JSON.parse(keyText(project) || fs.readFileSync(keyFile(project), 'utf8'))), projectId }, `jda-${project}`);
  const db = getFirestore(app);
  db.settings({ ignoreUndefinedProperties: true });
  return (open[project] = db);
}
