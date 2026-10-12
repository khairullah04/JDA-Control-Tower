// Demo: the real register rules, run in this page over sample data. Edits last until the page is refreshed.
import { createFinance, memoryStore } from '../../finance/service.js';
import { parseCsv } from '../../finance/sheets.js';
import { seedFinance } from './data.js';
import { currentUser } from './auth.js';
import { localToday } from '../../../../../shared/dates.js';

const f = createFinance(memoryStore());
await seedFinance(f);
const who = () => (currentUser()?.email || 'demo@jda.app').split('@')[0];
const RATES = { USD: '4.7', SGD: '3.5', EUR: '5.1', JPY: '0.031', GBP: '6' };

export const session = async () => true; // no passkey in demo mode
export const unlock = async () => {};
export const data = async () => ({ ...(await f.data()), storage: 'demo' });
export const save = (kind, input) => f.save(kind, input, who());
export const saveSanctionedOver = inputs => f.saveAll('sanctioned', inputs, who());
export const remove = (kind, ids) => f.remove(kind, ids, who());
export const restore = (kind, ids) => f.restore(kind, ids, who());
export const setStatus = (ids, status) => f.setStatus(ids, status, who());
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
export const workbook = null; // Excel files are written by the server
