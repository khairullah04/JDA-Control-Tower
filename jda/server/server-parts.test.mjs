// node --experimental-test-module-mocks --test server-parts.test.mjs
// Small parts of the server on their own: error answers, the AI wrapper, the sync cache.
import { test, before, after } from 'node:test';
import { mockModule } from './test-mocks.mjs';
import assert from 'node:assert/strict';
import express from 'express';
import { apiErrors, apiNotFound } from './errors.js';

let reply;
mockModule('@anthropic-ai/sdk', { default: class { messages = { create: async () => reply }; } });
const { ask, parseJson } = await import('./claude.js');
const { pruned } = await import('./portal-sync.js');

let server, base;
before(() => {
  const app = express(); app.use(express.json({ limit: '1kb' }));
  app.post('/api/echo', (req, res) => res.json(req.body));
  app.get('/api/boom', () => { throw new Error('database password is hunter2'); });
  app.use('/api', apiErrors, apiNotFound);
  server = app.listen(0); base = `http://localhost:${server.address().port}`;
});
after(() => server.close());
const post = async (body, type = 'application/json') => { const r = await fetch(`${base}/api/echo`, { method: 'POST', headers: { 'Content-Type': type }, body }); return [r.status, r.headers.get('content-type').split(';')[0], await r.json()]; };

test('every API failure answers as { error }, never as an HTML page', async () => {
  assert.deepEqual(await post('{"a":1}'), [200, 'application/json', { a: 1 }]);
  assert.deepEqual(await post('{"a":'), [400, 'application/json', { error: 'That request could not be read.' }]);
  assert.deepEqual(await post(JSON.stringify({ a: 'x'.repeat(5000) })), [413, 'application/json', { error: 'That is too large to send (25 MB at most).' }]);
  const boom = await fetch(`${base}/api/boom`);
  assert.deepEqual([boom.status, await boom.json()], [500, { error: 'The server hit a problem with that request.' }]);   // the detail stays in the log
  const none = await fetch(`${base}/api/nowhere`);
  assert.deepEqual([none.status, await none.json()], [404, { error: 'There is nothing at that address.' }]);
});

test('an AI answer cut off at the length limit is an error, not a half answer', async () => {
  reply = { stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: 'Here: {"a": 1}' }] };
  assert.equal(await ask({ system: 's', messages: [] }), 'Here: {"a": 1}');
  reply = { stop_reason: 'max_tokens', content: [{ type: 'text', text: '{"allocations": [{"projectCode": "AA"' }] };
  await assert.rejects(ask({ system: 's', messages: [] }), /ran out of room before it finished/);
  assert.deepEqual(parseJson('Sure. {"a": {"b": 2}} Done.'), { a: { b: 2 } });
  assert.throws(() => parseJson('I could not read the file.'), /did not answer with data/);
  assert.throws(() => parseJson('{"a": 1,, }'), /could not be read/);
});

test('the sync cache drops results not used for 60 days, and dates older entries today', () => {
  const now = Date.UTC(2026, 9, 12), day = 864e5;
  const out = pruned({ fresh: { at: now - 5 * day, data: { a: 1 } }, stale: { at: now - 61 * day, data: { b: 2 } }, undated: { tagline: 'from before' } }, now);
  assert.deepEqual(out, { fresh: { at: now - 5 * day, data: { a: 1 } }, undated: { at: now, data: { tagline: 'from before' } } });
});

test('an exported workbook has columns as wide as what is in them', async () => {
  const { writeWorkbook, readSheets } = await import('./finance-xlsx.js');
  const ExcelJS = (await import('exceljs')).default;
  const rows = [['Invoice', 'Description', 'Amount'], ['INV-1', 'A description that is rather longer than twelve characters', { n: '813000.00' }], ['INV-2', 'x'.repeat(200), { n: '12345678901.25' }]];
  const file = await writeWorkbook([{ name: 'CJI3', rows }]);
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(file);
  assert.deepEqual(wb.worksheets[0].columns.map(c => c.width), [12, 44, 19]);     // never narrower than 12 or wider than 44; 12,345,678,901.25 is 17 characters
  assert.equal((await readSheets('CJI3.xlsx', file))[0].rows[1][2], '813000');
});
