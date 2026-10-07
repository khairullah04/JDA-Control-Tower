import { config } from '../config/index.js';
export const {
  listJdas, getJda, addJda, updateJda, listProjectsByJda, listAllProjectsWithJda,
  getProject, addProject, updateProject, listScope, listInvoices, addScope, addInvoice, updateInvoice, deleteInvoice,
  addLog, listLog, listProcessedFileIds, markFileProcessed
} = config.demoMode ? await import('./demo/db.js') : await import('./live/db.js');
