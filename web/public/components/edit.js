// Edit mode for the public TriCipta AI landing page (signed-in people only; the server checks again
// on every save). Text is edited where it stands; each JDA's tab becomes a form for what is written
// about it; the Roles picture can be replaced or removed. What the JDA's report says is shown beside each
// field, and a written value replaces it. Nothing is public until Save, the Roles picture included.
import { esc } from '/shared/lib/esc.js';
import { api, editBar, listEditor, editable, getPath, setPath } from '/shared/components/edit-kit.js';
import { STATUS } from '/public/components/landing.js';

const $ = id => document.getElementById(id);
const PERSON = () => ({ name: '', title: '' });
// What each in-place field is called, for screen readers.
const SECTION = { header: 'Top of the page', overview: 'Overview', roles: 'Roles', whatIsJda: 'What is a JDA', existing: 'Existing JDAs', news: 'Latest press releases', figures: 'Figures', status: 'JDA status', contacts: 'Contacts', footer: 'Footer' };
const FIELD = { title: 'heading', subtitle: 'subheading', body: 'text', eyebrow: 'small heading above the title', tagline: 'tagline', email: 'email', phone: 'phone', address: 'address', jdas: 'first figure\'s label', underWay: 'second figure\'s label', finished: 'third figure\'s label', linkedin: 'LinkedIn address', website: 'website address', text: 'text', alt: 'picture description' };
const nameOf = path => { const [s, f] = path.split('.'); return `${SECTION[s] || s}: ${FIELD[f] || f}`; };

export async function start({ site, show, reload, done }) {
  const { content, reports, updatedAt } = await api('GET', '/api/site/public');
  const draft = structuredClone(content);
  let base = updatedAt;
  const pictures = {}; // <key>: 'publish' once a picture is uploaded, 'remove' to take it away (sent with Save)
  await show(site);
  document.body.classList.add('editing');

  const bar = editBar({
    title: 'Editing the public page',
    intro: "Click or tap any text with a dashed outline to change it. Each JDA's details are in its tab under Existing JDAs.",
    save: async force => {
      const out = await api('PUT', '/api/site/public', { content: draft, base, force, pictures });
      base = out.updatedAt;
      finish(); await reload(); done('Saved. The public page now shows your changes.');
    },
    cancel: async () => {
      for (const [key, act] of Object.entries(pictures)) if (act === 'publish') await api('DELETE', `/api/site/image/${key}`).catch(() => {});
      finish(); await show(site); done('Edit cancelled. Nothing was changed.');
    }
  });
  const changed = () => bar.changed();
  const finish = () => { bar.el.remove(); document.body.classList.remove('editing'); };
  document.body.append(bar.el);

  // Text in the page's sections, where it stands.
  for (const el of document.querySelectorAll('#page [data-field]')) {
    const path = el.dataset.field;
    if (path.startsWith('jdas.') || !(path.split('.')[0] in draft)) continue;
    editable(el, getPath(draft, path) ?? '', v => { setPath(draft, path, v); changed(); },
      { multiline: el.hasAttribute('data-multiline'), placeholder: el.closest('.contact-card') ? (/linkedin|website/.test(path) ? 'https://…' : 'To be announced') : 'Type here', label: nameOf(path) });
  }

  // Each JDA's tab: a form for what is written about it.
  site.jdas.forEach(j => {
    const panel = $(`panel-${j.id}`);
    if (panel) panel.replaceChildren(jdaForm(j, reports[j.id].report, draft.jdas[j.id], changed, bar.say));
  });
  document.querySelectorAll('.status-card .status-title').forEach(p => p.insertAdjacentHTML('afterend', '<p class="edit-hint">Set the status, title and number of projects in the JDA\'s tab under Existing JDAs.</p>'));

  // Every picture: the Roles chart (with its description), the Overview and What is a JDA pictures
  // where they stand, and the two hero pictures under the hero.
  const setPicture = key => act => { pictures[key] = act; changed(); };
  const pics = site.pictures || {};
  const roles = document.querySelector('[data-picture="roles"]');
  if (roles) roles.after(pictureForm({ key: 'roles', label: 'the Roles picture', current: pics.roles, set: setPicture('roles'), preview: url => figurePreview(roles, url, 'Roles chart'),
    extra: field('What the picture shows (for people who cannot see it)', input(draft.roles.alt, v => { draft.roles.alt = v; changed(); })) }));
  for (const [key, name] of [['overview', 'Overview'], ['whatIsJda', 'What is a JDA']]) {
    const fig = document.querySelector(`[data-picture="${key}"]`);
    if (fig) fig.append(pictureForm({ key, label: `the ${name} picture`, current: pics[key], set: setPicture(key), preview: url => figurePreview(fig, url, name) }));
  }
  const hero = document.querySelector('.hero');
  if (hero) {
    const box = document.createElement('div');
    box.className = 'hero-edit';
    box.append(Object.assign(document.createElement('h3'), { className: 'mini-head', textContent: 'Hero pictures' }), hint('Each JDA\'s slide uses the picture of its press release, set on its Master Page.'));
    for (const [key, name, slide] of [['hero', 'the first slide (TriCipta AI)', 0], ['heroJda', 'the "What is a JDA" slide', 1]]) {
      box.append(pictureForm({ key, label: `the picture of ${name}`, current: pics[key], set: setPicture(key), preview: url => slidePreview(hero, slide, url) }));
    }
    hero.after(box);
  }

  $('page').querySelector('.ed-inline')?.focus();
}

function hint(text) { const p = document.createElement('p'); p.className = 'edit-hint'; p.textContent = text; return p; }
function field(label, input, note) {
  const wrap = document.createElement('label');
  wrap.className = 'ef';
  wrap.append(Object.assign(document.createElement('span'), { className: 'ef-label', textContent: label }), input);
  if (note) wrap.append(hint(note));
  return wrap;
}
function input(value, set, { multiline = false, type = 'text', placeholder = '', max } = {}) {
  const el = document.createElement(multiline ? 'textarea' : 'input');
  if (!multiline) el.type = type;
  if (max !== undefined) { el.min = 0; el.max = max; }
  el.value = value ?? ''; el.placeholder = placeholder;
  el.addEventListener('input', () => set(el.value));
  return el;
}
const shorten = (t, n = 120) => t.length > n ? `${t.slice(0, n).replace(/\s+\S*$/, '')}…` : t;

function jdaForm(j, r, w, changed, say) {
  const form = document.createElement('div');
  form.className = 'jda-edit';
  const set = (key, v) => { w[key] = v; changed(); };
  const status = document.createElement('select');
  status.innerHTML = `<option value="">Automatic (now: ${esc(STATUS[r.status].label)})</option>` + Object.entries(STATUS).map(([v, s]) => `<option value="${v}">${esc(s.label)}</option>`).join('');
  status.value = w.status || '';
  status.onchange = () => set('status', status.value);
  const count = input(w.projectCount ?? '', v => {
    const n = Math.round(Number(v));
    set('projectCount', v === '' || !Number.isFinite(n) ? null : Math.max(0, Math.min(999, n)));
  }, { type: 'number', max: 999, placeholder: String(w.projects?.length || r.projects.length) });
  form.append(
    Object.assign(document.createElement('h3'), { className: 'mini-head', textContent: `${j.name}: what the public page says` }),
    field('Title', input(w.title, v => set('title', v), { placeholder: r.title || 'Title TBC' }),
      r.title ? `Leave empty to use the Master Page tagline: "${shorten(r.title)}".` : 'The Master Page has no tagline yet, so "Title TBC" shows until one is written here.'),
    field('Status', status, 'Automatic is In progress once its report lists projects, otherwise In the works.'),
    field('Press release overview', input(w.pressRelease, v => set('pressRelease', v), { multiline: true, placeholder: r.pressRelease }),
      r.pressRelease ? "Leave empty to use the press release on the JDA's Master Page (shown greyed in the box)." : "The Master Page has no press release yet."),
    field('Press release date', input(w.pressDate, v => set('pressDate', v), { type: 'date' }), 'Shown on its card under Latest press releases; the newest is shown first and largest.'),
    field('Projects, one per line', input((w.projects || []).join('\n'), v => set('projects', v.split('\n').map(x => x.trim()).filter(Boolean)), { multiline: true, placeholder: r.projects.join('\n') }),
      `Leave empty to use the project names on Overall progress (${r.projects.length} there now).`),
    field('Number of projects', count, 'Leave empty to count the projects listed (0 to 999).')
  );
  for (const [key, title, one] of [['programLeads', 'Program Lead', 'a Program Lead'], ['businessChampions', 'Business Champions', 'a Business Champion']]) {
    form.append(Object.assign(document.createElement('h4'), { className: 'mini-head sub', textContent: title }),
      listEditor({ items: w[key] ||= [], fields: [{ key: 'name', label: 'Name' }, { key: 'title', label: 'Job title' }], addLabel: `+ Add ${one}`, blank: PERSON, onChange: changed, label: `${j.name} ${title}`, say }));
  }
  form.append(hint('The headings on this tab ("Press release overview", "Program Lead" and so on) and the buttons are fixed wording.'));
  return form;
}

// A picture's form: Replace (uploaded now, public on Save, thrown away on Cancel) and Remove (on Save;
// the one before is kept on the server). `preview(url | null)` shows the change on the page at once.
function pictureForm({ key, label, current, set, preview, extra }) {
  const box = document.createElement('div');
  box.className = 'roles-edit picture-edit';
  const file = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/jpeg,image/png,image/webp' });
  const msg = Object.assign(document.createElement('p'), { className: 'edit-hint', textContent: 'JPEG, PNG or WebP, up to 8 MB. The new picture shows here now and goes public when you press Save changes; Cancel throws it away.' });
  msg.setAttribute('role', 'status');
  const remove = Object.assign(document.createElement('button'), { type: 'button', className: 'le-btn', textContent: 'Remove the picture', hidden: !current });
  file.onchange = async () => {
    const f = file.files[0];
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) { msg.textContent = 'That picture is larger than 8 MB.'; return; }
    msg.textContent = 'Uploading…';
    try {
      const url = await new Promise((ok, fail) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = fail; r.readAsDataURL(f); });
      await api('POST', `/api/site/image/${key}`, { image: url.split(',')[1] });
      preview(url); set('publish'); remove.hidden = false;
      msg.textContent = 'New picture ready. It goes public when you press Save changes.';
    } catch (e) { msg.textContent = `Not uploaded: ${e.message}`; }
  };
  remove.onclick = () => {
    set('remove'); preview(null); remove.hidden = true;
    msg.textContent = 'The picture will be removed when you press Save changes. The one before is kept on the server.';
  };
  box.append(field(`Replace ${label}`, file), remove, msg);
  if (extra) box.append(extra);
  return box;
}
// What a picture slot shows while editing: the new picture, or the placeholder once removed.
function figurePreview(fig, url, name) {
  const form = fig.querySelector('.picture-edit');
  fig.className = url ? (fig.classList.contains('roles-figure') ? 'roles-figure' : 'sec-pic') : (fig.classList.contains('roles-figure') ? 'roles-figure' : 'pic-placeholder');
  fig.innerHTML = url ? `<img src="${esc(url)}" alt="${esc(name)}">` : `<div class="roles-placeholder"><p><b>${esc(name)}: no picture</b><span>The placeholder shows once you press Save changes.</span></p></div>`;
  if (form) fig.append(form);
}
// A hero slide shows the new picture (or its built-in one once removed, after Save).
function slidePreview(hero, i, url) {
  const slide = hero.querySelector(`#slide-${i}`);
  if (!slide || !url) return;
  slide.style.backgroundImage = `linear-gradient(100deg,rgba(1,39,36,.88) 0%,rgba(1,61,57,.7) 45%,rgba(1,61,57,.2) 100%),url('${url}')`;
  slide.style.setProperty('--slide-img', `url('${url}')`);
}
