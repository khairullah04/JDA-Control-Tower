import { request } from './http.js';
import { parseCsv } from '../../finance/sheets.js';

// The passkey is exchanged for a session token, kept for this tab only. The portal's Administration
// card stores one under the same name, so coming from there the tracker does not ask again.
const KEY = 'jda-finance-token';
const token = () => { try { return sessionStorage.getItem(KEY) || ''; } catch { return ''; } };

const call = (path, method = 'GET', body, quiet = false) => request(path, { method, body, headers: { 'X-Finance-Token': token() } }).catch(e => {
  if (e.status === 401 && e.passkey && !quiet) window.dispatchEvent(new Event('finance-locked')); // the session ended: ask for the passkey again
  throw e;
});
const post = (path, body) => call(path, 'POST', body);
const path = kind => `/api/finance/${kind === 'entry' ? 'entries' : kind}`;

export const session = () => call('/api/finance/session', 'GET', undefined, true).then(() => true, e => { if (e.passkey) return false; throw e; });
export async function unlock(passkey) {
  const { token: t } = await post('/api/portal/unlock', { jdaId: 'admin', passkey });
  sessionStorage.setItem(KEY, t);
}
export const data = () => call('/api/finance/data');
export const save = (kind, input) => post(path(kind), input);
export const saveSanctionedOver = inputs => post('/api/finance/sanctioned/batch', { inputs }); // one sanctioned amount, a record per month
export const remove = (kind, ids) => post(`${path(kind)}/delete`, { ids });
export const restore = (kind, ids) => post(`${path(kind)}/restore`, { ids });
export const setStatus = (ids, status) => post('/api/finance/entries/status', { ids, status });
export const recalculate = (kind, ids, options) => post(`${path(kind)}/recalculate`, { ids, ...options });
export const saveSettings = input => call('/api/finance/settings', 'PUT', input);
export const audit = ({ entityId = '' } = {}) => call(`/api/finance/audit?entityId=${encodeURIComponent(entityId)}`);
export const forex = (currency, date = '') => call(`/api/finance/forex?currency=${encodeURIComponent(currency)}&date=${encodeURIComponent(date)}`);
export const importRecords = (kind, inputs, options = {}) => post(`${path(kind)}/import`, { inputs, ...options });
export const workbook = sheets => post('/api/finance/workbook', { sheets }); // -> the .xlsx file, as a Blob

// A chosen .xlsx or .csv file -> [{ name, rows }]. CSV is read here; Excel is read by the server.
export async function readFile(file) {
  if (/\.csv$/i.test(file.name)) return [{ name: file.name, rows: parseCsv(await file.text()) }];
  const fileBase64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(new Error('That file could not be read.'));
    reader.readAsDataURL(file);
  });
  return (await post('/api/finance/read', { name: file.name, fileBase64 })).sheets;
}
