// Demo: the real register rules, run in this page over sample data. Edits last until the page is refreshed.
import { createFinance, memoryStore } from '../../finance/service.js';
import { parseCsv } from '../../finance/sheets.js';
import { seedFinance } from './data.js';
import { currentUser } from './auth.js';
import { localToday } from '../../../../../shared/lib/dates.js';

const f = createFinance(memoryStore());
await seedFinance(f);
const who = () => (currentUser()?.email || 'demo@jda.app').split('@')[0];
const RATES = { USD: '4.7', SGD: '3.5', EUR: '5.1', JPY: '0.031', GBP: '6' };

export const data = async () => ({ ...(await f.data()), storage: 'demo' });
export const save = (kind, input) => f.save(kind, input, who());
export const saveSanctionedOver = inputs => f.saveAll('sanctioned', inputs, who());
export const remove = (kind, ids) => f.remove(kind, ids, who());
export const restore = (kind, ids) => f.restore(kind, ids, who());
export const setStatus = (ids, status) => f.setStatus(ids, status, who());
export const moveStage = (ids, to, note = '') => f.moveStage(ids, to, { note }, who());
export const stageHistory = entityId => f.stageHistory(entityId);
export const recalculate = (kind, ids, options) => f.recalculate(kind, ids, options, who());
export const saveSettings = input => f.saveSettings(input, who());
export const audit = query => f.audit(query);
export const importRecords = (kind, inputs, options) => f.importRecords(kind, inputs, who(), options);
export async function forex(currency) {
  if (!RATES[currency]) throw new Error(`Demo mode has no rate for ${currency}. Enter one by hand.`);
  return { rate: RATES[currency], date: localToday(), source: 'Demo rate (not a real one)' };
}
export async function readFile(file) {
  if (!/\.csv$/i.test(file.name)) throw new Error('Demo mode reads CSV files only. Excel files are read by the server.');
  return [{ name: file.name, rows: parseCsv(await file.text()) }];
}
export async function importCji3(group, file, { dryRun = false } = {}) {
  return f.importCji3({ group, fileName: file.name, sheets: await readFile(file) }, who(), { dryRun });
}
export const cji3Lines = (group = '') => f.cji3Lines(group);
export const cji3Imports = () => f.cji3Imports();
export const matchLine = (lineId, invoiceId = '') => f.matchLine(lineId, invoiceId, who());
export const rematch = async group => f.matchCji3((await f.cji3Lines(group)).filter(l => !l.invoiceId || ['not_approved', 'incomplete'].includes(l.matchState)).map(l => l.id), who());
// The Microsoft List in demo mode: an export (CSV) only; no Graph, no Outlook drafts.
export const listState = async () => ({ ...(await f.listState()), graph: false, demo: true, ms: { signedIn: false, account: '', pending: null }, mail: false });
export async function listRows(file) {
  if (!file) throw new Error('Demo mode reads an export of the List (CSV). Choose the file.');
  const { rowsFromSheet } = await import('../../finance/list-source.js');
  return rowsFromSheet(await readFile(file));
}
export const saveListPull = pull => f.saveListPull(pull, who());
export const sendListToLead = req => f.sendListToLead(req, who());
export const listDraft = async () => { throw new Error('Outlook drafts are not available in demo mode.'); };
export const msSignIn = async () => { throw new Error('Microsoft sign-in is not available in demo mode: import an export of the List.'); };
export const msSignOut = async () => ({ ok: true });
export const workbook = null; // Excel files are written by the server
