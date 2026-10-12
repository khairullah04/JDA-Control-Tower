import { config } from '../config/index.js';
const db = config.demoMode ? await import('./demo/db.js') : await import('./live/db.js');
export const {
  listJdas, addJda, updateJda, listProjectsByJda, listAllProjectsWithJda,
  addProject, updateProject, listLegacyScope, listLegacyInvoices,
  listLog, listProcessedFileIds, markFileProcessed
} = db;
// A change-log line is written after the change it describes has been saved. If the line cannot be
// written the change still stands, so that is a warning - reporting it as a failure would have the
// user make the change a second time.
export const addLog = (...line) => db.addLog(...line).catch(e => { console.warn('Saved, but its change-log line could not be written:', e.message); });
