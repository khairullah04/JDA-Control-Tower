// node scripts/backup.mjs            (run from jda/server)
// Copies everything the system stores into backups/<timestamp>/ at the top of the repository,
// which no web server serves and git ignores:
//   - every Firestore collection of the main project, with subcollections (needs the service-account key)
//   - each JDA's report document, read the way the portal reads it (works without a key while the
//     rules allow public reads), which also covers JDA 3's separate Firebase project
//   - the local finance file, if the server has been saving to one
// Whatever could not be read is listed at the end and in MANIFEST.json; the script then exits with
// code 1, so a partial backup is never mistaken for a complete one.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JDAS } from '../../../portal/js/config/app-config.js';
import { FIREBASE_PROJECTS } from '../../../shared/firebase-config.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const out = path.resolve(here, '../../../backups', stamp);
fs.mkdirSync(out, { recursive: true });
const save = (name, data) => { const file = path.join(out, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data, null, 2)); };
const manifest = { at: new Date().toISOString(), saved: [], missing: [] };

// 1. Every collection, through the Admin SDK.
async function dumpCollection(coll) {
  const docs = {};
  for (const d of (await coll.get()).docs) {
    docs[d.id] = { data: d.data(), updated: d.updateTime?.toDate().toISOString() };
    for (const sub of await d.ref.listCollections()) docs[d.id][`/${sub.id}`] = await dumpCollection(sub);
  }
  return docs;
}
async function dumpProject(label, credentialsFile, projectId) {
  if (!process.env.FIRESTORE_EMULATOR_HOST && !(credentialsFile && fs.existsSync(credentialsFile))) {
    manifest.missing.push(`${label}: every collection that needs sign-in (no service-account key at ${credentialsFile || '(not set)'})`);
    return;
  }
  try {
    const { initializeApp, cert } = await import('firebase-admin/app');
    const { getFirestore } = await import('firebase-admin/firestore');
    const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
    const app = initializeApp({ ...(!emulator && { credential: cert(JSON.parse(fs.readFileSync(credentialsFile, 'utf8'))) }), ...(emulator && { projectId }) }, `backup-${label}`);
    for (const coll of await getFirestore(app).listCollections()) {
      const docs = await dumpCollection(coll);
      save(`${label}/${coll.id}.json`, docs);
      manifest.saved.push(`${label}/${coll.id}.json (${Object.keys(docs).length} documents)`);
    }
  } catch (e) { manifest.missing.push(`${label}: ${e.message}`); }
}
await dumpProject('firestore-main', process.env.GOOGLE_APPLICATION_CREDENTIALS, process.env.FIREBASE_PROJECT_ID || FIREBASE_PROJECTS.portal.projectId);
if (process.env.JDA3_GOOGLE_APPLICATION_CREDENTIALS) await dumpProject('firestore-jda3', process.env.JDA3_GOOGLE_APPLICATION_CREDENTIALS, FIREBASE_PROJECTS.jda3.projectId);

// 2. Each JDA's report document, as the portal reads it. Kept in Firestore's own typed form, so nothing is lost in translation.
for (const jda of JDAS) {
  const src = jda.source || { project: 'portal', collection: 'jdaReports', doc: jda.id }, cfg = FIREBASE_PROJECTS[src.project];
  const where = `${cfg.projectId}: ${src.collection}/${src.doc}`;
  try {
    const res = await fetch(`https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents/${src.collection}/${src.doc}?key=${cfg.apiKey}`, { signal: AbortSignal.timeout(30000) });
    if (res.status === 404) { manifest.saved.push(`reports/${jda.id}: no document yet (${where})`); continue; }
    if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 120)}`);
    save(`reports/${jda.id}.json`, await res.json());
    manifest.saved.push(`reports/${jda.id}.json (${where})`);
  } catch (e) { manifest.missing.push(`report of ${jda.name} (${where}): ${e.message}`); }
}

// 3. The local finance file.
const financeFile = path.resolve(here, '../.finance-data.json');
if (fs.existsSync(financeFile)) { fs.copyFileSync(financeFile, path.join(out, 'finance-data.json')); manifest.saved.push('finance-data.json (the local finance file)'); }
else manifest.saved.push('finance-data.json: no local finance file exists');

// 4. The landing pages' content when kept in a file (no key), and the Roles picture.
const siteFile = path.resolve(here, '../.site-content.json');
if (fs.existsSync(siteFile)) { fs.copyFileSync(siteFile, path.join(out, 'site-content.json')); manifest.saved.push('site-content.json (the landing pages, local file)'); }
const publicDir = path.resolve(here, '../../../site/public');
for (const f of fs.existsSync(publicDir) ? fs.readdirSync(publicDir).filter(n => /^roles(-previous)?\./.test(n)) : []) {
  fs.mkdirSync(path.join(out, 'site-public'), { recursive: true });
  fs.copyFileSync(path.join(publicDir, f), path.join(out, 'site-public', f));
  manifest.saved.push(`site-public/${f} (the Roles picture)`);
}

save('MANIFEST.json', manifest);
console.log(`Backup written to ${out}\n\nSaved:\n  ${manifest.saved.join('\n  ')}`);
if (manifest.missing.length) { console.log(`\nNOT backed up:\n  ${manifest.missing.join('\n  ')}`); process.exitCode = 1; }
