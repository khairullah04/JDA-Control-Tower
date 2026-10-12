// node --test finance-api.test.mjs
// The finance routes over real HTTP, with an in-memory store: the passkey gate, who is recorded in
// the audit log, and Excel out and back in.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { unlock } from './passkeys.js';
import financeRoutes from './routes/finance.js';
import { createFinance, memoryStore } from '../web/js/finance/service.js';
import { entrySheet, entryInputs, tableIn, ENTRY_HEADERS } from '../web/js/finance/sheets.js';

// The tests bring their own passkeys; the real file is never read.
const passkeys = { jda1: 'test-passkey-jda-one', admin: 'test-passkey-tracker' };
process.env.PASSKEYS_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'jda-')), 'passkeys.json');
fs.writeFileSync(process.env.PASSKEYS_FILE, JSON.stringify(passkeys));
let server, base, token;
const call = async (path, { method = 'GET', body, as = 'aina', key = token } = {}) => {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', 'X-Finance-Token': key || '', 'X-Test-User': as }, body: body && JSON.stringify(body) });
  return { status: res.status, body: res.headers.get('content-type')?.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer()) };
};
const unlockAs = (jdaId, passkey) => call('/api/portal/unlock', { method: 'POST', body: { jdaId, passkey } });
const invoice = { jdaId: 'j1', jdaName: 'JDA 1', projectId: 'p1', projectCode: 'AA', partner: 'IBM', invoiceNo: 'IN-1', documentDate: '2025-08-14', currency: 'USD', amount: '100.00', rate: '4.7' };

before(async () => {
  const app = express();
  app.use(express.json({ limit: '25mb' }));
  app.post('/api/portal/unlock', unlock);
  app.use('/api', (req, res, next) => { req.user = { name: req.headers['x-test-user'] }; next(); }); // stands in for the Firebase sign-in check
  app.use('/api/finance', financeRoutes(createFinance(memoryStore()), 'memory'));
  server = app.listen(0);
  base = `http://localhost:${server.address().port}`;
});
after(() => server.close());

test('nothing is readable or writable without the Invoice Tracker passkey', async () => {
  assert.equal((await call('/api/finance/data', { key: '' })).status, 401);
  assert.equal((await call('/api/finance/entries', { method: 'POST', body: invoice, key: '' })).status, 401);
  assert.equal((await call('/api/finance/data', { key: 'admin.99999999999999.forged' })).status, 401);
  assert.equal((await unlockAs('admin', 'not-it')).status, 401);
  const jda = await unlockAs('jda1', passkeys.jda1);                         // a JDA editor's passkey is not the tracker's
  assert.equal((await call('/api/finance/data', { key: jda.body.token })).status, 401);
  const ok = await unlockAs('admin', passkeys.admin);
  assert.equal(ok.status, 200);
  token = ok.body.token;
  assert.deepEqual((await call('/api/finance/session')).body, { ok: true });
});

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
  assert.equal((await call('/api/finance/entries/status', { method: 'POST', body: { ids: [id], status: 'paid' }, as: 'badrul' })).body.changed, 1);
  assert.equal((await call('/api/finance/entries/delete', { method: 'POST', body: { ids: [id] }, as: 'chong' })).body.changed, 1);
  assert.equal((await call('/api/finance/entries/restore', { method: 'POST', body: { ids: [id] }, as: 'chong' })).body.changed, 1);
  const log = (await call(`/api/finance/audit?entityId=${id}`)).body;
  assert.deepEqual(log.map(l => [l.by, l.action, l.field, l.old, l.new]).reverse(), [
    ['aina', 'create', '', '', 'USD 100.00 at 4.7, MYR 507.60 taxed, 2025-08'], ['badrul', 'status', 'Status', 'Pending', 'Paid'], ['chong', 'delete', '', '', ''], ['chong', 'restore', '', '', '']
  ]);
  const data = (await call('/api/finance/data')).body;
  assert.deepEqual([data.storage, data.settings.taxRateBps, data.entries.length, data.entries[0].status], ['memory', 800, 1, 'paid']);
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
  assert.equal((await call('/api/finance/sanctioned/batch', { method: 'POST', body: { inputs: span }, key: '' })).status, 401);
});

test('Excel: the register goes out as a workbook and reads back in', async () => {
  const { entries } = (await call('/api/finance/data')).body;
  const book = await call('/api/finance/workbook', { method: 'POST', body: { sheets: [{ name: 'CJI3', rows: entrySheet(entries) }] } });
  assert.equal(book.status, 200);
  assert.equal(book.body.subarray(0, 2).toString(), 'PK');                                              // an .xlsx file is a zip
  const read = await call('/api/finance/read', { method: 'POST', body: { name: 'cji3.xlsx', fileBase64: book.body.toString('base64') } });
  const rows = entryInputs(tableIn(read.body.sheets, ENTRY_HEADERS), { jda: { id: 'j2', name: 'JDA 2' }, projects: [{ id: 'p9', name: 'AA' }], status: 'pending' });
  const preview = await call('/api/finance/entries/import', { method: 'POST', body: { inputs: rows.map(r => r.input), dryRun: true } });
  assert.deepEqual(preview.body.results.map(r => [r.ok, r.record.invoiceNo, r.record.currency, r.record.netMinor, r.record.grossMyrMinor, r.record.rate, r.record.status]), [[true, 'IN-1', 'USD', 10000, 50760, '4.7', 'paid']]);
  assert.equal((await call('/api/finance/read', { method: 'POST', body: { name: 'old.xls', fileBase64: '' } })).status, 400);
});
