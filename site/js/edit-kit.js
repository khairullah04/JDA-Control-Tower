// What edit mode on both landing pages is built from: the calls to the server, the save bar, and an
// editor for a list of small records (people, links, insights) that can be added, removed and reordered.
// Only signed-in people see edit mode; the server checks the sign-in again on every save.
import { esc } from '/shared/esc.js';
import { toLogin } from '/shared/session.js';

// `token`: a function giving the Firebase sign-in token when the page has one (the Control Tower), so a
// save still goes through after the session cookie has run out. When the sign-in has ended and there
// are unsaved changes, the page is not left: the error says to sign in again in another tab.
export async function api(method, url, body, { token } = {}) {
  let res;
  try {
    const bearer = token ? await token().catch(() => '') : '';
    res = await fetch(url, { method, headers: { 'Content-Type': 'application/json', ...(bearer && { Authorization: `Bearer ${bearer}` }) }, body: body && JSON.stringify(body) });
  } catch { throw new Error('No connection to the server. Check the network and try again.'); }
  const out = await res.json().catch(() => ({}));
  if (res.status === 401 && out.signIn) {
    if (window.hasUnsavedChanges?.()) throw Object.assign(new Error('Your sign-in has ended.'), { status: 401, signIn: true });
    toLogin();
  }
  if (!res.ok) throw Object.assign(new Error(out.error || `The server could not do that (error ${res.status}).`), { status: res.status });
  return out;
}

export const getPath = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj);
export function setPath(obj, path, value) {
  const keys = path.split('.'), last = keys.pop();
  keys.reduce((o, k) => (o[k] = o[k] && typeof o[k] === 'object' ? o[k] : {}), obj)[last] = value;
}

// The bar along the bottom while editing: what state the edit is in, Cancel and Save.
// `save(force)` returns a promise; a 409 (someone else saved first) offers "Save anyway" for that one save.
export function editBar({ title, intro, save, cancel }) {
  const bar = document.createElement('div');
  bar.className = 'edit-bar';
  bar.setAttribute('role', 'region');
  bar.setAttribute('aria-label', 'Edit mode');
  bar.innerHTML = `<div class="edit-bar-text"><b>${esc(title)}</b><span class="edit-status" role="status">${esc(intro)}</span></div>
    <div class="edit-bar-actions"><button type="button" class="eb-btn ghost" data-cancel>Cancel</button><button type="button" class="eb-btn primary" data-save disabled>Save changes</button></div>`;
  const status = bar.querySelector('.edit-status'), saveBtn = bar.querySelector('[data-save]');
  let dirty = false;
  const leaving = e => { if (dirty) e.preventDefault(); };
  addEventListener('beforeunload', leaving);
  window.hasUnsavedChanges = () => dirty; // Sign out asks first
  const close = () => { dirty = false; removeEventListener('beforeunload', leaving); window.hasUnsavedChanges = () => false; };
  saveBtn.onclick = async () => {
    const force = saveBtn.dataset.force === '1';
    delete saveBtn.dataset.force; saveBtn.textContent = 'Save changes';
    saveBtn.disabled = true; status.textContent = 'Saving…';
    try { await save(force); close(); }
    catch (e) {
      saveBtn.disabled = false;
      if (e.signIn) { status.innerHTML = 'Not saved: your sign-in has ended. <a href="/login" target="_blank" rel="noopener">Sign in again in a new tab</a>, then press Save changes here. Your changes are still on this page.'; return; }
      status.textContent = `Not saved: ${e.message}`;
      if (e.status === 409) { saveBtn.textContent = 'Save anyway'; saveBtn.dataset.force = '1'; }
    }
  };
  bar.querySelector('[data-cancel]').onclick = () => { if (!dirty || confirm('Leave edit mode without saving your changes?')) { close(); cancel(); } };
  return {
    el: bar,
    get dirty() { return dirty; },
    changed() { if (dirty) return; dirty = true; saveBtn.disabled = false; status.textContent = 'Unsaved changes. Nothing is published until you save.'; },
    say(text) { status.textContent = text; },
    close
  };
}

// A list of records, each a row of fields, with Move up, Move down and Remove, and Add below. After each
// change focus stays where the person is working, and `say` (the save bar's status line) says what happened.
// `fields`: [{ key, label, multiline?, type?, placeholder?, options?, check? }]. Items are named by their first field.
export function listEditor({ items, fields, addLabel, blank, onChange, max = 50, label, say = () => {} }) {
  const wrap = document.createElement('div');
  wrap.className = 'le';
  wrap.setAttribute('role', 'group');
  if (label) wrap.setAttribute('aria-label', label);
  const draw = focus => {
    wrap.innerHTML = '';
    items.forEach((item, i) => {
      const row = document.createElement('div');
      row.className = 'le-row';
      row.setAttribute('role', 'group');
      row.setAttribute('aria-label', `${label || 'Item'} ${i + 1}`);
      const called = () => `"${item[fields[0].key] || `item ${i + 1}`}"`;
      for (const f of fields) {
        const lab = document.createElement('label');
        lab.className = `le-field${f.multiline ? ' wide' : ''}`;
        lab.textContent = f.label;
        const input = document.createElement(f.multiline ? 'textarea' : f.options ? 'select' : 'input');
        if (f.options) input.innerHTML = f.options.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('');
        else { if (!f.multiline) input.type = f.type || 'text'; input.placeholder = f.placeholder || ''; }
        input.value = item[f.key] ?? '';
        input.addEventListener('input', () => { item[f.key] = input.value; onChange(); f.check?.(input); });
        lab.append(input);
        row.append(lab);
        f.check?.(input);
      }
      const tools = document.createElement('div');
      tools.className = 'le-tools';
      const btn = (text, title, act, disabled) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'le-btn'; b.textContent = text; b.disabled = disabled; b.dataset.act = act;
        b.setAttribute('aria-label', `${title} ${called()}`);
        b.onclick = () => {
          const it = called();
          if (act === 'up') { items.splice(i - 1, 0, ...items.splice(i, 1)); say(`${it} moved to place ${i}.`); draw({ row: i - 1, act: i - 1 === 0 ? 'down' : 'up' }); }
          if (act === 'down') { items.splice(i + 1, 0, ...items.splice(i, 1)); say(`${it} moved to place ${i + 2}.`); draw({ row: i + 1, act: i + 1 === items.length - 1 ? 'up' : 'down' }); }
          if (act === 'remove') { items.splice(i, 1); say(`${it} removed. Cancel leaves without saving if that was a mistake.`); draw(items.length ? { row: Math.min(i, items.length - 1), field: true } : { add: true }); }
          onChange();
        };
        return b;
      };
      tools.append(btn('↑', 'Move up', 'up', i === 0), btn('↓', 'Move down', 'down', i === items.length - 1), btn('Remove', 'Remove', 'remove', false));
      row.append(tools);
      wrap.append(row);
    });
    const add = document.createElement('button');
    add.type = 'button'; add.className = 'le-add'; add.textContent = addLabel; add.disabled = items.length >= max;
    add.onclick = () => { items.push(blank()); onChange(); draw({ row: items.length - 1, field: true }); };
    wrap.append(add);
    if (!focus) return; // put focus back where the person was working
    const row = wrap.querySelectorAll('.le-row')[focus.row];
    (focus.add ? add : focus.field ? row?.querySelector('input, textarea, select') : row?.querySelector(`[data-act="${focus.act}"]`))?.focus();
  };
  draw();
  return wrap;
}

// Makes one element's text editable in place; `set` gets the new text (line breaks kept when `multiline`).
// `label` names the field for screen readers ("Overview: body"); `placeholder` shows when it is empty.
export function editable(el, value, set, { multiline = false, placeholder = 'Type here', label = placeholder } = {}) {
  el.textContent = value;
  try { el.contentEditable = 'plaintext-only'; } catch { el.contentEditable = 'true'; }
  el.classList.add('ed-inline');
  el.dataset.ph = placeholder;
  el.setAttribute('role', 'textbox');
  if (multiline) el.setAttribute('aria-multiline', 'true');
  el.setAttribute('aria-label', label);
  el.addEventListener('input', () => set(multiline ? el.innerText.replace(/\n{3,}/g, '\n\n').trim() : el.textContent.replace(/\s+/g, ' ').trim()));
  el.addEventListener('keydown', e => { if (e.key === 'Enter' && !multiline) { e.preventDefault(); el.blur(); } });
  const link = el.closest('a'); // editing a link's text, not following it: it stops being a link while editing
  if (link) link.removeAttribute('href');
}

// A check for a link field: says beside it when what is typed will not be kept as a link.
export function httpsCheck(input) {
  const bad = !!input.value.trim() && !/^https:\/\/\S+$/i.test(input.value.trim());
  input.setAttribute('aria-invalid', String(bad));
  let note = input.parentElement.querySelector('.le-warn');
  if (bad && !note) { note = Object.assign(document.createElement('span'), { className: 'le-warn', textContent: 'A link must start with https:// or it is not kept.' }); input.after(note); }
  if (!bad) note?.remove();
}
