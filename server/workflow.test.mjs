// node --test workflow.test.mjs
// The approval process: every move it allows, every move it refuses, and that the status the
// Payment Table reads follows the stage (so the Payment Table's figures do not change).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STAGES, MOVES, stageOf, statusFor, checkMove, applyMove, movesFrom, queueOf, routeOf } from '../web/control-tower/invoices/js/finance/workflow.js';
import { paymentTable } from '../web/control-tower/invoices/js/finance/core.js';

const at = '2026-10-20T01:00:00Z', by = 'aina';
const inv = (over = {}) => ({ id: 'e1', jdaId: 'j1', projectId: 'p1', projectCode: 'AA', partner: 'IBM', month: '2026-10', grossMyrMinor: 108000, status: 'pending', ...over });
const walk = (entry, ...steps) => steps.reduce((e, [to, opts = {}]) => {
  const why = checkMove(e, to, opts);
  assert.equal(why, '', `${stageOf(e)} -> ${to}: ${why}`);
  return applyMove(e, to, { at, by });
}, entry);

test('Route 2: received, with PM, pending Lead, To Be Paid, Paid by CJI3; the status follows', () => {
  const e = walk(inv(), ['with_pm'], ['pending_lead'], ['to_be_paid']);
  assert.deepEqual([e.stage, e.status, e.route, e.stageBy], ['to_be_paid', 'approved', 'validation', 'aina']);
  const paid = walk(e, ['paid', { byCji3: true }]);
  assert.deepEqual([paid.stage, paid.status], ['paid', 'paid']);
});

test('Route 1: received, Sent to PD (in the To Be Paid queue), Paid by CJI3', () => {
  const e = walk(inv(), ['sent_to_pd']);
  assert.deepEqual([e.stage, e.status, e.route, queueOf(e).id], ['sent_to_pd', 'approved', 'direct', 'pay']);
  assert.equal(walk(e, ['paid', { byCji3: true }]).status, 'paid');
});

test('Reject needs a reason, archives, and Restore brings it back to the Lead', () => {
  const lead = walk(inv(), ['with_pm'], ['pending_lead']);
  assert.match(checkMove(lead, 'rejected'), /Say why/);
  const rejected = walk(lead, ['rejected', { note: 'Wrong project' }]);
  assert.deepEqual([rejected.status, rejected.archivedAt, queueOf(rejected).id], ['rejected', at, 'archive']);
  assert.match(checkMove(rejected, 'pending_lead'), /Say why/);
  const back = walk(rejected, ['pending_lead', { note: 'Corrected' }]);
  assert.deepEqual([back.stage, back.archivedAt, back.status], ['pending_lead', null, 'pending']);
});

test('moves not on the graph are refused, and Paid only comes from a CJI3 match', () => {
  const refused = [
    [inv(), 'to_be_paid'], [inv(), 'paid'], [inv(), 'rejected'], [inv(), 'pending_lead'],             // no skipping the steps
    [walk(inv(), ['with_pm']), 'to_be_paid'], [walk(inv(), ['sent_to_pd']), 'to_be_paid'],
    [walk(inv(), ['sent_to_pd']), 'paid'], [walk(inv(), ['with_pm'], ['pending_lead'], ['to_be_paid']), 'paid'], // by hand
    [inv(), 'nonsense'], [inv({ deletedAt: at }), 'with_pm']
  ];
  for (const [e, to] of refused) assert.notEqual(checkMove(e, to), '', `${stageOf(e)} -> ${to} should be refused`);
  assert.notEqual(checkMove(inv(), 'paid', { byCji3: true }), '');                                     // CJI3 only pays approved ones
});

test('an incomplete invoice cannot be approved or sent to PD', () => {
  const draft = inv({ missing: ['Invoice number is required'] });
  assert.match(checkMove(draft, 'sent_to_pd'), /incomplete/);
  assert.match(checkMove(walk(draft, ['with_pm'], ['pending_lead']), 'to_be_paid'), /incomplete/);
});

test('an undone CJI3 match goes back to the queue the invoice came from', () => {
  const viaPd = walk(inv(), ['sent_to_pd'], ['paid', { byCji3: true }]);
  assert.deepEqual(movesFrom(viaPd, { byCji3: true }).map(m => m.to), ['sent_to_pd']);
  const viaLead = walk(inv(), ['with_pm'], ['pending_lead'], ['to_be_paid'], ['paid', { byCji3: true }]);
  assert.deepEqual(movesFrom(viaLead, { byCji3: true }).map(m => m.to), ['to_be_paid']);
});

test('invoices from before the process get their stage from their status, and keep their figures', () => {
  assert.deepEqual(['pending', 'approved', 'paid', 'rejected'].map(status => stageOf({ status })), ['received', 'to_be_paid', 'paid', 'rejected']);
  for (const s of STAGES) assert.ok(['pending', 'approved', 'paid', 'rejected'].includes(statusFor(s)), s);
  // the Payment Table reads `status` only: an old record and the same record moved to the matching stage give the same row
  const old = [inv({ status: 'paid' })], moved = [walk(inv(), ['sent_to_pd'], ['paid', { byCji3: true }])];
  const pick = rows => rows.map(r => [r.actualMinor, r.invoicedMinor, r.flag]);
  assert.deepEqual(pick(paymentTable([], moved)), pick(paymentTable([], old)));
  assert.equal(routeOf({ status: 'approved' }), 'validation');
  assert.ok(MOVES.every(m => STAGES.includes(m.from) && STAGES.includes(m.to)));
});

/* ---------- Over the register: each move saved with its history and audit line ---------- */
import { createFinance, memoryStore } from '../web/control-tower/invoices/js/finance/service.js';
const entryInput = (over = {}) => ({ jdaId: 'j1', jdaName: 'JDA 1', projectId: 'p1', projectCode: 'AA', partner: 'IBM', invoiceNo: 'IN-1', documentDate: '2026-10-01', currency: 'MYR', amount: '1000', ...over });

test('the register: moves are saved with who, when, from, to and note; refused ones are reported and left alone', async () => {
  const f = createFinance(memoryStore(), { now: () => at });
  const a = await f.save('entry', entryInput(), 'aina'), b = await f.save('entry', entryInput({ invoiceNo: 'IN-2' }), 'aina');
  const first = await f.moveStage([a.id, b.id], 'with_pm', {}, 'aina');
  assert.deepEqual([first.changed, first.refused], [2, []]);
  const wrong = await f.moveStage([a.id, 'nope'], 'to_be_paid', {}, 'badrul');                          // skipping the Lead; an id that is not there
  assert.deepEqual([wrong.changed, wrong.refused.map(r => r.id)], [0, [a.id, 'nope']]);
  await f.moveStage([a.id], 'pending_lead', { note: 'Docs checked' }, 'pm1');
  const noReason = await f.moveStage([a.id], 'rejected', {}, 'lead1');
  assert.match(noReason.refused[0].why, /Say why/);
  await f.moveStage([a.id], 'rejected', { note: 'Wrong project' }, 'lead1');
  const { entries } = await f.data(), rec = entries.find(e => e.id === a.id);
  assert.deepEqual([rec.stage, rec.status, rec.archivedAt, rec.route], ['rejected', 'rejected', at, 'validation']);
  const history = await f.stageHistory(a.id);
  assert.deepEqual(history.map(h => [h.from, h.to, h.by, h.note]), [['received', 'with_pm', 'aina', ''], ['with_pm', 'pending_lead', 'pm1', 'Docs checked'], ['pending_lead', 'rejected', 'lead1', 'Wrong project']]);
  const log = await f.audit({ entityId: a.id });
  assert.ok(log.some(l => l.action === 'stage' && l.new === 'Rejected (Wrong project)' && l.by === 'lead1'));
});

test('the register: the old status buttons still work, and the stage is then read from the status', async () => {
  const f = createFinance(memoryStore(), { now: () => at });
  const a = await f.save('entry', entryInput(), 'aina');
  await f.moveStage([a.id], 'sent_to_pd', {}, 'aina');
  await f.setStatus([a.id], 'pending', 'aina');
  const rec = (await f.data()).entries[0];
  assert.deepEqual([rec.status, 'stage' in rec, stageOf(rec)], ['pending', false, 'received']);
});
