// The invoices waiting for approval, as they stand in the company's Microsoft List (before approval;
// CJI3 is the evidence after payment). They arrive as rows of { column name: value }, from either
// source (server/ms-graph.js reads the List itself; an export of it, .xlsx or .csv, is read the same way),
// and become items by a column mapping worked out automatically (autoMapping).
// Pure functions, shared by the browser and the server.
import { toMinor } from './money.js';

// Our fields. `need`: the email cannot be sent without it (the others are asked about, not required).
export const LIST_FIELDS = [
  { key: 'invoiceNo', label: 'Invoice No.', need: true, like: ['invoiceno', 'invoicenumber', 'invoice', 'invno', 'reference', 'title'] },
  { key: 'partner', label: 'Partner', need: true, like: ['partner', 'vendor', 'supplier', 'company'] },
  { key: 'amount', label: 'Amount', need: true, like: ['amount', 'invoiceamount', 'value', 'total', 'totalamount'] },
  { key: 'currency', label: 'Currency', like: ['currency', 'curr', 'ccy'] },
  { key: 'description', label: 'Description', like: ['description', 'details', 'remarks', 'purpose'] },
  { key: 'jda', label: 'JDA', like: ['jda', 'jdaname', 'agreement'] },
  { key: 'proofs', label: 'Supporting documents', like: ['supportingdocuments', 'supportingdocs', 'proof', 'proofs', 'documents', 'attachments', 'links'] },
  { key: 'id', label: 'List item ID', like: ['id', 'listitemid', 'itemid'] }
];
const norm = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const text = v => v == null ? '' : typeof v === 'object' ? (v.Description || v.Url || v.LookupValue || v.Label || '') : String(v).trim();

// A row of headings and rows under it -> [{ heading: value }]. The first row with three or more filled
// cells is the heading row (an export may have a title above it).
export function rowsFromSheet(sheets) {
  for (const { rows } of sheets || []) {
    const at = rows.findIndex(r => r.filter(c => String(c ?? '').trim()).length >= 3);
    if (at < 0) continue;
    const head = rows[at].map(c => String(c ?? '').trim());
    const out = rows.slice(at + 1).filter(r => r.some(c => String(c ?? '').trim()))
      .map(r => Object.fromEntries(head.map((h, i) => [h, r[i] ?? '']).filter(([h]) => h)));
    return { headers: head.filter(Boolean), rows: out };
  }
  return { headers: [], rows: [] };
}

// Which List column is which, worked out automatically (nobody maps columns by hand). First by the
// column's name (exact usual names, then names containing a telling word), then, for what is still
// unfound, by what the column holds: web links (supporting documents), 3-letter codes (currency),
// "JDA n" (JDA), numbers (amount). A field still not found is simply missing on every row, and the
// "missing information" list says so before an email goes.
const NAME_HINTS = {
  invoiceNo: /^(title)$|invoice.*(no|num|number|ref|id)$|^inv(no|num|number)$|^invoice$|^ref(erence)?(no)?$/,
  partner: /vendor|partner|supplier|company|payee|contractor/,
  amount: /amount|value|total|sum|price|cost|payable/,
  currency: /^cur|currency|ccy/,
  description: /desc|detail|remark|note|purpose|scope|service|particular/,
  jda: /jda|agreement/,
  proofs: /support|proof|document|attach|link|evidence|url/,
  id: /^(id|itemid|listitemid)$/
};
const CURRENCIES = new Set(['MYR', 'USD', 'SGD', 'EUR', 'GBP', 'JPY', 'AUD', 'CNY', 'IDR', 'THB', 'INR', 'CHF', 'CAD', 'HKD', 'NOK', 'AED', 'SAR', 'QAR', 'KRW', 'BND']);
export function autoMapping(headers, rows = []) {
  const map = Object.fromEntries(LIST_FIELDS.map(f => [f.key, ''])), taken = new Set();
  const give = (k, h) => { map[k] = h; taken.add(h); };
  for (const f of LIST_FIELDS) { const h = headers.find(x => !taken.has(x) && f.like.includes(norm(x))); if (h) give(f.key, h); }       // exact usual names
  for (const f of LIST_FIELDS) {
    if (map[f.key]) continue;
    const h = headers.find(x => !taken.has(x) && NAME_HINTS[f.key].test(norm(x)) && !(f.key === 'amount' && NAME_HINTS.currency.test(norm(x))));
    if (h) give(f.key, h);
  }
  const sample = h => rows.slice(0, 50).map(r => r[h]).filter(v => v != null && String(typeof v === 'object' ? v.Url || '' : v).trim());
  const share = (h, test) => { const v = sample(h); return v.length ? v.filter(test).length / v.length : 0; };
  const byContent = [
    ['proofs', v => (typeof v === 'object' && v.Url) || /https?:\/\//i.test(String(v))],
    ['currency', v => CURRENCIES.has(String(v).trim().toUpperCase())],
    ['jda', v => /^jda\s*\d+$/i.test(String(v).trim())],
    ['amount', v => /^[A-Z]{0,3}\s*\(?-?[\d,]+(\.\d+)?\)?$/i.test(String(v).trim()) && /\d{2,}/.test(String(v))]
  ];
  for (const [k, test] of byContent) {
    if (map[k]) continue;
    const h = headers.find(x => !taken.has(x) && share(x, test) >= 0.6);
    if (h) give(k, h);
  }
  return map;
}
// The fields not found (for the note on the page).
export const notFound = mapping => LIST_FIELDS.filter(f => f.key !== 'id' && !mapping[f.key]).map(f => f.label);

// Proof links as the List holds them: a Hyperlink column ({ Url, Description }, or "url, description"
// in an export), or a text column with one link per line ("label | url", "[label](url)" or a bare url).
// Only http(s) addresses are kept: anything else is dropped (it would not open, or could be harmful).
export const isWebLink = u => { try { return ['http:', 'https:'].includes(new URL(String(u).trim()).protocol); } catch { return false; } };
export function parseProofs(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return isWebLink(value.Url) ? [{ label: text(value.Description) === value.Url ? '' : text(value.Description), url: value.Url.trim() }] : [];
  const out = [];
  for (const part of (Array.isArray(value) ? value : String(value ?? '').split(/[\r\n;]+/)).map(p => String(p).trim()).filter(Boolean)) {
    let label = '', url = '', m;
    if ((m = part.match(/^\[([^\]]*)\]\((\S+)\)$/))) [, label, url] = m;
    else if ((m = part.match(/^(.*?)\s*\|\s*(\S+)$/))) [, label, url] = m;
    else if ((m = part.match(/^(https?:\/\/\S+?),\s*(.+)$/i))) [, url, label] = m;
    else url = part;
    if (isWebLink(url)) out.push({ label: label.trim() === url ? '' : label.trim(), url: url.trim() });
  }
  return out;
}

// Rows -> items, by the mapping. Each item says what it is missing, so the person is told before sending.
export function itemsFrom(rows, mapping) {
  return rows.map((row, i) => {
    const get = k => mapping[k] ? row[mapping[k]] : undefined;
    const currency = text(get('currency')).toUpperCase(), rawAmount = text(get('amount'));
    const amountMinor = rawAmount ? toMinor(rawAmount.replace(/^[A-Z]{3}\s*/i, ''), currency || 'MYR') : null;
    const item = {
      key: text(get('id')) || `row-${i + 1}-${norm(text(get('invoiceNo')))}`,
      listId: text(get('id')), invoiceNo: text(get('invoiceNo')), partner: text(get('partner')),
      amountMinor, amountText: rawAmount, currency, description: text(get('description')), jda: text(get('jda')),
      proofs: parseProofs(get('proofs'))
    };
    item.missing = missingOf(item, mapping);
    return item;
  });
}
// What an item lacks, in words, for the "are you sure" list.
export function missingOf(item, mapping = {}) {
  const out = [];
  if (!item.invoiceNo) out.push('Invoice No.');
  if (!item.partner) out.push('Partner');
  if (!item.amountText) out.push('Amount');
  else if (item.amountMinor == null) out.push(`Amount ("${item.amountText}" is not a number)`);
  if (!item.currency) out.push('Currency');
  if (!item.description) out.push('Description');
  if (!item.proofs.length) out.push('Supporting documents');
  if (mapping.jda !== undefined && mapping.jda && !item.jda) out.push('JDA');
  return out;
}

// Whether an item belongs on a JDA's page: its JDA column names it ("JDA 1", "jda1"). With no JDA
// column mapped, the List is taken to be that JDA's own and every row shows.
export const inJda = (item, jdaName, mapping = {}) => !mapping.jda || norm(item.jda) === norm(jdaName);

// The selection: how many, and the total per currency (mixed currencies are never added together).
export function selectionTotals(items, selected) {
  const chosen = items.filter(i => selected.has(i.key)), by = new Map();
  for (const i of chosen) if (i.amountMinor != null) by.set(i.currency || '?', (by.get(i.currency || '?') || 0) + i.amountMinor);
  return { count: chosen.length, chosen, byCurrency: [...by].sort(([a], [b]) => a.localeCompare(b)).map(([currency, minor]) => ({ currency, minor })) };
}
