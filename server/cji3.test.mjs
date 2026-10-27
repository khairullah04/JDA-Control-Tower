// node --test cji3.test.mjs
// The CJI3 importer: a file read into lines, and what an upload does with them, for the cases the
// owner named: the same file again, overlapping files, malformed rows and missing columns.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readCji3, planCji3, amountOf, COLUMNS } from '../web/control-tower/invoices/js/finance/cji3.js';

// The real export's headings, the last one as SAP writes it.
const HEAD = COLUMNS.map(([, label]) => label).map(l => l === 'Forex' ? 'Forex Confidential - For PETRONAS Staff Only&1#\\x000D\\' : l === 'Val/COArea Crcy' ? 'Val/COArea Crcy' : l);
const line = (over = {}) => {
  const v = { 'WBS Element': 'C-26-001', 'CO Object Name': 'CA', 'Cost Element': '52999900', 'Cost element descr.': 'Contract services', Name: 'TriCipta AI - CA(IBM)',
    'Object Currency': 'MYR', 'Value in Obj. Crcy': '1,000.00', 'Document Type': 'KR', 'Fiscal Year': '2026', Period: '9', 'Posting Date': '09/15/2026', 'Document Date': '09/01/2026',
    'Recovery Indicator': '', 'User Name': 'AINA', 'Transaction Currency': 'MYR', 'Value TranCurr': '1,000.00', 'Document Header Text': 'IBM Sep', 'Val/COArea Crcy': '1,080.00',
    'Created on': '09/15/2026', Reference: 'INV-CA-101', Remarks: '', Forex: '', ...over };
  return COLUMNS.map(([, label]) => v[label]);
};
const file = (...rows) => [{ name: 'Sheet1', rows: [['CJI3 export'], [], HEAD, ...rows] }];
// The store, as far as planning goes: the lines already in, each with an id.
const store = () => { let n = 0; const lines = []; return { lines, put: list => list.forEach(l => lines.push({ ...l, id: `l${++n}` })) }; };
const upload = (s, sheets) => { const read = readCji3(sheets), plan = planCji3(s.lines, read.lines); s.put(plan.add); return { read, plan }; };

test('a file is read: the 22 columns, dates, amounts (negative ones too), the Forex heading as SAP writes it', () => {
  const { lines, malformed, missing } = readCji3(file(line(), line({ Reference: 'INV-CA-102', 'Value TranCurr': '(250.00)', Forex: '4.45', 'Transaction Currency': 'usd' })));
  assert.deepEqual([missing, malformed], [[], []]);
  assert.deepEqual([lines[0].postingDate, lines[0].documentDate, lines[0].valueTranMinor, lines[0].valueCoAreaMinor, lines[0].wbs, lines[0].line], ['2026-09-15', '2026-09-01', 100000, 108000, 'C-26-001', 4]);
  assert.deepEqual([lines[1].valueTranMinor, lines[1].forex, lines[1].currency], [-25000, '4.45', 'USD']);
  assert.deepEqual([amountOf('1,000.00-'), amountOf('-5'), amountOf('x'), amountOf('')], [-100000, -500, null, null]);
});

test('the same file uploaded again adds nothing', () => {
  const s = store(), sheets = file(line(), line({ Reference: 'INV-CA-102' }));
  assert.equal(upload(s, sheets).plan.add.length, 2);
  const again = upload(s, sheets).plan;
  assert.deepEqual([again.add.length, again.skip.length, again.update.length, s.lines.length], [0, 2, 0, 2]);
});

test('overlapping files: only the new lines are added; a line whose other columns changed is updated', () => {
  const s = store();
  upload(s, file(line(), line({ Reference: 'INV-CA-102' })));
  const next = upload(s, file(line({ Remarks: 'paid by TT', 'Val/COArea Crcy': '1,081.00' }), line({ Reference: 'INV-CA-102' }), line({ Reference: 'INV-CA-103' }))).plan;
  assert.deepEqual([next.add.map(l => l.reference), next.skip.length, next.update.length], [['INV-CA-103'], 1, 1]);
  assert.deepEqual(next.update[0].changes.map(c => [c.field, c.old, c.new]), [['Remarks', '', 'paid by TT'], ['Val/COArea Crcy', '1,080.00', '1,081.00']]);
  assert.equal(s.lines.length, 3);
});

test('identical lines in one file are kept apart; a later file with one more adds just that one', () => {
  const s = store();
  assert.equal(upload(s, file(line(), line())).plan.add.length, 2);                  // two real, identical payments
  assert.equal(upload(s, file(line(), line())).plan.add.length, 0);
  const third = upload(s, file(line(), line(), line())).plan;
  assert.deepEqual([third.add.length, third.add[0].occurrence], [1, 3]);
});

test('the key ignores case and spaces in Reference, and a different amount or date is a different line', () => {
  const s = store();
  upload(s, file(line()));
  assert.equal(upload(s, file(line({ Reference: 'inv-ca-101 ' }))).plan.add.length, 0);
  assert.equal(upload(s, file(line({ 'Value TranCurr': '1,000.01' }))).plan.add.length, 1);
  assert.equal(upload(s, file(line({ 'Posting Date': '09/16/2026' }))).plan.add.length, 1);
});

test('malformed rows are reported by line number and not imported; the rest go in', () => {
  const { lines, malformed } = readCji3(file(line(), line({ 'WBS Element': '' }), line({ 'Value TranCurr': 'n/a' }), line({ 'Posting Date': '31/31/2026' }), line({ 'Transaction Currency': '' })));
  assert.equal(lines.length, 1);
  assert.deepEqual(malformed.map(m => m.line), [5, 6, 7, 8]);
  assert.match(malformed[0].why, /no WBS Element/);
  assert.match(malformed[1].why, /Value TranCurr "n\/a" is not a number/);
  assert.match(malformed[2].why, /Posting Date .* is not a date/);
});

test('a file missing a required column is refused whole, saying which', () => {
  const without = label => [{ name: 'S', rows: [HEAD.filter(h => h !== label), line().filter((_, i) => HEAD[i] !== label)] }];
  const r = readCji3(without('Reference'));
  assert.deepEqual([r.lines.length, r.missing], [0, ['Reference']]);
  assert.deepEqual(readCji3(without('Remarks')).missing, []);                         // an optional column may be absent
  assert.equal(readCji3([{ name: 'S', rows: [['nothing like a CJI3 sheet']] }]).missing.length, 8);
});

/* ---------- Over the register: stored once, logged, and the same over HTTP ---------- */
import express from 'express';
import financeRoutes from './routes/finance.js';
import { createFinance, memoryStore } from '../web/control-tower/invoices/js/finance/service.js';
import { stageOf } from '../web/control-tower/invoices/js/finance/workflow.js';
import { paymentTable as ptRows } from '../web/control-tower/invoices/js/finance/core.js';
import { toCsv } from '../web/control-tower/invoices/js/finance/sheets.js';

test('uploads over the register: a preview saves nothing; each upload is logged; updates are audited', async () => {
  const f = createFinance(memoryStore(), { now: () => '2026-10-20T01:00:00Z' });
  const sheets = file(line(), line({ Reference: 'INV-CA-102' }), line({ 'WBS Element': '' }));
  const preview = await f.importCji3({ group: 'jda3', fileName: 'cji3-sep.xlsx', sheets }, 'acc2', { dryRun: true });
  assert.deepEqual([preview.added, (await f.cji3Lines()).length, (await f.cji3Imports()).length], [2, 0, 0]);
  const first = await f.importCji3({ group: 'jda3', fileName: 'cji3-sep.xlsx', sheets }, 'acc2');
  assert.deepEqual([first.added, first.skipped, first.updated, first.malformed.map(m => m.line), first.rows], [2, 0, 0, [6], 3]);
  const again = await f.importCji3({ group: 'jda3', fileName: 'cji3-sep-again.xlsx', sheets: file(line({ Remarks: 'TT 15/9' }), line({ Reference: 'INV-CA-102' }), line({ Reference: 'INV-CA-103' })) }, 'acc2');
  assert.deepEqual([again.added, again.skipped, again.updated], [1, 1, 1]);
  const lines = await f.cji3Lines('jda3');
  assert.deepEqual([lines.length, lines.find(l => l.reference === 'INV-CA-101').remarks, lines.every(l => l.group === 'jda3')], [3, 'TT 15/9', true]);
  const log = await f.cji3Imports();
  assert.deepEqual(log.map(l => [l.fileName, l.by, l.added, l.skipped, l.updated]).sort(), [['cji3-sep-again.xlsx', 'acc2', 1, 1, 1], ['cji3-sep.xlsx', 'acc2', 2, 0, 0]]);
  assert.ok((await f.audit({})).some(l => l.entity === 'cji3' && l.field === 'Remarks' && l.new === 'TT 15/9'));
  await assert.rejects(f.importCji3({ group: 'jda9', sheets }, 'x'), /JDA 3, or JDA 1 \+ JDA 2/);
  await assert.rejects(f.importCji3({ group: 'jda12', sheets: [{ name: 'S', rows: [['WBS Element', 'Remarks'], ['W', 'x']] }] }, 'x'), /it has no Cost Element.*Reference columns/);
});

test('an upload over HTTP: the server reads the file itself', async () => {
  const app = express();
  app.use(express.json({ limit: '25mb' }));
  app.use('/api', (req, res, next) => { req.user = { name: 'acc2', email: 'acc2@jda.app' }; next(); });
  app.use('/api/finance', financeRoutes(createFinance(memoryStore()), 'memory'));
  const srv = app.listen(0), at = `http://localhost:${srv.address().port}`;
  try {
    const csv = toCsv([HEAD, line(), line({ Reference: 'INV-CA-102' })]);
    const res = await fetch(`${at}/api/finance/cji3/import`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ group: 'jda12', fileName: 'jda12.csv', fileBase64: Buffer.from(csv).toString('base64') }) });
    const out = await res.json();
    assert.deepEqual([res.status, out.added, out.group], [200, 2, 'jda12']);
    assert.equal((await (await fetch(`${at}/api/finance/cji3/lines?group=jda12`)).json()).length, 2);
    assert.equal((await (await fetch(`${at}/api/finance/cji3/imports`)).json())[0].fileName, 'jda12.csv');
  } finally { srv.close(); }
});

/* ---------- Matching lines to invoices ---------- */
const inv = (no, over = {}) => ({ jdaId: 'j3', jdaName: 'JDA 3', projectId: 'pc', projectCode: 'CA', partner: 'IBM', invoiceNo: no, documentDate: '2026-09-01', currency: 'MYR', amount: '1000', ...over });

test('matching: the CJI3 line is the approval, so an invoice at any open stage becomes Paid; none and several are left for a person', async () => {
  const f = createFinance(memoryStore(), { now: () => '2026-10-20T01:00:00Z' });
  const approved = await f.save('entry', inv('INV-CA-101'), 'a'), direct = await f.save('entry', inv('INV-CA-102'), 'a'), fresh = await f.save('entry', inv('INV-CA-103'), 'a');
  const twinA = await f.save('entry', inv('INV-CA-104'), 'a'), twinB = await f.save('entry', inv('INV-CA-104', { projectId: 'pd', projectCode: 'CB' }), 'a');
  await f.save('entry', inv('INV-CA-101', { jdaId: 'j1', jdaName: 'JDA 1' }), 'a');             // same number in JDA 1: not this file's
  await f.moveStage([approved.id], 'with_pm', {}, 'a'); await f.moveStage([approved.id], 'pending_lead', {}, 'pm'); await f.moveStage([approved.id], 'to_be_paid', {}, 'lead');
  await f.moveStage([direct.id], 'sent_to_pd', {}, 'a');
  const out = await f.importCji3({ group: 'jda3', fileName: 'sep.xlsx', sheets: file(
    line({ Reference: 'inv-ca-101' }), line({ Reference: 'INV-CA-102' }), line({ Reference: 'INV-CA-103' }),
    line({ Reference: 'INV-CA-104', 'CO Object Name': '' }), line({ Reference: 'INV-CA-104', 'CO Object Name': 'CB', 'Value TranCurr': '500' }), line({ Reference: 'NOPE-1' })) }, 'acc2');
  assert.deepEqual(out.match, { paid: 4, linked: 0, part_paid: 0, amount_differs: 0, not_approved: 0, incomplete: 0, none: 1, ambiguous: 1 }); // INV-CA-103 (only Received) and INV-CA-104 for CB are paid too
  const { entries } = await f.data(), get = id => entries.find(e => e.id === id);
  assert.deepEqual([get(approved.id).status, get(direct.id).status, get(fresh.id).status, get(twinB.id).status], ['paid', 'paid', 'paid', 'paid']);
  const lines = await f.cji3Lines('jda3'), byRef = (r, co) => lines.find(l => l.reference === r && (co === undefined || l.coObject === co));
  assert.deepEqual([byRef('INV-CA-104', '').matchState, byRef('INV-CA-104', '').candidateIds.sort(), byRef('INV-CA-104', 'CB').matchState], ['ambiguous', [twinA.id, twinB.id].sort(), 'paid']);
  assert.deepEqual(get(approved.id).paidBy, [byRef('inv-ca-101').id]);
  assert.ok((await f.stageHistory(approved.id)).some(h => h.to === 'paid' && h.byCji3));
  // the same file again: nothing new, nothing matched twice
  const again = await f.importCji3({ group: 'jda3', fileName: 'sep.xlsx', sheets: file(line({ Reference: 'inv-ca-101' })) }, 'acc2');
  assert.deepEqual([again.added, again.match], [0, { paid: 0, linked: 0, part_paid: 0, amount_differs: 0, not_approved: 0, incomplete: 0, none: 0, ambiguous: 0 }]);
});

test('matching by hand, and undoing it sends the invoice back to its queue', async () => {
  const f = createFinance(memoryStore(), { now: () => '2026-10-20T01:00:00Z' });
  const a = await f.save('entry', inv('INV-CA-201'), 'a');
  await f.moveStage([a.id], 'sent_to_pd', {}, 'a');
  await f.importCji3({ group: 'jda3', fileName: 'x.xlsx', sheets: file(line({ Reference: 'TT-0001' })) }, 'acc2'); // the bank's reference, not the invoice number
  const [l] = await f.cji3Lines('jda3');
  assert.equal(l.matchState, 'none');
  await f.matchLine(l.id, a.id, 'acc2');
  assert.deepEqual([(await f.data()).entries[0].status, (await f.cji3Lines())[0].matchState], ['paid', 'manual']);
  await f.matchLine(l.id, '', 'acc2');
  const back = (await f.data()).entries[0];
  assert.deepEqual([back.stage, back.status, back.paidBy, (await f.cji3Lines())[0].invoiceId], ['sent_to_pd', 'approved', [], '']);
  const other = await f.save('entry', inv('INV-1', { jdaId: 'j1', jdaName: 'JDA 1' }), 'a');
  await assert.rejects(f.matchLine(l.id, other.id, 'acc2'), /not in JDA 3/);
});

test("a CJI3 file's Payment Table (JDA 1 + JDA 2) is exactly JDA 1's rows and JDA 2's rows, by the same rules", async () => {
  const { paymentTable, tableTotals } = await import('../web/control-tower/invoices/js/finance/core.js');
  const { inGroup } = await import('../web/control-tower/invoices/js/finance/cji3.js');
  const rec = (jda, project, month, gross, status) => ({ jdaId: jda, jdaName: jda === 'j1' ? 'JDA 1' : jda === 'j2' ? 'JDA 2' : 'JDA 3', projectId: project, projectCode: project, partner: 'IBM', month, netMyrMinor: gross, grossMyrMinor: gross, status });
  const sanctioned = [rec('j1', 'AA', '2026-09', 100000), rec('j2', 'BA', '2026-09', 50000), rec('j3', 'CA', '2026-09', 70000)];
  const entries = [rec('j1', 'AA', '2026-09', 108000, 'paid'), rec('j2', 'BA', '2026-09', 20000, 'approved'), rec('j3', 'CA', '2026-09', 70000, 'paid')];
  const group = r => inGroup('jda12', r.jdaName), only = id => r => r.jdaId === id;
  const combined = paymentTable(sanctioned.filter(group), entries.filter(group));
  const apart = [...paymentTable(sanctioned.filter(only('j1')), entries.filter(only('j1'))), ...paymentTable(sanctioned.filter(only('j2')), entries.filter(only('j2')))];
  assert.deepEqual(combined.map(r => [r.id, r.actualMinor, r.varianceMinor, r.flag]).sort(), apart.map(r => [r.id, r.actualMinor, r.varianceMinor, r.flag]).sort());
  assert.deepEqual(tableTotals(combined), { sanctionedMinor: 150000, invoicedMinor: 128000, actualMinor: 108000, remainingMinor: 42000 });
  assert.ok(combined.every(r => r.jdaId !== 'j3'));
});

test('matching checks the amount: equal pays, a part payment waits for the rest, too much is left for a person', async () => {
  const f = createFinance(memoryStore(), { now: () => '2026-10-20T01:00:00Z' });
  const approve = async no => { const e = await f.save('entry', inv(no), 'a'); await f.moveStage([e.id], 'sent_to_pd', {}, 'a'); return e.id; }; // RM 1,000 + 8% = RM 1,080.00
  const [even, part, over] = [await approve('INV-A'), await approve('INV-B'), await approve('INV-C')];
  const up = (...rows) => f.importCji3({ group: 'jda3', fileName: 'x.xlsx', sheets: file(...rows) }, 'acc2');
  const first = await up(line({ Reference: 'INV-A', 'Val/COArea Crcy': '1,080.50' }),                // 50 sen out: within RM 1
    line({ Reference: 'INV-B', 'Value TranCurr': '500', 'Val/COArea Crcy': '540.00' }),               // half
    line({ Reference: 'INV-C', 'Value TranCurr': '2000', 'Val/COArea Crcy': '2,160.00' }));            // twice
  assert.deepEqual([first.match.paid, first.match.part_paid, first.match.amount_differs], [1, 1, 1]);
  const status = async () => Object.fromEntries((await f.data()).entries.map(e => [e.invoiceNo, e.status]));
  assert.deepEqual(await status(), { 'INV-A': 'paid', 'INV-B': 'approved', 'INV-C': 'approved' });
  await up(line({ Reference: 'INV-B', 'Value TranCurr': '500', 'Val/COArea Crcy': '540.00', 'Posting Date': '10/01/2026' })); // the rest
  assert.equal((await status())['INV-B'], 'paid');
  const b = (await f.data()).entries.find(e => e.invoiceNo === 'INV-B');
  assert.equal(b.paidBy.length, 2);
  assert.ok((await f.cji3Lines()).filter(l => l.invoiceId === part).every(l => l.matchState === 'paid'));
  // a person checks the over-amount line and confirms the invoice is paid
  const overLine = (await f.cji3Lines()).find(l => l.invoiceId === over);
  await f.matchLine(overLine.id, over, 'acc2');
  assert.equal((await status())['INV-C'], 'paid');
  assert.equal(even.length > 0, true);
});

test('the List replaces Approvals: an emailed invoice is paid by its CJI3 line; undone, it goes back to Pending Lead; lines held as "not approved" are matched again', async () => {
  const f = createFinance(memoryStore(), { now: () => '2026-10-22T01:00:00Z' });
  const e = await f.save('entry', inv('INV-CA-201'), 'a');
  await f.moveStage([e.id], 'with_pm', {}, 'pm'); await f.moveStage([e.id], 'pending_lead', {}, 'pm'); // emailed to the Lead from the List
  const out = await f.importCji3({ group: 'jda3', fileName: 'oct.xlsx', sheets: file(line({ Reference: 'INV-CA-201' })) }, 'acc2');
  assert.equal(out.match.paid, 1);
  let rec = (await f.data()).entries.find(x => x.id === e.id);
  assert.deepEqual([rec.status, rec.paidFrom], ['paid', 'pending_lead']);
  const [l] = await f.cji3Lines('jda3');
  await f.matchLine(l.id, '', 'acc2'); // a wrong match, undone
  rec = (await f.data()).entries.find(x => x.id === e.id);
  assert.deepEqual([stageOf(rec), rec.status, rec.paidFrom], ['pending_lead', 'pending', '']);
  // a line linked under the old rule ("not approved yet") is picked up by Match again
  const store = memoryStore(), g = createFinance(store, { now: () => '2026-10-22T01:00:00Z' });
  const old = await g.save('entry', inv('INV-CA-202'), 'a');
  await g.importCji3({ group: 'jda3', fileName: 'oct.xlsx', sheets: file(line({ Reference: 'NOT-YET' })) }, 'acc2');
  const [held] = await g.cji3Lines('jda3');
  await store.atomic(async () => ({ writes: [{ coll: 'cji3Lines', id: held.id, data: { ...held, reference: 'INV-CA-202', invoiceId: old.id, matchState: 'not_approved' } }] }));
  assert.equal((await g.matchCji3([held.id], 'acc2')).paid, 1);
  assert.equal((await g.data()).entries.find(x => x.id === old.id).status, 'paid');
});

/* ---------- Batch 1 fixes (reviews/REVIEW.md) ---------- */
test('a reversal line takes a Paid invoice back to unpaid, and its amount stops counting (ACC-01, LOG-02)', async () => {
  const f = createFinance(memoryStore(), { now: () => '2026-10-27T01:00:00Z' });
  const e = await f.save('entry', inv('INV-CA-301'), 'a');
  await f.moveStage([e.id], 'with_pm', {}, 'pm'); await f.moveStage([e.id], 'pending_lead', {}, 'pm');
  await f.importCji3({ group: 'jda3', fileName: 'oct.xlsx', sheets: file(line({ Reference: 'INV-CA-301' })) }, 'acc2');
  assert.equal((await f.data()).entries.find(x => x.id === e.id).status, 'paid');
  const out = await f.importCji3({ group: 'jda3', fileName: 'nov.xlsx', sheets: file(line({ Reference: 'INV-CA-301', 'Val/COArea Crcy': '-1080', 'Value TranCurr': '-1080', 'Posting Date': '2026-11-02' })) }, 'acc2');
  assert.ok(out.match.part_paid >= 1);                                               // the reversal, and the line it cancels
  const rec = (await f.data()).entries.find(x => x.id === e.id);
  assert.deepEqual([stageOf(rec), rec.status], ['pending_lead', 'pending']);
  assert.equal(ptRows([], (await f.data()).entries).reduce((t, r) => t + r.actualMinor, 0), 0);
});

test('matching a line to another invoice undoes the first match, so one payment never pays two invoices (SWE-02, LOG-04)', async () => {
  const f = createFinance(memoryStore(), { now: () => '2026-10-27T01:00:00Z' });
  const a = await f.save('entry', inv('INV-CA-401'), 'a'), b = await f.save('entry', inv('INV-CA-402'), 'a');
  await f.importCji3({ group: 'jda3', fileName: 'oct.xlsx', sheets: file(line({ Reference: 'INV-CA-401' })) }, 'acc2');
  const [l] = await f.cji3Lines('jda3');
  await f.matchLine(l.id, b.id, 'acc2');
  const { entries } = await f.data(), get = id => entries.find(x => x.id === id);
  assert.deepEqual([get(a.id).status, get(b.id).status], ['pending', 'paid']);
});

test('an invoice with no project or payment month (a List draft) is linked, not paid, until completed (LOG-01, ACC-02)', async () => {
  const f = createFinance(memoryStore(), { now: () => '2026-10-27T01:00:00Z' });
  await f.saveListPull({ items: [{ key: 'k1', invoiceNo: 'INV-L-1', partner: 'IBM', amountMinor: 100000, amountText: '1000', currency: 'MYR', proofs: [] }], mapping: {} }, 'pm');
  const { sent } = await f.sendListToLead({ jdaId: 'j3', jdaName: 'JDA 3', keys: ['k1'] }, 'pm'), d = { id: sent[0].id };
  const out = await f.importCji3({ group: 'jda3', fileName: 'oct.xlsx', sheets: file(line({ Reference: 'INV-L-1' })) }, 'acc2');
  assert.equal(out.match.incomplete, 1);
  assert.equal((await f.data()).entries.find(x => x.id === d.id).status, 'pending');
  const [l] = await f.cji3Lines('jda3');
  await assert.rejects(f.matchLine(l.id, d.id, 'acc2'), /no project or payment month/);
  // completed: Match again pays it, and it counts on the Payment Table
  const draft = (await f.data()).entries.find(x => x.id === d.id);
  await f.save('entry', { ...draft, projectId: 'pc', projectCode: 'CA', documentDate: '2026-09-01', month: '2026-09', amount: '1000', taxRate: '8' }, 'pm');
  assert.equal((await f.matchCji3([l.id], 'acc2')).paid, 1);
  assert.equal(ptRows([], (await f.data()).entries).reduce((t, r) => t + r.actualMinor, 0), 108000);
});
