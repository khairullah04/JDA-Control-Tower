// A column's sort-and-filter window, as in Excel: opened by clicking a column's heading. Sort A to Z /
// Z to A (smallest to largest for numbers, oldest to newest for dates), Clear filter, a search box, and
// a checklist of the column's values with Select All. OK applies, Cancel / Escape / a click outside
// closes without changing anything.
//
//   openColumnFilter({ anchor, label, kind, values, allowed, onSort, onApply })
//     values  [{ value, label }] in the order to list them ('' is listed as "(Blanks)")
//     allowed a Set of the values shown now, or null when the column is not filtered
//     kind    'text' | 'number' | 'date': only changes the wording of the sort lines
//     onSort(1 | -1), onApply(Set | null)   null: no filter on this column
import { esc } from './dom.js';

const icon = d => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const SORT = {
  text: ['Sort A to Z', 'Sort Z to A'],
  number: ['Sort Smallest to Largest', 'Sort Largest to Smallest'],
  date: ['Sort Oldest to Newest', 'Sort Newest to Oldest']
};
let openOne = null;

export function openColumnFilter({ anchor, label, kind = 'text', values, allowed = null, onSort, onApply }) {
  openOne?.close();
  const pop = document.createElement('div');
  pop.className = 'cf-pop';
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', `Sort and filter ${label}`);
  const [up, down] = SORT[kind] || SORT.text;
  pop.innerHTML = `
    <button type="button" class="cf-item" data-sort="1">${icon('<path d="M4 4h5l-5 7h5M6.5 13v7M4 17l2.5 3 2.5-3"/><path d="M14 6h7M14 11h5M14 16h3"/>')}<span>${esc(up)}</span></button>
    <button type="button" class="cf-item" data-sort="-1">${icon('<path d="M4 4h5l-5 7h5M6.5 13v7M4 17l2.5 3 2.5-3"/><path d="M14 6h3M14 11h5M14 16h7"/>')}<span>${esc(down)}</span></button>
    <hr>
    <button type="button" class="cf-item" data-clear ${allowed ? '' : 'disabled'}>${icon('<path d="M3 5h14l-5 6v5l-4 2v-7Z"/><path d="m16 15 5 5m0-5-5 5"/>')}<span>Clear Filter from '${esc(label)}'</span></button>
    <hr>
    <label class="cf-search">${icon('<circle cx="11" cy="11" r="6"/><path d="m20 20-4.5-4.5"/>')}<input type="search" placeholder="Search" aria-label="Search the values of ${esc(label)}"></label>
    <div class="cf-list" role="group" aria-label="Values of ${esc(label)}"></div>
    <div class="cf-foot"><button type="button" class="primary btn-sm" data-ok>OK</button><button type="button" class="ghost btn-sm" data-cancel>Cancel</button></div>`;
  document.body.append(pop);

  // What is ticked, in the window only until OK.
  const ticked = new Set(allowed ? values.map(v => v.value).filter(v => allowed.has(v)) : values.map(v => v.value));
  const list = pop.querySelector('.cf-list'), search = pop.querySelector('input'), ok = pop.querySelector('[data-ok]');
  const shownNow = () => { const q = search.value.trim().toLowerCase(); return values.filter(v => !q || (v.label || '(Blanks)').toLowerCase().includes(q)); };
  function draw() {
    const shown = shownNow(), all = shown.length > 0 && shown.every(v => ticked.has(v.value)), some = shown.some(v => ticked.has(v.value));
    list.innerHTML = `<label class="cf-row cf-all"><input type="checkbox" data-all ${all ? 'checked' : ''}><span>${search.value.trim() ? '(Select All Search Results)' : '(Select All)'}</span></label>
      ${shown.map((v, i) => `<label class="cf-row"><input type="checkbox" data-i="${values.indexOf(v)}" ${ticked.has(v.value) ? 'checked' : ''}><span>${v.label ? esc(v.label) : '<i>(Blanks)</i>'}</span></label>`).join('')
      || '<p class="cf-none">No matches</p>'}`;
    list.querySelector('[data-all]').indeterminate = some && !all;
    ok.disabled = ticked.size === 0; // as in Excel: a filter must leave at least one value
  }
  draw();
  search.oninput = draw;
  list.onchange = e => {
    const t = e.target;
    if (t.dataset.all !== undefined) shownNow().forEach(v => t.checked ? ticked.add(v.value) : ticked.delete(v.value));
    else { const v = values[+t.dataset.i].value; t.checked ? ticked.add(v) : ticked.delete(v); }
    draw();
  };

  // Placed under the heading, kept inside the window.
  const place = () => {
    const r = anchor.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
    pop.style.left = `${Math.max(8, Math.min(r.left, innerWidth - w - 8))}px`;
    pop.style.top = `${r.bottom + 4 + h > innerHeight - 8 ? Math.max(8, r.top - h - 4) : r.bottom + 4}px`;
  };
  place();

  const close = () => {
    pop.remove(); openOne = null;
    removeEventListener('pointerdown', outside, true); removeEventListener('resize', place); removeEventListener('scroll', onScroll, true);
    anchor.setAttribute('aria-expanded', 'false'); anchor.focus();
  };
  const outside = e => { if (!pop.contains(e.target) && !anchor.contains(e.target)) close(); };
  const onScroll = e => { if (!pop.contains(e.target)) place(); }; // the page or the table scrolled: follow the heading
  addEventListener('pointerdown', outside, true); addEventListener('resize', place); addEventListener('scroll', onScroll, true);
  pop.onkeydown = e => { if (e.key === 'Escape') { e.preventDefault(); close(); } if (e.key === 'Enter' && e.target === search && !ok.disabled) ok.click(); };
  pop.onclick = e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.sort) { close(); onSort(Number(b.dataset.sort)); }
    if (b.dataset.clear !== undefined) { close(); onApply(null); }
    if (b.dataset.cancel !== undefined) close();
    if (b.dataset.ok !== undefined) { const every = values.every(v => ticked.has(v.value)); close(); onApply(every ? null : new Set(ticked)); }
  };
  anchor.setAttribute('aria-expanded', 'true');
  openOne = { close };
  search.focus();
}

// A heading that opens the window: its name, and an arrow when sorted or a funnel when filtered.
export const filterHeading = (key, label, { sorted = 0, filtered = false } = {}) =>
  `<button type="button" class="cf-head${filtered ? ' filtered' : ''}${sorted ? ' sorted' : ''}" data-col="${esc(key)}" aria-haspopup="dialog" aria-expanded="false"
    title="Sort and filter ${esc(label)}">${esc(label)}<span class="cf-mark" aria-hidden="true">${filtered ? icon('<path d="M4 5h16l-6 7v6l-4 2v-8Z"/>') : sorted > 0 ? '▲' : sorted < 0 ? '▼' : icon('<path d="m7 10 5 5 5-5"/>')}</span>${filtered ? '<span class="visually-hidden"> (filtered)</span>' : ''}</button>`;
