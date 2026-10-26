import { toMinor } from '../finance/money.js';
import { live, STATUSES, COUNTS_AS_ACTUAL } from '../finance/core.js';
import { localToday, localMonth } from '../../../../shared/lib/dates.js';

// Every figure the tracker shows comes from the CJI3 register and the sanctioned amounts
// (services/finance.js), in whole sen. "Actual" is what has been paid; "sanctionedToDate" is what
// was sanctioned, with tax, up to and including this month (there is no separate planned amount: the
// sanctioned amounts are the plan).
const total = list => list.reduce((t, x) => t + (x.grossMyrMinor || 0), 0);
export const ofProject = (list, projectId) => list.filter(x => x.projectId === projectId);

// A project's budget in sen. It is stored that way (budgetMinor); one saved before that holds whole ringgit in `budget`.
export const budgetMinorOf = project => project.budgetMinor ?? toMinor(project.budget ?? 0) ?? 0;
export const FORECAST_NOTE = 'Invoiced so far (rejected invoices left out) plus the sanctioned amounts, with tax, of the months still to come.';

// `project` gives the budget. "This month" is the month it is in Malaysia.
export function computeReport(project, sanctioned, entries, asOf = new Date()) {
  const month = localMonth(asOf), invoices = entries.filter(live), paid = invoices.filter(e => e.status === COUNTS_AS_ACTUAL);
  const budget = budgetMinorOf(project), plan = sanctioned.filter(live), counted = invoices.filter(e => e.status !== 'rejected');
  const actual = total(paid), sanctionedToDate = total(plan.filter(s => s.month <= month));

  // Forecast at completion: everything invoiced so far, plus what is sanctioned for the months still
  // to come. A month to come that is already invoiced above its sanctioned amount counts the
  // invoices instead - never both. (It does not depend on the project's dates.)
  const of = (list, m) => total(list.filter(x => x.month === m));
  const toCome = [...new Set([...plan, ...counted].map(x => x.month).filter(m => m > month))];
  const forecast = total(counted.filter(e => !(e.month > month))) + toCome.reduce((t, m) => t + Math.max(of(plan, m), of(counted, m)), 0);

  return {
    asOf: localToday(asOf), month, budget, sanctionedToDate, actual, invoiced: total(counted),
    variance: actual - sanctionedToDate, overSanctioned: actual > sanctionedToDate, budgetUsedPct: budget ? actual / budget : 0,
    forecast, forecastOverBudget: forecast > budget,
    counts: Object.fromEntries(STATUSES.map(s => [s, invoices.filter(e => e.status === s).length]))
  };
}
