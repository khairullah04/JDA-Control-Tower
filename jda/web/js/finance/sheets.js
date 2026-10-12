// Spreadsheets in and out: CSV text, the column layouts of the CJI3 sheet and the Payment Table,
// and how records from elsewhere (the tracker's first invoice format, invoices read by the AI)
// become inputs for the register. Pure functions, shared by the browser and the server.
import { fmt, toMinor, toBps, fromBps, beforeTax } from './money.js';
import { BASE, SAP_FIELDS, STATUSES, STATUS_LABEL, FLAG_LABEL } from './core.js';

/* ---------- CSV ---------- */
// A number is passed as { n: '813000.00' } so that a spreadsheet gets a number and CSV gets plain digits.
const num = (minor, currency) => minor == null ? '' : { n: fmt(minor, currency, true) };
const text = c => c == null ? '' : String(c);
const safe = s => /^[=+@]|^-(?!\d)/.test(s) ? `'${s}` : s; // never let a cell be read as a formula
export const toCsv = matrix => matrix.map(row => row.map(c => {
  const s = c && typeof c === 'object' ? c.n : safe(text(c));
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}).join(',')).join('\r\n');

export function parseCsv(csv) {
  const rows = [[]];
  let field = '', quoted = false;
  csv = csv.replace(/^﻿/, '');
  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i];
    if (quoted) {
      if (ch !== '"') field += ch;
      else if (csv[i + 1] === '"') { field += '"'; i++; }
      else quoted = false;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { rows.at(-1).push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && csv[i + 1] === '\n') i++;
      rows.at(-1).push(field); field = ''; rows.push([]);
    } else field += ch;
  }
  rows.at(-1).push(field);
  return rows;
}

/* ---------- Reading a sheet ---------- */
const norm = h => text(h).toLowerCase().replace(/[^a-z0-9]/g, '');
// The rows under the first header row that carries one of `headers`, down to the next blank row.
// Each row is keyed by its column heading with everything but letters and digits removed.
export function tableIn(sheets, headers) {
  for (const { rows } of sheets) {
    const at = rows.findIndex(r => r.some(c => headers.includes(norm(c))));
    if (at < 0) continue;
    const head = rows[at].map(norm), out = [];
    for (let i = at + 1; i < rows.length && rows[i].some(c => text(c).trim()); i++) {
      out.push({ _line: i + 1, ...Object.fromEntries(head.map((h, j) => [h, text(rows[i][j]).trim()]).filter(([h]) => h)) });
    }
    return out;
  }
  return null;
}
// The first of `names` the row has a value for. A name ending in * matches any heading that starts with it.
const val = (row, ...names) => {
  for (const n of names) {
    const key = n.endsWith('*') ? Object.keys(row).find(h => h.startsWith(n.slice(0, -1)) && row[h]) : n;
    if (key && row[key]) return row[key];
  }
  return '';
};

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DMY = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/;
// 2025-10-27, 10/27/2025, 27/10/2025, 27.10.2025 -> 2025-10-27. `order` settles the ones that could be either.
export function toIsoDate(v, order = 'mdy') {
  v = text(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  const m = v.match(DMY);
  if (!m) return v; // left as written: validation will say it is not a date
  const a = Number(m[1]), b = Number(m[2]);
  const [month, day] = a > 12 ? [b, a] : b > 12 ? [a, b] : order === 'dmy' ? [b, a] : [a, b];
  return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
// A file whose dates include a first number above 12 is written day first; otherwise month first, as in the CJI3 sheet.
export const dateOrder = values => values.some(v => Number(text(v).trim().match(DMY)?.[1]) > 12) ? 'dmy' : 'mdy';
// 2025-08, 2025-08-14, Aug-25, August 2025, 08/2025 -> 2025-08
export function toMonth(v) {
  v = text(v).trim();
  if (/^\d{4}-\d{2}/.test(v)) return v.slice(0, 7);
  const named = v.match(/^([A-Za-z]{3})[A-Za-z]*[\s/-]+(\d{2}|\d{4})$/), at = named ? MONTHS.indexOf(named[1].toLowerCase()) : -1;
  if (at >= 0) return `${named[2].length === 2 ? '20' + named[2] : named[2]}-${String(at + 1).padStart(2, '0')}`;
  const numbered = v.match(/^(\d{1,2})[/-](\d{4})$/);
  return numbered ? `${numbered[2]}-${numbered[1].padStart(2, '0')}` : v;
}

/* ---------- Import: sheet rows -> inputs for the register ---------- */
export const ENTRY_HEADERS = ['referenceinvoicename', 'reference', 'valuetrancurr', 'invoicenumber'];
export const SANCTIONED_HEADERS = ['monthpt', 'ptamountmyr', 'ptamountoriginalcurrency'];
const projectOf = (projects, code) => projects.find(p => norm(p.name) === norm(code) && norm(code));

// CJI3 rows. `status` is given to rows that do not state one.
export function entryInputs(rows, { jda, projects, status }) {
  const order = dateOrder(rows.flatMap(r => [val(r, 'documentdate', 'invoicedate'), val(r, 'postingdate')]));
  return rows.filter(r => val(r, 'referenceinvoicename', 'reference', 'invoicenumber', 'invoice', 'valuetrancurr', 'amount')).map(r => {
    const named = val(r, 'name').match(/-\s*([^()]+?)\s*\(([^()]+)\)\s*$/); // "TriCipta AI - <project>(<partner>)"
    const code = val(r, 'coobjectname', 'project') || named?.[1] || '', project = projectOf(projects, code);
    const stated = val(r, 'status').toLowerCase();
    return {
      line: r._line, error: project ? '' : `No project "${code}" in ${jda.name}`,
      input: {
        jdaId: jda.id, jdaName: jda.name, projectId: project?.id, projectCode: project?.name, partner: val(r, 'partner') || named?.[2] || '', vendor: val(r, 'vendor'),
        invoiceNo: val(r, 'referenceinvoicename', 'reference', 'invoicenumber', 'invoice'), documentDate: toIsoDate(val(r, 'documentdate', 'invoicedate'), order),
        postingDate: toIsoDate(val(r, 'postingdate'), order), dueDate: toIsoDate(val(r, 'duedate'), order), month: toMonth(val(r, 'paymentmonth', 'monthpt', 'month')),
        currency: val(r, 'transactioncurrency', 'currency') || BASE, amount: val(r, 'valuetrancurr', 'originalamount', 'amount'),
        rate: val(r, 'forex', 'ratetomyr', 'rate') || undefined, rateDate: toIsoDate(val(r, 'ratedate'), order), rateSource: val(r, 'ratesource') || 'imported',
        netMyr: val(r, 'valueinobjcrcy', 'myrbeforetax'), grossMyr: val(r, 'valcoareacrcy*', 'taxedmyr'), taxRate: val(r, 'taxrate*').replace('%', '') || undefined,
        status: STATUSES.find(s => s === stated || STATUS_LABEL[s].toLowerCase() === stated) || status,
        description: val(r, 'description', 'documentheadertext'), remarks: val(r, 'remarks'), fileUrl: val(r, 'filelink'),
        sap: Object.fromEntries(SAP_FIELDS.map(([k, label]) => [k, val(r, norm(label))])), source: 'import'
      }
    };
  });
}

// Payment Table rows: their sanctioned side only. A line that only lists a further invoice of the row above is skipped.
export function sanctionedInputs(rows, { jda, projects }) {
  return rows.filter(r => val(r, 'monthpt', 'month') && val(r, 'ptamountoriginalcurrency', 'ptamountmyr', 'amount')).map(r => {
    const code = val(r, 'project'), project = projectOf(projects, code), original = val(r, 'ptamountoriginalcurrency');
    const currency = (original && val(r, 'ptcurrency', 'currency').toUpperCase()) || BASE, foreign = currency !== BASE;
    return {
      line: r._line, error: project ? '' : `No project "${code}" in ${jda.name}`,
      input: {
        jdaId: jda.id, jdaName: jda.name, projectId: project?.id, projectCode: project?.name, partner: val(r, 'partner'), month: toMonth(val(r, 'monthpt', 'month')),
        currency, amount: foreign ? original : val(r, 'ptamountmyr', 'amount') || original, netMyr: foreign ? val(r, 'ptamountmyr') : '', grossMyr: val(r, 'wtax'),
        rate: val(r, 'forex', 'ratetomyr', 'rate') || undefined, rateSource: 'imported', taxRate: val(r, 'taxrate*').replace('%', '') || undefined,
        description: val(r, 'description'), remarks: val(r, 'remarks'), source: 'import'
      }
    };
  });
}

/* ---------- Export ---------- */
export const ENTRY_COLUMNS = ['JDA', 'WBS Element', 'CO Object Name', 'Cost Element', 'Cost element descr.', 'Name', 'Object Currency', 'Value in Obj. Crcy', 'Document Type',
  'Fiscal Year', 'Period', 'Posting Date', 'Document Date', 'Recovery Indicator', 'User Name', 'Transaction Currency', 'Value TranCurr', 'Document Header Text',
  'Val/COArea Crcy(after tax in ringgit)', 'Created on', 'Reference(invoice name)', 'Remarks', 'Forex', 'Partner', 'Vendor', 'Payment Month', 'Status', 'Tax rate %',
  'Rate date', 'Rate source', 'Due date', 'Description', 'File link'];
// The CJI3 sheet's own columns, in its order, then the tracker's extra ones. It imports back as it is.
export const entrySheet = entries => [ENTRY_COLUMNS, ...entries.map(e => {
  const s = e.sap || {};
  return [e.jdaName, s.wbsElement, e.projectCode, s.costElement, s.costElementDescr, s.name, BASE, num(e.netMyrMinor), s.documentType, s.fiscalYear, s.period, e.postingDate,
    e.documentDate, s.recoveryIndicator, s.userName, e.currency, num(e.netMinor, e.currency), s.documentHeaderText, num(e.grossMyrMinor), s.createdOn, e.invoiceNo, e.remarks,
    e.currency === BASE || !e.rate ? '' : { n: e.rate }, e.partner, e.vendor, e.month, STATUS_LABEL[e.status], { n: fromBps(e.taxRateBps ?? 0) }, e.rateDate, e.rateSource,
    e.dueDate, e.description, e.fileUrl];
})];

export const PAYMENT_COLUMNS = ['ID', 'Month (PT)', 'Partner', 'Project', 'PT Amount (Original Currency)', 'PT Amount (MYR)', 'w TAX', 'Invoice', 'CJI3 (Original Currency)',
  'CJI3 (MYR)', 'CJI3 w TAX', 'Total', 'Variance', 'Status', 'Remarks', 'PT Currency', 'CJI3 Currency', 'Invoice status'];
// The original-currency figure of a row's sanctioned amounts, when they are all in one currency.
export function ptOriginal(row) {
  const currencies = [...new Set(row.sanctioned.map(s => s.currency))];
  return currencies.length === 1 ? { currency: currencies[0], minor: row.sanctioned.reduce((t, s) => t + s.netMinor, 0) } : null;
}
export const rowRemarks = row => row.sanctioned.map(s => s.remarks).filter(Boolean).join('; ');
// One line per invoice; the row's own figures sit on its first line.
export function paymentSheet(rows) {
  const out = [PAYMENT_COLUMNS];
  for (const r of rows) {
    const pt = ptOriginal(r), has = r.sanctioned.length > 0;
    (r.invoices.length ? r.invoices : [null]).forEach((i, n) => out.push([
      ...(n ? ['', '', '', '', '', '', ''] : [r.id, r.month, r.partner, r.projectCode, pt ? num(pt.minor, pt.currency) : '', has ? num(r.ptMyrMinor) : '', has ? num(r.withTaxMinor) : '']),
      i?.invoiceNo ?? '', i ? num(i.netMinor, i.currency) : '', i ? num(i.netMyrMinor) : '', i ? num(i.grossMyrMinor) : '',
      ...(n ? ['', '', '', '', ''] : [num(r.actualMinor), num(r.varianceMinor), FLAG_LABEL[r.flag], rowRemarks(r), pt?.currency ?? '']),
      i?.currency ?? '', i ? STATUS_LABEL[i.status] : ''
    ]));
  }
  return out;
}

/* ---------- Records from elsewhere ---------- */
// A vendor name as printed ("IBM Malaysia Sdn Bhd") -> the partner it is already known by ("IBM"), so its invoices land on that partner's rows.
export const knownPartner = (vendor, partners) => partners.find(p => p && text(vendor).toUpperCase().includes(p.toUpperCase())) || text(vendor);
const draftAmount = (gross, currency, bps) => toMinor(gross, currency) > 0 ? fmt(beforeTax(toMinor(gross, currency), bps), currency, true) : '';
const percentOf = fraction => fromBps(toBps(String((Number(fraction) || 0) * 100)) ?? 0); // 0.08 -> "8"

// One invoice read by the AI -> one draft per project it bills. The amounts it reports include tax.
// target(code) gives { jdaId, jdaName, projectId, projectCode } for a project code, or the Unsorted project.
export function extractedInputs(a, { target, partners = [], fileId = '', fileName = '' }) {
  const currency = text(a.currency).toUpperCase(), taxRate = percentOf(a.taxRate);
  const shares = Array.isArray(a.allocations) && a.allocations.length ? a.allocations
    : [{ projectCode: '', amount: a.amount, description: '(no charges could be read)', verdict: 'flagged', reasoning: 'No project allocation could be read from this invoice.' }];
  return shares.map(s => ({
    ...target(s.projectCode), draft: true, source: 'drive', partner: knownPartner(a.vendor, partners), vendor: text(a.vendor), invoiceNo: text(a.invoiceNo),
    documentDate: text(a.date), dueDate: text(a.dueDate), month: text(a.paymentMonth), currency, amount: draftAmount(s.amount, currency, toBps(taxRate)), taxRate,
    description: text(s.description), remarks: [s.verdict && `AI: ${s.verdict}`, s.reasoning].filter(Boolean).join(' - '), status: 'pending', driveFileId: fileId, fileName
  }));
}

// The tracker's first invoice format (one record per project share, plain numbers with tax included) -> a draft.
// `rates` is the old config table, recorded on the entry as where its rate came from.
export function legacyEntryInput(inv, where, rates = {}) {
  const currency = text(inv.currency).toUpperCase(), taxRate = percentOf(inv.taxRate);
  const verdict = inv.verdict || (['approved', 'flagged', 'rejected'].includes(inv.status) ? inv.status : 'approved');
  return {
    ...where, draft: true, source: 'migrated', partner: text(inv.vendor), vendor: text(inv.vendor), invoiceNo: text(inv.invoiceNo), documentDate: text(inv.date),
    dueDate: text(inv.dueDate), currency, amount: draftAmount(inv.amount, currency, toBps(taxRate)), taxRate,
    rate: currency && currency !== BASE && rates[currency] != null ? String(rates[currency]) : undefined, rateSource: 'old tracker setting',
    status: inv.status === 'paid' ? 'paid' : verdict === 'rejected' ? 'rejected' : verdict === 'approved' ? 'approved' : 'pending',
    description: text(inv.description || inv.aiReasoning), remarks: 'Moved from the old invoice list', driveFileId: text(inv.driveFileId), fileName: text(inv.fileName)
  };
}
// An old WBS item is a sanctioned amount. The old tracker compared it with tax-inclusive invoices as it stood, so it comes over with no tax added.
export const legacySanctionedInput = (item, where, partner) => ({
  ...where, source: 'migrated', partner: partner || 'TBC', month: text(item.plannedDate).slice(0, 7), currency: BASE, amount: String(item.amount ?? ''), taxRate: '0',
  description: text(item.description), remarks: 'Moved from the old WBS list'
});
