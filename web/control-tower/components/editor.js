// Edit mode, in place, for one of two things: a JDA's Master Page (`mode: 'master'`, on its public Info
// page, drawn by master-edit.js) or its Overall and Weekly progress (`mode: 'progress'`, on its private
// pages, drawn by report.js). Every piece of text is editable where it stands, with controls to add or
// remove blocks. Edits live in a draft (the Master Page's `overview`, or the progress fields) until
// "Save changes"; "Update from Google Drive" loads the Drive folders into that draft.
import { setupBlockEditor } from './block-editor.js';
import { starterBlocks, cleanBlocks } from '../../shared/components/blocks.js';
import { withProjectIds, linkTasks, newId, normalizeTask, normalizeTasks, stampTasks, mergeTasks, PRIORITIES } from '../../shared/lib/progress.js';
import { esc } from '../../shared/lib/esc.js';

const $ = id => document.getElementById(id);
const newSolution = () => ({ title: '', tier: 'Tier 1', art: null, tags: [], blocks: starterBlocks() });
const NEW_PRESS = { text: '', more: '', url: '', linkText: 'Read the full release →', img: '' };

export function startEditor({ mode, jda, api, leave, logoFor, blocksOf, showScreen, iconFor, artKeys, draft, sectionOrder, show, save, progress, showProgress, saveProgress, statusLabel, taskStatuses, today, openTask }){
  const master = mode === 'master', prog = mode === 'progress';
  let d = draft, p = progress, savedTasks = [];
  if (prog) {
    // Tasks are tied to their project by its id, not its name (progress.js), so a rename keeps them together.
    p.projects = withProjectIds(p.projects); p.tasks = linkTasks(normalizeTasks(p.tasks), p.projects);
    savedTasks = JSON.parse(JSON.stringify(p.tasks)); // as last saved: what changed since gets today as its last-updated date
  }
  const dirty = { master: false, progress: false };
  let part = 'master'; // which draft the controls being built right now belong to
  const openDescriptions = new Set(); // likewise for project descriptions

  /* ---------- small builders ---------- */
  function touched(which = 'master'){
    dirty[which] = true;
    $('editorSaveBtn').disabled = false;
    $('editorSaveStatus').textContent = 'Unsaved changes';
  }
  const change = fn => () => { fn(); touched(); show(d); }; // a structural edit: redraw the page from the draft
  const redrawProgress = () => { showProgress(p); decorateProgress(); };
  const changeP = fn => () => { fn(); touched('progress'); redrawProgress(); };

  // Makes one rendered element editable. The page is not redrawn while typing; only the draft is updated.
  function text(el, set, placeholder){
    if (!el) return;
    el._set = set;
    el.dataset.ph = placeholder;
    if (el._editable) return;
    el._editable = true;
    const which = part;
    try { el.contentEditable = 'plaintext-only'; } catch { el.contentEditable = 'true'; }
    el.classList.add('ed-text');
    el.addEventListener('input', () => {
      const value = el.textContent.replace(/\s+/g, ' ').trim();
      if (!value) el.textContent = ''; // so the placeholder shows again
      el._set(value); touched(which);
    });
    el.addEventListener('keydown', e => { if (e.key === 'Enter'){ e.preventDefault(); el.blur(); } });
    el.addEventListener('paste', e => {
      e.preventDefault();
      document.execCommand('insertText', false, e.clipboardData.getData('text/plain').replace(/\s+/g, ' '));
    });
  }
  function button(label, onClick, cls = ''){
    const b = document.createElement('button');
    b.type = 'button'; b.className = `ed-btn ${cls}`; b.textContent = label; b.onclick = onClick;
    return b;
  }
  function bar(...children){
    const el = document.createElement('div');
    el.className = 'ed-bar'; el.append(...children);
    return el;
  }
  function field(label, value, set, { area = false, hint = '' } = {}){
    const wrap = document.createElement('div');
    wrap.innerHTML = `<label>${esc(label)}</label>${area ? '<textarea></textarea>' : '<input>'}`;
    const input = wrap.lastChild, which = part;
    input.value = value; input.placeholder = hint;
    input.addEventListener('input', () => { set(input.value); touched(which); });
    return wrap;
  }
  // A link field redraws the page when you leave it, so the picture or link it names appears.
  function linkField(label, value, set, hint){
    const wrap = field(label, value, set, { hint });
    wrap.lastChild.addEventListener('change', () => show(d));
    return wrap;
  }
  // A picture (a collaborator's logo, the press release picture), uploaded like the landing page's: the
  // file is checked and stored by the server at once, shows on the page now, and goes public with Save.
  function uploadField(label, value, set){
    const wrap = document.createElement('div');
    wrap.className = 'ed-upload';
    const file = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/jpeg,image/png,image/webp' });
    file.setAttribute('aria-label', `${label}: choose a picture`);
    const msg = Object.assign(document.createElement('p'), { className: 'ed-upload-msg', textContent: value ? 'JPEG, PNG or WebP, up to 8 MB. A new one replaces this.' : 'JPEG, PNG or WebP, up to 8 MB.' });
    msg.setAttribute('role', 'status');
    const remove = button(`Remove ${label.toLowerCase()}`, change(() => set('')), 'danger');
    remove.hidden = !value;
    file.onchange = async () => {
      const f = file.files[0];
      if (!f) return;
      if (f.size > 8 * 1024 * 1024) { msg.textContent = 'That picture is larger than 8 MB.'; return; }
      msg.textContent = 'Uploading…';
      try {
        const image = await new Promise((ok, fail) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = fail; r.readAsDataURL(f); });
        const { url } = await api('upload', { image });
        set(url); touched(); show(d); // the page is drawn again with the new picture; it goes public with Save changes
      } catch (e) { msg.textContent = `Not uploaded: ${e.message}`; }
    };
    wrap.append(Object.assign(document.createElement('label'), { textContent: label }), file, msg, remove);
    return wrap;
  }
  function tools(...children){
    const el = document.createElement('div');
    el.className = 'ed-tools'; el.append(...children);
    return el;
  }

  /* ---------- drag to reorder ---------- */
  // `el` gets a handle; dragging it onto another element of the same kind moves the item to that
  // spot (before or after, by which half the pointer is over). The handle also takes arrow keys.
  // `list`/`index` say where the item lives in the draft, so a drop can cross lists (solution groups).
  let dragging = null;
  function moveItem(fromList, from, toList, to){
    const [item] = fromList.splice(from, 1);
    if (fromList === toList && from < to) to--;
    toList.splice(Math.max(0, Math.min(to, toList.length)), 0, item);
    touched(); show(d);
  }
  // While something is being dragged, the page scrolls by itself when the pointer nears the top or
  // bottom of the window - faster the closer it gets - so a drop target off screen can be reached.
  const EDGE = 140, MAX_SPEED = 18, TICK_MS = 16; // px from the edge where scrolling starts; px per tick at the very edge
  let pointerY = null, scrollTimer = null;
  document.addEventListener('dragover', e => { if (dragging) pointerY = e.clientY; });
  function autoScroll(){
    if (!dragging){ clearInterval(scrollTimer); scrollTimer = null; pointerY = null; return; }
    if (pointerY === null) return;
    const fromBottom = window.innerHeight - pointerY;
    // 'instant': the page's smooth scrolling would otherwise fight a scroll issued every tick
    const by = top => window.scrollBy({ top, behavior: 'instant' });
    if (pointerY < EDGE) by(-Math.ceil(MAX_SPEED * (1 - Math.max(pointerY, 0) / EDGE)));
    else if (fromBottom < EDGE) by(Math.ceil(MAX_SPEED * (1 - Math.max(fromBottom, 0) / EDGE)));
  }
  const startAutoScroll = () => { scrollTimer ??= setInterval(autoScroll, TICK_MS); };
  const clearDropMarks = () => document.querySelectorAll('.ed-drop-before,.ed-drop-after,.ed-dragging').forEach(n => n.classList.remove('ed-drop-before', 'ed-drop-after', 'ed-dragging'));
  function sortable(el, kind, list, index, { axis = 'x', label = '' } = {}){
    el._sort = { list, index };
    if (el._sortable) return;
    el._sortable = true;
    el.dataset.axis = axis;
    const handle = document.createElement('div');
    handle.className = 'ed-handle'; handle.draggable = true; handle.tabIndex = 0;
    handle.setAttribute('role', 'button');
    handle.title = 'Drag to move. With the keyboard: arrow keys.';
    handle.setAttribute('aria-label', `Move ${label || kind}`);
    handle.textContent = label ? `⠿ ${label}` : '⠿';
    handle.addEventListener('dragstart', e => {
      dragging = { kind, ...el._sort };
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', kind);
      e.dataTransfer.setDragImage(el, 16, 16);
      el.classList.add('ed-dragging');
      startAutoScroll();
    });
    handle.addEventListener('dragend', () => { dragging = null; clearDropMarks(); });
    handle.addEventListener('keydown', e => {
      const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key];
      if (!step) return;
      e.preventDefault(); e.stopPropagation();
      const { list: l, index: i } = el._sort;
      if (i + step >= 0 && i + step < l.length) moveItem(l, i, l, step > 0 ? i + 2 : i - 1);
    });
    el.addEventListener('dragover', e => {
      if (!dragging || dragging.kind !== kind) return;
      e.preventDefault(); e.stopPropagation();
      const r = el.getBoundingClientRect();
      const after = axis === 'x' ? e.clientX > r.left + r.width / 2 : e.clientY > r.top + r.height / 2;
      el.classList.toggle('ed-drop-after', after); el.classList.toggle('ed-drop-before', !after);
    });
    el.addEventListener('dragleave', () => el.classList.remove('ed-drop-before', 'ed-drop-after'));
    el.addEventListener('drop', e => {
      if (!dragging || dragging.kind !== kind) return;
      e.preventDefault(); e.stopPropagation();
      const after = el.classList.contains('ed-drop-after'), from = dragging;
      dragging = null; clearDropMarks();
      moveItem(from.list, from.index, el._sort.list, el._sort.index + (after ? 1 : 0));
    });
    el.prepend(handle);
  }
  // An empty solution group still has to accept a card dragged from another group.
  function dropZone(el, kind, list){
    el.classList.add('ed-empty-drop');
    el.addEventListener('dragover', e => { if (dragging?.kind === kind){ e.preventDefault(); el.classList.add('ed-drop-after'); } });
    el.addEventListener('dragleave', () => el.classList.remove('ed-drop-after'));
    el.addEventListener('drop', e => {
      if (dragging?.kind !== kind) return;
      e.preventDefault();
      const from = dragging; dragging = null; clearDropMarks();
      moveItem(from.list, from.index, list, list.length);
    });
  }

  /* ---------- the page, section by section ---------- */
  function decorate(){
    // Whole sections move up and down the page; the order is part of the draft.
    d.sectionOrder = sectionOrder();
    d.sectionOrder.forEach((key, i) => {
      const block = key.startsWith('x:') ? document.querySelector(`#screen-overview > .extra-block[data-key="${CSS.escape(key)}"]`) : $('ov-' + key);
      if (block) sortable(block, 'section', d.sectionOrder, i, { axis: 'y', label: 'Move section' });
    });

    text($('heroEyebrow'), v => d.eyebrow = v, 'Line above the title');
    text($('heroTitle').querySelector('.hero-tagline'), v => d.tagline = v, 'Tagline');
    text($('heroSub'), v => d.summary = v, 'Summary sentence');
    text($('heroMoreText'), v => d.more = v, 'More detail (the Master Page shows this under “Read more”)');

    text($('aspirationIntro'), v => d.intros.aspiration = v, 'Section introduction');
    text($('solutionsIntro'), v => d.intros.solutions = v, 'Section introduction');
    text($('collabIntro'), v => d.intros.collaborators = v, 'Section introduction');
    text($('pressIntro'), v => d.intros.press = v, 'Section introduction');

    // Winning aspiration
    $('aspirationBody').querySelectorAll('.aspiration-chip').forEach((chip, i) => {
      const a = d.aspiration[i];
      text(chip.querySelector('strong'), v => a.value = v, 'Figure');
      text(chip.querySelector('span'), v => a.label = v, 'What it measures');
      chip.append(bar(
        button(a.highlight ? 'Highlighted' : 'Highlight', change(() => a.highlight = !a.highlight), a.highlight ? 'on' : ''),
        button('Remove', change(() => d.aspiration.splice(i, 1)), 'danger')));
      sortable(chip, 'aspiration', d.aspiration, i);
    });
    $('aspirationBody').append(bar(button('+ Add aspiration', change(() => d.aspiration.push({ value: '', label: '', highlight: false })))));

    // AI technology solutions
    const body = $('solutionsBody');
    const labels = body.querySelectorAll('.sol-group-label'), grids = body.querySelectorAll('.sol-grid');
    d.solutionGroups.forEach((g, gi) => {
      text(labels[gi], v => g.label = v, 'Group name');
      [...grids[gi].children].forEach((card, si) => { decorateSolution(card, g, gi, si); sortable(card, 'solution', g.solutions, si); });
      if (!g.solutions.length) dropZone(grids[gi], 'solution', g.solutions);
      grids[gi].after(bar(
        button('+ Add solution', change(() => g.solutions.push(newSolution()))),
        button('Remove this group', change(() => d.solutionGroups.splice(gi, 1)), 'danger')));
    });
    body.append(bar(button('+ Add solution group', change(() => d.solutionGroups.push({ label: '', solutions: [newSolution()] })))));

    // Collaborators
    $('collabBody').querySelectorAll('.collab-card').forEach((card, i) => {
      const p = d.collaborators[i];
      text(card.querySelector('h4'), v => p.name = v, 'Organisation');
      text(card.querySelector('.collab-role'), v => p.role = v, 'Role');
      text(card.querySelector(':scope > p'), v => p.text = v, 'What it contributes');
      text(card.querySelector('.collab-more p'), v => p.more = v, 'More detail (under “Read more”)');
      card.append(tools(
        uploadField('Logo', p.logo, v => p.logo = v),
        bar(button('Remove collaborator', change(() => d.collaborators.splice(i, 1)), 'danger'))));
      sortable(card, 'collaborator', d.collaborators, i);
    });
    $('collabBody').append(bar(button('+ Add collaborator', change(() => d.collaborators.push({ name: '', role: '', text: '', more: '', logo: '' })))));

    // Press release
    const press = $('pressBody').querySelector('.press-card');
    if (press){
      text(press.querySelector('.press-body > p'), v => d.press.text = v, 'The announcement');
      text(press.querySelector('.collab-more p'), v => d.press.more = v, 'More detail (under “Read more”)');
      const link = press.querySelector('a');
      text(link, v => d.press.linkText = v, 'Link text');
      link.addEventListener('click', e => e.preventDefault());
      $('pressBody').append(tools(
        linkField('Link to the full release', d.press.url, v => d.press.url = v.trim(), 'https://…'),
        uploadField('Picture', d.press.img, v => d.press.img = v),
        bar(button('Remove press release', change(() => d.press = null), 'danger'))));
    } else {
      $('pressBody').append(bar(button('+ Add press release', change(() => d.press = { ...NEW_PRESS }))));
    }

    // Sections added here
    document.querySelectorAll('#screen-overview > .extra-block').forEach(block => {
      const i = d.extraSections.findIndex(s => 'x:' + s.id === block.dataset.key), sec = d.extraSections[i];
      text(block.querySelector('h3'), v => sec.title = v, 'Section title');
      text(block.querySelector('.block-intro'), v => sec.intro = v, 'Section introduction');
      block.querySelectorAll('.collab-card').forEach((card, ci) => {
        const k = sec.cards[ci];
        text(card.querySelector('h4'), v => k.title = v, 'Card title');
        text(card.querySelector('.collab-role'), v => k.sub = v, 'Subtitle');
        text(card.querySelector('p'), v => k.text = v, 'Text');
        card.append(bar(button('Remove', change(() => sec.cards.splice(ci, 1)), 'danger')));
        sortable(card, 'card:' + sec.id, sec.cards, ci);
      });
      block.append(bar(
        button('+ Add card', change(() => sec.cards.push({ title: '', sub: '', text: '' }))),
        button('Remove this section', change(() => d.extraSections.splice(i, 1)), 'danger')));
    });
    $('editorAddSection').replaceChildren(
      button('+ Add section', change(() => d.extraSections.push({ id: Date.now().toString(36), title: '', intro: '', cards: [{ title: '', sub: '', text: '' }] })), 'ed-add-section'));
  }

  const cardIndex = (g, si) => d.solutionGroups.slice(0, d.solutionGroups.indexOf(g)).reduce((n, x) => n + x.solutions.length, 0) + si;
  function decorateSolution(card, g, gi, si){
    const sol = g.solutions[si], id = `${gi}-${si}`;
    text(card.querySelector('h4'), v => sol.title = v, 'Solution name');

    const tier = card.querySelector('.sol-tier');
    tier.classList.add('ed-click'); tier.title = 'Click to switch tier';
    tier.onclick = change(() => sol.tier = sol.tier === 'Tier 1' ? 'Competitive Edge' : 'Tier 1');

    const tagsEl = card.querySelector('.sol-tags');
    tagsEl.querySelectorAll('.sol-tag').forEach((tagEl, ti) => {
      const tag = sol.tags[ti], label = tagEl.querySelector('span');
      text(label, v => tag.text = v, 'Tag');
      label.addEventListener('blur', () => { if (!tag.text){ sol.tags.splice(sol.tags.indexOf(tag), 1); show(d); } });
      const dot = button('', change(() => tag.accent = !tag.accent), 'ed-dot' + (tag.accent ? ' on' : ''));
      dot.title = 'Highlight this tag';
      tagEl.append(dot);
    });
    tagsEl.append(button('+ tag', change(() => sol.tags.push({ text: '', accent: false })), 'ed-mini'));

    const art = document.createElement('div');
    art.innerHTML = `<label>Picture</label><select><option value="">No picture</option>${artKeys.map(k => `<option value="${k}">${k[0].toUpperCase() + k.slice(1)}</option>`).join('')}</select>`;
    art.lastChild.value = sol.art || '';
    art.lastChild.onchange = e => change(() => sol.art = e.target.value || null)();

    // The detail page has its own full-page editor; it works on a copy and hands the result back on Save.
    const edit = button('Edit detail page', () => { blockEditor.open({
      title: sol.title, tier: sol.tier, tierClass: sol.tier === 'Tier 1' ? 'tier1' : 'edge',
      iconHtml: `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${iconFor(sol.art)}</svg>`,
      blocks: sol.blocks,
      // The detail page goes into the Master Page's draft: it is published with the rest by Save changes,
      // never on its own (so half-done edits elsewhere on the page are not published with it).
      async save(title, blocks){
        sol.title = title; sol.blocks = blocks;
        touched();
      },
      close(){
        show(d);
        showScreen('screen-overview');
        setTimeout(() => document.querySelectorAll('.sol-card')[cardIndex(g, si)]?.scrollIntoView({ block: 'center' }));
      }
    }); showScreen('screen-blocks'); });

    card.append(tools(art, bar(edit, button('Remove', change(() => g.solutions.splice(si, 1)), 'danger'))));
  }

  /* ---------- Overall progress and Weekly progress ---------- */
  const cycle = (list, v) => list[(list.indexOf(v) + 1) % list.length];
  const RAG = ['green', 'amber', 'red'], SEVERITY = ['low', 'medium', 'high'];
  // Dates are taken when the field is left, without redrawing the screen (a redraw while a year is
  // still being typed would cut it short).
  function dateInput(value, set, label = 'Date'){
    const input = document.createElement('input');
    input.type = 'date'; input.value = value || ''; input.className = 'ed-date';
    input.setAttribute('aria-label', label);
    input.addEventListener('change', () => { set(input.value); touched('progress'); });
    return input;
  }
  // A badge that is changed by clicking it: a real button, so the keyboard can change it too.
  function pillButton(pill, label, onClick){
    const b = document.createElement('button');
    b.type = 'button'; b.className = `${pill.className} ed-pill`; b.innerHTML = pill.innerHTML;
    b.setAttribute('aria-label', `${label}: ${pill.textContent.trim() || 'not set'}. Press to change.`);
    b.onclick = onClick;
    pill.replaceWith(b);
    return b;
  }
  // The project choices on each task row, kept in step with the project names as they are typed on the other screen.
  const projectOptions = () => '<option value="">Not linked to a project</option>' + p.projects.filter(x => x.name).map(x => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('');
  const refreshProjectPickers = () => $('tasksBody').querySelectorAll('select.ed-select').forEach(pick => { pick.innerHTML = projectOptions(); pick.value = pick._task.projectId || ''; });
  function decorateProgress(){
    part = 'progress';
    // Overall progress
    const pill = $('overallStatusPill');
    pill.classList.add('ed-click'); pill.title = 'Click to change the overall status';
    pill.onclick = changeP(() => p.overallStatus = cycle(RAG, p.overallStatus));

    $('projectGrid').querySelectorAll('.project-card').forEach((card, i) => {
      const pr = p.projects[i];
      text(card.querySelector('h4'), v => { pr.name = v; p.tasks.forEach(t => { if (t.projectId === pr.id) t.project = v; }); refreshProjectPickers(); }, 'Project name');
      text(card.querySelector('.project-meta'), v => pr.owner = v, 'Owner');
      const pct = card.querySelector('.project-pct');
      text(pct, v => {
        pr.pct = Math.min(100, Math.max(0, parseInt(v, 10) || 0));
        card.querySelector('.progress-fill').style.width = pr.pct + '%'; // the ring and S-curve catch up on the next redraw or save
      }, '0%');
      const description = field('Description (shown on the project page)', pr.description || '', v => pr.description = v.trim(), { area: true });
      description.hidden = !openDescriptions.has(i);
      const toggle = button(description.hidden ? 'Edit description' : 'Hide description', () => {
        description.hidden = !description.hidden;
        description.hidden ? openDescriptions.delete(i) : openDescriptions.add(i);
        toggle.textContent = description.hidden ? 'Edit description' : 'Hide description';
      });
      card.append(tools(bar(
        button(`Status: ${statusLabel[pr.status] || statusLabel.green}`, changeP(() => pr.status = cycle(RAG, pr.status))),
        toggle,
        button('Delete', changeP(() => { openDescriptions.clear(); p.tasks.forEach(t => { if (t.projectId === pr.id) { delete t.projectId; t.project = ''; } }); p.projects.splice(i, 1); }), 'danger')), description));
    });
    const addProject = bar(button('+ Add project', changeP(() => p.projects.push({ id: newId(), name: '', owner: '', pct: 0, status: 'green', description: '' }))));
    addProject.style.gridColumn = '1 / -1';
    $('projectGrid').append(addProject);

    $('challengesList').querySelectorAll('.challenge-item').forEach((item, i) => {
      const ch = p.challenges[i];
      const sev = item.querySelector('.sev-tag');
      sev.classList.add('ed-click'); sev.title = 'Click to change the severity';
      sev.onclick = changeP(() => ch.severity = cycle(SEVERITY, ch.severity));
      text(item.querySelector('h4'), v => ch.title = v, 'Challenge');
      text(item.querySelector('.challenge-body > p'), v => ch.description = v, 'What the problem is');
      text(item.querySelector('.mitigation'), v => ch.mitigation = v.replace(/^Mitigation:\s*/i, '').replace(/^—$/, ''), 'Mitigation');
      item.querySelector('.challenge-body').append(bar(button('Delete', changeP(() => p.challenges.splice(i, 1)), 'danger')));
    });
    $('challengesList').append(bar(button('+ Add challenge', changeP(() => p.challenges.push({ severity: 'medium', title: '', description: '', mitigation: '' })))));

    // Weekly progress
    text($('weekLabel'), v => p.weekLabel = v, 'Week of …');
    $('tasksBody').querySelectorAll('tr.task-row').forEach(row => {
      const i = Number(row.dataset.index), t = p.tasks[i];
      if (!t) return;
      const cell = name => row.querySelector(`[data-cell="${name}"]`);
      const name = row.querySelector('.task-name');
      row.querySelector('.task-project')?.remove();
      const project = document.createElement('select');
      project.className = 'ed-select';
      project._task = t;
      project.innerHTML = projectOptions();
      project.value = t.projectId || '';
      project.setAttribute('aria-label', 'Project');
      project.onchange = () => {
        const chosen = p.projects.find(x => x.id === project.value);
        if (chosen) Object.assign(t, { projectId: chosen.id, project: chosen.name }); else { delete t.projectId; t.project = ''; }
        touched('progress');
      };
      cell('task').append(bar(project, button('Delete', changeP(() => p.tasks.splice(i, 1)), 'danger')));
      text(name, v => t.task = v, 'Task title');
      text(cell('owner'), v => t.owner = v, 'Owner');
      const prio = cell('priority').firstElementChild;
      if (!t.priority) prio.textContent = 'Set';
      pillButton(prio, 'Priority', changeP(() => t.priority = cycle(['', ...PRIORITIES], t.priority)));
      cell('due').replaceChildren(dateInput(t.due, v => t.due = v, 'Due date'));
      if (!t.checklist.length) {
        const pct = document.createElement('input');
        pct.type = 'number'; pct.min = 0; pct.max = 100; pct.className = 'ed-date ed-pct'; pct.value = t.progress ?? ''; pct.placeholder = '%';
        pct.setAttribute('aria-label', 'Progress, %');
        pct.onchange = changeP(() => { const v = pct.value === '' ? null : Math.max(0, Math.min(100, Math.round(Number(pct.value)))); t.progress = Number.isFinite(v) ? v : null; });
        cell('progress').replaceChildren(pct);
      }
      pillButton(cell('status').querySelector('.task-status'), 'Status', changeP(() => t.status = cycle(taskStatuses, t.status)));
      // The details row: everything else about the task.
      const details = row.nextElementSibling?.firstElementChild;
      if (!details) return;
      const form = document.createElement('div');
      form.className = 'task-edit';
      const list = document.createElement('div');
      list.className = 'task-edit-checklist';
      list.innerHTML = '<label>Checklist <span class="muted">(when it has items, progress is worked out from them)</span></label>';
      t.checklist.forEach((c, ci) => {
        const item = document.createElement('div');
        item.className = 'ed-check';
        const box = Object.assign(document.createElement('input'), { type: 'checkbox', checked: c.done });
        box.setAttribute('aria-label', `Done: ${c.text || `item ${ci + 1}`}`);
        box.onchange = () => { c.done = box.checked; touched('progress'); };
        const label = Object.assign(document.createElement('input'), { value: c.text, placeholder: 'Checklist item' });
        label.setAttribute('aria-label', `Checklist item ${ci + 1}`);
        label.oninput = () => { c.text = label.value; touched('progress'); };
        item.append(box, label, button('Remove', changeP(() => t.checklist.splice(ci, 1)), 'danger'));
        list.append(item);
      });
      list.append(button('+ Add checklist item', () => {
        t.checklist.push({ text: '', done: false }); touched('progress'); openTask(t.id); redrawProgress();
        $('tasksBody').querySelector(`tr.task-detail[data-index="${i}"] .ed-check:last-of-type input:not([type])`)?.focus();
      }));
      const dates = document.createElement('div');
      dates.className = 'task-edit-dates';
      for (const [label, key] of [['Start', 'start'], ['Completed', 'completed']]) {
        const wrap = document.createElement('label');
        wrap.textContent = label;
        const input = dateInput(t[key], v => t[key] = v, `${label} date`);
        // a completed date belongs to a task that is Done (marking it Done fills it in)
        if (key === 'completed' && t.status !== 'Done') { input.disabled = true; input.title = 'Mark the task Done first'; }
        wrap.append(input);
        dates.append(wrap);
      }
      form.append(
        field('Description', t.description, v => t.description = v, { area: true, hint: 'What the task is' }),
        field('Notes and blockers', t.notes, v => t.notes = v, { area: true, hint: 'Anything in the way, or worth knowing' }),
        dates, list,
        Object.assign(document.createElement('p'), { className: 'muted', textContent: `Last updated: ${t.updatedAt ? new Date(`${t.updatedAt}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'not yet'}. Saving sets it to today for every task you changed; marking a task Done sets its completed date.` })
      );
      details.replaceChildren(form);
    });
    const addTask = document.createElement('tr');
    addTask.innerHTML = '<td colspan="6"></td>';
    addTask.firstChild.append(bar(button('+ Add task', changeP(() => { const t = normalizeTask({ id: newId(), status: 'Not started' }); p.tasks.push(t); openTask(t.id); }))));
    $('tasksBody').append(addTask);

    $('updatesLog').querySelectorAll('.update-item').forEach((item, i) => {
      const u = p.updates[i];
      text(item.querySelector('p'), v => u.text = v, 'What happened');
      item.append(bar(dateInput(u.date, v => u.date = v), button('Delete', changeP(() => p.updates.splice(i, 1)), 'danger')));
    });
    $('updatesLog').append(bar(button('+ Add update', changeP(() => p.updates.unshift({ date: today, text: '' })))));
    part = 'master';
  }

  // One "Update from Google Drive" card at the top of each progress screen; both read the same
  // Overall Progress and Weekly Progress folders into the progress draft.
  const driveCards = (prog ? ['screen-progress', 'screen-weekly'] : []).map(screen => {
    const top = document.createElement('div');
    top.className = 'editor-top';
    top.innerHTML = `<div class="edit-card">
      <div class="edit-card-head"><span class="edit-card-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 19a4 4 0 0 1 0-8 5.5 5.5 0 0 1 10.6-1.8A4 4 0 0 1 17 19"/><path d="M12 12v8M9 17l3 3 3-3"/></svg></span><h3>Update from Google Drive</h3></div>
      <p class="hint">Reads this JDA's <b>Overall Progress</b> folder (status, projects, challenges, S-curve) and <b>Weekly Progress</b> folder (week label, tasks, key updates) into these two screens for you to review; nothing is published until you save. Below, click any dashed text to change it, and use the dashed buttons to add or delete.</p>
      <button class="save">Update from Google Drive</button>
      <div class="cal-status"></div>
      <div class="entry-list"></div>
    </div>`;
    $(screen).prepend(top);
    return { button: top.querySelector('button'), status: top.querySelector('.cal-status'), skipped: top.querySelector('.entry-list') };
  });
  const sayP = (textValue, color) => driveCards.forEach(c => { c.status.textContent = textValue; c.status.style.color = color || 'var(--muted)'; });
  const skippedRows = list => list.map(x => `<div class="entry-row"><div class="entry-main"><div class="entry-title">Skipped</div><div class="entry-meta">${esc(x)}</div></div></div>`).join('');
  const count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  driveCards.forEach(card => card.button.onclick = async () => {
    driveCards.forEach(c => { c.button.disabled = true; c.skipped.innerHTML = ''; });
    sayP('Reading the progress folders and extracting — this can take a minute or two…');
    try {
      const out = await api('sync', { scope: 'progress', currentProjects: p.projects });
      if (!out.found) throw new Error(`No folder named "${jda.name}" in the JDA Control Tower's Drive folder.`);
      const { driveSync, ...sections } = out.patch;
      if (!Object.keys(sections).length) sayP("Nothing to load: no readable files in this JDA's Overall Progress or Weekly Progress folders.");
      else {
        // Each section the files cover replaces that section of the draft; the others stay as they are.
        const before = p.projects, tasksBefore = p.tasks;
        Object.assign(p, sections);
        p.projects = withProjectIds(p.projects, before); // projects from Drive keep the ids they had
        // tasks from Drive are merged into the draft's: each keeps its id and every detail typed that the report does not state
        p.tasks = linkTasks(sections.tasks ? mergeTasks(sections.tasks, tasksBefore) : p.tasks, p.projects);
        openDescriptions.clear(); touched('progress'); redrawProgress();
        const parts = [];
        if (out.counts.overall) parts.push(`overall progress (${count(out.counts.overall, 'file')})`);
        if (out.counts.weekly) parts.push(`weekly progress (${count(out.counts.weekly, 'report')})`);
        sayP(`Loaded from Drive: ${parts.join(', ')}. Review both screens, then Save changes.`, 'var(--green)');
      }
      driveCards.forEach(c => c.skipped.innerHTML = skippedRows(out.skipped));
    } catch (e){
      sayP(e.message, 'var(--red)');
    } finally {
      driveCards.forEach(c => c.button.disabled = false);
    }
  });

  /* ---------- Update from Google Drive: the Master File folder, into the draft ---------- */
  const status = (textValue, color) => { $('editorSyncStatus').textContent = textValue; $('editorSyncStatus').style.color = color || 'var(--muted)'; };
  if (master) $('editorSyncBtn').onclick = async () => {
    $('editorSyncBtn').disabled = true; $('editorSyncSkipped').innerHTML = '';
    status('Reading the Master File folder and extracting — this can take a minute or two…');
    try {
      const out = await api('sync', { scope: 'master' });
      if (!out.found) throw new Error(`No folder named "${jda.name}" in the JDA Control Tower's Drive folder.`);
      const ov = out.patch.overview;
      if (!ov) status("Nothing to load: no readable files in this JDA's Master File folder.");
      else {
        // Each part the files cover replaces that part of the draft; parts they say nothing about stay as they are.
        for (const k of ['eyebrow', 'tagline', 'summary', 'more']) if (ov[k]) d[k] = ov[k];
        if (ov.aspiration.length) d.aspiration = ov.aspiration;
        if (ov.solutionGroups.length){
          d.solutionGroups = ov.solutionGroups.map(g => ({ label: g.label, solutions: g.solutions.map(x => ({ title: x.title, tier: x.tier, art: x.art, tags: x.tags, blocks: blocksOf(x) })) }));
        }
        if (ov.collaborators.length) d.collaborators = ov.collaborators.map(p => ({ ...p, logo: d.collaborators.find(old => old.name === p.name)?.logo || logoFor(p.name) }));
        if (ov.press) d.press = { ...ov.press, img: d.press?.img || '' };
        touched(); show(d);
        status(`Loaded from Drive (${out.counts.master} file${out.counts.master === 1 ? '' : 's'}). Review the page, then Save changes.`, 'var(--green)');
      }
      $('editorSyncSkipped').innerHTML = out.skipped.map(x => `<div class="entry-row"><div class="entry-main"><div class="entry-title">Skipped</div><div class="entry-meta">${esc(x)}</div></div></div>`).join('');
    } catch (e){
      status(e.message, 'var(--red)');
    } finally {
      $('editorSyncBtn').disabled = false;
    }
  };
  if (master) $('editorFolderBtn').onclick = async () => {
    const tab = window.open('', '_blank'); // opened now, while this is still a click, so it isn't blocked
    try { tab.location = (await api('master-folder')).url; }
    catch (e){ tab?.close(); status(e.message, 'var(--red)'); }
  };

  /* ---------- Save ---------- */
  // Blocks left completely empty are dropped; anything with text in it is kept as typed.
  const filled = o => Object.values(o).some(v => typeof v === 'string' ? v : Array.isArray(v) && v.length);
  function cleaned(){
    const o = JSON.parse(JSON.stringify(d));
    o.aspiration = o.aspiration.filter(a => a.value || a.label);
    o.solutionGroups.forEach(g => {
      g.solutions.forEach(s => {
        s.tags = s.tags.filter(t => t.text);
        s.blocks = cleanBlocks(s.blocks);
      });
      g.solutions = g.solutions.filter(s => s.title || s.tags.length || s.blocks.length);
    });
    o.solutionGroups = o.solutionGroups.filter(g => g.label || g.solutions.length);
    o.collaborators = o.collaborators.filter(filled);
    if (o.press && !o.press.text && !o.press.more && !o.press.url && !o.press.img) o.press = null;
    o.extraSections.forEach(s => s.cards = s.cards.filter(filled));
    o.extraSections = o.extraSections.filter(s => s.title || s.intro || s.cards.length);
    return o;
  }
  function cleanedProgress(){
    const o = JSON.parse(JSON.stringify(p));
    o.projects = o.projects.filter(x => x.name);
    o.tasks = linkTasks(o.tasks, o.projects); // each linked task carries its project's current name; one whose project is gone keeps only the text
    o.challenges = o.challenges.filter(x => x.title || x.description);
    // a task with details but no title is kept as "Untitled task" rather than dropped
    const hasDetail = x => x.description || x.notes || x.checklist?.length || x.owner || x.due;
    o.tasks = stampTasks(o.tasks.filter(x => x.task || hasDetail(x)).map(x => normalizeTask({ ...x, task: x.task || 'Untitled task' })), savedTasks, today);
    o.updates = o.updates.filter(x => x.text);
    return o;
  }
  // Publishes whatever has changed. The drafts stay as typed; only what is stored is tidied.
  async function saveAll(){
    $('editorSaveBtn').disabled = true;
    $('editorSaveStatus').textContent = 'Saving…';
    try {
      if (dirty.master){ await save(cleaned()); dirty.master = false; show(d); }
      if (dirty.progress){ p = cleanedProgress(); await saveProgress(p); savedTasks = JSON.parse(JSON.stringify(p.tasks)); dirty.progress = false; openDescriptions.clear(); redrawProgress(); }
      $('editorSaveStatus').textContent = 'Saved — the live pages are updated';
    } catch (e){
      if (e.signIn) $('editorSaveStatus').innerHTML = 'Not saved: your sign-in has ended. <a href="/login" target="_blank" rel="noopener">Sign in again in a new tab</a>, then press Save changes here. Your changes are still on this page.';
      else $('editorSaveStatus').textContent = `Not saved: ${e.message}`;
      $('editorSaveBtn').disabled = false;
      throw e;
    }
  }
  $('editorSaveBtn').onclick = () => saveAll().catch(() => {}); // the failure is already on screen
  const blockEditor = master ? setupBlockEditor() : null;


  /* ---------- Leaving ---------- */
  window.addEventListener('beforeunload', e => { if (dirty.master || dirty.progress) e.preventDefault(); });
  window.hasUnsavedChanges = () => dirty.master || dirty.progress; // Sign out asks first (account.js)
  if (master) $('editorBackTop').onclick = e => { e.preventDefault(); leave(); };
  $('editorBack').onclick = e => { e.preventDefault(); leave(); };

  $('editorSaveBar').hidden = false;
  if ($('reportFooter')) $('reportFooter').hidden = true;
  if (master) {
    $('editorHeading').textContent = `Editing ${jda.name}: the Master Page`;
    $('editorTop').hidden = false;
    show(d);
    decorate();
  } else redrawProgress();
  return { decorate: master ? decorate : () => {} };
}
