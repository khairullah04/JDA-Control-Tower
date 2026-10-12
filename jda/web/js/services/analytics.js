import { toMinor, roundDiv } from '../finance/money.js';
import { live, STATUSES, COUNTS_AS_ACTUAL } from '../finance/core.js';

// Every figure the tracker shows comes from the CJI3 register and the sanctioned amounts
// (services/finance.js), in whole sen. "Actual" is what has been paid; "planned" is what was
// sanctioned, with tax, up to and including this month.
const total = list => list.reduce((t, x) => t + (x.grossMyrMinor || 0), 0);
export const ofProject = (list, projectId) => list.filter(x => x.projectId === projectId);

// `project` gives the budget (ringgit, or budgetMinor in sen for several projects added up) and the dates the forecast runs between.
export function computeReport(project, sanctioned, entries, asOf = new Date()) {
  const month = asOf.toISOString().slice(0, 7), invoices = entries.filter(live), paid = invoices.filter(e => e.status === COUNTS_AS_ACTUAL);
  const budget = project.budgetMinor ?? toMinor(project.budget ?? 0) ?? 0;
  const actual = total(paid), planned = total(sanctioned.filter(s => live(s) && s.month <= month));

  // Forecast at completion: what has been paid, scaled up by the share of the project's days that have passed.
  const day = 864e5, days = Math.round((Date.parse(project.endDate) - Date.parse(project.startDate)) / day);
  const gone = Math.min(Math.max(Math.round((asOf - Date.parse(project.startDate)) / day), 1), days);
  const forecast = days > 0 ? Number(roundDiv(BigInt(actual) * BigInt(days), BigInt(gone))) : actual;

  return {
    asOf: asOf.toISOString().slice(0, 10), month, budget, planned, actual, invoiced: total(invoices.filter(e => e.status !== 'rejected')),
    variance: actual - planned, overPlan: actual > planned, budgetUsedPct: budget ? actual / budget : 0,
    forecast, forecastOverBudget: forecast > budget,
    counts: Object.fromEntries(STATUSES.map(s => [s, invoices.filter(e => e.status === s).length]))
  };
}
