// CJI3 lines: the company's payment evidence, exported from SAP and uploaded again and again as
// payments are made one at a time. It comes as two files: one for JDA 3, one for JDA 1 and JDA 2
// together. This reads such a file and decides, line by line, what an upload does: add a line not
// seen before, skip one already in, or update one already in whose other columns have changed.
// Pure functions, shared by the browser and the server; nothing is written here.
import { toMinor, fmt } from './money.js';
import { tableIn, toIsoDate, dateOrder } from './sheets.js';

// The file's 22 columns: how each is stored, and the heading it is read from (letters and digits only;
// a trailing * matches any heading that starts with it, e.g. "Forex Confidential - For PETRONAS Staff Only…").
export const COLUMNS = [
  ['wbs', 'WBS Element', 'wbselement'], ['coObject', 'CO Object Name', 'coobjectname'], ['costElement', 'Cost Element', 'costelement'],
  ['costElementDescr', 'Cost element descr.', 'costelementdescr'], ['name', 'Name', 'name'], ['objectCurrency', 'Object Currency', 'objectcurrency'],
  ['valueObj', 'Value in Obj. Crcy', 'valueinobjcrcy'], ['documentType', 'Document Type', 'documenttype'], ['fiscalYear', 'Fiscal Year', 'fiscalyear'],
  ['period', 'Period', 'period'], ['postingDate', 'Posting Date', 'postingdate'], ['documentDate', 'Document Date', 'documentdate'],
  ['recoveryIndicator', 'Recovery Indicator', 'recoveryindicator'], ['userName', 'User Name', 'username'], ['currency', 'Transaction Currency', 'transactioncurrency'],
  ['valueTran', 'Value TranCurr', 'valuetrancurr'], ['headerText', 'Document Header Text', 'documentheadertext'], ['valueCoArea', 'Val/COArea Crcy', 'valcoareacrcy*'],
  ['createdOn', 'Created on', 'createdon'], ['reference', 'Reference', 'reference*'], ['remarks', 'Remarks', 'remarks'], ['forex', 'Forex', 'forex*']
];
// What makes a line the same line again (agreed with the owner, 2026-10-19). The file has no SAP
// document or line number, so a line is known by these; two lines identical in all of them are told
// apart by their order in the file (the 1st, the 2nd…).
export const KEY_FIELDS = ['wbs', 'reference', 'postingDate', 'documentDate', 'documentType', 'costElement', 'currency', 'valueTranMinor'];
// The columns a file must have: the key's, so that lines can be told apart at all.
export const REQUIRED = ['wbs', 'reference', 'postingDate', 'documentDate', 'documentType', 'costElement', 'currency', 'valueTran'];
// The other columns: when one of these differs on a line already in, the line is updated (and logged).
export const UPDATABLE = COLUMNS.map(([k]) => k).filter(k => !REQUIRED.includes(k)).concat(['valueObjMinor', 'valueCoAreaMinor']).filter(k => !['valueObj', 'valueCoArea'].includes(k));
export const LABEL = Object.fromEntries([...COLUMNS.map(([k, label]) => [k, label]), ['valueTranMinor', 'Value TranCurr'], ['valueObjMinor', 'Value in Obj. Crcy'], ['valueCoAreaMinor', 'Val/COArea Crcy']]);

// The two files, and the JDAs each one is about (by name, as the Invoice Tracker names its JDAs).
export const GROUPS = { jda3: { label: 'JDA 3', jdas: ['jda3'] }, jda12: { label: 'JDA 1 + JDA 2', jdas: ['jda1', 'jda2'] } };
export const jdaKey = name => String(name || '').toLowerCase().replace(/\s+/g, '');
export const inGroup = (group, jdaName) => !!GROUPS[group]?.jdas.includes(jdaKey(jdaName));

const text = v => v == null ? '' : String(v).trim();
const cell = (row, header) => {
  if (!header.endsWith('*')) return text(row[header]);
  const h = Object.keys(row).find(k => k.startsWith(header.slice(0, -1)));
  return h ? text(row[h]) : '';
};
// SAP writes a negative amount as -1,000.00, (1,000.00) or 1,000.00-.
export function amountOf(v, currency) {
  let s = text(v);
  if (!s) return null;
  const negative = /^\(.*\)$/.test(s) || /-$/.test(s);
  s = s.replace(/^\((.*)\)$/, '$1').replace(/-$/, '');
  const n = toMinor(s, currency || 'MYR');
  return n == null ? null : negative ? -Math.abs(n) : n;
}
const isIso = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
export const refKey = s => text(s).toUpperCase().replace(/\s+/g, '');
export const keyOf = l => KEY_FIELDS.map(k => k === 'reference' ? refKey(l[k]) : text(l[k])).join('|');
// A line's record id, made from its key: the same line always lands on the same record, so two uploads
// at the same moment cannot store it twice. (cyrb53: a 53-bit hash, the same in the browser and on the server.)
export function lineId(lineKey) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < lineKey.length; i++) { const c = lineKey.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 'c' + (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

// A file's sheets ([{ name, rows }]) -> its lines, the lines that could not be read (with their line
// numbers and why), and the columns it lacks. A file missing a required column gives no lines at all.
export function readCji3(sheets) {
  const rows = tableIn(sheets || [], ['wbselement']);
  if (!rows) return { lines: [], malformed: [], missing: REQUIRED.map(k => LABEL[k]), headers: [] };
  const headers = Object.keys(rows[0] || {}).filter(h => h !== '_line');
  const has = header => headers.some(h => header.endsWith('*') ? h.startsWith(header.slice(0, -1)) : h === header);
  const missing = COLUMNS.filter(([k, , h]) => REQUIRED.includes(k) && !has(h)).map(([, label]) => label);
  if (missing.length) return { lines: [], malformed: [], missing, headers };
  const order = dateOrder(rows.flatMap(r => [cell(r, 'postingdate'), cell(r, 'documentdate')])).order;
  const lines = [], malformed = [], seen = new Map();
  for (const r of rows) {
    const l = Object.fromEntries(COLUMNS.map(([k, , h]) => [k, cell(r, h)]));
    l.currency = l.currency.toUpperCase();
    l.postingDate = toIsoDate(l.postingDate, order); l.documentDate = toIsoDate(l.documentDate, order);
    l.valueTranMinor = amountOf(l.valueTran, l.currency);
    l.valueObjMinor = amountOf(l.valueObj, l.objectCurrency || 'MYR'); l.valueCoAreaMinor = amountOf(l.valueCoArea, 'MYR');
    const why = [];
    if (!l.wbs) why.push('no WBS Element');
    if (!/^[A-Z]{3}$/.test(l.currency)) why.push('no Transaction Currency');
    if (l.valueTranMinor == null) why.push(l.valueTran ? `Value TranCurr "${l.valueTran}" is not a number` : 'no Value TranCurr');
    if (!isIso(l.postingDate)) why.push(`Posting Date "${l.postingDate}" is not a date`);
    if (l.documentDate && !isIso(l.documentDate)) why.push(`Document Date "${l.documentDate}" is not a date`);
    if (why.length) { malformed.push({ line: r._line, why: why.join('; ') }); continue; }
    delete l.valueTran; delete l.valueObj; delete l.valueCoArea;
    const key = keyOf(l), n = (seen.get(key) || 0) + 1;
    seen.set(key, n);
    lines.push({ ...l, line: r._line, key, occurrence: n, lineKey: `${key}#${n}` });
  }
  return { lines, malformed, missing: [], headers };
}

// What an upload does, given the lines already stored: each incoming line is added (new), skipped
// (already in, nothing changed) or updated (already in, other columns changed: `changes` lists them).
export function planCji3(stored, incoming) {
  const byKey = new Map(stored.map(s => [s.lineKey, s]));
  const add = [], skip = [], update = [];
  for (const l of incoming) {
    const was = byKey.get(l.lineKey);
    if (!was) { add.push(l); continue; }
    const changes = UPDATABLE.filter(k => text(was[k]) !== text(l[k])).map(k => ({ field: LABEL[k] || k, old: show(k, was), new: show(k, l) }));
    (changes.length ? update : skip).push({ id: was.id, line: l, changes });
  }
  return { add, skip, update };
}
// Which invoices a line could be the payment of: those of the file's JDAs whose number is the line's
// Reference (ignoring case and spaces), not rejected or deleted. When there are several (one invoice
// number billing several projects), the line's CO Object Name narrows them to its project.
export function candidatesFor(l, invoices) {
  const ref = refKey(l.reference);
  if (!ref) return [];
  const same = invoices.filter(e => !e.deletedAt && e.status !== 'rejected' && inGroup(l.group, e.jdaName) && refKey(e.invoiceNo) === ref);
  if (same.length < 2 || !l.coObject) return same;
  const project = same.filter(e => jdaKey(e.projectCode) === jdaKey(l.coObject));
  return project.length ? project : same;
}
export const MATCH_LABEL = { paid: 'Matched: invoice Paid', linked: 'Matched (invoice already Paid)', not_approved: 'Matched, but the invoice is not approved yet', none: 'No invoice with this Reference', ambiguous: 'Several invoices could match', manual: 'Matched by hand' };

const show = (k, l) => /Minor$/.test(k) ? (l[k] == null ? '' : fmt(l[k])) : text(l[k]);
