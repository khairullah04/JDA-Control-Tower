// node --test analytics.test.mjs
// The tracker's headline figures for a project, worked out from the register. Amounts are whole sen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeReport, ofProject } from '../web/js/services/analytics.js';
import { checkDates, checkProject } from '../web/js/ui/checks.js';
import { localToday, localMonth } from '../../shared/dates.js';

const project = { budget: 1000000, startDate: '2026-01-01', endDate: '2026-12-31' };   // RM 1,000,000
const s = (month, gross, over = {}) => ({ projectId: 'p1', month, grossMyrMinor: gross, ...over });
const e = (month, gross, status, over = {}) => ({ projectId: 'p1', month, grossMyrMinor: gross, status, ...over });
const sanctioned = [s('2026-05', 10800000), s('2026-06', 10800000), s('2026-07', 10800000), s('2026-08', 10800000), s('2026-06', 99999999, { deletedAt: 'x' })];
const entries = [
  e('2026-05', 10800000, 'paid'), e('2026-06', 5400000, 'paid'), e('2026-06', 2700000, 'approved'), e('2026-07', 1080000, 'pending'),
  e('2026-07', 900000, 'rejected'), e('2026-05', 77777777, 'paid', { deletedAt: 'x' }), { projectId: 'p2', month: '2026-05', grossMyrMinor: 5, status: 'paid' }
];
const asOf = new Date('2026-07-01T04:00:00Z');   // midday on 1 July in Malaysia

test('a project report: budget, sanctioned to date, paid, invoiced, counts', () => {
  const r = computeReport(project, sanctioned, ofProject(entries, 'p1'), asOf);
  assert.equal(r.budget, 100000000);
  assert.equal(r.planned, 32400000);                    // May + June + July; August is in the future, the deleted one counts for nothing
  assert.equal(r.actual, 16200000);                     // only Paid: 108,000 + 54,000
  assert.equal(r.invoiced, 19980000);                   // everything except the rejected and the deleted one
  assert.deepEqual([r.variance, r.overPlan, r.budgetUsedPct], [-16200000, false, 0.162]);
  assert.deepEqual(r.counts, { pending: 1, approved: 1, paid: 2, rejected: 1 });
  assert.deepEqual([r.asOf, r.month], ['2026-07-01', '2026-07']);
});

test('several projects added up: the budget is given in sen', () => {
  const r = computeReport({ budgetMinor: 250000000, startDate: '2026-01-01', endDate: '2026-12-31' }, sanctioned, entries, asOf);
  assert.equal(r.budget, 250000000);
  assert.equal(r.actual, 16200005);
});

test('a project with no dates or no budget still reports', () => {
  const r = computeReport({}, [], [e('2026-05', 100, 'paid')], asOf);
  assert.deepEqual([r.budget, r.actual, r.budgetUsedPct, r.forecast, r.forecastOverBudget], [0, 100, 0, 100, true]);
});

test('today and this month are Malaysia\'s, whatever the clock of the machine', () => {
  assert.equal(localToday(new Date('2026-06-30T15:59:59Z')), '2026-06-30');      // 23:59 on 30 June in Malaysia
  assert.equal(localToday(new Date('2026-06-30T16:00:00Z')), '2026-07-01');      // midnight: 1 July there, still 30 June in UTC
  assert.equal(localMonth(new Date('2026-12-31T16:30:00Z')), '2027-01');
  const early = computeReport(project, sanctioned, ofProject(entries, 'p1'), new Date('2026-06-30T17:00:00Z'));   // 1 am on 1 July in Malaysia
  assert.deepEqual([early.asOf, early.month, early.planned], ['2026-07-01', '2026-07', 32400000]);                // July's sanctioned amount already counts
});

test('forecast at completion: invoiced so far, plus what is sanctioned for the months to come', () => {
  const r = computeReport(project, sanctioned, ofProject(entries, 'p1'), asOf);
  assert.equal(r.forecast, 19980000 + 10800000);                                  // invoiced to July (rejected left out) + August's sanctioned amount
  assert.equal(r.forecastOverBudget, false);
  // one payment before the project starts is no longer multiplied by the project's length
  const notStarted = computeReport({ budget: 1000000, startDate: '2026-09-01', endDate: '2027-08-31' }, [s('2026-09', 10800000), s('2026-10', 10800000)], [e('2026-06', 10800000, 'paid')], asOf);
  assert.equal(notStarted.forecast, 10800000 + 21600000);
  // a month to come that is already invoiced above its sanctioned amount counts the invoices, not both
  const ahead = computeReport(project, [s('2026-08', 10800000), s('2026-09', 10800000)], [e('2026-08', 12000000, 'approved'), e('2026-09', 100, 'pending')], asOf);
  assert.equal(ahead.forecast, 12000000 + 10800000);
  assert.equal(computeReport({ budget: 100 }, [s('2026-08', 10001)], [], asOf).forecastOverBudget, true);
});

test('a project is refused with dates the wrong way round, a negative budget, or a code already in use', () => {
  const others = [{ name: 'AA', jdaName: 'JDA 1' }, { name: 'BA', jdaName: 'JDA 2' }];
  const ok = { name: ' AD ', budget: 0, startDate: '2026-01-01', endDate: '2026-01-01' };
  assert.deepEqual(checkProject(ok, others), { name: 'AD', budgetMinor: 0, startDate: '2026-01-01', endDate: '2026-01-01' });   // saved without the stray spaces
  assert.equal(checkProject({ ...ok, budget: 1234.56 }, others).budgetMinor, 123456);                     // the budget is kept in whole sen
  assert.throws(() => checkProject({ ...ok, budget: 1e21 }, others), /zero or more/);
  assert.throws(() => checkProject({ ...ok, endDate: '2025-12-31' }, others), /End date must be on or after/);
  assert.throws(() => checkProject({ ...ok, budget: -1 }, others), /zero or more/);
  assert.throws(() => checkProject({ ...ok, budget: NaN }, others), /zero or more/);
  assert.throws(() => checkProject({ ...ok, name: 'ba' }, others), /"BA" is already used in JDA 2/);     // whatever the capitals, whichever JDA
  assert.throws(() => checkProject({ ...ok, name: '  ' }, others), /Give the project a code/);
  const edit = { budget: 5, startDate: '2026-01-01', endDate: '2026-12-31' };                             // the edit form does not ask for the code
  assert.deepEqual(checkProject(edit), { budgetMinor: 500, startDate: '2026-01-01', endDate: '2026-12-31' });
  assert.throws(() => checkProject({ ...edit, endDate: '2025-01-01' }), /End date/);
  assert.doesNotThrow(() => checkDates({ startDate: '2026-01-01', endDate: '2026-01-02' }));
});
