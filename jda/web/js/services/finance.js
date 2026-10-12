import { config } from '../config/index.js';
// The CJI3 register and the sanctioned amounts. Live: the server does every read and write, behind
// the Invoice Tracker passkey. Demo: the same rules, run in this page over sample data.
export const { session, unlock, data, save, saveSanctionedOver, remove, restore, setStatus, recalculate, saveSettings, audit, forex, readFile, importRecords, workbook } =
  config.demoMode ? await import('./demo/finance.js') : await import('./live/finance.js');
