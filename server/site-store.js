import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { adminDb } from './firebase-admin.js';

// Where the text of the two landing pages is kept (what edit mode saves): one document per page,
// "public" (the TriCipta AI landing page) and "controlTower" (the JDA Control Tower landing page).
// The same choice as for invoices (finance-store.js): Firestore when the server has the key,
// otherwise this file beside the server, or nothing at all (memory, the tests).
// To move what the file holds into Firestore, save each page once from edit mode with the key in place.
export const SITE_FILE = fileURLToPath(new URL('./.site-content.json', import.meta.url));
export const PAGES = ['public', 'controlTower'];

export function siteStore(kind, file = SITE_FILE) {
  if (kind === 'firestore') return {
    get: async page => { const d = await (await adminDb('portal')).collection('site').doc(page).get(); return d.exists ? d.data() : null; },
    put: async (page, data) => { await (await adminDb('portal')).collection('site').doc(page).set(data); return data; }
  };
  if (kind === 'memory') { const docs = {}; return { get: async p => structuredClone(docs[p] ?? null), put: async (p, d) => { docs[p] = structuredClone(d); return d; } }; }
  const read = () => {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (e) { if (e.code === 'ENOENT') return {}; throw new Error(`The landing page file ${file} cannot be read (${e.message}). Restore it from a backup.`); }
  };
  return {
    get: async page => read()[page] ?? null,
    put: async (page, data) => { const all = { ...read(), [page]: data }; fs.writeFileSync(file + '.tmp', JSON.stringify(all, null, 2)); fs.renameSync(file + '.tmp', file); return data; }
  };
}
