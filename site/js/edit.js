// Edit mode for the public TriCipta AI landing page (signed-in people only; the server checks again
// on every save). Text is edited where it stands; each JDA's tab becomes a form for what is written
// about it; the Roles picture can be replaced. Values worked out from a JDA's report are shown as such,
// and become overrides only when something is written over them. Nothing is public until Save.
import { esc } from '/shared/esc.js';
import { api, editBar, listEditor, editable, getPath, setPath } from '/site/js/edit-kit.js';
import { STATUS } from '/site/js/landing.js';

const $ = id => document.getElementById(id);
const PERSON = () => ({ name: '', title: '' });

export async function start({ site, show, reload }) {
  const { content, updatedAt } = await api('GET', '/api/site/public');
  const draft = structuredClone(content);
  let base = updatedAt;
  await show(site);
  document.body.classList.add('editing');

  const bar = editBar({
    title: 'Editing the public page',
    save: async force => {
      const out = await api('PUT', '/api/site/public', { content: draft, base, force });
      base = out.updatedAt;
      finish(); await reload();
    },
    cancel: () => { finish(); show(site); }
  });
  const changed = () => bar.changed();
  const finish = () => { bar.el.remove(); document.body.classList.remove('editing'); $('editPageBtn').hidden = false; };
  document.body.append(bar.el);
  $('editPageBtn').hidden = true;

  // Text in the page's sections, where it stands.
  for (const el of document.querySelectorAll('#page [data-field]')) {
    const path = el.dataset.field;
    if (path.startsWith('jdas.') || !(path.split('.')[0] in draft)) continue;
    editable(el, getPath(draft, path) ?? '', v => { setPath(draft, path, v); changed(); }, { multiline: el.hasAttribute('data-multiline'), placeholder: el.closest('.contact-card') ? 'To be announced' : 'Type here' });
  }

  // Each JDA's tab: a form for what is written about it.
  site.jdas.forEach(j => {
    const panel = $(`panel-${j.id}`);
    if (panel) panel.replaceChildren(jdaForm(j, draft.jdas[j.id], changed));
  });
  document.querySelectorAll('.status-card .status-title').forEach(p => p.insertAdjacentHTML('afterend', '<p class="edit-hint">Set the status, title and number of projects in the JDA\'s tab above.</p>'));

  // The Roles picture and its description.
  const figure = document.querySelector('.roles-figure');
  if (figure) figure.after(rolesForm(draft, changed, bar));
}

function hint(text) { const p = document.createElement('p'); p.className = 'edit-hint'; p.textContent = text; return p; }
function field(label, input, note) {
  const wrap = document.createElement('label');
  wrap.className = 'ef';
  wrap.append(Object.assign(document.createElement('span'), { className: 'ef-label', textContent: label }), input);
  if (note) wrap.append(hint(note));
  return wrap;
}
function input(value, set, { multiline = false, type = 'text', placeholder = '' } = {}) {
  const el = document.createElement(multiline ? 'textarea' : 'input');
  if (!multiline) el.type = type;
  el.value = value ?? ''; el.placeholder = placeholder;
  el.addEventListener('input', () => set(el.value));
  return el;
}

function jdaForm(j, w, changed) {
  const form = document.createElement('div');
  form.className = 'jda-edit';
  const set = (key, v) => { w[key] = v; changed(); };
  const derived = what => `Leave empty to use ${what}.`;
  const status = document.createElement('select');
  const auto = j.derived.status ? j.status : (j.projects.length ? 'in-progress' : 'in-the-works');
  status.innerHTML = `<option value="">Automatic: ${esc(STATUS[auto].label)} (In progress once it has projects)</option>` +
    Object.entries(STATUS).map(([v, s]) => `<option value="${v}">${esc(s.label)}</option>`).join('');
  status.value = w.status || '';
  status.onchange = () => set('status', status.value);
  form.append(
    Object.assign(document.createElement('h3'), { className: 'mini-head', textContent: `${j.name}: what the public page says` }),
    field('Title', input(w.title, v => set('title', v), { placeholder: j.derived.title ? j.title : 'Title TBC' }), derived("the tagline on the JDA's Master Page")),
    field('Status', status),
    field('Press release overview', input(w.pressRelease, v => set('pressRelease', v), { multiline: true, placeholder: j.derived.pressRelease ? j.pressRelease : '' }), derived("the press release on the JDA's Master Page")),
    field('Projects, one per line', input((w.projects || []).join('\n'), v => set('projects', v.split('\n').map(x => x.trim()).filter(Boolean)), { multiline: true, placeholder: j.derived.projects ? j.projects.join('\n') : '' }),
      derived(`the project names on Overall progress (${j.derived.projects ? j.projects.length : 0} now)`)),
    field('Number of projects', input(w.projectCount ?? '', v => set('projectCount', v === '' ? null : Math.max(0, Math.round(Number(v)))), { type: 'number', placeholder: String(j.derived.projectCount ? j.projectCount : '') }), derived('the number of projects listed'))
  );
  for (const [key, title] of [['programLeads', 'Program Lead'], ['businessChampions', 'Business Champions']]) {
    form.append(Object.assign(document.createElement('h4'), { className: 'mini-head sub', textContent: title }),
      listEditor({ items: w[key] ||= [], fields: [{ key: 'name', label: 'Name' }, { key: 'title', label: 'Title' }], addLabel: `+ Add ${title === 'Program Lead' ? 'a Program Lead' : 'a Business Champion'}`, blank: PERSON, onChange: changed, label: title }));
  }
  return form;
}

function rolesForm(draft, changed, bar) {
  const box = document.createElement('div');
  box.className = 'roles-edit';
  const file = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/jpeg,image/png,image/webp' });
  const msg = Object.assign(document.createElement('p'), { className: 'edit-hint', textContent: 'JPEG, PNG or WebP, up to 8 MB. The picture is replaced as soon as it is chosen.' });
  msg.setAttribute('role', 'status');
  file.onchange = async () => {
    const f = file.files[0];
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) { msg.textContent = 'That picture is larger than 8 MB.'; return; }
    msg.textContent = 'Uploading…';
    try {
      const data = await new Promise((ok, fail) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = fail; r.readAsDataURL(f); });
      const { image } = await api('POST', '/api/site/roles-image', { image: data });
      const fig = document.querySelector('.roles-figure');
      fig.innerHTML = `<img src="${esc(image)}" alt="${esc(draft.roles.alt)}">`;
      msg.textContent = 'Picture replaced.';
    } catch (e) { msg.textContent = `Not uploaded: ${e.message}`; }
  };
  box.append(field('Replace the Roles picture', file), msg,
    field('What the picture shows (for people who cannot see it)', input(draft.roles.alt, v => { draft.roles.alt = v; changed(); })));
  return box;
}
