import { config } from '../config/index.js';

const PAY = ['paid', 'pending', 'notpaid'];
export const STATUS_LABEL = { paid: 'Paid', pending: 'Pending', notpaid: 'Not paid yet' };
const rateOf = currency => config.fxToMYR[currency] ?? 1;

export const toMYR = i => (Number(i.amount) || 0) * rateOf(i.currency);
const monthKey = d => (typeof d === 'string' && d.length >= 7) ? d.slice(0, 7) : 'unknown';
export const convert = (value, currency) => (value || 0) * rateOf(currency);

// The AI verdict (approved/flagged/rejected) drives whether an invoice counts toward spend and needs review.
// Older records only ever had `status` set to one of those three; newer ones keep the verdict separately.
export const verdictOf = i => i.verdict || (['approved', 'flagged', 'rejected'].includes(i.status) ? i.status : 'approved');
// Payment status (paid/pending/notpaid) is separate from the verdict and is editable by the user.
export const paymentStatusOf = i => PAY.includes(i.status) ? i.status : (verdictOf(i) === 'approved' ? 'pending' : 'notpaid');
export const needsReview = i => verdictOf(i) !== 'approved' && paymentStatusOf(i) !== 'paid';

// An invoice split across projects is stored once per project: `amount` is that project's share,
// but subtotal and taxAmount are the whole invoice's. So each record's SST is scaled to its share
// (amount / whole-invoice total) - otherwise the subtotal exceeds the total and the tax is counted
// once per project the invoice touches.
const round2 = n => Math.round(n * 100) / 100;
export function taxShare(i) {
  const subtotal = i.subtotal ?? null, taxAmount = i.taxAmount ?? null;
  const whole = (Number(subtotal) || 0) + (Number(taxAmount) || 0);
  if (subtotal == null || taxAmount == null || !(whole > 0) || !(Number(i.amount) > 0)) return { subtotal, taxAmount };
  const share = Number(i.amount) / whole;
  return { subtotal: round2(subtotal * share), taxAmount: round2(taxAmount * share) };
}

export function computeReport(project, scope, invoices, asOf = new Date()) {
  const cutoff = asOf.toISOString().slice(0, 10);
  const counted = invoices.filter(i => verdictOf(i) !== 'rejected');
  const actual = counted.reduce((s, i) => s + toMYR(i), 0);
  const planned = scope.filter(s => s.plannedDate <= cutoff).reduce((s, x) => s + x.amount, 0);
  const totalScope = scope.reduce((s, x) => s + x.amount, 0);

  const months = {};
  const slot = k => (months[k] ??= { planned: 0, actual: 0 });
  scope.forEach(s => slot(monthKey(s.plannedDate)).planned += s.amount);
  counted.forEach(i => slot(monthKey(i.date)).actual += toMYR(i));

  const start = new Date(project.startDate), end = new Date(project.endDate);
  const elapsed = Math.min(Math.max((asOf - start) / (end - start), 0.01), 1);
  const forecast = actual / elapsed;

  const scopeProgress = scope.map(s => {
    const spent = counted.filter(i => i.matchedScopeId === s.id).reduce((t, i) => t + toMYR(i), 0);
    return { ...s, spent, pct: s.amount ? spent / s.amount : 0 };
  });

  // One row per invoice: the records an invoice was split into (several charges, or several
  // projects on a JDA page) are added back together. Records with no invoice number stay separate.
  const sstRows = [];
  const rowFor = {};
  for (const i of counted) {
    const row = { invoiceNo: i.invoiceNo, vendor: i.vendor, currency: i.currency, amount: Number(i.amount) || 0, taxRate: i.taxRate ?? null, ...taxShare(i) };
    const key = i.invoiceNo ? [i.invoiceNo, i.vendor, i.currency, i.driveFileId || ''].join('|') : null;
    const seen = key && rowFor[key];
    if (!seen) { sstRows.push(row); if (key) rowFor[key] = row; continue; }
    seen.amount = round2(seen.amount + row.amount);
    for (const f of ['subtotal', 'taxAmount']) if (row[f] != null) seen[f] = round2((seen[f] || 0) + row[f]);
  }

  return {
    asOf: cutoff, budget: project.budget, totalScope, planned, actual,
    variance: actual - planned, overPlan: actual > planned,
    budgetUsedPct: project.budget ? actual / project.budget : 0,
    forecast, forecastOverBudget: forecast > project.budget,
    months: Object.entries(months).sort(([a], [b]) => a.localeCompare(b)),
    scopeProgress,
    foreign: invoices.filter(i => i.currency !== config.baseCurrency)
      .map(i => ({ ...i, rate: config.fxToMYR[i.currency] ?? null, myr: toMYR(i) })),
    sst: {
      rows: sstRows,
      totalTax: sstRows.reduce((s, x) => s + convert(x.taxAmount, x.currency), 0)
    },
    counts: {
      approved: invoices.filter(i => verdictOf(i) === 'approved').length,
      flagged: invoices.filter(i => verdictOf(i) === 'flagged').length,
      rejected: invoices.filter(i => verdictOf(i) === 'rejected').length,
      needsReview: invoices.filter(needsReview).length
    }
  };
}
