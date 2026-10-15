// node --experimental-test-module-mocks --test site-content.test.mjs
// What the public pages are given: only what may be shown, written values over derived ones, and
// nothing from a report's progress, people or figures. The reports are stand-ins.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mockModule } from './test-mocks.mjs';

const reports = {
  jda1: {
    weekLabel: 'Week 9', overallStatus: 'amber',
    projects: [{ name: 'Seismic Copilot', owner: 'Secret Owner', pct: 42, status: 'green', description: 'internal' }, { name: ' Well Advisor ', owner: 'X', pct: 7 }, { name: '' }],
    tasks: [{ task: 'Confidential task', owner: 'Someone', due: '2026-10-01', status: 'In progress' }],
    updates: [{ date: '2026-10-10', text: 'Internal update' }],
    challenges: [{ severity: 'high', title: 'Budget overrun', description: 'MYR 2m over', mitigation: 'x' }],
    scurve: { months: ['Jan'], planned: [1], actual: [1] },
    overviewBackup: { secret: true },
    overview: {
      complete: true, eyebrow: 'TriCipta AI · First JDA', tagline: 'Geoscience Companion', summary: 'About JDA 1', more: '',
      intros: { aspiration: 'Aim', solutions: '<b>Solutions</b> intro', collaborators: 'Who', press: 'News' },
      aspiration: [{ value: '30%', label: 'faster', highlight: true }],
      solutionGroups: [{ label: 'Tier 1', solutions: [
        { title: 'Seismic AI', tier: 'Tier 1', art: 'vision', tags: [{ text: 'Data', accent: true }], blocks: [{ id: 'a', type: 'body', html: 'Hello <b>world</b>' }, { type: 'script', html: 'x' }] },
        { title: 'Odd art', tier: 'Other', art: '../../etc/passwd', tags: [], blocks: [] }
      ] }],
      collaborators: [{ name: 'IBM Malaysia', role: 'Partner', text: 'Builds it', more: '', logo: 'assets/ibm-logo.jpg' }, { name: 'Evil', logo: 'javascript:alert(1)' }, { name: 'Up', logo: 'assets/../../jda/server/.env' }],
      press: { text: 'Signed on 1 July.', more: 'More', url: 'javascript:alert(1)', linkText: 'Read', img: 'kai' },
      sectionOrder: ['press', 'architecture', 'aspiration'], extraSections: []
    }
  },
  jda2: null,
  jda3: { projects: [{ name: 'Project 2a', pct: 15, owner: 'Hj Azrul' }] }
};
mockModule('./report-reader.js', { readReport: async jda => structuredClone(reports[jda.id] ?? null) });
const { publicSite, infoPage, PUBLIC_DEFAULTS, withDefaults } = await import('./site-content.js');
const { siteStore } = await import('./site-store.js');
const { JDAS } = await import('../../portal/js/config/app-config.js');

const PRIVATE = /Secret Owner|Confidential task|Internal update|Budget overrun|MYR 2m|overviewBackup|"secret"|"pct"|"owner"|"tasks"|"updates"|"challenges"|"scurve"|weekLabel|overallStatus|"description":"internal"|Hj Azrul/;

test('the landing page: defaults, every JDA from the config, derived values marked', async () => {
  const site = await publicSite(siteStore('memory'));
  assert.equal(site.header.title, 'TRICIPTA AI');
  assert.deepEqual(site.jdas.map(j => j.id), JDAS.map(j => j.id));
  const [j1, j2, j3] = site.jdas;
  assert.deepEqual([j1.title, j1.pressRelease, j1.projects, j1.projectCount, j1.status], ['Geoscience Companion', 'Signed on 1 July.', ['Seismic Copilot', 'Well Advisor'], 2, 'in-progress']);
  assert.deepEqual(j1.derived, { title: true, pressRelease: true, projects: true, status: true, projectCount: true });
  assert.deepEqual([j2.projects, j2.projectCount, j2.status], [[], 0, 'in-the-works']);   // no report yet
  assert.equal(j3.title, 'Surface Equipment Optimisation with AI');                       // JDA 3's built-in tagline
  assert.deepEqual(j1.programLeads, [{ name: 'Name TBC', title: 'Title TBC' }]);
  assert.equal(j1.businessChampions.length, 2);
  assert.equal(site.roles.image, null);                                                   // no picture supplied yet
  assert.doesNotMatch(JSON.stringify(site), PRIVATE);
});

test('what is written in edit mode wins over what is derived', async () => {
  const store = siteStore('memory');
  await store.put('public', { header: { title: 'TRICIPTA AI' }, overview: { body: 'New body' }, contacts: { email: 'a@b.c' },
    jdas: { jda1: { title: 'My title', status: 'finished', projects: ['Only one'], projectCount: 5, programLeads: [{ name: 'Aina', title: 'Lead', extra: 'dropped' }] } } });
  const site = await publicSite(store);
  assert.equal(site.overview.body, 'New body');
  assert.equal(site.overview.title, PUBLIC_DEFAULTS.overview.title);                     // fields not written keep their default
  assert.equal(site.contacts.phone, PUBLIC_DEFAULTS.contacts.phone);
  const j1 = site.jdas[0];
  assert.deepEqual([j1.title, j1.status, j1.projects, j1.projectCount], ['My title', 'finished', ['Only one'], 5]);
  assert.deepEqual(j1.derived, { title: false, pressRelease: true, projects: false, status: false, projectCount: false });
  assert.deepEqual(j1.programLeads, [{ name: 'Aina', title: 'Lead' }]);
});

test('withDefaults keeps a written section whole and fills what is missing', () => {
  assert.deepEqual(withDefaults({ a: { x: 2 }, b: [1] }, { a: { x: 1, y: 1 }, b: [], c: 3 }), { a: { x: 2, y: 1 }, b: [1], c: 3 });
  assert.deepEqual(withDefaults('nonsense', { a: 1 }), { a: 1 });
});

test('the Info page: the Master Page only, with pictures and links checked', async () => {
  const info = await infoPage(JDAS[0]);
  assert.doesNotMatch(JSON.stringify(info), PRIVATE);
  assert.deepEqual([info.short, info.tagline, info.sub], ['JDA 1', 'Geoscience Companion', 'About JDA 1']);
  assert.equal(info.solutionsIntro, '<b>Solutions</b> intro');                            // sent as text; the page escapes it
  assert.deepEqual(info.sectionOrder.includes('architecture'), false);                   // the architecture diagram is not published
  const [seismic, odd] = info.solutionGroups[0].cards;
  assert.equal(seismic.img, '/site/portal/assets/sol-vision.jpg');
  assert.deepEqual(seismic.blocks.map(b => b.type), ['body', 'body']);                    // an unknown block type is drawn as text
  assert.equal(odd.img, '');                                                              // not one of the stock pictures
  assert.equal(odd.tier, 'Competitive Edge');
  assert.deepEqual(info.collaborators.map(c => c.logo), ['/site/portal/assets/ibm-logo.jpg', '', '']);
  assert.deepEqual([info.press.href, info.press.img], ['', '']);                          // javascript: link and "kai" dropped
});

test('a JDA with no report gets its built-in Master Page, without targets or delivery leads', async () => {
  const info = await infoPage(JDAS[2]);
  assert.equal(info.tagline, 'Surface Equipment Optimisation with AI');
  const cards = info.solutionGroups.flatMap(g => g.cards);
  assert.ok(cards.length >= 9);
  const text = JSON.stringify(cards);
  assert.doesNotMatch(text, /≥50% improvement|Delivery lead|IBM Malaysia leads BPW/);
  assert.match(text, /Vision/);
  assert.ok(info.collaborators.every(c => c.logo.startsWith('/site/portal/assets/')));
  assert.equal(info.press.img, '/site/portal/assets/press.jpg');
  assert.match(info.press.href, /^https:\/\/www\.petronas\.com\//);
});
