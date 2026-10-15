import { normalizeTask } from '../../portal/js/progress.js';

// The Weekly progress task fields added in the overhaul (portal/js/progress.js). Reading never needs
// this: every page reads a task through normalizeTask. These write the fields into the stored reports
// (migrate), or take them out again where they are still blank (revert), which gives back the old shape.
export const NEW_FIELDS = { description: '', priority: '', start: '', completed: '', progress: null, checklist: [], notes: '', updatedAt: '' };
const blank = (k, v) => JSON.stringify(v) === JSON.stringify(NEW_FIELDS[k]);

export const needsMigration = tasks => (Array.isArray(tasks) ? tasks : []).some(t => !t.id || Object.keys(NEW_FIELDS).some(k => !(k in t)));
export const migrateTasks = tasks => (Array.isArray(tasks) ? tasks : []).map(normalizeTask);
// Back to { task, project, projectId, owner, due, status }: new fields that are still blank go, and so
// does the id; anything written into a new field since is kept, so nothing typed is lost.
export const revertTasks = tasks => (Array.isArray(tasks) ? tasks : []).map(t => {
  const out = { ...t };
  for (const k of Object.keys(NEW_FIELDS)) if (k in out && blank(k, out[k])) delete out[k];
  if (Object.keys(NEW_FIELDS).every(k => !(k in out))) delete out.id;
  return out;
});
