// A JDA's Agreement & BRD page (/control-tower/<jda>/documents): each document's title, version, date
// and source, a preview where the link allows one, Open and Download. Edit page adds, replaces (a new
// link), removes and reorders them and edits what is known about each. The documents are saved with
// the Control Tower's other written content (/api/site/controlTower), which the server checks again.
import { esc } from '../../shared/lib/esc.js';
import { JDAS } from '../../shared/config/jdas.js';
import { auth } from '../../shared/lib/firebase.js';
import '../../shared/components/account.js';
import { api, editBar, listEditor, httpsCheck } from '../../shared/components/edit-kit.js';
import { mountCtSidebar } from './ct-sidebar.js';
import { mountCtTopbar, jdaNav, jdaPage } from './ct-topbar.js';
import { previewUrl, downloadUrl, sourceOf } from '../lib/documents.js';

const $ = id => document.getElementById(id);
const jda = JDAS.find(j => j.id === location.pathname.split('/')[2]);
if (!jda) { location.replace('/control-tower/'); await new Promise(() => {}); }
mountCtSidebar({ wrap: document.querySelector('.app'), bar: document.querySelector('.topbar-inner'), current: jda.id });
mountCtTopbar({ bar: document.querySelector('.topbar-inner'), tabs: { current: jda.id, href: j => jdaPage(j.id, 'documents') }, actions: [$('editPageBtn')] });
$('main').prepend(jdaNav(jda, 'documents'));

const token = () => auth.currentUser ? auth.currentUser.getIdToken() : Promise.resolve('');
const KINDS = [
  { key: 'agreement', title: 'Agreement', about: 'The signed Joint Development Agreement.', none: 'No agreement linked yet.' },
  { key: 'brd', title: 'Business Requirement Document (BRD)', about: 'What the JDA is to deliver, as agreed with the business.', none: 'No BRD linked yet.' }
];
const DOC = () => ({ title: '', url: '', version: '', date: '', source: '' });
const fmtDate = iso => { const d = new Date(`${iso}T00:00:00`); return isNaN(d) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); };
const svg = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const notice = (text, warn = false) => { $('ctNotice').textContent = text; $('ctNotice').hidden = !text; $('ctNotice').classList.toggle('warn', warn); };

document.title = `${jda.name}: Agreement & BRD · JDA Control Tower`;
$('docEyebrow').textContent = jda.name;
$('docTitle').textContent = `${jda.name}: Agreement & BRD`;
document.querySelectorAll('.brand a[href="/control-tower/"]').forEach(a => { a.href = `/control-tower/#${jda.id}`; });

let data; // { jdas, updatedAt } as saved

// One document: what is known about it, and what can be done with it. The newest (by date) is marked.
function card(d, i, kind, newest) {
  const preview = previewUrl(d.url), download = downloadUrl(d.url), source = d.source || sourceOf(d.url);
  const id = `${kind}-${i}`;
  const facts = [['Version', d.version], ['Date', d.date && `<time datetime="${esc(d.date)}">${esc(fmtDate(d.date))}</time>`], ['Source', source && esc(source)]].filter(([, v]) => v);
  return `
  <article class="doc-card" aria-labelledby="${id}-t">
    <div class="doc-top">
      <span class="doc-icon">${svg('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>')}</span>
      <div class="doc-main">
        <h4 id="${id}-t">${esc(d.title || 'Untitled document')}${newest ? ' <span class="doc-badge">Latest</span>' : ''}</h4>
        ${facts.length ? `<dl class="doc-facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${k === 'Version' ? esc(v) : v}</dd></div>`).join('')}</dl>` : ''}
      </div>
      <div class="doc-actions">
        ${preview ? `<button type="button" class="ct-btn ghost small" data-preview="${id}" aria-expanded="false" aria-controls="${id}-p">Preview</button>` : ''}
        ${d.url ? `<a class="ct-btn ghost small" href="${esc(d.url)}" target="_blank" rel="noopener">Open ↗</a>` : '<span class="ct-hint">No link yet</span>'}
        ${download ? `<a class="ct-btn ghost small" href="${esc(download)}" target="_blank" rel="noopener" download>Download</a>` : ''}
      </div>
    </div>
    ${preview ? `<div class="doc-preview" id="${id}-p" data-src="${esc(preview)}" hidden>
      <p class="ct-hint">If the preview stays blank or asks you to sign in, you may need to sign in to ${esc(source || 'the site')} in this browser, or use Open.</p></div>` : ''}
  </article>`;
}

function render() {
  const w = data.jdas[jda.id] || { agreement: [], brd: [] };
  $('docs').innerHTML = KINDS.map(k => {
    const list = w[k.key] || [], dated = list.map(d => d.date).filter(Boolean).sort();
    const newest = list.length > 1 && dated.length ? list.findIndex(d => d.date === dated.at(-1)) : -1;
    return `
    <section class="doc-sec" aria-labelledby="sec-${k.key}">
      <header class="doc-sec-head"><h3 id="sec-${k.key}">${k.title}</h3><p class="ct-hint">${k.about}</p></header>
      ${list.length ? list.map((d, i) => card(d, i, k.key, i === newest)).join('') : `<p class="ct-empty">${k.none} Add it with Edit page.</p>`}
    </section>`;
  }).join('');
  // On a wide screen the first document of each kind is previewed straight away (on a phone only the
  // first one on the page); the others when asked.
  const secs = [...document.querySelectorAll('.doc-sec')];
  (matchMedia('(min-width:900px)').matches ? secs : secs.slice(0, 1)).forEach(sec => sec.querySelector('[data-preview]')?.click());
}

// A preview is loaded only once it is opened, so the page does not fetch every file at once.
$('docs').addEventListener('click', e => {
  const btn = e.target.closest('[data-preview]');
  if (!btn) return;
  const box = $(`${btn.dataset.preview}-p`), open = box.hidden;
  if (open && !box.querySelector('iframe')) {
    const frame = Object.assign(document.createElement('iframe'), { src: box.dataset.src, loading: 'lazy', title: `Preview of ${btn.closest('.doc-card').querySelector('h4').textContent}`, referrerPolicy: 'no-referrer' });
    frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-forms allow-downloads');
    box.prepend(frame);
  }
  box.hidden = !open;
  btn.setAttribute('aria-expanded', String(open));
  btn.textContent = open ? 'Hide preview' : 'Preview';
});

// Edit page: a form for each kind of document, saved with the rest of the Control Tower's written content.
function edit() {
  const draft = structuredClone(data.jdas), w = draft[jda.id];
  let base = data.updatedAt;
  $('editPageBtn').hidden = true;
  document.body.classList.add('editing');
  const bar = editBar({
    title: `Editing ${jda.name}: Agreement & BRD`,
    intro: 'Add, replace (paste the new link) or remove documents, and write their version, date and source.',
    save: async force => {
      const out = await api('PUT', '/api/site/controlTower', { content: { jdas: draft }, base, force }, { token });
      base = out.updatedAt; finish(); await load(); notice('Saved.');
    },
    cancel: () => { finish(); render(); }
  });
  const finish = () => { bar.el.remove(); document.body.classList.remove('editing'); $('editPageBtn').hidden = false; $('editPageBtn').focus(); };
  const fields = [
    { key: 'title', label: 'Title', placeholder: 'e.g. JDA 1 signed agreement' },
    { key: 'url', label: 'Link (https://…)', type: 'url', check: httpsCheck },
    { key: 'version', label: 'Version', placeholder: 'e.g. v1.2' },
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'source', label: 'Source', placeholder: 'Worked out from the link if left empty' }
  ];
  const box = document.createElement('div');
  box.className = 'ct-edit doc-edit';
  for (const k of KINDS) {
    const h = Object.assign(document.createElement('h3'), { textContent: k.title });
    box.append(h, listEditor({ items: w[k.key] ||= [], fields, addLabel: `+ Add ${k.key === 'brd' ? 'a BRD' : 'an agreement'} document`, blank: DOC, onChange: () => bar.changed(), label: `${jda.name} ${k.title}`, say: bar.say }));
  }
  box.append(Object.assign(document.createElement('p'), { className: 'edit-hint', textContent: 'Links to the files in Google Drive or SharePoint can be previewed here; any other https:// link is opened in a new tab. A link that does not start with https:// is not kept. To keep the previous version of a document, add the new one with + Add instead of pasting over its link.' }));
  $('docs').replaceChildren(box);
  document.body.append(bar.el);
  box.querySelector('input')?.focus();
}
$('editPageBtn').onclick = edit;

async function load() {
  data = await api('GET', '/api/site/controlTower', undefined, { token });
  render();
  $('editPageBtn').hidden = false;
}
load().catch(e => { $('docs').innerHTML = ''; notice(`The documents could not be loaded: ${e.message}`, true); });
