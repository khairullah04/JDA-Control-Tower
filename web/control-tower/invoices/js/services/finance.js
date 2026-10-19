import { config } from '../config/index.js';
import { withBook } from '../finance/book.js';
// The CJI3 register and the sanctioned amounts. Live: the server does every read and write, behind
// the JDA Control Tower sign-in. Demo: the same rules, run in this page over sample data.
// Every change answers with the records it changed, and they are kept in the page's own copy
// (finance/book.js), so a redraw after a change does not read the whole register again.
export const { data, save, saveSanctionedOver, remove, restore, setStatus, moveStage, stageHistory, importCji3, cji3Lines, cji3Imports, matchLine, rematch, recalculate, saveSettings, audit, forex, readFile, importRecords, workbook } =
  withBook(config.demoMode ? await import('./demo/finance.js') : await import('./live/finance.js'));
