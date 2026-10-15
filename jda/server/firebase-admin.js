import fs from 'node:fs';
import { FIREBASE_PROJECTS } from '../../shared/firebase-config.js';

// The one place the server opens a Firebase project with a service-account key.
//   portal - the main project (invoices, payments, the reports of JDA 1 and 2, the access list).
//            Key: GOOGLE_APPLICATION_CREDENTIALS in .env.
//   jda3   - the original JDA 3 report's own project. Key: JDA3_GOOGLE_APPLICATION_CREDENTIALS.
// With FIRESTORE_EMULATOR_HOST set, both go to the local emulator and no key is needed.
const KEY_ENV = { portal: 'GOOGLE_APPLICATION_CREDENTIALS', jda3: 'JDA3_GOOGLE_APPLICATION_CREDENTIALS' };
const emulator = () => !!process.env.FIRESTORE_EMULATOR_HOST;
const keyFile = project => process.env[KEY_ENV[project]];
export const hasKey = project => emulator() || !!(keyFile(project) && fs.existsSync(keyFile(project)));

const open = {};
export async function adminDb(project = 'portal') {
  if (open[project]) return open[project];
  if (!hasKey(project)) throw Object.assign(new Error(`The server has no Firebase key for this (${KEY_ENV[project]} in server/.env), so nothing can be saved. See jda/README.md, "Running in production".`), { status: 503 });
  const { initializeApp, cert } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const projectId = (project === 'portal' && process.env.FIREBASE_PROJECT_ID) || FIREBASE_PROJECTS[project].projectId;
  const app = initializeApp(emulator() ? { projectId } : { credential: cert(JSON.parse(fs.readFileSync(keyFile(project), 'utf8'))), projectId }, `jda-${project}`);
  const db = getFirestore(app);
  db.settings({ ignoreUndefinedProperties: true });
  return (open[project] = db);
}
