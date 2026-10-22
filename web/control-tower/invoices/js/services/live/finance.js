import { request } from './http.js';
import { parseCsv } from '../../finance/sheets.js';

// Every call carries the JDA Control Tower session (http.js); one that has ended sends the person to sign in again.
const call = (path, method = 'GET', body) => request(path, { method, body });
const post = (path, body) => call(path, 'POST', body);
const path = kind => `/api/finance/${kind === 'entry' ? 'entries' : kind}`;

export const data = () => call('/api/finance/data');
export const save = (kind, input) => post(path(kind), input);
export const saveSanctionedOver = inputs => post('/api/finance/sanctioned/batch', { inputs }); // one sanctioned amount, a record per month
export const remove = (kind, ids) => post(`${path(kind)}/delete`, { ids });
export const restore = (kind, ids) => post(`${path(kind)}/restore`, { ids });
export const setStatus = (ids, status) => post('/api/finance/entries/status', { ids, status });
export const moveStage = (ids, to, note = '') => post('/api/finance/entries/stage', { ids, to, note });
export const stageHistory = entityId => call(`/api/finance/stages?entityId=${encodeURIComponent(entityId)}`);
export const recalculate = (kind, ids, options) => post(`${path(kind)}/recalculate`, { ids, ...options });
export const saveSettings = input => call('/api/finance/settings', 'PUT', input);
// The newest lines of one record, one project or one JDA; with none of them, of everything.
export const audit = (about = {}) => call(`/api/finance/audit?${new URLSearchParams(Object.entries(about).filter(([, v]) => v))}`);
export const forex = (currency, date = '') => call(`/api/finance/forex?currency=${encodeURIComponent(currency)}&date=${encodeURIComponent(date)}`);
export const importRecords = (kind, inputs, options = {}) => post(`${path(kind)}/import`, { inputs, ...options });
// CJI3 lines: one of the two files uploaded (`group`: 'jda3' or 'jda12'), read by the server; `dryRun` previews.
export async function importCji3(group, file, { dryRun = false } = {}) {
  const fileBase64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(new Error('That file could not be read.'));
    reader.readAsDataURL(file);
  });
  return post('/api/finance/cji3/import', { group, fileName: file.name, fileBase64, dryRun });
}
export const cji3Lines = (group = '') => call(`/api/finance/cji3/lines?group=${encodeURIComponent(group)}`);
export const cji3Imports = () => call('/api/finance/cji3/imports');
// The Microsoft List: its state; rows from the List (no file) or from an export (a file); keep a pull; email to the Lead; an Outlook draft.
export const listState = () => call('/api/finance/list');
export async function listRows(file) {
  if (!file) return post('/api/finance/list/rows', {});
  const fileBase64 = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result).split(',')[1] || ''); r.onerror = () => reject(new Error('That file could not be read.')); r.readAsDataURL(file); });
  return post('/api/finance/list/rows', { fileName: file.name, fileBase64 });
}
export const saveListPull = pull => call('/api/finance/list', 'PUT', pull);
export const sendListToLead = req => post('/api/finance/list/send', req);
export const listDraft = msg => post('/api/finance/list/draft', msg);
export const matchLine = (lineId, invoiceId = '') => post('/api/finance/cji3/match', { lineId, invoiceId });
export const rematch = group => post('/api/finance/cji3/rematch', { group });
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
