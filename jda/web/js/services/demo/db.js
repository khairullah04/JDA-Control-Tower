// Demo: in-memory only. Edits work until you refresh the page.
import { jdas, projects, logs, processedFiles } from './data.js';
import { currentUser } from './auth.js';
const usernameOf = () => (currentUser()?.email || 'demo@jda.app').split('@')[0];
let n = 1;
const add = (list, x) => { const row = { id: 'new' + n++, ...x }; list.push(row); return row; };
const copy = list => list.map(x => ({ ...x }));

export const listJdas = async () => copy(jdas).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
export const getJda = async id => ({ ...jdas.find(j => j.id === id) });
export const addJda = async j => add(jdas, j);
export const updateJda = async (id, j) => Object.assign(jdas.find(x => x.id === id), j);
export const listProjectsByJda = async jdaId => copy(projects.filter(p => p.jdaId === jdaId)).sort((a, b) => a.name.localeCompare(b.name));
export const listAllProjectsWithJda = async () => {
  const jmap = Object.fromEntries(jdas.map(j => [j.id, j.name]));
  return copy(projects).map(p => ({ ...p, jdaName: jmap[p.jdaId] || '—' })).sort((a, b) => a.name.localeCompare(b.name));
};

export const getProject = async id => ({ ...projects.find(p => p.id === id) });
export const addProject = async p => add(projects, p);
export const updateProject = async (id, p) => { const x = Object.assign(projects.find(x => x.id === id), p); if ('budgetMinor' in p) delete x.budget; return x; };
// Invoices and sanctioned amounts are in ./finance.js; the demo has no older records to bring over.
export const listLegacyScope = async () => [];
export const listLegacyInvoices = async () => [];
export const addLog = async (projectId, action, detail) => add(logs, { projectId, action, by: usernameOf(), detail, ts: new Date().toISOString() });
export const listLog = async projectId => copy(projectId ? logs.filter(l => l.projectId === projectId) : logs).sort((a, b) => b.ts.localeCompare(a.ts));

export const listProcessedFileIds = async () => new Set(processedFiles.map(x => x.driveFileId));
export const markFileProcessed = async (driveFileId, fileName, allocations) => add(processedFiles, { driveFileId, fileName, allocations, processedAt: new Date().toISOString() });
