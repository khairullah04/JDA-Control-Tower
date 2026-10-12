import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { memoryStore } from '../web/js/finance/service.js';

// Where the CJI3 register, the sanctioned amounts and their audit log are kept.
//   firestore - the Firebase project's database, reached with a service-account key. The real one.
//   file      - a JSON file beside the server, for trying things out before the key is in place.
// FINANCE_STORE picks one. Left unset it is firestore when a key (or the emulator) is configured,
// and file otherwise. Either way the browser never touches this data directly.
const FILE = fileURLToPath(new URL('./.finance-data.json', import.meta.url));

function fileStore() {
  let db = {};
  try { db = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { /* first run */ }
  return memoryStore(db, all => { fs.writeFileSync(FILE + '.tmp', JSON.stringify(all)); fs.renameSync(FILE + '.tmp', FILE); });
}

async function firestoreStore() {
  const { initializeApp, applicationDefault } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
  const db = getFirestore(initializeApp({ ...(!emulator && { credential: applicationDefault() }), ...(process.env.FIREBASE_PROJECT_ID && { projectId: process.env.FIREBASE_PROJECT_ID }) }));
  const rows = snap => snap.docs.map(d => ({ ...d.data(), id: d.id }));
  return {
    // `where: [field, value]` or `latest: n, by: field` narrow what is read; without them, the whole collection.
    list: async (coll, { where, latest, by } = {}) => {
      const all = db.collection(coll);
      return rows(await (where ? all.where(where[0], '==', where[1]) : latest ? all.orderBy(by, 'desc').limit(latest) : all).get());
    },
    get: async (coll, id) => { const d = await db.collection(coll).doc(id).get(); return d.exists ? { ...d.data(), id } : null; },
    // One batch is all-or-nothing, so a record and its audit lines are saved together (a batch holds 500 writes; a large import is split).
    commit: async writes => {
      for (let i = 0; i < writes.length; i += 400) {
        const batch = db.batch();
        for (const w of writes.slice(i, i + 400)) batch.set(db.collection(w.coll).doc(w.id), w.data);
        await batch.commit();
      }
    }
  };
}

export async function openStore() {
  const key = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const kind = process.env.FINANCE_STORE || (process.env.FIRESTORE_EMULATOR_HOST || (key && fs.existsSync(key)) ? 'firestore' : 'file');
  if (kind === 'firestore') return { kind, store: await firestoreStore() };
  return kind === 'memory' ? { kind, store: memoryStore() } : { kind: 'file', store: fileStore() };
}
