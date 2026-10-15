import { normalizeTasks } from '../web/shared/lib/progress.js';

// The Weekly progress task fields added in the overhaul (portal/js/progress.js). Reading never needs
// this: every page reads a task through normalizeTask, which leaves stored values as they are. These
// write the missing fields into the stored reports (migrate), or take them out again where they are
// still blank (revert). Only missing fields are added, so a revert gives back exactly what was stored.
export const NEW_FIELDS = { description: '', priority: '', start: '', completed: '', progress: null, checklist: [], notes: '', updatedAt: '' };
const blank = (k, v) => JSON.stringify(v) === JSON.stringify(NEW_FIELDS[k]);
const list = v => Array.isArray(v) ? v : [];

export const needsMigration = tasks => list(tasks).some(t => !t.id || Object.keys(NEW_FIELDS).some(k => !(k in t)));
export function migrateTasks(tasks) {
  const ids = normalizeTasks(tasks).map(t => t.id); // the same ids the pages work out for tasks without one
  return list(tasks).map((t, i) => ({ ...structuredClone(NEW_FIELDS), ...t, id: t.id || ids[i] }));
}
// New fields that are still blank go, and so does the id when nothing new is left; anything written into
// a new field since is kept, so nothing typed is lost.
export const revertTasks = tasks => list(tasks).map(t => {
  const out = { ...t };
  for (const k of Object.keys(NEW_FIELDS)) if (k in out && blank(k, out[k])) delete out[k];
  if (Object.keys(NEW_FIELDS).every(k => !(k in out))) delete out.id;
  return out;
});
