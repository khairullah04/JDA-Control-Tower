// node --test sanctioned-tandem.test.mjs
// The planned amount is the sanctioned amount: there is one record of it (a sanctioned amount), and every
// figure that shows it is worked out from that record each time. So one edit moves them all together:
// the Payment Table, the project report, the Control Tower's cost ring (even when its paid figure is set
// by hand), and what the AI is told is sanctioned when it reads an invoice.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFinance, memoryStore } from '../web/control-tower/invoices/js/finance/service.js';
import { paymentTable, tableTotals } from '../web/control-tower/invoices/js/finance/core.js';
import { computeReport } from '../web/control-tower/invoices/js/services/analytics.js';
import { costsByName, jdaFigures } from '../web/control-tower/lib/jda-figures.js';

const where = { jdaId: 'j1', jdaName: 'JDA 1', projectId: 'p1', projectCode: 'AA', partner: 'IBM' };

test('one edit to a sanctioned amount changes every figure that shows it, at once', async () => {
  const f = createFinance(memoryStore(), { now: () => '2026-10-22T01:00:00Z' });
  const s = await f.save('sanctioned', { ...where, month: '2026-09', currency: 'MYR', amount: '100,000.00', description: 'M1' }, 'aina');
  const figures = async () => {
    const { sanctioned, entries } = await f.data();
    const ring = jdaFigures({ name: 'JDA 1' }, null, { costOverride: { spent: 5, sanctioned: 1 } }, costsByName([{ id: 'j1', name: 'JDA 1' }], { sanctioned, entries }));
    return [tableTotals(paymentTable(sanctioned, entries)).sanctionedMinor, computeReport({ budgetMinor: 0 }, sanctioned, entries, new Date('2026-10-22T04:00:00Z')).sanctionedToDate, ring.cost.sanctioned * 100];
  };
  const before = await figures();
  assert.ok(before.every(v => v === before[0] && v > 0), `all the same: ${before}`);
  await f.save('sanctioned', { ...s, amount: '150,000.00' }, 'aina');
  const after = await figures();
  assert.ok(after.every(v => v === after[0]), `all the same: ${after}`);
  assert.equal(after[0], before[0] * 1.5);
  await f.remove('sanctioned', [s.id], 'aina');
  assert.deepEqual(await figures(), [0, 0, 0]);
});
