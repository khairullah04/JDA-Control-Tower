// The CJI3 register: every invoice, entered once. It is shown whole on its own page (#/cji3) and
// narrowed to one JDA or one project on those pages. Filter, search, sort, change a status alone
// or in bulk, recalculate on request, delete and restore, and export what is on screen.
import { $, esc } from './dom.js';
import { state, CONTEXT_ROWS } from './state.js';
import { startRender } from './render.js';
import * as finance from '../services/finance.js';
import { config } from '../config/index.js';
import { money, fmt, fromBps } from '../finance/money.js';
import { BASE, STATUSES, STATUS_LABEL } from '../finance/core.js';
import { entrySheet } from '../finance/sheets.js';
import { loadCtx, storageNotice, scopeBar, wireScope, monthLabel, statusBadge, dialog, act, openRecord, openAudit, exportButtons, exportSheet, today } from './finance-ui.js';
import { openImport, bringOverOldRecords } from './finance-io.js';
import { openColumnFilter, filterHeading } from './column-filter.js';
import { stageOf, STAGE_LABEL } from '../finance/workflow.js';

const views = {}; // filters, sort order and selection, kept per place the register is shown
const viewFor = key => views[key] ||= { q: '', cols: {}, deleted: false, sort: 'documentDate', dir: -1, selected: new Set() };
// What a cell shows, as the column's filter lists it. Money columns list their figure; dates and months as written.
const NUMERIC = new Set(['netMinor', 'rate', 'netMyrMinor', 'taxMyrMinor', 'grossMyrMinor']);
const cellText = (e, k) => k === 'month' ? (e.month ? monthLabel(e.month) : '') : k === 'status' ? STATUS_LABEL[e.status] || e.status || ''
  : k === 'netMinor' ? (e.netMinor == null ? '' : money(e.netMinor, e.currency)) : k === 'rate' ? (e.currency === BASE ? '' : String(e.rate || ''))
  : NUMERIC.has(k) ? (e[k] == null ? '' : fmt(e[k])) : k === 'invoiceNo' ? e.invoiceNo || '' : String(e[k] ?? '');
const sortValue = (e, k) => k === 'rate' ? Number(e.rate) || 0 : e[k] ?? '';
const kindOf = k => NUMERIC.has(k) ? 'number' : ['documentDate', 'dueDate', 'month'].includes(k) ? 'date' : 'text';

export function renderRegister(root, ctx, { jdaId = '', projectId = '', full = false, title = 'All invoices' } = {}) {
  const view = viewFor(`${jdaId}|${projectId}`), { settings } = ctx.fin;
  const scope = ctx.fin.entries.filter(e => (!jdaId || e.jdaId === jdaId) && (!projectId || e.projectId === projectId));
  const COLS = [['invoiceNo', 'Invoice #'], ['documentDate', 'Invoice date'], ['month', 'Month'], ...(jdaId ? [] : [['jdaName', 'JDA']]), ['projectCode', 'Project'], ['partner', 'Partner'],
    ['netMinor', 'Original', 'num'], ['rate', 'Rate', 'num'], ['netMyrMinor', 'MYR', 'num'], ['taxMyrMinor', 'Tax', 'num'], ['grossMyrMinor', 'Taxed MYR', 'num'], ['status', 'Status'], ['dueDate', 'Due']];

  root.innerHTML = `
    <div class="section-head"><h3>${esc(title)}</h3>
      <div class="row">
        <button type="button" class="primary btn-sm" id="reg-add">+ Add invoice</button>
        <button type="button" class="ghost btn-sm" id="reg-import">Import</button>
        ${exportButtons()}
        ${full ? `<button type="button" class="ghost btn-sm" id="reg-tax">Tax rate: ${esc(fromBps(settings.taxRateBps))}%</button><button type="button" class="ghost btn-sm" id="reg-audit">Audit log</button>` : ''}
        ${full && !settings.migratedAt && !config.demoMode ? '<button type="button" class="ghost btn-sm" id="reg-old">Bring over old tracker invoices</button>' : ''}
      </div></div>
    <div class="toolbar reg-filters">
      <input type="search" id="reg-q" placeholder="Search invoice number, partner, vendor, description" value="${esc(view.q)}">
      <span class="legend cf-hint">Click a column's heading to sort or filter it.</span>
      <button type="button" class="ghost btn-sm" id="reg-clear-cols" ${Object.keys(view.cols).length ? '' : 'hidden'}>Clear all column filters</button>
      <label class="check"><input type="checkbox" id="reg-deleted" ${view.deleted ? 'checked' : ''}> Show deleted</label>
    </div>
    <p class="msg" id="reg-msg"></p>
    <div id="reg-bulk"></div>
    <div class="pt-scroll" id="reg-table"></div>`;

  const msg = $('#reg-msg', root), text = e => [e.invoiceNo, e.partner, e.vendor, e.description, e.remarks, e.projectCode].join(' ').toLowerCase();
  // Rows left by the search, "Show deleted" and every column filter except `skip` (a column's own list shows what the others leave).
  const passing = (skip = '') => scope.filter(e => !!e.deletedAt === view.deleted && (!view.q || text(e).includes(view.q.toLowerCase()))
    && Object.entries(view.cols).every(([k, allowed]) => k === skip || allowed.has(cellText(e, k))));
  const shown = () => passing()
    .sort((a, b) => {
      const x = sortValue(a, view.sort), y = sortValue(b, view.sort);
      return view.dir * (view.sort === 'rate' ? Number(x) - Number(y) : typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true }));
    });

  function draw() {
    const list = shown(), ids = new Set(list.map(e => e.id)), sum = f => list.reduce((t, e) => t + (e[f] || 0), 0);
    for (const id of view.selected) if (!ids.has(id)) view.selected.delete(id);
    $('#reg-table', root).innerHTML = `<table class="reg-table">
      <tr><th><input type="checkbox" id="reg-all" aria-label="Select all" ${list.length && list.every(e => view.selected.has(e.id)) ? 'checked' : ''}></th>
        ${COLS.map(([k, label, cls]) => `<th class="${cls || ''}">${filterHeading(k, label, { sorted: view.sort === k ? view.dir : 0, filtered: !!view.cols[k] })}</th>`).join('')}<th></th></tr>
      ${list.map(e => `<tr class="${e.deletedAt ? 'gone' : ''}">
        <td><input type="checkbox" data-pick="${esc(e.id)}" aria-label="Select ${esc(e.invoiceNo)}" ${view.selected.has(e.id) ? 'checked' : ''}></td>
        <td title="${esc(e.invoiceNo)}"><b>${esc(e.invoiceNo || '(no number)')}</b>${e.missing?.length ? ` <span class="st rejected" title="${esc(e.missing.join('\n'))}">Incomplete</span>` : ''}
          ${e.fileUrl ? ` <a href="${esc(e.fileUrl)}" target="_blank" rel="noopener" title="Open the invoice file">file</a>` : ''}</td>
        <td>${esc(e.documentDate)}</td><td>${monthLabel(e.month)}</td>${jdaId ? '' : `<td>${esc(e.jdaName)}</td>`}<td>${esc(e.projectCode)}</td><td>${esc(e.partner)}</td>
        <td class="num mono">${esc(money(e.netMinor, e.currency))}</td>
        <td class="num mono" title="${esc([e.rateSource, e.rateDate].filter(Boolean).join(', '))}">${e.currency === BASE ? '—' : esc(e.rate || '')}${e.rateOverridden ? ' <span class="flag over">overridden</span>' : ''}</td>
        <td class="num mono">${esc(fmt(e.netMyrMinor))}</td><td class="num mono" title="Tax rate ${esc(fromBps(e.taxRateBps ?? 0))}%">${esc(fmt(e.taxMyrMinor))}</td><td class="num mono"><b>${esc(fmt(e.grossMyrMinor))}</b></td>
        <td title="${esc(STAGE_LABEL[stageOf(e)])}">${statusBadge(e.status)}</td>
        <td class="${e.dueDate && e.status !== 'paid' && e.dueDate < today() ? 'overdue' : ''}">${esc(e.dueDate || '')}</td>
        <td class="actions">${e.deletedAt ? `<button type="button" class="ghost btn-sm" data-restore="${esc(e.id)}">Restore</button>` : `<button type="button" class="ghost btn-sm" data-edit="${esc(e.id)}">Edit</button>`}
          <button type="button" class="ghost btn-sm" data-history="${esc(e.id)}">History</button>${e.deletedAt ? '' : `<button type="button" class="ghost btn-sm" data-delete="${esc(e.id)}">Delete</button>`}</td></tr>`).join('')
        || `<tr><td colspan="${COLS.length + 2}">${scope.some(e => !!e.deletedAt === view.deleted) ? 'No invoices match these filters.' : view.deleted ? 'Nothing has been deleted.' : 'No invoices yet. Add one, or import a CJI3 sheet.'}</td></tr>`}
      ${list.length ? `<tr class="reg-total"><td colspan="${jdaId ? 8 : 9}">${list.length} invoice(s) shown, MYR · of which paid: ${esc(fmt(list.filter(e => e.status === 'paid').reduce((t, e) => t + (e.grossMyrMinor || 0), 0)))} taxed</td>
        <td class="num mono">${esc(fmt(sum('netMyrMinor')))}</td><td class="num mono">${esc(fmt(sum('taxMyrMinor')))}</td><td class="num mono"><b>${esc(fmt(sum('grossMyrMinor')))}</b></td><td colspan="3"></td></tr>` : ''}
    </table>`;
    $('#reg-bulk', root).innerHTML = view.selected.size ? `<div class="reg-bulk"><b>${view.selected.size} selected</b>
      ${view.deleted ? '<button type="button" class="ghost btn-sm" data-bulk="restore">Restore</button>' : `
        <button type="button" class="ghost btn-sm" data-bulk="recalculate">Recalculate…</button><button type="button" class="ghost btn-sm" data-bulk="delete">Delete</button>`}</div>` : '';
  }
  draw();

  const find = id => ctx.fin.entries.find(e => e.id === id), picked = () => [...view.selected];
  const removeThem = ids => confirm(`Delete ${ids.length === 1 ? `invoice ${find(ids[0])?.invoiceNo || ''}` : `${ids.length} invoices`}? They stop counting at once. You can bring them back with "Show deleted" > Restore.`)
    && act(ctx, msg, () => finance.remove('entry', ids));

  $('#reg-q', root).oninput = e => { view.q = e.target.value; draw(); };
  $('#reg-deleted', root).onchange = e => { view.deleted = e.target.checked; view.selected.clear(); draw(); };
  $('#reg-clear-cols', root).onclick = e => { view.cols = {}; e.target.hidden = true; draw(); };
  // A column's heading: its sort-and-filter window (column-filter.js), listing the values the other filters leave.
  const openCol = btn => {
    const k = btn.dataset.col, label = COLS.find(c => c[0] === k)[1], seen = new Map();
    for (const e of passing(k)) { const t = cellText(e, k); if (!seen.has(t)) seen.set(t, sortValue(e, k)); }
    const values = [...seen].sort(([, a], [, b]) => typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), undefined, { numeric: true }))
      .map(([t]) => ({ value: t, label: t }));
    openColumnFilter({ anchor: btn, label, kind: kindOf(k), values, allowed: view.cols[k] || null,
      onSort: dir => { view.sort = k; view.dir = dir; draw(); },
      onApply: allowed => { if (allowed) view.cols[k] = allowed; else delete view.cols[k]; $('#reg-clear-cols', root).hidden = !Object.keys(view.cols).length; draw(); root.querySelector(`[data-col="${k}"]`)?.focus(); } });
  };
  $('#reg-add', root).onclick = () => openRecord('entry', ctx, { preset: { jdaId, projectId } });
  $('#reg-import', root).onclick = () => openImport('entry', ctx, jdaId);
  root.querySelectorAll('[data-export]').forEach(b => b.onclick = () => exportSheet('CJI3', entrySheet(shown()), b.dataset.export).catch(e => { msg.textContent = e.message; }));
  if (full) {
    $('#reg-audit', root).onclick = () => openAudit('Audit log: every change to invoices, sanctioned amounts and settings');
    $('#reg-tax', root).onclick = () => openTaxRate(ctx);
    if ($('#reg-old', root)) $('#reg-old', root).onclick = e => bringOverOldRecords(ctx, e.target, msg);
  }

  root.onchange = e => {
    const t = e.target;
    if (t.id === 'reg-all') { shown().forEach(x => t.checked ? view.selected.add(x.id) : view.selected.delete(x.id)); draw(); }
    if (t.dataset.pick) { t.checked ? view.selected.add(t.dataset.pick) : view.selected.delete(t.dataset.pick); draw(); }
  };
  root.onclick = e => {
    const d = e.target.closest('button')?.dataset;
    if (!d) return;
    if (d.col) openCol(e.target.closest('button'));
    if (d.edit) openRecord('entry', ctx, { record: find(d.edit) });
    if (d.history) openAudit(`History of invoice ${find(d.history)?.invoiceNo || ''}`, d.history);
    if (d.delete) removeThem([d.delete]);
    if (d.restore) act(ctx, msg, () => finance.restore('entry', [d.restore]));
    if (d.bulk === 'delete') removeThem(picked());
    if (d.bulk === 'restore') act(ctx, msg, () => finance.restore('entry', picked()));
    if (d.bulk === 'recalculate') openRecalculate(ctx, picked().map(find));
  };
  return shown; // the invoices the filters leave on screen, in the order shown
}

// Stored amounts never change by themselves. This is the one deliberate way to work them out again.
function openRecalculate(ctx, entries) {
  const foreign = [...new Set(entries.filter(e => e.currency !== BASE).map(e => e.currency))], one = foreign.length === 1 ? foreign[0] : '';
  const d = dialog(`<form><h3>Recalculate ${entries.length} invoice(s)</h3>
    <p class="legend">Each invoice keeps the rate and tax rate it was entered with until you do this. Every figure that changes is written to the audit log.</p>
    ${one ? `<label>New ${esc(one)} rate to MYR (leave empty to keep each invoice's own rate)<input name="rate" inputmode="decimal" autocomplete="off"></label>
      <label>Rate date<input name="rateDate" type="date" value="${today()}"></label>
      <button type="button" class="ghost btn-sm" id="fetch-rate">Get Bank Negara rate</button>` : foreign.length ? '<p class="legend">The chosen invoices are in more than one currency, so a new rate cannot be applied to them together.</p>' : ''}
    <label class="check"><input type="checkbox" name="currentTax"> Apply the current tax rate (${esc(fromBps(ctx.fin.settings.taxRateBps))}%) instead of each invoice's own</label>
    <p class="msg" id="form-msg"></p>
    <div class="row"><button type="button" class="ghost" id="cancel">Cancel</button><button class="primary">Recalculate</button></div></form>`);
  const form = $('form', d), msg = $('#form-msg', d);
  let source = 'manual';
  if (one) {
    form.elements.rate.oninput = () => { source = 'manual'; };
    $('#fetch-rate', d).onclick = async () => {
      try { const got = await finance.forex(one, form.elements.rateDate.value); form.elements.rate.value = got.rate; form.elements.rateDate.value = got.date; source = got.source; msg.textContent = ''; }
      catch (e) { msg.textContent = e.message; }
    };
  }
  $('#cancel', d).onclick = () => d.close();
  form.onsubmit = async e => {
    e.preventDefault();
    try {
      await finance.recalculate('entry', entries.map(x => x.id), { rate: one ? form.elements.rate.value.trim() : '', rateDate: one ? form.elements.rateDate.value : '', rateSource: source, currentTax: form.elements.currentTax.checked });
      d.close(); ctx.refresh();
    } catch (err) { msg.textContent = err.message; }
  };
}

function openTaxRate(ctx) {
  const d = dialog(`<form><h3>Tax rate</h3>
    <p class="legend">Used for invoices and sanctioned amounts entered from now on. Those already entered keep the rate they were entered with; to change them, select them and choose Recalculate.</p>
    <label>Tax rate %<input name="taxRate" inputmode="decimal" required autocomplete="off" value="${esc(fromBps(ctx.fin.settings.taxRateBps))}"></label>
    <p class="msg" id="form-msg"></p>
    <div class="row"><button type="button" class="ghost" id="cancel">Cancel</button><button class="primary">Save</button></div></form>`);
  $('#cancel', d).onclick = () => d.close();
  $('form', d).onsubmit = async e => {
    e.preventDefault();
    try { await finance.saveSettings({ taxRate: e.target.elements.taxRate.value }); d.close(); ctx.refresh(); }
    catch (err) { $('#form-msg', d).textContent = err.message; }
  };
}

// The register on a page of its own (#/cji3, #/cji3/<jda>, #/cji3/<jda>/<project>): the full width of the
// window, with the tax rate, the audit log and the way to each Payment Table.
export async function renderCji3(jdaId = '', projectId = '') {
  const r = startRender('Loading the CJI3 register…', () => renderCji3(jdaId, projectId)), { page } = r;
  const ctx = await loadCtx(r);
  const jda = ctx.jdas.find(j => j.id === jdaId), project = jda && ctx.projects.find(p => p.id === projectId && p.jdaId === jda.id);
  r.current();
  page.innerHTML = `
    <div class="section-head"><h2>CJI3 register</h2>
      <div class="row"><a class="ghost" href="#/payments${jda ? '/' + esc(jda.id) : ''}${project ? '/' + esc(project.id) : ''}">Payment table</a></div></div>
    ${scopeBar(ctx, '#/cji3', jda?.id || '', project?.id || '', true)}
    ${storageNotice(ctx)}
    <div class="section" id="register"></div>`;
  wireScope('#/cji3', jda?.id);
  const shown = renderRegister($('#register'), ctx, { jdaId: jda?.id || '', projectId: project?.id || '', full: true, title: jda ? `Invoices · ${jda.name}${project ? ' / ' + project.name : ''}` : 'All invoices' });

  const { settings } = ctx.fin, alive = ctx.fin.entries.filter(e => !e.deletedAt && (!jda || e.jdaId === jda.id) && (!project || e.projectId === project.id));
  state.page = 'cji3';
  // The assistant is sent the totals of the whole register in view, and row by row only what the
  // filters leave on screen (the first CONTEXT_ROWS of it), so a question costs the same however long the register grows.
  const taxed = list => fmt(list.reduce((t, e) => t + (e.grossMyrMinor || 0), 0));
  state.context = () => {
    const list = shown();
    return {
      page: `CJI3 register (${jda ? jda.name + (project ? ' / ' + project.name : '') : 'all invoices'})`, taxRate: fromBps(settings.taxRateBps) + '%', note: 'Only Paid invoices count as actual spend. Amounts are MYR after tax unless a currency is shown.',
      summary: { invoices: alive.length, taxedMYR: taxed(alive), byStatus: Object.fromEntries(STATUSES.map(s => { const of = alive.filter(e => e.status === s); return [STATUS_LABEL[s], { invoices: of.length, taxedMYR: taxed(of) }]; })) },
      rowsShown: `${Math.min(list.length, CONTEXT_ROWS)} of the ${list.length} ${list[0]?.deletedAt ? 'deleted ' : ''}invoice(s) the filters on screen leave`,
      invoices: list.slice(0, CONTEXT_ROWS).map(e => ({ jda: e.jdaName, project: e.projectCode, partner: e.partner, invoiceNo: e.invoiceNo, date: e.documentDate, month: e.month, original: money(e.netMinor, e.currency), rate: e.rate, taxedMYR: fmt(e.grossMyrMinor), status: STATUS_LABEL[e.status] }))
    };
  };
}
