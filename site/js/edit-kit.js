// What edit mode on both landing pages is built from: the calls to the server, the save bar, and an
// editor for a list of small records (people, links, insights) that can be added, removed and reordered.
// Only signed-in people see edit mode; the server checks the sign-in again on every save.
import { esc } from '/shared/esc.js';
import { toLogin } from '/shared/session.js';

export async function api(method, url, body) {
  let res;
  try { res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) }); }
  catch { throw new Error('No connection to the server. Check the network and try again.'); }
  const out = await res.json().catch(() => ({}));
  if (res.status === 401 && out.signIn) toLogin();
  if (!res.ok) throw Object.assign(new Error(out.error || `The server could not do that (error ${res.status}).`), { status: res.status });
  return out;
}

export const getPath = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj);
export function setPath(obj, path, value) {
  const keys = path.split('.'), last = keys.pop();
  keys.reduce((o, k) => (o[k] = o[k] && typeof o[k] === 'object' ? o[k] : {}), obj)[last] = value;
}

// The bar along the bottom while editing: what state the edit is in, Cancel and Save.
// `save(force)` returns a promise; a 409 (someone else saved first) offers "Save anyway".
export function editBar({ title, save, cancel }) {
  const bar = document.createElement('div');
  bar.className = 'edit-bar';
  bar.setAttribute('role', 'region');
  bar.setAttribute('aria-label', 'Edit mode');
  bar.innerHTML = `<div class="edit-bar-text"><b>${esc(title)}</b><span class="edit-status" role="status">Nothing changed yet. Click any text with a dashed outline to change it.</span></div>
    <div class="edit-bar-actions"><button type="button" class="eb-btn ghost" data-cancel>Cancel</button><button type="button" class="eb-btn primary" data-save disabled>Save changes</button></div>`;
  const status = bar.querySelector('.edit-status'), saveBtn = bar.querySelector('[data-save]');
  let dirty = false;
  const api = {
    el: bar,
    get dirty() { return dirty; },
    changed() { if (dirty) return; dirty = true; saveBtn.disabled = false; status.textContent = 'Unsaved changes. Nothing is published until you save.'; },
    say(text) { status.textContent = text; }
  };
  saveBtn.onclick = async () => {
    saveBtn.disabled = true; status.textContent = 'Saving…';
    try { await save(false); dirty = false; }
    catch (e) {
      status.textContent = `Not saved: ${e.message}`;
      saveBtn.disabled = false;
      if (e.status === 409) { saveBtn.textContent = 'Save anyway'; saveBtn.onclick = async () => { saveBtn.disabled = true; status.textContent = 'Saving…'; try { await save(true); dirty = false; } catch (err) { status.textContent = `Not saved: ${err.message}`; saveBtn.disabled = false; } }; }
    }
  };
  bar.querySelector('[data-cancel]').onclick = () => { if (!dirty || confirm('Leave edit mode without saving your changes?')) cancel(); };
  addEventListener('beforeunload', e => { if (dirty) e.preventDefault(); });
  window.hasUnsavedChanges = () => dirty; // Sign out asks first
  return api;
}

// A list of records, each a row of fields, with Move up, Move down and Remove, and Add below.
// `fields`: [{ key, label, multiline?, type?, placeholder?, options? }]. `onChange` runs after every change.
export function listEditor({ items, fields, addLabel, blank, onChange, max = 50, label }) {
  const wrap = document.createElement('div');
  wrap.className = 'le';
  if (label) wrap.setAttribute('aria-label', label);
  const draw = () => {
    wrap.innerHTML = '';
    items.forEach((item, i) => {
      const row = document.createElement('div');
      row.className = 'le-row';
      for (const f of fields) {
        const lab = document.createElement('label');
        lab.className = `le-field${f.multiline ? ' wide' : ''}`;
        lab.textContent = f.label;
        const input = document.createElement(f.multiline ? 'textarea' : f.options ? 'select' : 'input');
        if (f.options) input.innerHTML = f.options.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('');
        else { if (!f.multiline) input.type = f.type || 'text'; input.placeholder = f.placeholder || ''; }
        input.value = item[f.key] ?? '';
        input.addEventListener('input', () => { item[f.key] = input.value; onChange(); });
        lab.append(input);
        row.append(lab);
      }
      const tools = document.createElement('div');
      tools.className = 'le-tools';
      const btn = (text, title, fn, disabled) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'le-btn'; b.textContent = text; b.title = title; b.setAttribute('aria-label', `${title} (${i + 1})`); b.disabled = disabled; b.onclick = () => { fn(); onChange(); draw(); }; return b; };
      tools.append(
        btn('↑', 'Move up', () => items.splice(i - 1, 0, ...items.splice(i, 1)), i === 0),
        btn('↓', 'Move down', () => items.splice(i + 1, 0, ...items.splice(i, 1)), i === items.length - 1),
        btn('Remove', 'Remove', () => items.splice(i, 1)));
      row.append(tools);
      wrap.append(row);
    });
    const add = document.createElement('button');
    add.type = 'button'; add.className = 'le-add'; add.textContent = addLabel; add.disabled = items.length >= max;
    add.onclick = () => { items.push(blank()); onChange(); draw(); wrap.querySelector('.le-row:last-of-type input, .le-row:last-of-type textarea')?.focus(); };
    wrap.append(add);
  };
  draw();
  return wrap;
}

// Makes one element's text editable in place; `set` gets the new text (line breaks kept when `multiline`).
export function editable(el, value, set, { multiline = false, placeholder = 'Type here' } = {}) {
  el.textContent = value;
  try { el.contentEditable = 'plaintext-only'; } catch { el.contentEditable = 'true'; }
  el.classList.add('ed-inline');
  el.dataset.ph = placeholder;
  el.setAttribute('role', 'textbox');
  if (multiline) el.setAttribute('aria-multiline', 'true');
  el.setAttribute('aria-label', placeholder);
  el.addEventListener('input', () => set(multiline ? el.innerText.replace(/\n{3,}/g, '\n\n').trim() : el.textContent.replace(/\s+/g, ' ').trim()));
  el.addEventListener('keydown', e => { if (e.key === 'Enter' && !multiline) { e.preventDefault(); el.blur(); } });
  el.addEventListener('click', e => { if (el.closest('a')) e.preventDefault(); }); // editing a link's text, not following it
}
