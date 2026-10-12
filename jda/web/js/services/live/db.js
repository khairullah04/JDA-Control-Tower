import { collection, getDocs, addDoc, updateDoc, doc, getDoc, setDoc, query, where }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db, auth } from './firebase.js';
import { config } from '../../config/index.js';
const usernameOf = () => (auth.currentUser?.email || 'unknown@').split('@')[0];

const rows = snap => snap.docs.map(d => ({ id: d.id, ...d.data() }));
const byField = (coll, field, val) => getDocs(query(collection(db, coll), where(field, '==', val))).then(rows);

// Seeds JDA 1-4 (+ an Unsorted catch-all) and their projects only the very first time this Firestore
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
            jdaId: jRef.id, name: code, budget: config.defaultSubProjectBudget,
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
export const getJda = async id => ({ id, ...(await getDoc(doc(db, 'jdas', id))).data() });
export const addJda = j => addDoc(collection(db, 'jdas'), j);
export const updateJda = (id, j) => updateDoc(doc(db, 'jdas', id), j);
export const listProjectsByJda = jdaId => byField('projects', 'jdaId', jdaId).then(l => l.sort((a, b) => a.name.localeCompare(b.name)));

// Every project across every JDA, with its JDA's name joined in - used to populate the
// "move this invoice to..." dropdown when editing an invoice.
export async function listAllProjectsWithJda() {
  const [projSnap, jdaList] = await Promise.all([getDocs(collection(db, 'projects')), listJdas()]);
  const jmap = Object.fromEntries(jdaList.map(j => [j.id, j.name]));
  return rows(projSnap).map(p => ({ ...p, jdaName: jmap[p.jdaId] || '—' })).sort((a, b) => a.name.localeCompare(b.name));
}

export const getProject = async id => ({ id, ...(await getDoc(doc(db, 'projects', id))).data() });
export const addProject = p => addDoc(collection(db, 'projects'), p);
export const updateProject = (id, p) => updateDoc(doc(db, 'projects', id), p);

// Invoices and sanctioned amounts now live behind the server (services/finance.js). These two read
// the collections the tracker used before that, only so their records can be brought over once.
export const listLegacyScope = () => getDocs(collection(db, 'scope')).then(rows);
export const listLegacyInvoices = () => getDocs(collection(db, 'invoices')).then(rows);

export const addLog = (projectId, action, detail) => addDoc(collection(db, 'activity'), { projectId, action, by: usernameOf(), detail, ts: new Date().toISOString() });
export async function listLog(projectId) {
  const list = projectId ? await byField('activity', 'projectId', projectId) : rows(await getDocs(collection(db, 'activity')));
  return list.sort((a, b) => b.ts.localeCompare(a.ts));
}

// Tracks which Drive files have already been synced, globally - a file can be split across many
// projects, so "already imported" can't be checked per project the way it used to be.
export async function listProcessedFileIds() {
  const list = rows(await getDocs(collection(db, 'processedFiles')));
  return new Set(list.map(x => x.driveFileId));
}
export const markFileProcessed = (driveFileId, fileName, allocations) =>
  addDoc(collection(db, 'processedFiles'), { driveFileId, fileName, allocations, processedAt: new Date().toISOString() });
