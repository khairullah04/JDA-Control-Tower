// node --test analytics.test.mjs
// The tracker's headline figures for a project, worked out from the register. Amounts are whole sen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeReport, ofProject } from '../web/js/services/analytics.js';

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
  assert.deepEqual([r.budget, r.actual, r.budgetUsedPct, r.forecastOverBudget], [0, 100, 0, true]);
});
