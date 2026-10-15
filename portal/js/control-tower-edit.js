// Edit mode for the JDA Control Tower landing page: for each JDA, its document links (Agreement, BRD),
// key insights, challenges, and the progress and cost figures when they must be set by hand. Values
// worked out from the data are left alone unless "Set by hand" is chosen, and are then labelled as overrides.
// Saved on the server (PUT /api/site/controlTower), which checks the sign-in and every field again.
import { api, editBar, listEditor, httpsCheck } from '/site/js/edit-kit.js';

const $ = id => document.getElementById(id);
const LINK = () => ({ label: '', url: '' }), BOX = () => ({ title: '', text: '' }), CHALLENGE = () => ({ title: '', text: '', severity: 'medium' });

// `token` gives the Firebase sign-in token, so a save still goes through after the session cookie ran out.
export async function start({ jdas, figures, redraw, saved, token }) {
  const data = await api('GET', '/api/site/controlTower', undefined, { token });
  const draft = structuredClone(data.jdas);
  let base = data.updatedAt;
  document.body.classList.add('editing');
  $('editPageBtn').hidden = true;
  // a sync or a new JDA would redraw the page under the forms: held until edit mode ends
  const held = ['syncBtn', 'addJdaBtn'].map($).filter(b => b && !b.disabled);
  held.forEach(b => { b.disabled = true; b.dataset.title = b.title; b.title = 'Save or cancel the edit first'; });

  const bar = editBar({
    title: 'Editing the Control Tower',
    intro: "Each JDA tab has a form at its top. Its tagline, status, projects and latest update are edited in the JDA's report (links under its name).",
    save: async force => {
      const out = await api('PUT', '/api/site/controlTower', { content: { jdas: draft }, base, force }, { token });
      base = out.updatedAt;
      finish(); saved();
    },
    cancel: () => { finish(); redraw(); }
  });
  const changed = () => bar.changed();
  const finish = () => {
    bar.el.remove(); document.body.classList.remove('editing'); $('editPageBtn').hidden = false; $('editPageBtn').focus();
    held.forEach(b => { b.disabled = false; b.title = b.dataset.title; });
  };
  document.body.append(bar.el);

  for (const j of jdas) {
    const panel = $(`panel-${j.id}`);
    if (panel) panel.prepend(form(j, draft[j.id], figures(j), changed, bar.say));
  }
  document.querySelector('[role="tabpanel"]:not([hidden]) .ct-edit h4')?.focus();
}

function el(tag, props = {}, ...children) { const e = Object.assign(document.createElement(tag), props); e.append(...children); return e; }
const hint = text => el('p', { className: 'edit-hint', textContent: text });
// A number field that says beside it when what is typed will not be kept.
function numberInput(value, set, label, { max = Infinity } = {}) {
  const i = el('input', { type: 'number', min: 0, step: 'any', value: value ?? '' });
  if (Number.isFinite(max)) i.max = max;
  i.setAttribute('aria-label', label);
  const warn = el('span', { className: 'le-warn', hidden: true });
  i.addEventListener('input', () => {
    const n = Number(i.value), ok = i.value !== '' && Number.isFinite(n) && n >= 0 && n <= max;
    warn.hidden = ok; warn.textContent = i.value === '' ? 'Type a number, or untick "Set by hand".' : `Use a number from 0${Number.isFinite(max) ? ` to ${max}` : ' up'}.`;
    i.setAttribute('aria-invalid', String(!ok));
    if (ok) set(n);
  });
  return el('span', { className: 'ct-num' }, i, warn);
}
// "Set by hand": a checkbox that shows the field(s) for an override, and clears it when unticked.
function override(label, on, fields, onToggle, note) {
  const box = el('input', { type: 'checkbox', checked: on });
  const wrap = el('div', { className: 'ct-override' }, el('label', { className: 'ef-check' }, box, ` ${label}`), ...fields);
  const show = () => fields.forEach(f => { f.hidden = !box.checked; });
  box.onchange = () => { onToggle(box.checked); show(); };
  show();
  if (note) wrap.append(hint(note));
  return wrap;
}

function form(j, w, f, changed, say) {
  const box = el('div', { className: 'ct-edit' });
  box.append(el('h4', { textContent: `${j.name}: edit`, tabIndex: -1 }));
  const linkFields = [{ key: 'label', label: 'Name' }, { key: 'url', label: 'Link (https://…)', type: 'url', check: httpsCheck }];

  box.append(el('h4', { textContent: 'Agreement (signed JDA)' }),
    listEditor({ items: w.agreement, fields: linkFields, addLabel: '+ Add a document link', blank: LINK, onChange: changed, label: `${j.name} Agreement links`, say }),
    el('h4', { textContent: 'Business Requirement Document (BRD)' }),
    listEditor({ items: w.brd, fields: linkFields, addLabel: '+ Add a document link', blank: LINK, onChange: changed, label: `${j.name} BRD links`, say }),
    hint('Links to the files in Drive or SharePoint. A link that does not start with https:// is not kept.'));

  box.append(el('h4', { textContent: 'Key insights' }),
    listEditor({ items: w.keyInsights, fields: [{ key: 'title', label: 'Insight' }, { key: 'text', label: 'Detail', multiline: true }], addLabel: '+ Add a key insight', blank: BOX, onChange: changed, label: `${j.name} key insights`, say }));

  // Challenges: the report's own (Overall progress), or written here instead.
  const written = Array.isArray(w.challenges);
  let kept = written ? w.challenges : null; // what was written here, kept while unticked so a misclick loses nothing
  const listWrap = el('div');
  const drawList = () => listWrap.replaceChildren(listEditor({ items: w.challenges, fields: [{ key: 'title', label: 'Challenge' }, { key: 'severity', label: 'Severity', options: [['high', 'High'], ['medium', 'Medium'], ['low', 'Low']] }, { key: 'text', label: 'Detail', multiline: true }],
    addLabel: '+ Add a challenge', blank: CHALLENGE, onChange: changed, label: `${j.name} challenges`, say }));
  box.append(el('h4', { textContent: 'Challenges' }), override('Write the challenges here instead of taking them from Overall progress', written, [listWrap], on => {
    if (on) { w.challenges = kept || f.reportChallenges.map(c => ({ title: c.title || '', text: c.text || '', severity: c.severity || 'medium' })); drawList(); }
    else { kept = w.challenges; w.challenges = null; }
    changed();
  }, `Otherwise taken from Overall progress (${f.reportChallenges.length} there now). Ticking starts from those.`));
  if (written) drawList();

  // Progress and cost, worked out from the data unless set by hand.
  const pct = numberInput(w.progressOverride, v => { w.progressOverride = Math.round(v); changed(); }, 'Progress, %', { max: 100 });
  box.append(el('h4', { textContent: 'Progress' }), override('Set the progress by hand (%)', w.progressOverride !== null, [pct], on => { w.progressOverride = on ? (w.progressOverride ?? f.dataProgress ?? 0) : null; pct.firstChild.value = w.progressOverride ?? ''; changed(); },
    `Otherwise the average of its projects on Overall progress (${f.dataProgress === null ? 'no projects yet' : `${f.dataProgress}% now`}).`));
  const spent = numberInput(w.costOverride?.spent, v => { (w.costOverride ||= { spent: 0, sanctioned: 0 }).spent = v; changed(); }, 'Paid, MYR');
  const sanctioned = numberInput(w.costOverride?.sanctioned, v => { (w.costOverride ||= { spent: 0, sanctioned: 0 }).sanctioned = v; changed(); }, 'Sanctioned, MYR');
  const costFields = el('div', { className: 'ct-cost-fields' }, el('label', { className: 'ef' }, el('span', { className: 'ef-label', textContent: 'Paid (MYR, with tax)' }), spent),
    el('label', { className: 'ef' }, el('span', { className: 'ef-label', textContent: 'Sanctioned (MYR, with tax)' }), sanctioned));
  box.append(el('h4', { textContent: 'Cost' }), override('Set the cost figures by hand', !!w.costOverride, [costFields], on => {
    w.costOverride = on ? (w.costOverride || { spent: f.dataCost?.spent ?? 0, sanctioned: f.dataCost?.sanctioned ?? 0 }) : null;
    spent.firstChild.value = w.costOverride?.spent ?? ''; sanctioned.firstChild.value = w.costOverride?.sanctioned ?? ''; changed();
  }, `Otherwise paid invoices against sanctioned amounts from the Invoice Tracker (${f.dataCost ? `now RM ${Math.round(f.dataCost.spent).toLocaleString('en-MY')} paid of RM ${Math.round(f.dataCost.sanctioned).toLocaleString('en-MY')}` : 'no figures there yet'}).`));
  return box;
}
