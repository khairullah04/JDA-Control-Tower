import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { memoryStore } from '../web/js/finance/service.js';
import { adminDb, hasKey } from './firebase-admin.js';

// Where the CJI3 register, the sanctioned amounts and their audit log are kept.
//   firestore - the Firebase project's database, reached with the service-account key. The real one.
//   file      - a JSON file beside the server, for trying things out before the key is in place.
//   memory    - nothing kept at all (the tests).
// FINANCE_STORE picks one, and must be set when NODE_ENV=production. Left unset elsewhere, it is
// firestore when a key (or the emulator) is configured and file otherwise. Any other value stops
// the server: a typing mistake must not quietly send invoices to a local file.
// To move what a file holds into Firestore: node scripts/finance-file-to-firestore.mjs
export const FILE = fileURLToPath(new URL('./.finance-data.json', import.meta.url));

// Only "there is no file yet" counts as a first run. A file that exists but cannot be read stops the
// server: starting empty would let the next save overwrite the whole register.
export function readFinanceFile(file = FILE) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); }
  catch (e) { if (e.code === 'ENOENT') return {}; throw new Error(`The finance file ${file} cannot be read (${e.code || e.message}). Fix it or restore it from a backup; the server will not start without it.`); }
  try { const db = JSON.parse(text); if (!db || typeof db !== 'object' || Array.isArray(db)) throw new Error('not an object'); return db; }
  catch (e) { throw new Error(`The finance file ${file} is damaged (${e.message}). Restore it from a backup (backups/<date>/finance-data.json); the server will not start on a damaged file, because the next save would replace it.`); }
}
function fileStore(file = FILE) {
  return memoryStore(readFinanceFile(file), all => { fs.writeFileSync(file + '.tmp', JSON.stringify(all)); fs.renameSync(file + '.tmp', file); });
}

async function firestoreStore() {
  const db = await adminDb('portal');
  const rows = snap => snap.docs.map(d => ({ ...d.data(), id: d.id }));
  const query = (coll, { where, latest, by } = {}) => {
    let q = db.collection(coll);
    if (where) q = q.where(where[0], '==', where[1]);
    return latest ? q.orderBy(by, 'desc').limit(latest) : q;
  };
  let warned = false;
  return {
    // `where: [field, value]` and `latest: n, by: field` narrow what is read; without them, the whole collection.
    // The two together need a composite index (jda/firestore.indexes.json). Until it is deployed the
    // matching records are all read, which gives the same answer more slowly, and the log says so once.
    list: async (coll, how = {}) => {
      try { return rows(await query(coll, how).get()); }
      catch (e) {
        if (e.code !== 9 || !(how.where && how.latest)) throw e; // 9: FAILED_PRECONDITION, "the query requires an index"
        if (!warned) console.warn(`Firestore has no index for ${coll} by ${how.where[0]} and ${how.by} yet. Deploy jda/firestore.indexes.json (see jda/README.md). Reading without it for now.`);
        warned = true;
        return rows(await query(coll, { where: how.where }).get());
      }
    },
    get: async (coll, id) => { const d = await db.collection(coll).doc(id).get(); return d.exists ? { ...d.data(), id } : null; },
    // One all-or-nothing step, as a Firestore transaction: everything the step reads is checked again at
    // commit, so if someone else saved in between, the step is run again on the new state.
    atomic: step => db.runTransaction(async t => {
      const { writes = [], result } = await step({
        list: async (coll, how) => rows(await t.get(query(coll, how))),
        get: async (coll, id) => { const d = await t.get(db.collection(coll).doc(id)); return d.exists ? { ...d.data(), id } : null; }
      });
      for (const w of writes) t.set(db.collection(w.coll).doc(w.id), w.data);
      return result;
    })
  };
}

const KINDS = ['firestore', 'file', 'memory'];
export async function openStore(env = process.env) {
  const asked = env.FINANCE_STORE;
  if (asked && !KINDS.includes(asked)) throw new Error(`FINANCE_STORE is "${asked}". It must be one of: ${KINDS.join(', ')}.`);
  if (!asked && env.NODE_ENV === 'production') throw new Error('FINANCE_STORE is not set. In production, say where invoices and payments are kept: FINANCE_STORE=firestore.');
  const kind = asked || (hasKey('portal') ? 'firestore' : 'file');
  if (kind === 'firestore') return { kind, store: await firestoreStore() };
  return kind === 'memory' ? { kind, store: memoryStore() } : { kind, store: fileStore(env.FINANCE_FILE || FILE) };
}
