const TASKS = ['Engineering design', 'Procurement', 'Fabrication', 'Installation', 'Commissioning', 'Site services'];
const VENDORS = ['Sapura Engineering', 'Dialog Services', 'Yinson Marine', 'Hextar Supplies', 'Bumi Armada'];

export const jdas = [
  { id: 'j1', name: 'JDA 1' }, { id: 'j2', name: 'JDA 2' }, { id: 'j3', name: 'JDA 3' },
  { id: 'j4', name: 'JDA 4' }, { id: 'j5', name: 'Unsorted' }
];
const STRUCTURE = [
  ['j1', ['AA', 'AB', 'AC']], ['j2', ['BA', 'BB']],
  ['j3', ['CA', 'CB', 'CC', 'CD', 'CE', 'CF', 'CG']], ['j4', ['DA', 'DB', 'DC']], ['j5', ['UNSORTED']]
];
export const projects = [];
STRUCTURE.forEach(([jdaId, codes]) => codes.forEach(name =>
  projects.push({ id: name, jdaId, name, budget: 2000000, startDate: '2026-01-01', endDate: '2026-12-31' })
));
// Give the "flagship" project of each JDA a realistic budget; the rest start blank until synced.
const BUDGET = { AA: 12000000, BA: 9600000, CA: 6000000, DA: 14400000 };
projects.forEach(p => { if (BUDGET[p.id]) p.budget = BUDGET[p.id]; });

export const scope = [], invoices = [], logs = [], processedFiles = [];

// (project id, monthly WBS amount, actual/planned factor) — mirrors the old JDA1-4 demo data, now on AA/BA/CA/DA
const RICH = [['AA', 1000000, 1.15], ['BA', 800000, 0.85], ['CA', 500000, 1.0], ['DA', 1200000, 0.6]];
RICH.forEach(([p, monthly, factor]) => {
  for (let m = 1; m <= 12; m++) {
    const mm = String(m).padStart(2, '0');
    scope.push({ id: `${p}-s${m}`, projectId: p, description: TASKS[(m - 1) % TASKS.length] + ` (M${m})`, amount: monthly, plannedDate: `2026-${mm}-28` });
    if (m > 8) continue;
    const usd = p === 'BA' && m === 3;
    const amount = Math.round(monthly * factor / (usd ? 4.7 : 1));
    const over = factor > 1.05;
    const verdict = over && m > 5 ? 'flagged' : 'approved';
    const taxRate = usd ? 0 : 0.08;
    const subtotal = Math.round(amount / (1 + taxRate));
    const dueMonth = String(Math.min(m + 1, 12)).padStart(2, '0');
    const vendor = VENDORS[m % VENDORS.length], invoiceNo = `INV-${p}-${100 + m}`;
    invoices.push({
      id: `${p}-i${m}`, projectId: p, vendor, invoiceNo,
      date: `2026-${mm}-15`, dueDate: `2026-${dueMonth}-14`, currency: usd ? 'USD' : 'MYR', amount,
      subtotal, taxRate, taxAmount: amount - subtotal, matchedScopeId: `${p}-s${m}`,
      verdict, status: verdict === 'approved' ? (m <= 4 ? 'paid' : 'pending') : 'notpaid', lineItems: [],
      description: `${TASKS[(m - 1) % TASKS.length]} services for the month, per the attached breakdown.`,
      aiReasoning: verdict === 'flagged'
        ? 'Matches the WBS item but the amount exceeds its planned value; delivery evidence is incomplete. Needs review.'
        : 'Matches the WBS item, amount within plan, no duplicate found. Delivery evidenced on the invoice.'
    });
    logs.push({ id: `${p}-l${m}`, projectId: p, action: 'invoice', by: 'demo', detail: `Imported ${vendor} ${invoiceNo} (${usd ? 'USD' : 'MYR'} ${amount.toLocaleString()}) — ${verdict}`, ts: `2026-${mm}-15T09:00:00.000Z` });
  }
});
invoices.push({
  id: 'ca-dup', projectId: 'CA', vendor: 'Dialog Services', invoiceNo: 'INV-CA-103', date: '2026-04-20', dueDate: '2026-05-20',
  currency: 'MYR', amount: 500000, subtotal: 462963, taxRate: 0.08, taxAmount: 37037, matchedScopeId: null,
  verdict: 'rejected', status: 'notpaid', lineItems: [], description: 'Site consumables, second submission of the same charge.',
  aiReasoning: 'Duplicate of an existing invoice with the same number and amount.'
});
logs.push({ id: 'ca-l-dup', projectId: 'CA', action: 'invoice', by: 'demo', detail: 'Imported Dialog Services INV-CA-103 (MYR 500,000) — rejected', ts: '2026-04-20T09:05:00.000Z' });
logs.push({ id: 'aa-l-scope', projectId: 'AA', action: 'scope', by: 'demo', detail: 'WBS item added: "Engineering design (M1)" (RM 1,000,000)', ts: '2026-01-02T08:00:00.000Z' });
