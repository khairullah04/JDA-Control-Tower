// node --experimental-test-module-mocks --test portal-routes.test.mjs
// The portal's passkey routes over real HTTP, with Drive and the AI stubbed out: who gets a session,
// what a session opens, and how repeated syncs are held back.
import { test, before, after } from 'node:test';
import { mockModule } from './test-mocks.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

const passkeys = { jda1: 'test-passkey-jda-one', jda2: 'test-passkey-jda-two', admin: 'test-passkey-tracker' };
process.env.PASSKEYS_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'jda-')), 'passkeys.json');
fs.writeFileSync(process.env.PASSKEYS_FILE, JSON.stringify(passkeys));

const synced = [], folders = [];
let syncFails = false, hold = null;   // `hold`: a promise the stubbed sync waits on, to keep it in flight
mockModule('./portal-sync.js', { syncJda: async (jda, opts) => { synced.push([jda, opts.scope]); await hold; if (syncFails) throw new Error('Drive is down'); return { found: true, patch: {}, counts: {}, skipped: [] }; } });
mockModule('./portal-drive.js', { masterFolderUrl: async jda => { folders.push(jda); return `https://drive.test/${jda.id}`; } });
const { createReportSaver, memoryReports } = await import('./portal-save.js');
const reportStore = memoryReports({ 'portal/jdaReports/jda1': { weekLabel: 'Week 1' }, 'portal/jdaReports/jda2': { weekLabel: 'JDA 2 week' } }), saver = createReportSaver(reportStore);
mockModule('./report-store.js', { reports: () => saver });
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
  assert.equal((await call('save', { jda: { id: 'admin' }, patch: { weekLabel: 'x' } }, token)).status, 400);
  assert.equal((await call('session', { jda: JDA1 }, token)).status, 401);
});

test('after five wrong passkeys the address is locked out for a while', async () => {
  for (let i = 0; i < 5; i++) assert.equal((await unlock('jda2', 'wrong')).status, 401);
  const locked = await unlock('jda2', passkeys.jda2);
  assert.equal(locked.status, 429);
  assert.match(locked.body.error, /Too many wrong passkeys/);
});

test('a sync must say what to sync, and only one runs at a time for a JDA and scope', async () => {
  const { token } = (await unlock('jda1', passkeys.jda1)).body;
  assert.equal((await call('sync', { jda: JDA1, scope: 'everything' }, token)).status, 400);
  let release; hold = new Promise(r => { release = r; });
  const first = call('sync', { jda: JDA1, scope: 'master' }, token);
  await new Promise(r => setTimeout(r, 50));                                                // the first is now reading Drive
  const second = await call('sync', { jda: JDA1, scope: 'master' }, token);
  assert.deepEqual([second.status, second.body.error], [429, 'A sync for this JDA is still running. Wait for it to finish.']);
  const other = call('sync', { jda: JDA1, scope: 'progress' }, token);                      // the other half is a separate matter
  await new Promise(r => setTimeout(r, 50));
  release(); hold = null;
  assert.deepEqual([(await first).status, (await other).status], [200, 200]);
  assert.equal((await call('sync', { jda: JDA1, scope: 'master' }, token)).status, 200);   // finished: it may run again at once
  assert.deepEqual(synced.map(([jda, scope]) => [jda.id, scope]), [['jda1', 'master'], ['jda1', 'progress'], ['jda1', 'master']]);

  syncFails = true;
  assert.equal((await call('sync', { jda: JDA1, scope: 'master' }, token)).status, 500);
  syncFails = false;
  assert.equal((await call('sync', { jda: JDA1, scope: 'master' }, token)).status, 200);   // a failed run does not leave the lock held
});

test('a JDA 1 session cannot reach JDA 2\'s Drive folder, whatever name the page sends', async () => {
  const { token } = (await unlock('jda1', passkeys.jda1)).body;
  folders.length = 0;
  const out = await call('master-folder', { jda: { id: 'jda1', name: 'JDA 2' } }, token);      // the name is a lie
  assert.deepEqual([out.status, out.body.url], [200, 'https://drive.test/jda1']);
  assert.deepEqual(folders.map(j => [j.id, j.name]), [['jda1', 'JDA 1']]);                      // the server used its own name for jda1
  synced.length = 0;
  await call('sync', { jda: { id: 'jda1', name: 'jda2' }, scope: 'progress' }, token);
  assert.deepEqual(synced.map(([jda]) => jda.name).filter(n => n !== 'JDA 1'), []);
  assert.equal((await call('master-folder', { jda: { id: 'jda2', name: 'JDA 2' } }, token)).status, 401);
  assert.equal((await call('master-folder', { jda: { id: 'jda7', name: 'JDA 1' } }, token)).status, 400);   // not a JDA the portal knows
});

test('a report is saved through the server, only with that JDA\'s session', async () => {
  const { token } = (await unlock('jda1', passkeys.jda1)).body;
  assert.equal((await call('save', { jda: JDA1, patch: { weekLabel: 'Week 2' } })).status, 401);
  assert.equal((await call('save', { jda: JDA2, patch: { weekLabel: 'hijacked' } }, token)).status, 401);
  const ok = await call('save', { jda: JDA1, patch: { weekLabel: 'Week 2', tasks: [{ task: 'a' }] } }, token);
  assert.deepEqual([ok.status, ok.body.saved], [200, { weekLabel: 'Week 2', tasks: [{ task: 'a' }] }]);
  assert.equal(reportStore.docs['portal/jdaReports/jda2'].weekLabel, 'JDA 2 week');
  assert.equal(reportStore.versions['portal/jdaReports/jda1'][0].data.weekLabel, 'Week 1');     // the version before is kept

  const stale = await call('save', { jda: JDA1, patch: { weekLabel: 'Week 3' }, base: { weekLabel: 'not what is stored' } }, token);
  assert.deepEqual([stale.status, stale.body.changed], [409, ['weekLabel']]);
  assert.equal((await call('save', { jda: JDA1, patch: { weekLabel: 'Week 3' }, base: { weekLabel: 'not what is stored' }, force: true }, token)).status, 200);
  assert.equal((await call('save', { jda: JDA1, patch: { secrets: 1 } }, token)).status, 400);
});

test('JDA 3\'s report is saved to its own project', async () => {
  fs.writeFileSync(process.env.PASSKEYS_FILE, JSON.stringify({ ...passkeys, jda3: 'test-passkey-jda-three' }));
  const { token } = (await unlock('jda3', 'test-passkey-jda-three')).body;
  await call('save', { jda: { id: 'jda3' }, patch: { weekLabel: 'JDA 3 week' } }, token);
  assert.deepEqual(reportStore.docs['jda3/report/current'], { weekLabel: 'JDA 3 week' });
});
