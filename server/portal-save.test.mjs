// node --test portal-save.test.mjs
// Saving a report document: whole parts are replaced inside one read-modify-write, a part someone
// else changed meanwhile is not overwritten unless asked, and the previous versions are kept.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createReportSaver, memoryReports } from './portal-save.js';
import { digest, digests } from '../web/shared/lib/digest.js';

const JDA1 = { project: 'portal', collection: 'jdaReports', doc: 'jda1' };
const setup = (docs = {}) => { let tick = 0; const store = memoryReports(docs); return { store, saver: createReportSaver(store, { now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)).toISOString(), keep: 20 }) }; };

test('the fingerprint ignores key order and tells a missing part from an empty one', () => {
  assert.equal(digest({ a: 1, b: [{ x: 'y', z: null }] }), digest({ b: [{ z: null, x: 'y' }], a: 1 }));
  assert.notEqual(digest([{ name: 'A', pct: 10 }]), digest([{ name: 'A', pct: 11 }]));
  assert.notEqual(digest(undefined), digest(''));
  assert.notEqual(digest([]), digest(undefined));
  assert.deepEqual(digests({ a: 1 }, ['a', 'b']), { a: digest(1), b: 'none' });
});

test('a save replaces the parts it names and leaves the rest of the document alone', async () => {
  const { saver, store } = setup({ 'portal/jdaReports/jda1': { weekLabel: 'Week 1', projects: [{ name: 'A', pct: 10 }], scurve: { months: ['Jul'] }, overview: { tagline: 'T' } } });
  const saved = await saver.save(JDA1, { patch: { projects: [{ name: 'A', pct: 20 }], tasks: [] }, remove: ['overview'] });
  assert.deepEqual(saved, { weekLabel: 'Week 1', projects: [{ name: 'A', pct: 20 }], scurve: { months: ['Jul'] }, tasks: [] });
  assert.deepEqual(await saver.read(JDA1), saved);
  assert.deepEqual(store.versions['portal/jdaReports/jda1'].map(v => [v.fields, v.data.projects[0].pct, 'overview' in v.data]), [[['projects', 'tasks', 'overview'], 10, true]]); // what it was before
});

test('the first save of a JDA creates its document, with no earlier version to keep', async () => {
  const { saver, store } = setup();
  assert.deepEqual(await saver.save(JDA1, { patch: { weekLabel: 'Week 1' }, base: { weekLabel: 'none' } }), { weekLabel: 'Week 1' });
  assert.equal(store.versions['portal/jdaReports/jda1'], undefined);
});

test('a part someone else changed since the page loaded is not overwritten, unless asked', async () => {
  const { saver } = setup({ 'portal/jdaReports/jda1': { projects: [{ name: 'A', pct: 10 }], tasks: [{ task: 't' }] } });
  const loaded = digests(await saver.read(JDA1), ['projects', 'tasks']);
  await saver.save(JDA1, { patch: { projects: [{ name: 'A', pct: 55 }] } });            // somebody else (or the Power Automate feed)

  const refused = saver.save(JDA1, { patch: { projects: [{ name: 'A', pct: 20 }], tasks: [] }, base: loaded });
  await assert.rejects(refused, e => e.status === 409 && /Someone else has changed/.test(e.message) && e.changed.join() === 'projects');
  assert.equal((await saver.read(JDA1)).projects[0].pct, 55);                           // nothing of the refused save went in, not even the tasks

  assert.deepEqual((await saver.save(JDA1, { patch: { tasks: [] }, base: loaded })).tasks, []);   // the part nobody touched still saves
  assert.equal((await saver.save(JDA1, { patch: { projects: [{ name: 'A', pct: 20 }] }, base: loaded, force: true })).projects[0].pct, 20);
});

test('only the newest 20 versions are kept', async () => {
  const { saver, store } = setup({ 'portal/jdaReports/jda1': { weekLabel: 'Week 0' } });
  for (let i = 1; i <= 25; i++) await saver.save(JDA1, { patch: { weekLabel: `Week ${i}` } });
  const kept = store.versions['portal/jdaReports/jda1'];
  assert.equal(kept.length, 20);
  assert.deepEqual([kept[0].data.weekLabel, kept[19].data.weekLabel], ['Week 24', 'Week 5']);
});

test('what cannot be saved from a page is refused', async () => {
  const { saver } = setup();
  await assert.rejects(saver.save(JDA1, { patch: {} }), /Nothing to save/);
  await assert.rejects(saver.save(JDA1, { patch: { passkey: 'x' } }), /cannot be saved from the page: passkey/);
  await assert.rejects(saver.save(JDA1, { patch: {}, remove: ['driveSecret'] }), /cannot be saved/);
  await assert.rejects(saver.save(JDA1, { patch: { projects: 'all of them' } }), /projects must be a list/);
  await assert.rejects(saver.save(JDA1, { patch: { weekLabel: 7 } }), /weekLabel must be text/);
  await assert.rejects(saver.save(JDA1, { patch: { updates: [{ text: 'x'.repeat(950000) }] } }), /too much to save/);
  assert.equal(await saver.read(JDA1), null);
});

test('two saves at once do not lose one another', async () => {
  const { saver } = setup({ 'portal/jdaReports/jda1': {} });
  await Promise.all([saver.save(JDA1, { patch: { tasks: [{ task: 'a' }] } }), saver.save(JDA1, { patch: { updates: [{ text: 'b' }] } })]);
  assert.deepEqual(Object.keys(await saver.read(JDA1)).sort(), ['tasks', 'updates']);
});
