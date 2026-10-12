import { fmt, scale } from '../../finance/money.js';

const TASKS = ['Engineering design', 'Procurement', 'Fabrication', 'Installation', 'Commissioning', 'Site services'];

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
const BUDGET = { AA: 16000000, BA: 9600000, CA: 6600000, DA: 14400000 };
projects.forEach(p => { if (BUDGET[p.id]) p.budget = BUDGET[p.id]; });

export const logs = [], processedFiles = [];
logs.push({ id: 'aa-l-budget', projectId: 'AA', action: 'project', by: 'demo', detail: 'Budget/dates updated: RM 16,000,000, 2026-01-01 to 2026-12-31', ts: '2026-01-02T08:00:00.000Z' });

// (project, partner, sanctioned per month in sen before tax, invoiced as a % of that). 115% runs over its
// sanctioned amount, 100% lands exactly on it, the others stay under.
const RICH = [['AA', 'IBM', 100000000, 115], ['BA', 'TAI', 80000000, 85], ['CA', 'IBM', 50000000, 100], ['DA', 'TAI', 120000000, 60]];

// Sample sanctioned amounts for the whole year and invoices for January to August, put through the
// register's own import so they are validated and worked out exactly as real ones are.
export async function seedFinance(finance) {
  const sanctioned = [], entries = [];
  for (const [code, partner, monthly, percent] of RICH) {
    const jda = jdas.find(j => j.id === projects.find(p => p.id === code).jdaId);
    const where = { jdaId: jda.id, jdaName: jda.name, projectId: code, projectCode: code, partner };
    for (let m = 1; m <= 12; m++) {
      const mm = String(m).padStart(2, '0'), task = TASKS[(m - 1) % TASKS.length];
      sanctioned.push({ ...where, month: `2026-${mm}`, currency: 'MYR', amount: fmt(monthly, 'MYR', true), description: `${task} (M${m})` });
      if (m > 8) continue;
      const usd = code === 'BA' && m === 3, net = scale(monthly, percent, 100);
      entries.push({
        ...where, vendor: partner === 'IBM' ? 'IBM Malaysia Sdn Bhd' : 'Tridiagonal.ai', invoiceNo: `INV-${code}-${100 + m}`,
        documentDate: `2026-${mm}-15`, dueDate: `2026-${String(Math.min(m + 1, 12)).padStart(2, '0')}-14`,
        currency: usd ? 'USD' : 'MYR', amount: fmt(usd ? scale(net, 10, 47) : net, 'MYR', true), ...(usd && { rate: '4.7', rateDate: '2026-03-15', rateSource: 'Entered by hand' }),
        status: m <= 4 ? 'paid' : m <= 6 ? 'approved' : 'pending', description: `${task} services for the month, per the attached breakdown.`
      });
    }
  }
  entries.push({
    jdaId: 'j3', jdaName: 'JDA 3', projectId: 'CA', projectCode: 'CA', partner: 'IBM', vendor: 'IBM Malaysia Sdn Bhd', invoiceNo: 'INV-CA-103-R', documentDate: '2026-04-20',
    currency: 'MYR', amount: '500000.00', status: 'rejected', description: 'Site consumables, second submission of the same charge.', remarks: 'Duplicate of INV-CA-103.'
  });
  await finance.importRecords('sanctioned', sanctioned, 'demo');
  await finance.importRecords('entry', entries, 'demo');
}
