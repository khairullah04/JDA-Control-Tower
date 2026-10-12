// node --test portal-pages.test.mjs
// The portal's page logic that can be run without a browser: how a solution's detail page is laid
// out and cleaned, and how a saved Master Page combines with a JDA's built-in content.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><body></body>');
Object.assign(globalThis, { document: dom.window.document, Node: dom.window.Node }); // what blocks.js expects of a page
const { layout, placeStyle, cleanBlocks, cleanHtml, blocksFromBoxes } = await import('../../portal/js/blocks.js');
const { contentFromOverview, overviewFromContent, boxesOf, blocksOf, logoFor } = await import('../../portal/js/overview.js');
const { contentFor } = await import('../../portal/js/config/jda-content.js');

test('layout: full-width blocks stack; columned neighbours share a band', () => {
  const b = (col) => ({ id: 'x', type: 'body', html: 'x', ...(col && { col }) });
  assert.deepEqual(layout([b(), b(1), b(2), b(1), b()]), [
    { start: 1, span: 6, row: 1 },
    { start: 1, span: 3, row: 2 }, { start: 4, span: 3, row: 2 }, { start: 1, span: 3, row: 3 },   // two columns are halves; column 1 stacks
    { start: 1, span: 6, row: 4 }
  ]);
  assert.deepEqual(layout([b(1), b(2), b(3)]).map(p => [p.start, p.span, p.row]), [[1, 2, 1], [3, 2, 1], [5, 2, 1]]); // three are thirds
  assert.deepEqual(layout([b(7)]), [{ start: 1, span: 6, row: 1 }]);                                    // an unknown column is full width
  assert.equal(placeStyle({ start: 4, span: 3, row: 2 }), '--blk-col:4 / span 3;--blk-row:2');
});

test('cleanBlocks: only the allowed formatting is stored, and empty blocks are dropped', () => {
  const out = cleanBlocks([
    { id: 'a', type: 'body', html: '<p>Hello <script>alert(1)</script><b onclick="x()">bold</b> <a href="javascript:alert(1)">bad</a> <a href="https://ok.test/x">good</a></p>' },
    { id: 'b', type: 'h2', html: '  <br> ' },
    { id: 'c', type: 'marquee', html: 'text', col: 2 },
    { id: 'd', type: 'boxes', items: [{ title: ' One ', text: '' }, { title: '', text: '' }], col: 9 },
    { id: 'e', type: 'boxes', items: [{ title: '', text: ' ' }] }
  ]);
  assert.deepEqual(out, [
    { id: 'a', type: 'body', html: 'Hello <b>bold</b> bad <a href="https://ok.test/x" target="_blank" rel="noopener">good</a>' },
    { id: 'c', type: 'body', html: 'text', col: 2 },
    { id: 'd', type: 'boxes', items: [{ title: 'One', text: '' }] }
  ]);
  assert.equal(cleanHtml('<ul><li>a</li><li>b</li></ul>', { lists: false }), 'a<br>b');
});

test('a detail page saved before blocks existed is shown as blocks', () => {
  const old = { vision: 'Why', scope: ['one', 'two'], targets: [], lead: 'IBM' };
  assert.deepEqual(boxesOf(old), [{ title: 'Vision', body: 'Why' }, { title: 'Scope', body: 'one\ntwo' }, { title: 'Delivery lead', body: 'IBM' }]);
  assert.deepEqual(blocksOf(old).map(b => [b.type, b.html]), [['h3', 'Vision'], ['body', 'Why'], ['h3', 'Scope'], ['body', '<ul><li>one</li><li>two</li></ul>'], ['h3', 'Delivery lead'], ['body', 'IBM']]);
  assert.deepEqual(blocksOf({ blocks: [{ id: 'k', type: 'body', html: 'kept' }] }), [{ id: 'k', type: 'body', html: 'kept' }]);
  assert.deepEqual(blocksFromBoxes([{ title: '', body: '' }]), []);
});

const jda = { id: 'jda1', name: 'JDA 1' }, base = contentFor(jda);
const saved = () => ({
  complete: true, eyebrow: 'E', tagline: 'T', summary: 'S', more: 'M',
  intros: { aspiration: 'ia', architecture: 'ib', collaborators: 'ic', press: 'ip', solutions: 'The solution portfolio being delivered.' },
  aspiration: [{ value: '90%', label: 'Uptime', highlight: true }],
  solutionGroups: [{ label: 'Group', solutions: [{ title: 'Sol', tier: 'Tier 1', art: 'gai', tags: [{ text: 't', accent: true }], blocks: [{ id: 'b1', type: 'body', html: 'x' }] }] }],
  collaborators: [{ name: 'IBM Malaysia', role: 'r', text: 't', more: '', logo: 'assets/ibm-logo.jpg' }],
  press: { text: 'p', more: '', url: 'https://x.test/a', linkText: 'Read', img: '' },
  sectionOrder: ['press', 'aspiration', 'project', 'architecture', 'collaborators', 'x:x1'],
  extraSections: [{ id: 'x1', title: 'Extra', intro: 'i', cards: [{ title: 'c', sub: 's', text: 't' }] }]
});

test('Master Page: nothing saved shows the built-in content, sections in the built-in order', () => {
  const c = contentFromOverview(null, base);
  assert.deepEqual([c.short, c.aspiration, c.solutionGroups, c.press, c.extraSections], ['JDA 1', [], [], null, []]);
  assert.deepEqual(c.sectionOrder, ['aspiration', 'project', 'architecture', 'collaborators', 'press']);
});

test('Master Page: what the Editor Page saves comes back exactly as it was saved', () => {
  const c = contentFromOverview(saved(), base);
  assert.deepEqual([c.eyebrow, c.tagline, c.sub, c.more, c.aspirationIntro, c.pressIntro], ['E', 'T', 'S', 'M', 'ia', 'ip']);
  assert.deepEqual(c.solutionGroups, [{ label: 'Group', cards: [{ key: 's0-0', tags: [['t', true]] }] }]);
  assert.equal(c.solutions['s0-0'].img, 'assets/sol-gai.jpg');
  assert.deepEqual(overviewFromContent(c), saved());                                                    // the round trip loses nothing
});

test('Master Page: a partial save (from Drive) keeps the built-in value wherever it says nothing', () => {
  const jda3 = contentFor({ id: 'jda3', name: 'JDA 3' });
  const c = contentFromOverview({ tagline: 'New tagline', summary: '', aspiration: [], collaborators: [{ name: 'Tridiagonal.ai', role: 'r', text: 't' }], press: { text: 'P', url: 'javascript:alert(1)' }, sectionOrder: ['press', 'nonsense'] }, jda3);
  assert.equal(c.tagline, 'New tagline');
  assert.equal(c.sub, jda3.sub);                                                                        // empty summary: built-in kept
  assert.equal(c.aspiration, jda3.aspiration);
  assert.equal(c.collaborators[0].logo, 'assets/tridiagonal-logo-cropped.png');                         // logo found from the name
  assert.deepEqual([c.press.href, c.press.linkText, c.press.img], ['', 'Read the full release →', jda3.press.img]); // an unsafe link is dropped
  assert.deepEqual(c.sectionOrder, ['press', 'aspiration', 'project', 'architecture', 'collaborators']);
  assert.equal(logoFor('Somebody Else'), '');
});

test('Master Page: an emptied part stays empty once the editor has saved it', () => {
  const jda3 = contentFor({ id: 'jda3', name: 'JDA 3' });
  const c = contentFromOverview({ ...saved(), aspiration: [], press: null, solutionGroups: [] }, jda3);
  assert.deepEqual([c.aspiration, c.press, c.solutionGroups], [[], null, []]);
});

const { withProjectIds, linkTasks, tasksOf, projectOf } = await import('../../portal/js/progress.js');

test('progress: a task stays with its project through a rename, and is never matched on an empty name', () => {
  let projects = withProjectIds([{ name: 'Alpha' }, { name: '' }, { name: 'Beta', id: 'b1' }]);
  assert.ok(projects.every(p => p.id) && new Set(projects.map(p => p.id)).size === 3);
  let tasks = linkTasks([{ task: 'one', project: 'Alpha' }, { task: 'two', project: '' }, { task: 'three', project: 'Gone' }, { task: 'four', project: 'Beta' }], projects);
  assert.deepEqual(tasks.map(t => [t.task, t.project, t.projectId]), [['one', 'Alpha', projects[0].id], ['two', '', undefined], ['three', 'Gone', undefined], ['four', 'Beta', 'b1']]);

  projects[1] = { ...projects[1], name: 'N' };                                         // the unnamed project gets its first letter
  assert.deepEqual(tasksOf(projects[1], tasks, projects), []);                         // the unlinked task is NOT swept into it
  projects[0] = { ...projects[0], name: 'Alpha renamed' };
  tasks = linkTasks(tasks, projects);
  assert.deepEqual(tasks.map(t => [t.task, t.project]), [['one', 'Alpha renamed'], ['two', ''], ['three', 'Gone'], ['four', 'Beta']]);
  assert.deepEqual(tasksOf(projects[0], tasks, projects).map(t => t.task), ['one']);

  projects = projects.filter(p => p.id !== 'b1');                                      // Beta is deleted
  tasks = linkTasks(tasks, projects);
  assert.deepEqual([tasks[3].project, 'projectId' in tasks[3]], ['Beta', false]);      // its task keeps the name as text and no link
  assert.equal(projectOf(tasks[3], projects), null);
});

test('progress: projects arriving without ids (Drive, the feed) keep the ids they had', () => {
  const before = withProjectIds([{ name: 'Alpha' }, { name: 'Beta' }]);
  const after = withProjectIds([{ name: 'Beta', pct: 50 }, { name: 'New' }, { name: 'Alpha' }], before);
  assert.deepEqual([after[0].id, after[2].id], [before[1].id, before[0].id]);
  assert.ok(after[1].id && ![before[0].id, before[1].id].includes(after[1].id));
  const twins = withProjectIds([{ name: 'Same' }, { name: 'Same' }], withProjectIds([{ name: 'Same' }]));
  assert.notEqual(twins[0].id, twins[1].id);                                           // two with one name never share an id
  // a task saved by name only (an older report) still finds its project
  assert.deepEqual(tasksOf(after[0], [{ task: 't', project: 'Beta' }, { task: 'u', project: '' }], after).map(t => t.task), ['t']);
});

test('Master Page: a saved overview with parts missing or of the wrong kind still draws', () => {
  const base = contentFor('jda1');
  const broken = contentFromOverview({ complete: true, solutionGroups: [{ label: 'A' }, { label: 'B', solutions: [{ title: 'No tags' }, { title: 'Bad tags', tags: 'x' }] }, null],
    aspiration: 'not a list', collaborators: { name: 'not a list' }, extraSections: [{ title: 'No cards' }, null, { id: 'k', cards: 'x' }], sectionOrder: 'x', press: { text: 'p' } }, base);
  assert.deepEqual(broken.solutionGroups.map(g => [g.label, g.cards.map(c => c.tags)]), [['A', []], ['B', [[], []]], ['', []]]);
  assert.deepEqual([broken.aspiration, broken.collaborators], [[], []]);
  assert.deepEqual(broken.extraSections.map(s => [s.id, s.title, s.cards]), [['s0', 'No cards', []], ['s1', '', []], ['k', '', []]]);
  assert.deepEqual(broken.sectionOrder.slice(0, 5), ['aspiration', 'project', 'architecture', 'collaborators', 'press']);
  assert.doesNotThrow(() => overviewFromContent(broken));
  const partial = contentFromOverview({ solutionGroups: 'x', aspiration: 7, collaborators: 'x' }, base);                 // not marked complete: the built-in content stands
  assert.deepEqual([partial.solutionGroups, partial.aspiration, partial.collaborators], [base.solutionGroups, base.aspiration, base.collaborators]);
});

test('cleanHtml: what is typed or pasted into a block cannot carry script, style or a dangerous link', () => {
  const clean = (html, opts) => cleanHtml(html, opts);
  assert.equal(clean('<img src=x onerror="alert(1)">text'), 'text');
  assert.equal(clean('<svg onload="alert(1)"><circle/></svg>a<iframe src="https://evil.test"></iframe>b'), 'ab');
  assert.equal(clean('<style>body{display:none}</style><script>alert(1)</script>kept'), 'kept');
  assert.equal(clean('<b style="position:fixed" class="x" id="y" onmouseover="x()">bold</b>'), '<b>bold</b>');
  assert.equal(clean('<a href="JaVaScRiPt:alert(1)">a</a><a href=" javascript:alert(1)">b</a><a href="data:text/html,x">c</a><a href="//evil.test">d</a>'), 'abcd');
  assert.equal(clean('<a href="https://ok.test/?q=1&r=2" onclick="x()" target="_self">ok</a>'), '<a href="https://ok.test/?q=1&amp;r=2" target="_blank" rel="noopener">ok</a>');
  assert.equal(clean('<a href="mailto:a@b.test">mail</a>'), '<a href="mailto:a@b.test" target="_blank" rel="noopener">mail</a>');   // http, https and mailto are the only links kept
  assert.equal(clean('&lt;script&gt;alert(1)&lt;/script&gt;'), '&lt;script&gt;alert(1)&lt;/script&gt;');   // text that looks like a tag stays text
  assert.equal(clean('<div><p>one</p><p>two</p></div>'), 'one<br>two');
  assert.equal(clean('<h1>Head</h1><table><tr><td>cell</td></tr></table>'), 'Head<br>cell');
  assert.equal(clean('<ul><li><i>a</i></li><li>b<script>x</script></li></ul>'), '<ul><li><i>a</i></li><li>b</li></ul>');
  assert.deepEqual(cleanBlocks([{ id: 'a', type: 'body', html: '  <br> &nbsp; ' }]), []);            // a block with nothing but space in it is dropped when saved
  const twice = clean(clean('<b><a href="https://ok.test">x</a></b><img src=x onerror=1>'));
  assert.equal(twice, '<b><a href="https://ok.test" target="_blank" rel="noopener">x</a></b>');     // cleaning what is already clean changes nothing
});
