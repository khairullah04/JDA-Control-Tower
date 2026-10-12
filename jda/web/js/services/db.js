import { config } from '../config/index.js';
export const {
  listJdas, getJda, addJda, updateJda, listProjectsByJda, listAllProjectsWithJda,
  getProject, addProject, updateProject, listLegacyScope, listLegacyInvoices,
  addLog, listLog, listProcessedFileIds, markFileProcessed
} = config.demoMode ? await import('./demo/db.js') : await import('./live/db.js');
