import { collection, getDocs, addDoc, updateDoc, doc, getDoc, setDoc, query, where, orderBy, limit, deleteField }
  from '../../../../../shared/vendor/firebase-firestore.js';
import { db, auth } from './firebase.js';
import { config } from '../../config/index.js';
import { toMinor } from '../../finance/money.js';
const usernameOf = () => (auth.currentUser?.email || 'unknown@').split('@')[0];

const rows = snap => snap.docs.map(d => ({ id: d.id, ...d.data() }));
const byField = (coll, field, val) => getDocs(query(collection(db, coll), where(field, '==', val))).then(rows);

// Seeds the default JDAs in app-config.json (+ an Unsorted catch-all) and their projects only the very first time this Firestore
// project is used, marked by meta/seed. A later empty read (e.g. a transient network glitch) never re-seeds.
export async function listJdas() {
  let list = rows(await getDocs(collection(db, 'jdas')));
  if (!list.length) {
    const marker = await getDoc(doc(db, 'meta', 'seed'));
    if (!marker.exists()) {
      for (const j of config.defaultJdas) {
        const jRef = await addDoc(collection(db, 'jdas'), { name: j.name, startDate: config.defaultJdaStart, endDate: config.defaultJdaEnd });
        for (const code of j.subProjects) {
          await addDoc(collection(db, 'projects'), {
            jdaId: jRef.id, name: code, budgetMinor: toMinor(config.defaultSubProjectBudget),
            startDate: '2026-01-01', endDate: '2026-12-31'
          });
        }
      }
      await setDoc(doc(db, 'meta', 'seed'), { done: true, at: new Date().toISOString() });
      list = rows(await getDocs(collection(db, 'jdas')));
    }
  }
  return list.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}
export const addJda = j => addDoc(collection(db, 'jdas'), j);
export const updateJda = (id, j) => updateDoc(doc(db, 'jdas', id), j);
export const listProjectsByJda = jdaId => byField('projects', 'jdaId', jdaId).then(l => l.sort((a, b) => a.name.localeCompare(b.name)));

// Every project across every JDA, with its JDA's name joined in - used to populate the
// "move this invoice to..." dropdown when editing an invoice.
// `jdaList`: the JDAs, when the caller has just read them, so they are not read a second time.
export async function listAllProjectsWithJda(jdaList) {
  const projSnap = await getDocs(collection(db, 'projects'));
  jdaList ||= await listJdas();
  const jmap = Object.fromEntries(jdaList.map(j => [j.id, j.name]));
  return rows(projSnap).map(p => ({ ...p, jdaName: jmap[p.jdaId] || '—' })).sort((a, b) => a.name.localeCompare(b.name));
}

export const addProject = p => addDoc(collection(db, 'projects'), p);
// A budget is kept in sen (budgetMinor). Saving one removes the whole-ringgit `budget` an older project may still carry, so there is one figure, not two.
export const updateProject = (id, p) => updateDoc(doc(db, 'projects', id), 'budgetMinor' in p ? { ...p, budget: deleteField() } : p);

// Invoices and sanctioned amounts now live behind the server (services/finance.js). These two read
// the collections the tracker used before that, only so their records can be brought over once.
export const listLegacyScope = () => getDocs(collection(db, 'scope')).then(rows);
export const listLegacyInvoices = () => getDocs(collection(db, 'invoices')).then(rows);

export const addLog = (projectId, action, detail) => addDoc(collection(db, 'activity'), { projectId, action, by: usernameOf(), detail, ts: new Date().toISOString() });
// The newest `max` lines of the change log: of everything, or of the given JDA and project ids
// (a line carries the id of the JDA or project it is about in `projectId`). Only those lines are
// read, not the whole log. Asking by id and newest-first together needs a composite index
// (jda/firestore.indexes.json); until it is deployed the matching lines are all read and sorted here,
// which gives the same answer more slowly.
export async function listLog(ids, max = 25) {
  const log = collection(db, 'activity'), newest = [orderBy('ts', 'desc'), limit(max)], found = [];
  if (!ids) return rows(await getDocs(query(log, ...newest)));
  for (let i = 0; i < ids.length; i += 30) { // "in" takes 30 values at most
    const mine = where('projectId', 'in', ids.slice(i, i + 30));
    try { found.push(...rows(await getDocs(query(log, mine, ...newest)))); }
    catch (e) {
      if (e.code !== 'failed-precondition') throw e;
      console.warn('The change log has no index by projectId and ts yet. Deploy jda/firestore.indexes.json (see jda/README.md).');
      found.push(...rows(await getDocs(query(log, mine))));
    }
  }
  return found.sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, max);
}

// Tracks which Drive files have already been synced, globally - a file can be split across many
// projects, so "already imported" can't be checked per project the way it used to be.
export async function listProcessedFileIds() {
  const list = rows(await getDocs(collection(db, 'processedFiles')));
  return new Set(list.map(x => x.driveFileId));
}
export const markFileProcessed = (driveFileId, fileName, allocations) =>
  addDoc(collection(db, 'processedFiles'), { driveFileId, fileName, allocations, processedAt: new Date().toISOString() });
