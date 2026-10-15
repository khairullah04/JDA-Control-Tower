// node --experimental-test-module-mocks --test portal-routes.test.mjs
// The JDA report routes over real HTTP, with Drive and the AI stubbed out: which JDA a request may
// reach, how saves are checked, and how repeated syncs are held back. Who may call them at all is the
// sign-in in front of them (app.test.mjs).
import { test, before, after } from 'node:test';
import { mockModule } from './test-mocks.mjs';
import assert from 'node:assert/strict';
import express from 'express';


const synced = [], folders = [];
let syncFails = false, hold = null;   // `hold`: a promise the stubbed sync waits on, to keep it in flight
mockModule('./portal-sync.js', { syncJda: async (jda, opts) => { synced.push([jda, opts.scope]); await hold; if (syncFails) throw new Error('Drive is down'); return { found: true, patch: {}, counts: {}, skipped: [] }; } });
mockModule('./portal-drive.js', { masterFolderUrl: async jda => { folders.push(jda); return `https://drive.test/${jda.id}`; } });
const { createReportSaver, memoryReports } = await import('./portal-save.js');
const reportStore = memoryReports({ 'portal/jdaReports/jda1': { weekLabel: 'Week 1' }, 'portal/jdaReports/jda2': { weekLabel: 'JDA 2 week' } }), saver = createReportSaver(reportStore);
mockModule('./report-store.js', { reports: () => saver });
const { default: portal } = await import('./routes/portal.js');

let server, base;
const call = async (route, body) => {
  const res = await fetch(`${base}/api/portal/${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
};
const JDA1 = { id: 'jda1', name: 'JDA 1' };

before(() => { const app = express(); app.use(express.json()); app.use('/api/portal', portal); server = app.listen(0); base = `http://localhost:${server.address().port}`; });
after(() => server.close());

test('a request must name a JDA the portal knows', async () => {
  assert.equal((await call('save', { patch: { weekLabel: 'x' } })).status, 400);
  assert.equal((await call('save', { jda: { id: 'admin' }, patch: { weekLabel: 'x' } })).status, 400);
  assert.equal((await call('master-folder', { jda: { id: 'jdaz', name: 'JDA 1' } })).status, 400);
});

test('a sync must say what to sync, and only one runs at a time for a JDA and scope', async () => {
  assert.equal((await call('sync', { jda: JDA1, scope: 'everything' })).status, 400);
  let release; hold = new Promise(r => { release = r; });
  const first = call('sync', { jda: JDA1, scope: 'master' });
  await new Promise(r => setTimeout(r, 50));                                                // the first is now reading Drive
  const second = await call('sync', { jda: JDA1, scope: 'master' });
  assert.deepEqual([second.status, second.body.error], [429, 'A sync for this JDA is still running. Wait for it to finish.']);
  const other = call('sync', { jda: JDA1, scope: 'progress' });                      // the other half is a separate matter
  await new Promise(r => setTimeout(r, 50));
  release(); hold = null;
  assert.deepEqual([(await first).status, (await other).status], [200, 200]);
  assert.equal((await call('sync', { jda: JDA1, scope: 'master' })).status, 200);   // finished: it may run again at once
  assert.deepEqual(synced.map(([jda, scope]) => [jda.id, scope]), [['jda1', 'master'], ['jda1', 'progress'], ['jda1', 'master']]);

  syncFails = true;
  assert.equal((await call('sync', { jda: JDA1, scope: 'master' })).status, 500);
  syncFails = false;
  assert.equal((await call('sync', { jda: JDA1, scope: 'master' })).status, 200);   // a failed run does not leave the lock held
});

test('a request for JDA 1 cannot reach JDA 2\'s Drive folder, whatever name the page sends', async () => {
  folders.length = 0;
  const out = await call('master-folder', { jda: { id: 'jda1', name: 'JDA 2' } });      // the name is a lie
  assert.deepEqual([out.status, out.body.url], [200, 'https://drive.test/jda1']);
  assert.deepEqual(folders.map(j => [j.id, j.name]), [['jda1', 'JDA 1']]);                      // the server used its own name for jda1
  synced.length = 0;
  await call('sync', { jda: { id: 'jda1', name: 'jda2' }, scope: 'progress' });
  assert.deepEqual(synced.map(([jda]) => jda.name).filter(n => n !== 'JDA 1'), []);
});

test('a report is saved through the server, to the JDA it names', async () => {
  const ok = await call('save', { jda: JDA1, patch: { weekLabel: 'Week 2', tasks: [{ task: 'a' }] } });
  assert.deepEqual([ok.status, ok.body.saved], [200, { weekLabel: 'Week 2', tasks: [{ task: 'a' }] }]);
  assert.equal(reportStore.docs['portal/jdaReports/jda2'].weekLabel, 'JDA 2 week');
  assert.equal(reportStore.versions['portal/jdaReports/jda1'][0].data.weekLabel, 'Week 1');     // the version before is kept

  const stale = await call('save', { jda: JDA1, patch: { weekLabel: 'Week 3' }, base: { weekLabel: 'not what is stored' } });
  assert.deepEqual([stale.status, stale.body.changed], [409, ['weekLabel']]);
  assert.equal((await call('save', { jda: JDA1, patch: { weekLabel: 'Week 3' }, base: { weekLabel: 'not what is stored' }, force: true })).status, 200);
  assert.equal((await call('save', { jda: JDA1, patch: { secrets: 1 } })).status, 400);
});

test('JDA 3\'s report is saved to its own project', async () => {
  await call('save', { jda: { id: 'jda3' }, patch: { weekLabel: 'JDA 3 week' } });
  assert.deepEqual(reportStore.docs['jda3/report/current'], { weekLabel: 'JDA 3 week' });
});
