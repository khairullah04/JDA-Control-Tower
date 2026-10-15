// node --experimental-test-module-mocks --test site-edit.test.mjs
// Edit mode's saves: only what the pages hold is stored, nobody overwrites another person's save
// unknowingly, and the Roles picture must really be a picture.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { mockModule } from './test-mocks.mjs';

mockModule('./report-reader.js', { readReport: async () => null, sourceOf: j => j.source || { project: 'portal', collection: 'jdaReports', doc: j.id } });
const { savePage, cleanPublic, cleanControlTower, editablePublic, publicSite, controlTowerContent, saveRolesImage, publishRolesImage, discardRolesImage } = await import('./site-content.js');
const { siteStore } = await import('./site-store.js');

test('a public save keeps only known sections and fields, as text of a sensible length', () => {
  const out = cleanPublic({ overview: { title: 'T', body: 'x'.repeat(9000), secret: 'no' }, hacked: { a: 1 }, header: { title: 5 },
    jdas: { jda1: { title: 'Geo', status: 'done?', projects: [' A ', '', 7, 'B'], projectCount: 3.5, programLeads: [{ name: 'Aina', title: 'Lead', email: 'x' }, 'junk'] }, jdaz: { title: 'nope' } } });
  assert.equal(out.overview.title, 'T');
  assert.equal(out.overview.body.length, 6000);
  assert.equal('secret' in out.overview || 'hacked' in out, false);
  assert.equal(out.header.title, '');                                                  // not text: dropped
  assert.deepEqual(out.jdas.jda1, { title: 'Geo', status: '', pressRelease: '', pressDate: '', projects: ['A', 'B'], projectCount: null, programLeads: [{ name: 'Aina', title: 'Lead' }], businessChampions: [] });
  assert.equal('jdaz' in out.jdas, false);
});

test('a Control Tower save keeps safe links, boxes, and overrides in range', () => {
  const out = cleanControlTower({ jdas: { jda1: {
    agreement: [{ label: 'Signed JDA', url: 'https://drive.example/x' }, { label: 'Bad', url: 'javascript:alert(1)' }],
    keyInsights: [{ title: 'Fast', text: 'Yes', extra: 1 }], challenges: [{ title: 'C', severity: 'huge' }], progressOverride: 140, costOverride: { spent: 10, sanctioned: -1 } } } });
  const j = out.jdas.jda1;
  assert.deepEqual(j.agreement, [{ label: 'Signed JDA', url: 'https://drive.example/x' }, { label: 'Bad', url: '' }]);
  assert.deepEqual(j.keyInsights, [{ title: 'Fast', text: 'Yes' }]);
  assert.deepEqual(j.challenges, [{ title: 'C', text: '', severity: 'medium' }]);
  assert.deepEqual([j.progressOverride, j.costOverride], [null, null]);
  assert.equal(cleanControlTower({}).jdas.jda2.challenges, null);                      // not written: the report's own
});

test('saves are stamped, and one made after someone else\'s is refused unless forced', async () => {
  const store = siteStore('memory');
  const first = await savePage(store, 'public', { content: { overview: { title: 'One' } } }, 'aina', '2026-10-15T01:00:00Z');
  assert.deepEqual([first.updatedBy, first.updatedAt], ['aina', '2026-10-15T01:00:00Z']);
  await assert.rejects(savePage(store, 'public', { content: { overview: { title: 'Two' } }, base: '' }, 'badrul'), e => e.status === 409 && /aina saved this page/.test(e.message));
  await savePage(store, 'public', { content: { overview: { title: 'Two' } }, base: '2026-10-15T01:00:00Z' }, 'badrul');
  await savePage(store, 'public', { content: { overview: { title: 'Three' } }, force: true }, 'aina');
  assert.equal((await editablePublic(store)).content.overview.title, 'Three');
  const site = await publicSite(store);
  assert.equal(site.overview.title, 'Three');
  assert.doesNotMatch(JSON.stringify(site), /aina|badrul|updatedAt/);                    // who saved is never published
  await assert.rejects(savePage(store, 'secrets', {}), e => e.status === 404);
  const fresh = await editablePublic(siteStore('memory'));                              // edit mode starts from what the public sees
  assert.deepEqual(fresh.content.jdas.jda1.programLeads, [{ name: 'Name TBC', title: 'Title TBC' }]);
});

test('the Control Tower save is what the Control Tower reads back', async () => {
  const store = siteStore('memory');
  await savePage(store, 'controlTower', { content: { jdas: { jda2: { keyInsights: [{ title: 'K', text: 'T' }], progressOverride: 55, costOverride: { spent: 5, sanctioned: 10 } } } } }, 'aina');
  const back = await controlTowerContent(store);
  assert.deepEqual([back.jdas.jda2.keyInsights, back.jdas.jda2.progressOverride, back.jdas.jda2.costOverride, back.updatedBy], [[{ title: 'K', text: 'T' }], 55, { spent: 5, sanctioned: 10 }, 'aina']);
});

test('the Roles picture must be a JPEG, PNG or WebP, waits for Save, and keeps the one before', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roles-')) + path.sep, pending = fs.mkdtempSync(path.join(os.tmpdir(), 'pending-')) + path.sep;
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(20)]).toString('base64');
  const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20)]).toString('base64');
  assert.deepEqual(saveRolesImage(png, pending), { pending: true, kind: 'png' });
  assert.deepEqual(fs.readdirSync(dir), []);                                            // nothing public until saved
  assert.match(publishRolesImage(dir, pending), /^\/public\/assets\/roles\.png\?v=\d+$/);
  saveRolesImage(jpg, pending); discardRolesImage(pending);                             // Cancel
  assert.deepEqual([fs.readdirSync(dir), fs.readdirSync(pending)], [['roles.png'], []]);
  saveRolesImage(jpg, pending); publishRolesImage(dir, pending);
  assert.deepEqual(fs.readdirSync(dir).sort(), ['roles-previous.png', 'roles.jpg']);       // the one before is kept
  assert.throws(() => saveRolesImage(Buffer.from('<svg onload=alert(1)>').toString('base64'), pending), e => e.status === 415);
  assert.throws(() => saveRolesImage('', pending), e => e.status === 400);
});

test('document links: https only, and capped in length', () => {
  const j = cleanControlTower({ jdas: { jda1: { brd: [{ label: 'x'.repeat(5000), url: 'http://plain.example/brd' }, { label: 'ok', url: `https://drive.example/${'a'.repeat(5000)}` }] } } }).jdas.jda1;
  assert.equal(j.brd[0].label.length, 300);
  assert.equal(j.brd[0].url, '');
  assert.equal(j.brd[1].url.length, 2000);
});

test('a save keeps the version before it, and only force === true overwrites', async () => {
  const store = siteStore('memory');
  await savePage(store, 'controlTower', { content: { jdas: { jda1: { keyInsights: [{ title: 'One', text: '' }] } } } }, 'aina', '2026-10-15T01:00:00Z');
  await assert.rejects(savePage(store, 'controlTower', { content: {}, force: 'false' }, 'badrul'), e => e.status === 409);
  await savePage(store, 'controlTower', { content: {}, base: '2026-10-15T01:00:00Z' }, 'badrul', '2026-10-15T02:00:00Z');
  const now = await store.get('controlTower');
  assert.deepEqual([now.previous.updatedBy, now.previous.jdas.jda1.keyInsights[0].title, 'previous' in now.previous], ['aina', 'One', false]);
});
