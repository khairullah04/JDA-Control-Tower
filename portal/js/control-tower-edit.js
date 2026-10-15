// Edit mode for the JDA Control Tower landing page: for each JDA, its document links (Agreement, BRD),
// key insights, challenges, and the progress and cost figures when they must be set by hand. Values
// worked out from the data are left alone unless "Set by hand" is chosen, and are then labelled as overrides.
// Saved on the server (PUT /api/site/controlTower), which checks the sign-in and every field again.
import { api, editBar, listEditor } from '/site/js/edit-kit.js';

const $ = id => document.getElementById(id);
const LINK = () => ({ label: '', url: '' }), BOX = () => ({ title: '', text: '' }), CHALLENGE = () => ({ title: '', text: '', severity: 'medium' });

export async function start({ jdas, figures, redraw, saved }) {
  const data = await api('GET', '/api/site/controlTower');
  const draft = structuredClone(data.jdas);
  let base = data.updatedAt;
  document.body.classList.add('editing');
  $('editPageBtn').hidden = true;

  const bar = editBar({
    title: 'Editing the Control Tower',
    save: async force => {
      const out = await api('PUT', '/api/site/controlTower', { content: { jdas: draft }, base, force });
      base = out.updatedAt;
      finish(); saved(draft);
    },
    cancel: () => { finish(); redraw(); }
  });
  bar.say('Nothing changed yet. Each JDA tab has a form at its top.');
  const changed = () => bar.changed();
  const finish = () => { bar.el.remove(); document.body.classList.remove('editing'); $('editPageBtn').hidden = false; };
  document.body.append(bar.el);

  for (const j of jdas) {
    const panel = $(`panel-${j.id}`);
    if (panel) panel.prepend(form(j, draft[j.id], figures(j), changed));
  }
}

function el(tag, props = {}, ...children) { const e = Object.assign(document.createElement(tag), props); e.append(...children); return e; }
const hint = text => el('p', { className: 'edit-hint', textContent: text });
function numberInput(value, set, label) {
  const i = el('input', { type: 'number', min: 0, step: 'any', value: value ?? '' });
  i.setAttribute('aria-label', label);
  i.addEventListener('input', () => set(i.value === '' ? null : Number(i.value)));
  return i;
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

function form(j, w, f, changed) {
  const box = el('div', { className: 'ct-edit' });
  box.append(el('h4', { textContent: `${j.name}: edit` }));

  box.append(el('h4', { textContent: 'Agreement (signed JDA)' }),
    listEditor({ items: w.agreement, fields: [{ key: 'label', label: 'Name' }, { key: 'url', label: 'Link (https://…)', type: 'url' }], addLabel: '+ Add a document link', blank: LINK, onChange: changed, label: 'Agreement links' }),
    el('h4', { textContent: 'Business Requirement Document (BRD)' }),
    listEditor({ items: w.brd, fields: [{ key: 'label', label: 'Name' }, { key: 'url', label: 'Link (https://…)', type: 'url' }], addLabel: '+ Add a document link', blank: LINK, onChange: changed, label: 'BRD links' }),
    hint('Links to the files in Drive or SharePoint. A link that does not start with https:// is not kept.'));

  box.append(el('h4', { textContent: 'Key insights' }),
    listEditor({ items: w.keyInsights, fields: [{ key: 'title', label: 'Insight' }, { key: 'text', label: 'Detail', multiline: true }], addLabel: '+ Add a key insight', blank: BOX, onChange: changed, label: 'Key insights' }));

  // Challenges: the report's own (Overall progress), or written here instead.
  const written = Array.isArray(w.challenges);
  const listWrap = el('div');
  const drawList = () => listWrap.replaceChildren(listEditor({ items: w.challenges, fields: [{ key: 'title', label: 'Challenge' }, { key: 'severity', label: 'Severity', options: [['high', 'High'], ['medium', 'Medium'], ['low', 'Low']] }, { key: 'text', label: 'Detail', multiline: true }],
    addLabel: '+ Add a challenge', blank: CHALLENGE, onChange: changed, label: 'Challenges' }));
  box.append(el('h4', { textContent: 'Challenges' }), override('Write the challenges here instead of taking them from Overall progress', written, [listWrap], on => {
    w.challenges = on ? (w.challenges || f.challenges.map(c => ({ title: c.title || '', text: c.text || '', severity: c.severity || 'medium' }))) : null;
    if (on) drawList();
    changed();
  }, `Taken from Overall progress unless ticked (${f.challengesOverride ? 'written here now' : `${f.challenges.length} there now`}).`));
  if (written) drawList();

  // Progress and cost, worked out from the data unless set by hand.
  const pct = numberInput(w.progressOverride, v => { w.progressOverride = v === null ? null : Math.max(0, Math.min(100, Math.round(v))); changed(); }, 'Progress, %');
  box.append(el('h4', { textContent: 'Progress' }), override('Set the progress by hand (%)', w.progressOverride !== null, [pct], on => { w.progressOverride = on ? (w.progressOverride ?? f.progress ?? 0) : null; pct.value = w.progressOverride ?? ''; changed(); },
    'Otherwise the average of its projects on Overall progress.'));
  const spent = numberInput(w.costOverride?.spent, v => { (w.costOverride ||= { spent: 0, sanctioned: 0 }).spent = v ?? 0; changed(); }, 'Paid, MYR');
  const sanctioned = numberInput(w.costOverride?.sanctioned, v => { (w.costOverride ||= { spent: 0, sanctioned: 0 }).sanctioned = v ?? 0; changed(); }, 'Sanctioned, MYR');
  const costFields = el('div', { className: 'ct-cost-fields' }, el('label', { className: 'ef' }, el('span', { className: 'ef-label', textContent: 'Paid (MYR, with tax)' }), spent),
    el('label', { className: 'ef' }, el('span', { className: 'ef-label', textContent: 'Sanctioned (MYR, with tax)' }), sanctioned));
  box.append(el('h4', { textContent: 'Cost' }), override('Set the cost figures by hand', !!w.costOverride, [costFields], on => {
    w.costOverride = on ? (w.costOverride || { spent: f.cost?.spent ?? 0, sanctioned: f.cost?.sanctioned ?? 0 }) : null;
    spent.value = w.costOverride?.spent ?? ''; sanctioned.value = w.costOverride?.sanctioned ?? ''; changed();
  }, 'Otherwise paid invoices against sanctioned amounts from the Invoice Tracker.'));
  return box;
}
