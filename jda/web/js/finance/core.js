// The rules of the CJI3 register and the Payment Tables: how a record's three amounts are worked
// out, what makes a record valid, how records roll up into a JDA's Payment Table, and what an edit
// changed. Pure functions, shared by the browser and the server.
import { toMinor, fmt, money, normRate, convert, impliedRate, percentage, toBps, fromBps, beforeTax } from './money.js';

export const BASE = 'MYR';
export const STATUSES = ['pending', 'approved', 'paid', 'rejected'];
export const STATUS_LABEL = { pending: 'Pending', approved: 'Approved', paid: 'Paid', rejected: 'Rejected' };
export const COUNTS_AS_ACTUAL = 'paid'; // only a paid invoice is "actual" spend
export const FLAG_LABEL = { over: 'Over sanctioned', under: 'Under sanctioned', within: 'Within sanctioned' };
export const DEFAULT_SETTINGS = { taxRateBps: 800, currencies: ['MYR', 'USD', 'SGD', 'EUR', 'JPY', 'GBP'] };
// The SAP columns of a CJI3 line that the tracker keeps but does not calculate with.
export const SAP_FIELDS = [
  ['wbsElement', 'WBS Element'], ['costElement', 'Cost Element'], ['costElementDescr', 'Cost element descr.'], ['name', 'Name'],
  ['documentType', 'Document Type'], ['fiscalYear', 'Fiscal Year'], ['period', 'Period'], ['recoveryIndicator', 'Recovery Indicator'],
  ['userName', 'User Name'], ['documentHeaderText', 'Document Header Text'], ['createdOn', 'Created on']
];

const str = v => v == null ? '' : String(v).trim();
export function isDate(s) { // a real calendar date, written YYYY-MM-DD
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + 'T00:00:00Z') : NaN;
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
}
export const isMonth = s => /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
export const live = r => !r.deletedAt;
export const partnerKey = p => str(p).toUpperCase();
// What must be unique among invoices: JDA + invoice number + project. One invoice may bill several
// projects of a JDA, so the project is part of it. The partner (vendor) is deliberately NOT part of
// it: this assumes two vendors never issue the same invoice number for one project. If they can,
// add partnerKey(e.partner) here; the review raised it and the owner chose to leave it (#20).
export const invoiceKey = e => [e.jdaId, str(e.invoiceNo).toUpperCase(), e.projectId].join('|');

// The table's three amounts: original currency -> MYR -> taxed MYR. Tax is charged on the MYR amount.
export function amounts({ currency, netMinor, rate, taxRateBps }) {
  const netMyrMinor = currency === BASE ? netMinor : convert(netMinor, currency, rate, BASE);
  const taxMyrMinor = percentage(netMyrMinor, taxRateBps);
  return { netMyrMinor, taxMyrMinor, grossMyrMinor: netMyrMinor + taxMyrMinor };
}

// A spreadsheet row that already states its MYR figures (before tax, taxed, or both): they are kept exactly as written.
function statedAmounts(r, input) {
  const netMyrMinor = r.currency === BASE ? r.netMinor : str(input.netMyr) ? toMinor(input.netMyr) : beforeTax(toMinor(input.grossMyr), r.taxRateBps);
  const grossMyrMinor = str(input.grossMyr) ? toMinor(input.grossMyr) : netMyrMinor + percentage(netMyrMinor, r.taxRateBps);
  return { netMyrMinor, taxMyrMinor: grossMyrMinor - netMyrMinor, grossMyrMinor };
}

// One record - a CJI3 entry ('entry') or a sanctioned amount ('sanctioned') - from what was typed.
// `prev` is the stored record when editing: fields that were not sent keep their value, and the
// stored MYR amounts are only worked out again when the amount, currency, rate or tax rate changed.
// `input.draft` (an invoice read by the AI) keeps a record with gaps instead of refusing it: what
// is missing is listed on the record and it stays Pending until someone completes it.
export function build(kind, input, prev, settings) {
  const errors = [], entry = kind === 'entry';
  const pick = k => str(input[k] !== undefined ? input[k] : prev?.[k]);
  const need = (ok, message) => { if (!ok) errors.push(message); return ok; };
  const r = {
    jdaId: pick('jdaId'), jdaName: pick('jdaName'), projectId: pick('projectId'), projectCode: pick('projectCode'), partner: pick('partner'),
    month: pick('month'), currency: pick('currency').toUpperCase(), description: pick('description'), remarks: pick('remarks')
  };
  if (pick('legacyId')) r.legacyId = pick('legacyId'); // the id it had in the old tracker, so it is never brought over twice
  need(r.jdaId, 'Choose a JDA');
  need(r.projectId && r.projectCode, 'Choose a project');
  need(r.partner, 'Partner is required');
  need(/^[A-Z]{3}$/.test(r.currency), 'Currency must be a 3-letter code such as MYR or USD');

  if (entry) {
    Object.assign(r, {
      vendor: pick('vendor') || r.partner, invoiceNo: pick('invoiceNo'), documentDate: pick('documentDate'), postingDate: pick('postingDate'),
      dueDate: pick('dueDate'), status: pick('status') || 'pending', fileUrl: pick('fileUrl'), fileName: pick('fileName'), driveFileId: pick('driveFileId'),
      sap: Object.fromEntries(SAP_FIELDS.map(([k]) => [k, str(input.sap?.[k] !== undefined ? input.sap[k] : prev?.sap?.[k])]).filter(([, v]) => v))
    });
    if (!r.month && isDate(r.documentDate)) r.month = r.documentDate.slice(0, 7); // the invoice's own month
    need(r.invoiceNo, 'Invoice number is required');
    need(isDate(r.documentDate), 'Invoice date must be a valid date');
    for (const [k, label] of [['postingDate', 'Posting date'], ['dueDate', 'Due date']]) need(!r[k] || isDate(r[k]), `${label} must be a valid date`);
    need(STATUSES.includes(r.status), `Status must be one of: ${STATUSES.map(s => STATUS_LABEL[s]).join(', ')}`);
    need(!r.fileUrl || /^https?:\/\//i.test(r.fileUrl), 'File link must start with http:// or https://');
  }
  need(isMonth(r.month), `${entry ? 'Payment month' : 'Month'} is required, as YYYY-MM`);

  r.netMinor = input.amount !== undefined ? toMinor(input.amount, r.currency) : prev?.netMinor ?? null;
  const amountOk = need(r.netMinor > 0, 'Amount must be a positive number');
  r.taxRateBps = input.taxRate !== undefined ? toBps(input.taxRate) : prev?.taxRateBps ?? settings.taxRateBps;
  const taxOk = need(r.taxRateBps !== null, 'Tax rate must be a percentage between 0 and 100');

  const stated = str(input.grossMyr) !== '' || (str(input.netMyr) !== '' && r.currency !== BASE);
  const statedOk = !stated || need(['grossMyr', 'netMyr'].every(k => !str(input[k]) || toMinor(input[k]) > 0), 'The MYR amounts in the file must be positive numbers');
  let rateOk = true;
  if (r.currency === BASE) Object.assign(r, { rate: '1', rateDate: '', rateSource: 'base', rateOverridden: false });
  else {
    Object.assign(r, {
      rate: input.rate !== undefined ? normRate(input.rate) : prev?.rate ?? null, rateDate: pick('rateDate'),
      rateSource: pick('rateSource') || 'manual', rateOverridden: (input.rateOverridden !== undefined ? input.rateOverridden : prev?.rateOverridden) === true
    });
    if (!r.rate && stated && amountOk && taxOk && !errors.length) { // both amounts given, no rate: record the rate they imply
      Object.assign(r, { rate: impliedRate(r.netMinor, r.currency, statedAmounts(r, input).netMyrMinor), rateSource: 'worked out from the imported amounts' });
    }
    rateOk = need(r.rate, `Rate to ${BASE} must be a positive number`);
    need(!r.rateDate || isDate(r.rateDate), 'Rate date must be a valid date');
  }

  const unchanged = prev && ['netMinor', 'currency', 'rate', 'taxRateBps'].every(k => prev[k] === r[k]);
  if (amountOk && taxOk && rateOk && statedOk) {
    if (stated) {
      const a = statedAmounts(r, input);
      if (need(a.taxMyrMinor >= 0, 'The taxed MYR amount in the file is smaller than the amount before tax')) Object.assign(r, a);
    } else Object.assign(r, unchanged ? { netMyrMinor: prev.netMyrMinor, taxMyrMinor: prev.taxMyrMinor, grossMyrMinor: prev.grossMyrMinor } : amounts(r));
  }
  if (r.grossMyrMinor === undefined) Object.assign(r, { netMyrMinor: 0, taxMyrMinor: 0, grossMyrMinor: 0 });
  // Limits, so that nothing typed, pasted or imported can outgrow a column or a number: text fields
  // hold 200 characters (description and remarks 1,000, partner 40), and amounts stay exact.
  // These hold for every record, a draft included: a draft's gaps are listed on it, but it is never
  // stored with an amount too large to be exact, and its text is cut to the limit rather than kept long.
  const always = [];
  if (!(Number.isSafeInteger(r.grossMyrMinor) && r.grossMyrMinor <= 1e15 && (r.netMinor == null || r.netMinor <= 1e15))) always.push('Amount is too large');
  const limit = k => k === 'description' || k === 'remarks' ? 1000 : k === 'partner' ? 40 : 200;
  for (const [k, label] of [...AUDITED[kind], ...Object.entries(r.sap || {}).map(([sk]) => ['sap.' + sk, `SAP: ${SAP_FIELDS.find(f => f[0] === sk)[1]}`])]) {
    const sap = k.startsWith('sap.'), value = sap ? r.sap[k.slice(4)] : r[k];
    if (typeof value !== 'string' || value.length <= limit(k)) continue;
    if (!input.draft) always.push(`${label} is too long (${limit(k)} characters at most)`);
    else if (sap) r.sap[k.slice(4)] = value.slice(0, limit(k)); else r[k] = value.slice(0, limit(k));
  }

  if (entry) {
    r.missing = input.draft ? errors.splice(0) : [];
    if (r.missing.length && r.status !== 'rejected') r.status = 'pending';
  }
  errors.push(...always);
  return { record: r, errors };
}

/* ---------- Payment Table: one row per project + partner + month of a JDA ---------- */
export const rowId = (projectCode, partner, month) => `${projectCode}-${partner}-${month.slice(2, 4)}${month.slice(5, 7)}`; // AA-IBM-2508
const rowKey = r => [r.projectId, partnerKey(r.partner), r.month].join('|');
const sum = (list, field) => list.reduce((t, x) => t + (x[field] || 0), 0);

// Nothing here is stored: a row is the sanctioned amounts and the invoices that share its project,
// partner and month, added up each time. So an edit to either side shows at once, and every
// figure can be traced to the records under it.
export function paymentTable(sanctioned, entries) {
  const rows = new Map();
  const rowOf = r => {
    const key = rowKey(r);
    if (!rows.has(key)) rows.set(key, { key, id: rowId(r.projectCode, r.partner, r.month), month: r.month, partner: r.partner, projectId: r.projectId, projectCode: r.projectCode, jdaId: r.jdaId, sanctioned: [], invoices: [] });
    return rows.get(key);
  };
  sanctioned.filter(live).forEach(s => rowOf(s).sanctioned.push(s));
  entries.filter(e => live(e) && isMonth(e.month)).forEach(e => rowOf(e).invoices.push(e));
  return [...rows.values()].map(r => {
    const withTaxMinor = sum(r.sanctioned, 'grossMyrMinor'), actualMinor = sum(r.invoices.filter(i => i.status === COUNTS_AS_ACTUAL), 'grossMyrMinor');
    const varianceMinor = actualMinor - withTaxMinor;
    return {
      ...r, ptMyrMinor: sum(r.sanctioned, 'netMyrMinor'), withTaxMinor, actualMinor, varianceMinor,
      invoicedMinor: sum(r.invoices.filter(i => i.status !== 'rejected'), 'grossMyrMinor'),
      flag: varianceMinor > 0 ? 'over' : varianceMinor < 0 ? 'under' : 'within'
    };
  }).sort((a, b) => a.month.localeCompare(b.month) || a.projectCode.localeCompare(b.projectCode) || a.partner.localeCompare(b.partner));
}
// The summary cells: what was sanctioned, what has been invoiced, what has actually been paid, and what is left.
export function tableTotals(rows) {
  const sanctionedMinor = sum(rows, 'withTaxMinor'), actualMinor = sum(rows, 'actualMinor');
  return { sanctionedMinor, invoicedMinor: sum(rows, 'invoicedMinor'), actualMinor, remainingMinor: sanctionedMinor - actualMinor };
}

/* ---------- Audit: what an edit changed, in words ---------- */
const AUDITED = {
  entry: [['jdaName', 'JDA'], ['projectCode', 'Project'], ['partner', 'Partner'], ['vendor', 'Vendor'], ['invoiceNo', 'Invoice number'], ['documentDate', 'Invoice date'],
    ['postingDate', 'Posting date'], ['dueDate', 'Due date'], ['month', 'Payment month'], ['netMinor', 'Original amount'], ['rate', 'Rate to MYR'], ['rateDate', 'Rate date'],
    ['rateSource', 'Rate source'], ['rateOverridden', 'Rate overridden'], ['taxRateBps', 'Tax rate'], ['netMyrMinor', 'MYR amount'], ['taxMyrMinor', 'Tax (MYR)'],
    ['grossMyrMinor', 'Taxed MYR'], ['status', 'Status'], ['description', 'Description'], ['remarks', 'Remarks'], ['fileUrl', 'File link']],
  sanctioned: [['jdaName', 'JDA'], ['projectCode', 'Project'], ['partner', 'Partner'], ['month', 'Month'], ['netMinor', 'PT amount (original currency)'], ['rate', 'Rate to MYR'],
    ['rateDate', 'Rate date'], ['rateSource', 'Rate source'], ['rateOverridden', 'Rate overridden'], ['taxRateBps', 'Tax rate'], ['netMyrMinor', 'PT amount (MYR)'],
    ['taxMyrMinor', 'Tax (MYR)'], ['grossMyrMinor', 'w TAX'], ['description', 'Description'], ['remarks', 'Remarks']]
};
export function display(field, rec) {
  const v = rec?.[field];
  if (v == null || v === '') return '';
  if (field === 'netMinor') return money(v, rec.currency);
  if (field.endsWith('MyrMinor')) return money(v, BASE);
  if (field === 'taxRateBps') return fromBps(v) + '%';
  if (field === 'status') return STATUS_LABEL[v] || String(v);
  return typeof v === 'boolean' ? (v ? 'Yes' : '') : String(v);
}
export function changes(kind, prev, next) {
  const out = [];
  for (const [k, field] of AUDITED[kind]) {
    const a = display(k, prev), b = display(k, next);
    if (a !== b) out.push({ field, old: a, new: b });
  }
  if (kind === 'entry') for (const [k, label] of SAP_FIELDS) {
    const a = str(prev?.sap?.[k]), b = str(next?.sap?.[k]);
    if (a !== b) out.push({ field: `SAP: ${label}`, old: a, new: b });
  }
  return out;
}
// How a record is named in the audit log and in messages.
export const refOf = (kind, r) => kind === 'entry' ? `Invoice ${r.invoiceNo || '(no number)'}` : `Sanctioned ${isMonth(r.month) ? rowId(r.projectCode, r.partner, r.month) : r.projectCode}`;

/* ---------- A sanctioned amount that covers several months ---------- */
export const MAX_SPAN = 60;
// 2026-01 .. 2026-03 -> ['2026-01', '2026-02', '2026-03']; empty unless both are months, in order, and no more than MAX_SPAN apart.
export function monthsBetween(from, to) {
  if (!isMonth(from) || !isMonth(to) || to < from) return [];
  const out = [];
  for (let y = Number(from.slice(0, 4)), m = Number(from.slice(5)); out.length <= MAX_SPAN; m === 12 ? (y++, m = 1) : m++) {
    const month = `${y}-${String(m).padStart(2, '0')}`;
    out.push(month);
    if (month === to) return out;
  }
  return [];
}
// The Payment Table works month by month, so an amount sanctioned for a run of months becomes one
// record per month. Either the amount is what each month gets, or (`split`) it is the total, shared
// out evenly in whole sen: any sen left over go one each to the earliest months, so the months add
// up to exactly the total.
export function spreadOverMonths(input, toMonth, split) {
  const months = monthsBetween(input.month, toMonth), n = months.length, total = toMinor(input.amount, String(input.currency || '').toUpperCase());
  if (n < 2) return [input];
  const share = i => split && total > 0 ? fmt(Math.floor(total / n) + (i < total % n ? 1 : 0), input.currency, true) : input.amount;
  return months.map((month, i) => ({ ...input, month, amount: share(i), description: `${str(input.description)} (month ${i + 1} of ${n}, ${months[0]} to ${months[n - 1]})`.trim() }));
}
