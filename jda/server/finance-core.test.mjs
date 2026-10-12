// node --test finance-core.test.mjs
// The money rules, the three amounts of a record, the Payment Table and the register's operations,
// run over an in-memory store. Expected figures are worked out by hand in the comments.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toMinor, fmt, money, ringgit, normRate, convert, impliedRate, perUnit, percentage, toBps, fromBps, beforeTax, roundDiv } from '../web/js/finance/money.js';
import { amounts, build, paymentTable, tableTotals, rowId, monthsBetween, spreadOverMonths, DEFAULT_SETTINGS } from '../web/js/finance/core.js';
import { createFinance, memoryStore } from '../web/js/finance/service.js';
import { toCsv, parseCsv, tableIn, entryInputs, sanctionedInputs, entrySheet, paymentSheet, toIsoDate, toMonth, extractedInputs, legacyEntryInput, legacySanctionedInput, ENTRY_HEADERS, SANCTIONED_HEADERS } from '../web/js/finance/sheets.js';

const S = DEFAULT_SETTINGS;
const base = { jdaId: 'j1', jdaName: 'JDA 1', projectId: 'p1', projectCode: 'AA', partner: 'IBM' };
const invoice = (over = {}) => ({ ...base, invoiceNo: 'IN-25-0423-BF', documentDate: '2025-08-14', currency: 'MYR', amount: '1000.00', ...over });

test('amounts are whole minor units, parsed and printed without floating point', () => {
  assert.equal(toMinor('813,000.00'), 81300000);
  assert.equal(toMinor(175680.36, 'USD'), 17568036);
  assert.equal(toMinor(0.1 + 0.2), 30);            // 0.30000000000000004 is still 30 sen
  assert.equal(toMinor('1500', 'JPY'), 1500);      // yen has no minor unit
  assert.equal(toMinor('abc'), null);
  assert.equal(toMinor(''), null);
  assert.equal(fmt(81300000), '813,000.00');
  assert.equal(fmt(-3375356), '-33,753.56');
  assert.equal(fmt(5), '0.05');
  assert.equal(money(1500, 'JPY'), 'JPY 1,500');
  assert.equal(fmt(81300000, 'MYR', true), '813000.00');
  assert.equal(ringgit(87804050), 'RM 878,041');   // 878,040.50 rounds up, half away from zero
});

test('one rounding rule: half away from zero', () => {
  assert.equal(roundDiv(5n, 10n), 1n);
  assert.equal(roundDiv(-5n, 10n), -1n);
  assert.equal(roundDiv(4n, 10n), 0n);
  assert.equal(toMinor('2.345'), 235);
  assert.equal(toMinor('-2.345'), -235);
  assert.equal(percentage(1006, 800), 80);         // 8% of 10.06 = 0.8048 -> 0.80
  assert.equal(percentage(1069, 800), 86);         // 8% of 10.69 = 0.8552 -> 0.86
  assert.equal(percentage(625, 800), 50);          // 8% of 6.25 = 0.50 exactly
  assert.equal(percentage(1875, 600), 113);        // 6% of 18.75 = 1.125 -> 1.13 (the half goes up)
});

test('tax rate and exchange rate are kept exactly as entered', () => {
  assert.equal(toBps('8'), 800);
  assert.equal(toBps('8.5'), 850);
  assert.equal(toBps('101'), null);
  assert.equal(fromBps(800), '8');
  assert.equal(fromBps(850), '8.5');
  assert.equal(normRate('4.4498240'), '4.449824');
  assert.equal(normRate('0'), null);
  assert.equal(normRate('x'), null);
  assert.equal(perUnit('2.5845', 100), '0.025845'); // Bank Negara quotes yen per 100
  // 100.00 USD at 4.7 = 470.00 MYR; 1,000 JPY at 0.031 = 31.00 MYR; 0.01 USD at 4.449824 = 0.04449824 -> 0.04
  assert.equal(convert(10000, 'USD', '4.7'), 47000);
  assert.equal(convert(1000, 'JPY', '0.031'), 3100);
  assert.equal(convert(1, 'USD', '4.449824'), 4);
  assert.equal(impliedRate(10000, 'USD', 47000), '4.7');
});

test('the Payment Table example from the brief: original -> MYR -> taxed MYR', () => {
  // Sanctioned side: PT Amount (MYR) 813,000.00, w TAX 878,040.00 (tax 65,040.00).
  assert.deepEqual(amounts({ currency: 'MYR', netMinor: 81300000, rate: '1', taxRateBps: 800 }), { netMyrMinor: 81300000, taxMyrMinor: 6504000, grossMyrMinor: 87804000 });
  // Invoice side: CJI3 (MYR) after tax is 844,286.44. Before tax that is 781,746.70 (844,286.44 / 1.08 = 781,746.7037),
  // and 781,746.70 + 8% (62,539.736 -> 62,539.74) is 844,286.44 again.
  assert.equal(beforeTax(84428644, 800), 78174670);
  assert.deepEqual(amounts({ currency: 'MYR', netMinor: 78174670, rate: '1', taxRateBps: 800 }), { netMyrMinor: 78174670, taxMyrMinor: 6253974, grossMyrMinor: 84428644 });
});

test('hand-worked foreign invoices', () => {
  // USD 12,345.67 at 4.2150: 52,036.99905 -> MYR 52,037.00; 8% = 4,162.96; taxed 56,199.96
  assert.deepEqual(amounts({ currency: 'USD', netMinor: 1234567, rate: '4.2150', taxRateBps: 800 }), { netMyrMinor: 5203700, taxMyrMinor: 416296, grossMyrMinor: 5619996 });
  // SGD 9,999.99 at 3.2817: 32,816.967183 -> MYR 32,816.97; 8% = 2,625.3576 -> 2,625.36; taxed 35,442.33
  assert.deepEqual(amounts({ currency: 'SGD', netMinor: 999999, rate: '3.2817', taxRateBps: 800 }), { netMyrMinor: 3281697, taxMyrMinor: 262536, grossMyrMinor: 3544233 });
  // JPY 1,250,000 at 0.025845: MYR 32,306.25; 8% = 2,584.50; taxed 34,890.75
  assert.deepEqual(amounts({ currency: 'JPY', netMinor: 1250000, rate: '0.025845', taxRateBps: 800 }), { netMyrMinor: 3230625, taxMyrMinor: 258450, grossMyrMinor: 3489075 });
});

test('a record is validated before it is stored', () => {
  const bad = build('entry', { ...base, invoiceNo: '', documentDate: '2025-02-30', currency: 'USD', amount: '-5', rate: '0', taxRate: '120', fileUrl: 'javascript:alert(1)' }, null, S);
  for (const part of ['Invoice number is required', 'Invoice date must be a valid date', 'Amount must be a positive number', 'Rate to MYR', 'Tax rate', 'File link', 'Payment month']) {
    assert.ok(bad.errors.some(e => e.includes(part)), `expected an error about: ${part}`);
  }
  const long = build('entry', invoice({ invoiceNo: 'X'.repeat(201), partner: 'P'.repeat(41), remarks: 'r'.repeat(1001), amount: '9999999999999', sap: { name: 'n'.repeat(201) } }), null, S);
  assert.deepEqual(long.errors, ['Amount is too large', 'Partner is too long (40 characters at most)', 'Invoice number is too long (200 characters at most)', 'Remarks is too long (1000 characters at most)', 'SAP: Name is too long (200 characters at most)']);
  const ok = build('entry', invoice({ currency: 'USD', amount: '175,680.36', rate: '4.449824' }), null, S);
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.record.month, '2025-08');            // taken from the invoice date
  assert.equal(ok.record.status, 'pending');
  assert.equal(ok.record.taxRateBps, 800);             // the rate in force when it was entered
  assert.equal(ok.record.netMinor, 17568036);
  assert.equal(ok.record.netMyrMinor, 78174668);       // 175,680.36 x 4.449824 = 781,746.68225...
  assert.equal(ok.record.grossMyrMinor, 78174668 + 6253973);
});

test('Payment Table: rows by project, partner and month; only paid invoices are actual', () => {
  const s = (over) => ({ ...base, id: 's' + Math.random(), currency: 'MYR', netMinor: 0, netMyrMinor: 0, grossMyrMinor: 0, remarks: '', ...over });
  const sanctioned = [
    s({ month: '2025-08', netMinor: 81300000, netMyrMinor: 81300000, grossMyrMinor: 87804000 }),
    s({ month: '2025-09', netMinor: 10000000, netMyrMinor: 10000000, grossMyrMinor: 10800000 }),
    s({ month: '2025-09', netMinor: 5000000, netMyrMinor: 5000000, grossMyrMinor: 5400000 }),          // added later: the row adds them up
    s({ month: '2025-10', netMinor: 10000000, netMyrMinor: 10000000, grossMyrMinor: 10800000, deletedAt: 'x' })
  ];
  const e = (over) => ({ ...base, id: 'e' + Math.random(), currency: 'MYR', status: 'paid', ...over });
  const entries = [
    e({ invoiceNo: 'A', month: '2025-08', grossMyrMinor: 84428644, partner: 'ibm ' }),                  // same partner, typed differently
    e({ invoiceNo: 'B', month: '2025-09', grossMyrMinor: 16200000 }),
    e({ invoiceNo: 'C', month: '2025-09', grossMyrMinor: 500000, status: 'approved' }),                 // invoiced, not paid
    e({ invoiceNo: 'D', month: '2025-09', grossMyrMinor: 900000, status: 'rejected' }),
    e({ invoiceNo: 'E', month: '2025-09', grossMyrMinor: 700000, deletedAt: 'x' }),
    e({ invoiceNo: 'F', month: '2025-11', grossMyrMinor: 100000, partner: 'TAI' })                      // nothing sanctioned for it
  ];
  const rows = paymentTable(sanctioned, entries);
  assert.deepEqual(rows.map(r => [r.id, r.withTaxMinor, r.invoicedMinor, r.actualMinor, r.varianceMinor, r.flag]), [
    ['AA-IBM-2508', 87804000, 84428644, 84428644, -3375356, 'under'],                                   // 844,286.44 - 878,040.00 = -33,753.56
    ['AA-IBM-2509', 16200000, 16700000, 16200000, 0, 'within'],
    ['AA-TAI-2511', 0, 100000, 100000, 100000, 'over']
  ]);
  assert.equal(rows[1].invoices.length, 3);                                                             // every figure traces to its invoices
  assert.deepEqual(tableTotals(rows), { sanctionedMinor: 104004000, invoicedMinor: 101228644, actualMinor: 100728644, remainingMinor: 3275356 });
  assert.equal(rowId('AA', 'IBM', '2025-08'), 'AA-IBM-2508');
});

const setup = () => { let tick = 0; return createFinance(memoryStore(), { now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)).toISOString() }); };

test('saving, editing and the audit log', async () => {
  const f = setup();
  const a = await f.save('entry', invoice({ currency: 'USD', amount: '100.00', rate: '4.7' }), 'aina');
  assert.equal(a.grossMyrMinor, 50760);                                                                 // 470.00 + 37.60
  assert.equal(a.createdBy, 'aina');
  await assert.rejects(f.save('entry', invoice({ invoiceNo: 'in-25-0423-bf' }), 'aina'), /already entered/);  // same number, same project
  assert.ok(await f.save('entry', invoice({ projectId: 'p2', projectCode: 'AB' }), 'aina'));            // the same invoice may bill another project

  const b = await f.save('entry', { id: a.id, amount: '200.00', currency: 'USD', rate: '4.7', remarks: 'corrected' }, 'badrul');
  assert.equal(b.grossMyrMinor, 101520);
  assert.equal(b.createdBy, 'aina');
  assert.equal(b.updatedBy, 'badrul');
  const log = await f.audit({ entityId: a.id });
  assert.deepEqual(log.filter(l => l.action === 'edit').map(l => [l.by, l.field, l.old, l.new]).sort(), [
    ['badrul', 'MYR amount', 'MYR 470.00', 'MYR 940.00'], ['badrul', 'Original amount', 'USD 100.00', 'USD 200.00'], ['badrul', 'Remarks', '', 'corrected'],
    ['badrul', 'Tax (MYR)', 'MYR 37.60', 'MYR 75.20'], ['badrul', 'Taxed MYR', 'MYR 507.60', 'MYR 1,015.20']
  ]);
  assert.equal(log.at(-1).action, 'create');
  assert.ok(log.every(l => l.at && l.by));
  assert.equal((await f.audit()).length, log.length + 1);                                               // + the second project's entry
  assert.deepEqual(await f.save('entry', { id: a.id, remarks: 'corrected' }, 'chong'), b);              // no change: nothing written,
  assert.equal((await f.audit({ entityId: a.id })).length, log.length);                                 // not even an audit line
});

test('changing the tax rate or a rate never rewrites past invoices; recalculation is explicit', async () => {
  const f = setup();
  const a = await f.save('entry', invoice({ currency: 'USD', amount: '100.00', rate: '4.7' }), 'aina');
  await f.saveSettings({ taxRate: '10' }, 'aina');
  const b = await f.save('entry', invoice({ invoiceNo: 'NEW', currency: 'USD', amount: '100.00', rate: '4.9' }), 'aina');
  assert.equal(b.taxRateBps, 1000);                                                                     // new invoices take the new rate
  const kept = (await f.data()).entries.find(e => e.id === a.id);
  assert.equal(kept.taxRateBps, 800);
  assert.equal(kept.grossMyrMinor, 50760);
  await f.save('entry', { id: a.id, description: 'edited after the change' }, 'aina');                  // an ordinary edit leaves the amounts alone
  assert.equal((await f.data()).entries.find(e => e.id === a.id).grossMyrMinor, 50760);

  const done = await f.recalculate('entry', [a.id], { rate: '4.8', rateDate: '2026-01-02', rateSource: 'manual', currentTax: true }, 'badrul');
  assert.equal(done.changed, 1);
  const after = (await f.data()).entries.find(e => e.id === a.id);
  assert.deepEqual([after.rate, after.rateOverridden, after.taxRateBps, after.netMyrMinor, after.grossMyrMinor], ['4.8', true, 1000, 48000, 52800]);
  assert.ok((await f.audit({ entityId: a.id })).some(l => l.action === 'recalculate' && l.field === 'Rate to MYR' && l.old === '4.7' && l.new === '4.8'));
  assert.ok((await f.audit()).some(l => l.entity === 'settings' && l.field === 'Tax rate' && l.old === '8%' && l.new === '10%'));
  await f.save('entry', invoice({ invoiceNo: 'SGD1', currency: 'SGD', amount: '5', rate: '3.3' }), 'aina');
  const all = (await f.data()).entries.map(e => e.id);
  await assert.rejects(f.recalculate('entry', all, { rate: '4' }, 'aina'), /more than one currency/);
});

test('status changes, soft delete and restore', async () => {
  const f = setup();
  const a = await f.save('entry', invoice(), 'aina'), b = await f.save('entry', invoice({ invoiceNo: 'B' }), 'aina');
  assert.equal((await f.setStatus([a.id, b.id], 'paid', 'badrul')).changed, 2);
  await assert.rejects(f.setStatus([a.id], 'settled', 'badrul'), /Unknown status/);
  assert.equal((await f.remove('entry', [a.id], 'badrul')).changed, 1);
  const gone = (await f.data()).entries.find(e => e.id === a.id);
  assert.ok(gone.deletedAt && gone.deletedBy === 'badrul');                                             // still there, only marked
  assert.equal(paymentTable([], (await f.data()).entries)[0].actualMinor, 108000);                      // only B counts now
  await assert.rejects(f.save('entry', { id: a.id, remarks: 'x' }, 'aina'), /deleted/);
  const again = await f.save('entry', invoice(), 'aina');                                               // the number is free again
  await assert.rejects(f.restore('entry', [a.id], 'aina'), /cannot be restored/);
  await f.remove('entry', [again.id], 'aina');
  assert.equal((await f.restore('entry', [a.id], 'aina')).changed, 1);
  assert.deepEqual((await f.audit({ entityId: a.id })).map(l => l.action), ['restore', 'delete', 'status', 'create']);
});

test('spreadsheets: CSV, dates, and a CJI3 sheet read back in', async () => {
  assert.deepEqual(parseCsv('a,"b,1","say ""hi"""\r\n\r\nx,y,z'), [['a', 'b,1', 'say "hi"'], [''], ['x', 'y', 'z']]);
  assert.equal(toCsv([['=SUM(A1)', { n: '-12.50' }, 'a,b']]), "'=SUM(A1),-12.50,\"a,b\"");
  assert.equal(toIsoDate('10/27/2025'), '2025-10-27');
  assert.equal(toIsoDate('27/10/2025'), '2025-10-27');
  assert.equal(toIsoDate('08/10/2025', 'dmy'), '2025-10-08');
  assert.equal(toMonth('Aug-25'), '2025-08');
  assert.equal(toMonth('2025-08-01'), '2025-08');

  const f = setup(), ctx = { jda: { id: 'j1', name: 'JDA 1' }, projects: [{ id: 'p1', name: 'AA' }], status: 'paid' };
  const sheet = [['cji3 example'], [],
    ['WBS Element', 'CO Object Name', 'Cost Element', 'Name', 'Transaction Currency', 'Value TranCurr', 'Posting Date', 'Document Date', 'Val/COArea Crcy(after tax in ringgit)', 'Reference(invoice name)', 'Remarks', 'Forex'],
    ['W-1', 'AA', '52999900', 'TriCipta AI - AA(IBM)', 'USD', '175,680.36', '10/27/2025', '10/08/2025', '844,286.44', 'IN-25-0423-BF', 'first', ''],
    ['W-1', 'AA', '52999900', 'TriCipta AI - AA(IBM)', 'MYR', '1000', '10/27/2025', '10/08/2025', '', 'IN-2', '', ''],
    ['W-1', 'ZZ', '52999900', 'TriCipta AI - ZZ(IBM)', 'MYR', '1000', '10/27/2025', '10/08/2025', '', 'IN-3', '', '']];
  const read = entryInputs(tableIn([{ name: 'Sheet1', rows: sheet }], ENTRY_HEADERS), ctx);
  assert.equal(read[2].error, 'No project "ZZ" in JDA 1');
  const preview = await f.importRecords('entry', read.filter(r => !r.error).map(r => r.input), 'aina', { dryRun: true });
  assert.equal((await f.data()).entries.length, 0);                                                     // a preview saves nothing
  const first = preview.results[0].record;
  // The file's own MYR figure is kept: 844,286.44 taxed, 781,746.70 before tax, and the rate those imply.
  assert.deepEqual([first.partner, first.documentDate, first.month, first.status, first.netMinor, first.netMyrMinor, first.grossMyrMinor, first.rate, first.sap.wbsElement],
    ['IBM', '2025-10-08', '2025-10', 'paid', 17568036, 78174670, 84428644, '4.4498241', 'W-1']);
  assert.equal((await f.importRecords('entry', read.filter(r => !r.error).map(r => r.input), 'aina')).imported, 2);
  const again = await f.importRecords('entry', read.filter(r => !r.error).map(r => r.input), 'aina');   // importing twice adds nothing
  assert.equal(again.imported, 0);
  assert.match(again.results[0].errors[0], /already entered/);

  const back = entryInputs(tableIn([{ name: 'CJI3', rows: parseCsv(toCsv(entrySheet((await f.data()).entries))) }], ENTRY_HEADERS), ctx);
  const round = await setup().importRecords('entry', back.map(r => r.input), 'aina', { dryRun: true });  // the export imports back unchanged
  assert.deepEqual(round.results.map(r => [r.ok, r.record.netMinor, r.record.netMyrMinor, r.record.grossMyrMinor, r.record.rate]), [[true, 17568036, 78174670, 84428644, '4.4498241'], [true, 100000, 100000, 108000, '1']]);
});

test('spreadsheets: a Payment Table read in as sanctioned amounts, and written out', async () => {
  const f = setup(), ctx = { jda: { id: 'j1', name: 'JDA 1' }, projects: [{ id: 'p1', name: 'AA' }] };
  const sheet = [['payment table example'], [], ['ID', 'Month (PT)', 'Partner', 'Project', 'PT Amount (Original Currency)', 'PT Amount (MYR)', 'w TAX', 'Invoice', 'Remarks'],
    ['AA-IBM-2508', 'Aug-25', 'IBM', 'AA', '', '813,000.00', '878,040.00', 'IN-25-0423-BF', 'as agreed'], ['', '', '', '', '', '', '', 'IN-25-0424-BF', '']];
  const read = sanctionedInputs(tableIn([{ name: 'PT', rows: sheet }], SANCTIONED_HEADERS), ctx);
  assert.equal(read.length, 1);                                                                         // the second line only lists another invoice
  assert.equal((await f.importRecords('sanctioned', read.map(r => r.input), 'aina')).imported, 1);
  await f.save('entry', invoice({ status: 'paid', amount: '781,746.70' }), 'aina');
  const { sanctioned, entries } = await f.data(), rows = paymentTable(sanctioned, entries);
  assert.deepEqual([rows[0].id, rows[0].ptMyrMinor, rows[0].withTaxMinor, rows[0].actualMinor, rows[0].varianceMinor], ['AA-IBM-2508', 81300000, 87804000, 84428644, -3375356]);
  assert.equal(toCsv(paymentSheet(rows)).split('\r\n')[1], 'AA-IBM-2508,2025-08,IBM,AA,813000.00,813000.00,878040.00,IN-25-0423-BF,781746.70,781746.70,844286.44,844286.44,-33753.56,Under sanctioned,as agreed,MYR,MYR,Paid');
});

test('invoices from elsewhere arrive as drafts that say what they are missing', async () => {
  const f = setup(), where = { jdaId: 'j1', jdaName: 'JDA 1', projectId: 'p1', projectCode: 'AA' };
  // An invoice read by the AI: MYR 2,160.00 including 8% tax, split 1,080 / 1,080 across two projects.
  const drafts = extractedInputs({ vendor: 'IBM Malaysia Sdn Bhd', invoiceNo: 'X1', date: '2026-09-03', paymentMonth: '2026-08', currency: 'MYR', amount: 2160, taxRate: 0.08,
    allocations: [{ projectCode: 'AA', amount: 1080, description: 'a', verdict: 'approved', reasoning: 'fits' }, { projectCode: 'AB', amount: 1080, description: 'b' }] },
    { target: code => ({ ...where, projectId: code === 'AA' ? 'p1' : 'p2', projectCode: code }), partners: ['IBM'], fileId: 'f1', fileName: 'x.pdf' });
  assert.deepEqual(drafts.map(d => [d.partner, d.month, d.amount, d.taxRate, d.projectCode]), [['IBM', '2026-08', '1000.00', '8', 'AA'], ['IBM', '2026-08', '1000.00', '8', 'AB']]);
  // An old tracker invoice in USD with no rate in the old table: it comes over, flagged.
  const old = legacyEntryInput({ vendor: 'Dialog', invoiceNo: 'L1', date: '2026-03-15', currency: 'USD', amount: 100, taxRate: 0, status: 'paid' }, where, {});
  const out = await f.importRecords('entry', [...drafts, old], 'sync');
  assert.equal(out.imported, 3);
  const flagged = out.results[2].record;
  assert.deepEqual([flagged.status, flagged.grossMyrMinor], ['pending', 0]);                            // it cannot count as paid until it is complete
  assert.match(flagged.missing.join(), /Rate to MYR/);
  await assert.rejects(f.setStatus([flagged.id], 'paid', 'aina'), /incomplete/);
  const fixed = await f.save('entry', { id: flagged.id, amount: '100', currency: 'USD', rate: '4.7', status: 'paid' }, 'aina');
  assert.deepEqual([fixed.missing, fixed.status, fixed.grossMyrMinor], [[], 'paid', 47000]);
  // An old WBS item (RM 500,000 planned for 28 April) becomes that month's sanctioned amount, as it stood: no tax added.
  const plan = await f.importRecords('sanctioned', [legacySanctionedInput({ id: 's1', description: 'Installation (M4)', amount: 500000, plannedDate: '2026-04-28' }, where, 'Dialog')], 'aina');
  assert.deepEqual([plan.imported, plan.results[0].record.month, plan.results[0].record.partner, plan.results[0].record.netMyrMinor, plan.results[0].record.grossMyrMinor], [1, '2026-04', 'Dialog', 50000000, 50000000]);
});

test('a sanctioned amount that covers several months', async () => {
  assert.deepEqual(monthsBetween('2025-11', '2026-02'), ['2025-11', '2025-12', '2026-01', '2026-02']);
  assert.deepEqual(monthsBetween('2026-02', '2026-01'), []);
  assert.deepEqual(monthsBetween('2020-01', '2026-01'), []);                                            // more than five years: refused
  const one = { ...base, month: '2025-11', currency: 'MYR', amount: '1,000.00', description: 'Phase 1' };
  assert.deepEqual(spreadOverMonths(one, '', true), [one]);                                             // no last month: a single record, as before
  assert.deepEqual(spreadOverMonths(one, '2026-01', false).map(r => [r.month, r.amount]), [['2025-11', '1,000.00'], ['2025-12', '1,000.00'], ['2026-01', '1,000.00']]);
  // MYR 1,000.00 over 3 months: 333.33 each leaves one sen, which goes to the first month. 333.34 + 333.33 + 333.33 = 1,000.00
  const split = spreadOverMonths(one, '2026-01', true);
  assert.deepEqual(split.map(r => [r.month, r.amount]), [['2025-11', '333.34'], ['2025-12', '333.33'], ['2026-01', '333.33']]);
  assert.equal(split[1].description, 'Phase 1 (month 2 of 3, 2025-11 to 2026-01)');

  const f = setup(), made = await f.saveAll('sanctioned', split, 'aina');
  assert.deepEqual(made.map(r => [r.month, r.netMyrMinor, r.grossMyrMinor]), [['2025-11', 33334, 36001], ['2025-12', 33333, 36000], ['2026-01', 33333, 36000]]);
  const rows = paymentTable((await f.data()).sanctioned, []);
  assert.deepEqual(rows.map(r => r.id), ['AA-IBM-2511', 'AA-IBM-2512', 'AA-IBM-2601']);                 // each month has its own Payment Table row
  assert.equal((await f.audit()).filter(l => l.action === 'create' && l.by === 'aina').length, 3);
  await assert.rejects(f.saveAll('sanctioned', [split[0], { ...split[1], amount: '-1' }], 'aina'), /Record 2 \(2025-12\): Amount must be a positive number/);
  assert.equal((await f.data()).sanctioned.length, 3);                                                  // one bad month: none of them is saved
});

test('saves are steps: a stale form is refused, and saves at the same moment cannot both pass the duplicate check', async () => {
  const f = setup();
  const a = await f.save('entry', invoice(), 'aina');
  await f.save('entry', { id: a.id, remarks: 'first', expectedUpdatedAt: a.updatedAt }, 'badrul');
  await assert.rejects(f.save('entry', { id: a.id, remarks: 'second', expectedUpdatedAt: a.updatedAt }, 'chong'),
    e => e.status === 409 && /was changed by badrul after you opened it/.test(e.message));
  assert.equal((await f.data()).entries[0].remarks, 'first');

  const both = await Promise.allSettled([f.save('entry', invoice({ invoiceNo: 'SAME-1' }), 'aina'), f.save('entry', invoice({ invoiceNo: 'SAME-1' }), 'badrul')]);
  assert.deepEqual(both.map(r => r.status).sort(), ['fulfilled', 'rejected']);
  assert.equal((await f.data()).entries.filter(e => e.invoiceNo === 'SAME-1').length, 1);
  const log = await f.audit();
  assert.equal(log.filter(l => l.ref === 'Invoice SAME-1').length, 1);                                  // the refused one left no audit line either
});

test('a big change is done in steps, each record with its own audit line', async () => {
  const f = setup(), many = Array.from({ length: 320 }, (_, i) => invoice({ invoiceNo: `BULK-${i}` }));
  assert.equal((await f.importRecords('entry', many, 'aina')).imported, 320);
  const ids = (await f.data()).entries.map(e => e.id);
  const paid = await f.setStatus(ids, 'paid', 'badrul');
  assert.deepEqual([paid.changed, paid.records.length, paid.records.every(r => r.status === 'paid')], [320, 320, true]);
  assert.equal((await f.remove('entry', ids.slice(0, 150), 'chong')).changed, 150);
  const log = await f.audit({ limit: 5000 });
  assert.deepEqual(['import', 'status', 'delete'].map(a => log.filter(l => l.action === a).length), [320, 320, 150]);
});

test('importing sanctioned amounts twice does not double them', async () => {
  const f = setup(), row = (month, amount) => ({ ...base, month, currency: 'MYR', amount });
  const file = [row('2025-08', '813000'), row('2025-09', '100000')];
  assert.equal((await f.importRecords('sanctioned', file, 'aina')).imported, 2);
  const preview = await f.importRecords('sanctioned', [...file, row('2025-10', '100000')], 'aina', { dryRun: true });
  assert.deepEqual(preview.results.map(r => [r.ok, !!r.duplicate]), [[true, true], [true, true], [true, false]]);   // the preview says which are already entered
  const again = await f.importRecords('sanctioned', [...file, row('2025-10', '100000')], 'aina');
  assert.deepEqual([again.imported, again.results.map(r => r.added)], [1, [false, false, true]]);                  // left out unless asked for
  assert.equal((await f.data()).sanctioned.length, 3);
  const twice = await f.importRecords('sanctioned', [row('2025-08', '813000'), row('2025-08', '813000')], 'aina', { duplicates: 'add' });
  assert.equal(twice.imported, 2);                                                                                  // a deliberate further amount is still possible
  assert.equal(paymentTable((await f.data()).sanctioned, []).find(r => r.month === '2025-08').withTaxMinor, 87804000 * 3);
});

test('old tracker records are brought over once, however often it is run', async () => {
  const f = setup(), where = { jdaId: 'j1', jdaName: 'JDA 1', projectId: 'p1', projectCode: 'AA' };
  const invoices = [{ id: 'old1', vendor: 'Dialog', invoiceNo: '', date: '2026-03-15', currency: 'MYR', amount: 108, taxRate: 0.08, status: 'paid' },
    { id: 'old2', vendor: 'Dialog', invoiceNo: '', date: '2026-03-16', currency: 'MYR', amount: 216, taxRate: 0.08 }].map(i => legacyEntryInput(i, where));
  const wbs = [legacySanctionedInput({ id: 's1', description: 'M3', amount: 500, plannedDate: '2026-03-28' }, where, 'Dialog')];
  assert.deepEqual([(await f.importRecords('entry', invoices, 'aina')).imported, (await f.importRecords('sanctioned', wbs, 'aina')).imported], [2, 1]);
  const second = [await f.importRecords('entry', invoices, 'aina'), await f.importRecords('sanctioned', wbs, 'aina', { duplicates: 'add' })];
  assert.deepEqual(second.map(r => r.imported), [0, 0]);                                                            // invoices with no number included
  assert.match(second[0].results[0].errors.join(), /Already brought over/);
  const d = await f.data();
  assert.deepEqual([d.entries.length, d.sanctioned.length], [2, 1]);
});

test('a draft is cut to the limits, and an amount too large to be exact is refused even as a draft', async () => {
  const f = setup(), where = { jdaId: 'j1', jdaName: 'JDA 1', projectId: 'p1', projectCode: 'AA' };
  const read = extractedInputs({ vendor: 'V'.repeat(300), invoiceNo: 'N'.repeat(300), date: '2026-09-03', currency: 'MYR', amount: 108, taxRate: 0.08,
    allocations: [{ projectCode: 'AA', amount: 108, description: 'd'.repeat(5000), reasoning: 'r'.repeat(5000) }] }, { target: () => where, fileId: 'f-long', fileName: 'x.pdf' });
  const ok = await f.importRecords('entry', read, 'sync');
  const r = ok.results[0].record;
  assert.deepEqual([ok.imported, r.vendor.length, r.partner.length, r.invoiceNo.length, r.description.length, r.remarks.length], [1, 200, 40, 200, 1000, 1000]);
  const huge = await f.importRecords('entry', [{ ...where, draft: true, source: 'drive', partner: 'IBM', invoiceNo: 'HUGE', documentDate: '2026-09-03', currency: 'MYR', amount: '50000000000000' }], 'sync');
  assert.deepEqual([huge.imported, huge.results[0].errors], [0, ['Amount is too large']]);
});

test('a Drive file is read into the register once, however often the sync is run', async () => {
  const f = setup(), where = { jdaId: 'j1', jdaName: 'JDA 1', projectId: 'p1', projectCode: 'AA' };
  const fromFile = id => extractedInputs({ vendor: 'IBM', invoiceNo: '', date: '2026-09-03', currency: 'MYR', amount: 216, taxRate: 0.08,
    allocations: [{ projectCode: 'AA', amount: 108 }, { projectCode: 'AA', amount: 108 }] }, { target: () => where, fileId: id, fileName: `${id}.pdf` });
  assert.equal((await f.importRecords('entry', fromFile('f1'), 'sync')).imported, 2);       // two charges from one file, neither with an invoice number
  const again = await f.importRecords('entry', fromFile('f1'), 'sync');                    // the sync was interrupted and run again
  assert.equal(again.imported, 0);
  assert.match(again.results[0].errors[0], /already been read/);
  assert.equal((await f.importRecords('entry', fromFile('f2'), 'sync')).imported, 2);
  assert.equal((await f.data()).entries.length, 4);
});
