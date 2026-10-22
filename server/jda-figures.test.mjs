// node --test jda-figures.test.mjs
// The Control Tower's figures for a JDA (web/control-tower/lib/jda-figures.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { averageProgress, latestUpdates, costPercent, jdaFigures, costsByName } from '../web/control-tower/lib/jda-figures.js';

const JDA1 = { id: 'jda1', name: 'JDA 1' };

test('progress is the average of the projects, latest update the newest', () => {
  assert.equal(averageProgress([{ pct: 10 }, { pct: 25 }, { pct: '40' }]), 25);
  assert.equal(averageProgress([]), null);
  assert.deepEqual(latestUpdates([{ date: '2026-09-01', text: 'a' }, { date: '2026-10-07', text: 'b' }, { date: '2026-10-08' }]).map(u => u.text), ['b', 'a']);
});

test('cost: paid of sanctioned; paid with nothing sanctioned is over', () => {
  assert.deepEqual(costPercent({ spent: 33, sanctioned: 100 }), { pct: 33, unsanctioned: false });
  assert.deepEqual(costPercent({ spent: 5, sanctioned: 0 }), { pct: 100, unsanctioned: true });
  assert.deepEqual(costPercent({ spent: 0, sanctioned: 0 }), { pct: null, unsanctioned: false });
  assert.deepEqual(costPercent(null), { pct: null, unsanctioned: false });
});

test('what edit mode wrote overrides the data, and the data is still given', () => {
  const report = { overallStatus: 'amber', projects: [{ pct: 40 }, { pct: 60 }], updates: [{ date: '2026-10-01', text: 'x' }], challenges: [{ title: 'C', description: 'd', severity: 'high' }] };
  const costs = { 'jda 1': { trackerId: 't1', spentMinor: 100_00, sanctionedMinor: 400_00, pending: 2 } };
  const plain = jdaFigures(JDA1, report, {}, costs);
  assert.deepEqual([plain.progress, plain.status, plain.latest.text, plain.cost, plain.pending, plain.challenges[0].text], [50, 'amber', 'x', { spent: 100, sanctioned: 400 }, 2, 'd']);
  const set = jdaFigures(JDA1, report, { progressOverride: 70, costOverride: { spent: 1, sanctioned: 2 }, challenges: [] }, costs);
  assert.deepEqual([set.progress, set.dataProgress, set.cost, set.dataCost, set.challenges, set.reportChallenges.length], [70, 50, { spent: 1, sanctioned: 400, override: true }, { spent: 100, sanctioned: 400 }, [], 1]); // sanctioned follows the tracker
  assert.deepEqual(jdaFigures(JDA1, report, { costOverride: { spent: 1, sanctioned: 2 } }, {}).cost, { spent: 1, sanctioned: 2, override: true }); // no tracker figures: the typed one
  assert.equal(jdaFigures(JDA1, report, {}, null, { failed: true }).progress, null); // the report could not be read
});

test('tracker figures by JDA name, two of the same name added together', () => {
  const m = (jdaId, extra) => ({ jdaId, projectId: 'p', projectCode: 'AA', partner: 'IBM', month: '2026-01', grossMyrMinor: 1000, netMyrMinor: 1000, ...extra });
  const fin = { sanctioned: [m('a'), m('b')], entries: [m('a', { status: 'paid' }), m('b', { status: 'pending' }), m('a', { status: 'paid', deletedAt: 'x' })] };
  const out = costsByName([{ id: 'a', name: 'JDA 1' }, { id: 'b', name: ' jda 1 ' }], fin);
  assert.deepEqual(out['jda 1'], { trackerId: 'a', spentMinor: 1000, sanctionedMinor: 2000, pending: 1, twice: true });
});
