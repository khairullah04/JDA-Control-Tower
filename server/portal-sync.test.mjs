// node --experimental-test-module-mocks --test portal-sync.test.mjs
// Checks how a JDA's Drive files are assembled into its report, with Drive and Claude stubbed out.
import { test } from 'node:test';
import { mockModule } from './test-mocks.mjs';
import assert from 'node:assert/strict';

const file = (id, name, modifiedTime) => ({ id, name, modifiedTime, mimeType: 'text/plain' });
const drive = {
  master: [file('m1', 'About JDA Z.docx', '2026-09-01T00:00:00Z')],
  overall: [file('o1', 'Overall.xlsx', '2026-09-10T00:00:00Z'), file('o2', 'broken.pptx', '2026-09-11T00:00:00Z')],
  weekly: [file('w2', 'Week 2.pdf', '2026-09-20T00:00:00Z'), file('w1', 'Week 1.pdf', '2026-09-13T00:00:00Z')],
  ignored: [file('x1', 'stray.txt', '2026-09-01T00:00:00Z')]
};
const replies = {
  master: { eyebrow: 'Programme · Ninth agreement', tagline: 'Test tagline', summary: 'S', more: null,
    aspiration: [{ value: '90%', label: 'Uptime', highlight: true }, { value: '', label: 'dropped' }],
    solutionGroups: [{ label: 'Tier 1', solutions: [{ title: 'Sol A', tier: 'Nonsense', art: 'not-a-key', tags: [{ text: 'T', accent: true }], vision: 'V', scope: ['a'], targets: [], lead: null }] }],
    collaborators: [{ name: 'IBM Malaysia', role: 'R', text: 'T', more: null }], press: { text: 'P', url: 'javascript:alert(1)' } },
  overall: { overallStatus: 'amber', projects: [{ name: 'Alpha', owner: 'A', pct: 40, status: 'green', description: 'd', taiPct: 55, ibmPct: null }, { name: 'Beta', owner: 'B', pct: '250', status: 'purple', description: '' }],
    challenges: [{ severity: 'high', title: 'C1', description: 'd', mitigation: 'm' }],
    scurve: { startMonth: '2026-07', months: ['Jul', 'Aug'], planned: [5, 10], actual: [4, null] } },
  w1: { weekLabel: 'Week 1', weekDate: '2026-09-07', tasks: [{ task: 'old task', project: 'Alpha', owner: 'x', due: '2026-09-09', status: 'Done' }],
    updates: [{ date: '2026-09-08', text: 'First' }], projectProgress: [{ name: 'Alpha', pct: 41, status: null }] },
  w2: { weekLabel: 'Week 2', weekDate: '2026-09-14', tasks: [{ task: 'new task', project: 'Not a project', owner: 'y', due: 'soon', status: 'Blocked' },
    { task: 'rich task', project: 'Alpha', owner: 'z', due: '2026-09-20', status: 'In progress', description: 'Why', priority: 'High', start: '2026-09-01', progress: 140, checklist: [{ text: 'a', done: true }, { text: '' }], notes: 'Waiting on IT', priority2: 'x' }],
    updates: [{ date: '2026-09-15', text: 'Second' }, { date: '2026-09-08', text: 'First' }], projectProgress: [{ name: 'Alpha', pct: 48, status: 'amber' }, { name: 'Ghost', pct: 99 }] }
};
let calls = 0;

mockModule('./portal-drive.js', {
  listJdaFiles: async jda => jda.id === 'jdaz' ? drive : null,
  fileBlocks: async f => { if (f.name.endsWith('.pptx')) throw new Error('unsupported file type'); return [{ type: 'text', text: `FILE ${f.id}` }]; }
});
mockModule('./claude.js', {
  ask: async ({ system, messages }) => {
    calls++;
    const ids = messages[0].content.map(b => b.text).join(' ');
    const key = system.includes('Master File') ? 'master' : system.includes('Overall Progress') ? 'overall' : ids.includes('FILE w1') ? 'w1' : 'w2';
    return 'Here you go: ' + JSON.stringify(replies[key]);
  },
  parseJson: text => JSON.parse(text.match(/\{[\s\S]*\}/)[0])
});
mockModule('node:fs', { default: { readFileSync: () => { throw new Error('no cache'); }, writeFileSync: () => {} } });

const { syncJda } = await import('./portal-sync.js');

const JDAZ = { id: 'jdaz', name: 'JDA Z' };
test('unknown JDA folder', async () => assert.deepEqual(await syncJda({ id: 'jda1', name: 'JDA 1' }, { scope: 'master' }), { found: false }));

test('master scope reads only the Master File folder', async () => {
  const before = calls;
  const { patch, counts } = await syncJda(JDAZ, { scope: 'master' });
  assert.deepEqual(Object.keys(patch), ['overview']);
  assert.deepEqual(counts, { master: 1, overall: 0, weekly: 0 });
  assert.equal(calls, before + 1);

  // home page: cleaned, bad enums and unsafe links dropped
  assert.equal(patch.overview.tagline, 'Test tagline');
  assert.equal(patch.overview.aspiration.length, 1);
  assert.equal(patch.overview.solutionGroups[0].solutions[0].tier, 'Tier 1');
  assert.equal(patch.overview.solutionGroups[0].solutions[0].art, null);
  assert.equal(patch.overview.press.url, '');
});

test('progress scope assembles overall and weekly, and leaves the home page alone', async () => {
  const { found, patch, counts, skipped } = await syncJda(JDAZ, { scope: 'progress' });
  assert.equal(found, true);
  assert.deepEqual(counts, { master: 0, overall: 1, weekly: 2 });
  assert.equal('overview' in patch, false);

  // overall: values clamped and defaulted; the latest weekly report (newer than the overall file) overrides percent complete
  assert.equal(patch.overallStatus, 'amber');
  assert.deepEqual(patch.projects.map(p => [p.name, p.pct, p.status]), [['Alpha', 48, 'amber'], ['Beta', 100, 'green']]);
  assert.equal(patch.projects[0].taiPct, 55);
  assert.equal('ibmPct' in patch.projects[0], false);
  assert.deepEqual(patch.scurve.actual, [4, null]);
  assert.equal(patch.challenges.length, 1);

  // weekly: latest week by date wins the label and tasks; updates accumulate, deduplicated, newest first
  assert.equal(patch.weekLabel, 'Week 2');
  const blank = { description: '', priority: '', start: '', completed: '', progress: null, checklist: [], notes: '' };
  assert.deepEqual(patch.tasks, [{ task: 'new task', project: '', owner: 'y', due: '', status: 'Not started', ...blank },
    { task: 'rich task', project: 'Alpha', owner: 'z', due: '2026-09-20', status: 'In progress', ...blank, description: 'Why', priority: 'High', start: '2026-09-01', progress: 100, checklist: [{ text: 'a', done: true }], notes: 'Waiting on IT' }]);
  assert.deepEqual(patch.updates, [{ date: '2026-09-15', text: 'Second' }, { date: '2026-09-08', text: 'First' }]);

  assert.deepEqual(skipped.sort(), ['broken.pptx: unsupported file type', 'stray.txt: not inside a Master File, Overall Progress or Weekly Progress folder'].sort());
  assert.equal(patch.driveSync.weekly, 2);
});

test('unchanged files are served from the cache, not sent to Claude again', async () => {
  const before = calls;
  await syncJda(JDAZ, { scope: 'master' });
  await syncJda(JDAZ, { scope: 'progress' });
  assert.equal(calls, before);
});
