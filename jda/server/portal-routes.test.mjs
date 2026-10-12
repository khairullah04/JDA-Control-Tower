// node --experimental-test-module-mocks --test portal-routes.test.mjs
// The portal's passkey routes over real HTTP, with Drive and the AI stubbed out: who gets a session,
// what a session opens, and how repeated syncs are held back.
import { test, mock, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

const passkeys = { jda1: 'test-passkey-jda-one', jda2: 'test-passkey-jda-two', admin: 'test-passkey-tracker' };
process.env.PASSKEYS_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'jda-')), 'passkeys.json');
fs.writeFileSync(process.env.PASSKEYS_FILE, JSON.stringify(passkeys));

const synced = [], folders = [];
let syncFails = false;
mock.module('./portal-sync.js', { exports: { syncJda: async (jda, opts) => { synced.push([jda, opts.scope]); if (syncFails) throw new Error('Drive is down'); return { found: true, patch: {}, counts: {}, skipped: [] }; } } });
mock.module('./portal-drive.js', { exports: { masterFolderUrl: async jda => { folders.push(jda); return `https://drive.test/${jda.id}`; } } });
const { default: portal } = await import('./routes/portal.js');

let server, base;
const call = async (route, body, token = '') => {
  const res = await fetch(`${base}/api/portal/${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Portal-Token': token }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
};
const unlock = (jdaId, passkey) => call('unlock', { jdaId, passkey });
const JDA1 = { id: 'jda1', name: 'JDA 1' }, JDA2 = { id: 'jda2', name: 'JDA 2' };

before(() => { const app = express(); app.use(express.json()); app.use('/api/portal', portal); server = app.listen(0); base = `http://localhost:${server.address().port}`; });
after(() => server.close());

test('a passkey is exchanged for a session token; a wrong one is not', async () => {
  assert.equal((await unlock('jda1', 'wrong')).status, 401);
  assert.equal((await unlock('jda9', 'anything')).status, 503);                      // no passkey set for it
  assert.equal((await call('unlock', { jdaId: 'jda1' })).status, 400);
  const ok = await unlock('jda1', passkeys.jda1);
  assert.equal(ok.status, 200);
  assert.match(ok.body.token, /^jda1\.\d+\.[0-9a-f]{64}$/);
});

test('everything else needs the session of the JDA it names', async () => {
  const { token } = (await unlock('jda1', passkeys.jda1)).body;
  assert.equal((await call('session', { jda: JDA1 })).status, 401);                  // no token
  assert.equal((await call('session', { jda: JDA1 }, 'jda1.99999999999999.forged')).status, 401);
  assert.equal((await call('session', {}, token)).status, 400);                     // which JDA?
  assert.deepEqual((await call('session', { jda: JDA1 }, token)).body, { ok: true });
  assert.equal((await call('session', { jda: JDA2 }, token)).status, 401);           // JDA 1's session does not open JDA 2
  assert.equal((await call('master-folder', { jda: JDA2 }, token)).status, 401);
});

test('the Invoice Tracker passkey opens no JDA', async () => {
  const { token } = (await unlock('admin', passkeys.admin)).body;
  assert.equal((await call('session', { jda: { id: 'admin', name: 'JDA 1' } }, token)).status, 400);
  assert.equal((await call('session', { jda: JDA1 }, token)).status, 401);
});

test('after five wrong passkeys the address is locked out for a while', async () => {
  for (let i = 0; i < 5; i++) assert.equal((await unlock('jda2', 'wrong')).status, 401);
  const locked = await unlock('jda2', passkeys.jda2);
  assert.equal(locked.status, 429);
  assert.match(locked.body.error, /Too many wrong passkeys/);
});

test('a sync must say what to sync, and a second one straight after is held back', async () => {
  const { token } = (await unlock('jda1', passkeys.jda1)).body;
  assert.equal((await call('sync', { jda: JDA1, scope: 'everything' }, token)).status, 400);
  assert.equal((await call('sync', { jda: JDA1, scope: 'master' }, token)).status, 200);
  const again = await call('sync', { jda: JDA1, scope: 'master' }, token);
  assert.equal(again.status, 429);
  assert.equal((await call('sync', { jda: JDA1, scope: 'progress' }, token)).status, 200);   // the other half is a separate matter
  assert.deepEqual(synced.map(([jda, scope]) => [jda.id, scope]), [['jda1', 'master'], ['jda1', 'progress']]);
});
