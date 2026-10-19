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
