// node --test finance-api.test.mjs
// The finance routes over real HTTP, with an in-memory store: who is recorded in
// the audit log, and Excel out and back in.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import financeRoutes from './routes/finance.js';
import { createFinance, memoryStore } from '../web/control-tower/invoices/js/finance/service.js';
import { entrySheet, entryInputs, tableIn, ENTRY_HEADERS } from '../web/control-tower/invoices/js/finance/sheets.js';

let server, base;
const call = async (path, { method = 'GET', body, as = 'aina' } = {}) => {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', 'X-Test-User': as }, body: body && JSON.stringify(body) });
  return { status: res.status, body: res.headers.get('content-type')?.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer()) };
};
const invoice = { jdaId: 'j1', jdaName: 'JDA 1', projectId: 'p1', projectCode: 'AA', partner: 'IBM', invoiceNo: 'IN-1', documentDate: '2025-08-14', currency: 'USD', amount: '100.00', rate: '4.7' };

before(async () => {
  const app = express();
  app.use(express.json({ limit: '25mb' }));
  app.use('/api', (req, res, next) => { req.user = { name: req.headers['x-test-user'] }; next(); }); // stands in for the Firebase sign-in check
  app.use('/api/finance', financeRoutes(createFinance(memoryStore()), 'memory'));
  server = app.listen(0);
  base = `http://localhost:${server.address().port}`;
});
after(() => server.close());

test('an invoice is worked out, validated and logged by the server', async () => {
  const made = await call('/api/finance/entries', { method: 'POST', body: invoice });
  assert.equal(made.status, 200);
  assert.deepEqual([made.body.netMyrMinor, made.body.taxMyrMinor, made.body.grossMyrMinor, made.body.month, made.body.createdBy], [47000, 3760, 50760, '2025-08', 'aina']);
  const bad = await call('/api/finance/entries', { method: 'POST', body: { ...invoice, invoiceNo: 'IN-2', amount: '-1' } });
  assert.equal(bad.status, 400);
  assert.match(bad.body.error, /Amount must be a positive number/);
  assert.equal((await call('/api/finance/entries', { method: 'POST', body: invoice })).status, 400);  // duplicate
  assert.equal((await call('/api/finance/widgets', { method: 'POST', body: invoice })).status, 400);  // not a kind of record

  const id = made.body.id;
  const byHand = await call('/api/finance/entries/status', { method: 'POST', body: { ids: [id], status: 'paid' }, as: 'badrul' });
  assert.deepEqual([byHand.status, /Approvals/.test(byHand.body.error)], [410, true]);                 // no status by hand any more
  const edited = await call('/api/finance/entries', { method: 'POST', body: { ...invoice, id, status: 'paid', remarks: 'x' } });
  assert.equal(edited.body.status, 'pending');                                                          // an edit cannot set it either
  assert.equal((await call('/api/finance/entries/stage', { method: 'POST', body: { ids: [id], to: 'sent_to_pd' }, as: 'badrul' })).body.changed, 1);
  assert.equal((await call('/api/finance/entries/delete', { method: 'POST', body: { ids: [id] }, as: 'chong' })).body.changed, 1);
  assert.equal((await call('/api/finance/entries/restore', { method: 'POST', body: { ids: [id] }, as: 'chong' })).body.changed, 1);
  const log = (await call(`/api/finance/audit?entityId=${id}`)).body;
  assert.deepEqual((await call('/api/finance/audit?projectId=p1&limit=2')).body, log.slice(0, 2));     // a project's latest lines only
  assert.deepEqual((await call('/api/finance/audit?jdaId=j1&limit=1')).body, log.slice(0, 1));
  assert.deepEqual((await call('/api/finance/audit?projectId=none')).body, []);
  assert.deepEqual(log.map(l => [l.by, l.action, l.field, l.old, l.new]).reverse(), [
    ['aina', 'create', '', '', 'USD 100.00 at 4.7, MYR 507.60 taxed, 2025-08'], ['aina', 'edit', 'Remarks', '', 'x'], ['badrul', 'stage', 'Stage', 'Received', 'Sent to PD'], ['chong', 'delete', '', '', ''], ['chong', 'restore', '', '', '']
  ]);
  const data = (await call('/api/finance/data')).body;
  assert.deepEqual([data.storage, data.settings.taxRateBps, data.entries.length, data.entries[0].status], ['memory', 800, 1, 'approved']);
});

test('sanctioned amounts and the tax setting', async () => {
  const s = await call('/api/finance/sanctioned', { method: 'POST', body: { jdaId: 'j1', jdaName: 'JDA 1', projectId: 'p1', projectCode: 'AA', partner: 'IBM', month: '2025-08', currency: 'MYR', amount: '813,000.00' } });
  assert.deepEqual([s.status, s.body.netMyrMinor, s.body.grossMyrMinor], [200, 81300000, 87804000]);
  const edited = await call('/api/finance/sanctioned', { method: 'POST', body: { id: s.body.id, amount: '900000', currency: 'MYR', remarks: 'raised' }, as: 'badrul' });
  assert.equal(edited.body.grossMyrMinor, 97200000);
  assert.equal((await call('/api/finance/settings', { method: 'PUT', body: { taxRate: '6' } })).body.taxRateBps, 600);
  assert.equal((await call('/api/finance/data')).body.sanctioned[0].grossMyrMinor, 97200000);           // the stored record is untouched
  assert.equal((await call('/api/finance/settings', { method: 'PUT', body: { taxRate: 'lots' } })).status, 400);
  const span = ['2026-01', '2026-02'].map(month => ({ jdaId: 'j1', jdaName: 'JDA 1', projectId: 'p1', projectCode: 'AA', partner: 'TAI', month, currency: 'MYR', amount: '50.00' }));
  const many = await call('/api/finance/sanctioned/batch', { method: 'POST', body: { inputs: span } });
  assert.deepEqual([many.status, many.body.map(r => r.month)], [200, ['2026-01', '2026-02']]);
});

test('Excel: the register goes out as a workbook and reads back in', async () => {
  const { entries } = (await call('/api/finance/data')).body;
  const book = await call('/api/finance/workbook', { method: 'POST', body: { sheets: [{ name: 'CJI3', rows: entrySheet(entries) }] } });
  assert.equal(book.status, 200);
  assert.equal(book.body.subarray(0, 2).toString(), 'PK');                                              // an .xlsx file is a zip
  const read = await call('/api/finance/read', { method: 'POST', body: { name: 'cji3.xlsx', fileBase64: book.body.toString('base64') } });
  const rows = entryInputs(tableIn(read.body.sheets, ENTRY_HEADERS), { jda: { id: 'j2', name: 'JDA 2' }, projects: [{ id: 'p9', name: 'AA' }], status: 'pending' });
  const preview = await call('/api/finance/entries/import', { method: 'POST', body: { inputs: rows.map(r => r.input), dryRun: true } });
  assert.deepEqual(preview.body.results.map(r => [r.ok, r.record.invoiceNo, r.record.currency, r.record.netMinor, r.record.grossMyrMinor, r.record.rate, r.record.status]), [[true, 'IN-1', 'USD', 10000, 50760, '4.7', 'pending']]); // imported invoices start at Received, whatever the sheet says
  assert.equal((await call('/api/finance/read', { method: 'POST', body: { name: 'old.xls', fileBase64: '' } })).status, 400);
});

test('the approval process over HTTP: moves, refusals, and Paid is not a button', async () => {
  const made = await call('/api/finance/entries', { method: 'POST', body: { ...invoice, invoiceNo: 'IN-STAGE' } });
  const id = made.body.id;
  const ok = await call('/api/finance/entries/stage', { method: 'POST', body: { ids: [id], to: 'sent_to_pd' }, as: 'acc1' });
  assert.deepEqual([ok.status, ok.body.changed, ok.body.records[0].status], [200, 1, 'approved']);
  const paid = await call('/api/finance/entries/stage', { method: 'POST', body: { ids: [id], to: 'paid' } });
  assert.match(paid.body.refused[0].why, /cannot be moved to Paid by hand/);
  const history = await call(`/api/finance/stages?entityId=${id}`);
  assert.deepEqual(history.body.map(h => [h.from, h.to, h.by]), [['received', 'sent_to_pd', 'acc1']]);
});

test('the approval roles: an empty list is open to anyone; a filled one only to the people on it', async () => {
  const { rolesFromEnv } = await import('./routes/finance.js');
  assert.deepEqual(rolesFromEnv({ ROLE_LEAD: ' Lead@jda.app, x@jda.app ' }), { accountant1: [], pm: [], lead: ['lead@jda.app', 'x@jda.app'], accountant2: [] });
  const app = express();
  app.use(express.json());
  app.use('/api', (req, res, next) => { req.user = { name: req.headers['x-test-user'], email: `${req.headers['x-test-user']}@jda.app` }; next(); });
  app.use('/api/finance', financeRoutes(createFinance(memoryStore()), 'memory', { roles: rolesFromEnv({ ROLE_LEAD: 'lead@jda.app' }) }));
  const srv = app.listen(0), at = `http://localhost:${srv.address().port}`;
  const post = async (path, body, who) => (await fetch(at + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Test-User': who }, body: JSON.stringify(body) })).json();
  try {
    const { id } = await post('/api/finance/entries', { ...invoice, invoiceNo: 'IN-ROLE' }, 'aina');
    await post('/api/finance/entries/stage', { ids: [id], to: 'with_pm' }, 'aina');                    // Accountant 1: open to all
    await post('/api/finance/entries/stage', { ids: [id], to: 'pending_lead' }, 'aina');               // PM: open to all
    const refused = await post('/api/finance/entries/stage', { ids: [id], to: 'to_be_paid' }, 'aina'); // Lead: only lead@jda.app
    assert.match(refused.refused[0].why, /Only the Project Lead/);
    const ok = await post('/api/finance/entries/stage', { ids: [id], to: 'to_be_paid' }, 'lead');
    assert.equal(ok.changed, 1);
  } finally { srv.close(); }
});

test('segregation of duties: whoever validated an invoice as PM cannot approve it as Lead', async () => {
  const { id } = (await call('/api/finance/entries', { method: 'POST', body: { ...invoice, invoiceNo: 'IN-SOD' } })).body;
  await call('/api/finance/entries/stage', { method: 'POST', body: { ids: [id], to: 'with_pm' }, as: 'acc1' });
  await call('/api/finance/entries/stage', { method: 'POST', body: { ids: [id], to: 'pending_lead' }, as: 'farid' });
  const own = await call('/api/finance/entries/stage', { method: 'POST', body: { ids: [id], to: 'to_be_paid' }, as: 'farid' });
  assert.match(own.body.refused[0].why, /someone else has to approve/);
  const other = await call('/api/finance/entries/stage', { method: 'POST', body: { ids: [id], to: 'to_be_paid' }, as: 'rahman' });
  assert.equal(other.body.changed, 1);
});

test('CJI3 upload and matching are Accountant 2\'s when that role is filled in; a "migrated" import never brings in Paid, and only once (SEC-01, SEC-02)', async () => {
  const { rolesFromEnv } = await import('./routes/finance.js');
  const app = express(), fin = createFinance(memoryStore());
  app.use(express.json());
  app.use('/api', (req, res, next) => { req.user = { name: req.headers['x-test-user'], email: `${req.headers['x-test-user']}@jda.app` }; next(); });
  app.use('/api/finance', financeRoutes(fin, 'memory', { roles: rolesFromEnv({ ROLE_ACCOUNTANT2: 'acc2@jda.app' }) }));
  const srv = app.listen(0), at = `http://localhost:${srv.address().port}`;
  const post = async (path, body, who) => { const r = await fetch(at + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Test-User': who }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };
  try {
    for (const [path, body] of [['/api/finance/cji3/import', { group: 'jda3', sheets: [] }], ['/api/finance/cji3/match', { lineId: 'x', invoiceId: 'y' }], ['/api/finance/cji3/rematch', { group: 'jda3' }]]) {
      const r = await post(path, body, 'aina');
      assert.deepEqual([r.status, r.body.error], [403, 'Only the Accountant 2 may do this.'], path);
    }
    assert.notEqual((await post('/api/finance/cji3/rematch', { group: 'jda3' }, 'acc2')).status, 403);
    // a forged "migrated" import: Paid becomes approved, so a CJI3 line is still needed
    const out = await post('/api/finance/entries/import', { inputs: [{ ...invoice, invoiceNo: 'IN-MIG', source: 'migrated', status: 'paid' }] }, 'aina');
    assert.equal(out.status, 200);
    assert.equal((await fin.data()).entries.find(e => e.invoiceNo === 'IN-MIG').status, 'approved');
    await fin.saveSettings({ migratedAt: '2026-10-27T00:00:00Z' }, 'admin');
    const again = await post('/api/finance/entries/import', { inputs: [{ ...invoice, invoiceNo: 'IN-MIG2', source: 'migrated', status: 'approved' }] }, 'aina');
    assert.equal(again.status, 409);
  } finally { srv.close(); }
});
