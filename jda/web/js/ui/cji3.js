// The CJI3 register: every invoice, entered once. It is shown whole on its own page (#/cji3) and
// narrowed to one JDA or one project on those pages. Filter, search, sort, change a status alone
// or in bulk, recalculate on request, delete and restore, and export what is on screen.
import { $, esc } from './dom.js';
import { state } from './state.js';
import * as finance from '../services/finance.js';
import { config } from '../config/index.js';
import { money, fmt, fromBps } from '../finance/money.js';
import { BASE, STATUSES, STATUS_LABEL } from '../finance/core.js';
import { entrySheet } from '../finance/sheets.js';
import { loadCtx, storageNotice, scopeBar, wireScope, partnersIn, monthLabel, statusBadge, options, dialog, act, openRecord, openAudit, exportButtons, exportSheet, today } from './finance-ui.js';
import { openImport, bringOverOldRecords } from './finance-io.js';

const views = {}; // filters, sort order and selection, kept per place the register is shown
const viewFor = key => views[key] ||= { q: '', jda: '', month: '', status: '', partner: '', deleted: false, sort: 'documentDate', dir: -1, selected: new Set() };

export function renderRegister(root, ctx, { jdaId = '', projectId = '', full = false, title = 'All invoices' } = {}) {
  const view = viewFor(`${jdaId}|${projectId}`), { settings } = ctx.fin;
  const scope = ctx.fin.entries.filter(e => (!jdaId || e.jdaId === jdaId) && (!projectId || e.projectId === projectId));
  const months = [...new Set(scope.map(e => e.month).filter(Boolean))].sort().reverse();
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
      ${jdaId ? '' : `<select data-filter="jda">${options(ctx.jdas.map(j => [j.id, j.name]), view.jda, 'All JDAs')}</select>`}
      <select data-filter="month">${options(months.map(m => [m, monthLabel(m)]), view.month, 'All months')}</select>
      <select data-filter="status">${options(STATUSES.map(s => [s, STATUS_LABEL[s]]), view.status, 'All statuses')}</select>
      <select data-filter="partner">${options(partnersIn(ctx.fin).map(p => [p, p]), view.partner, 'All partners')}</select>
      <label class="check"><input type="checkbox" id="reg-deleted" ${view.deleted ? 'checked' : ''}> Show deleted</label>
    </div>
    <p class="msg" id="reg-msg"></p>
    <div id="reg-bulk"></div>
    <div class="pt-scroll" id="reg-table"></div>`;

  const msg = $('#reg-msg', root), text = e => [e.invoiceNo, e.partner, e.vendor, e.description, e.remarks, e.projectCode].join(' ').toLowerCase();
  const shown = () => scope
    .filter(e => !!e.deletedAt === view.deleted && (!view.jda || e.jdaId === view.jda) && (!view.month || e.month === view.month) && (!view.status || e.status === view.status)
      && (!view.partner || e.partner === view.partner) && (!view.q || text(e).includes(view.q.toLowerCase())))
    .sort((a, b) => {
      const x = a[view.sort] ?? '', y = b[view.sort] ?? '';
      return view.dir * (view.sort === 'rate' ? Number(x) - Number(y) : typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true }));
    });

  function draw() {
    const list = shown(), ids = new Set(list.map(e => e.id)), sum = f => list.reduce((t, e) => t + (e[f] || 0), 0);
    for (const id of view.selected) if (!ids.has(id)) view.selected.delete(id);
    $('#reg-table', root).innerHTML = `<table class="reg-table">
      <tr><th><input type="checkbox" id="reg-all" aria-label="Select all" ${list.length && list.every(e => view.selected.has(e.id)) ? 'checked' : ''}></th>
        ${COLS.map(([k, label, cls]) => `<th class="${cls || ''}"><button type="button" class="sort${view.sort === k ? ' on' : ''}" data-sort="${k}">${esc(label)}${view.sort === k ? (view.dir > 0 ? ' ▲' : ' ▼') : ''}</button></th>`).join('')}<th></th></tr>
      ${list.map(e => `<tr class="${e.deletedAt ? 'gone' : ''}">
        <td><input type="checkbox" data-pick="${esc(e.id)}" aria-label="Select ${esc(e.invoiceNo)}" ${view.selected.has(e.id) ? 'checked' : ''}></td>
        <td title="${esc(e.invoiceNo)}"><b>${esc(e.invoiceNo || '(no number)')}</b>${e.missing?.length ? ` <span class="st rejected" title="${esc(e.missing.join('\n'))}">Incomplete</span>` : ''}
          ${e.fileUrl ? ` <a href="${esc(e.fileUrl)}" target="_blank" rel="noopener" title="Open the invoice file">file</a>` : ''}</td>
        <td>${esc(e.documentDate)}</td><td>${monthLabel(e.month)}</td>${jdaId ? '' : `<td>${esc(e.jdaName)}</td>`}<td>${esc(e.projectCode)}</td><td>${esc(e.partner)}</td>
        <td class="num mono">${esc(money(e.netMinor, e.currency))}</td>
        <td class="num mono" title="${esc([e.rateSource, e.rateDate].filter(Boolean).join(', '))}">${e.currency === BASE ? '—' : esc(e.rate || '')}${e.rateOverridden ? ' <span class="flag over">overridden</span>' : ''}</td>
        <td class="num mono">${esc(fmt(e.netMyrMinor))}</td><td class="num mono" title="Tax rate ${esc(fromBps(e.taxRateBps ?? 0))}%">${esc(fmt(e.taxMyrMinor))}</td><td class="num mono"><b>${esc(fmt(e.grossMyrMinor))}</b></td>
        <td>${e.deletedAt ? statusBadge(e.status) : `<select class="st-select ${esc(e.status)}" data-status="${esc(e.id)}" aria-label="Payment status">${options(STATUSES.map(s => [s, STATUS_LABEL[s]]), e.status)}</select>`}</td>
        <td class="${e.dueDate && e.status !== 'paid' && e.dueDate < today() ? 'overdue' : ''}">${esc(e.dueDate || '')}</td>
        <td class="actions">${e.deletedAt ? `<button type="button" class="ghost btn-sm" data-restore="${esc(e.id)}">Restore</button>` : `<button type="button" class="ghost btn-sm" data-edit="${esc(e.id)}">Edit</button>`}
          <button type="button" class="ghost btn-sm" data-history="${esc(e.id)}">History</button>${e.deletedAt ? '' : `<button type="button" class="ghost btn-sm" data-delete="${esc(e.id)}">Delete</button>`}</td></tr>`).join('')
        || `<tr><td colspan="${COLS.length + 2}">${scope.some(e => !!e.deletedAt === view.deleted) ? 'No invoices match these filters.' : view.deleted ? 'Nothing has been deleted.' : 'No invoices yet. Add one, or import a CJI3 sheet.'}</td></tr>`}
      ${list.length ? `<tr class="reg-total"><td colspan="${jdaId ? 8 : 9}">${list.length} invoice(s) shown, MYR · of which paid: ${esc(fmt(list.filter(e => e.status === 'paid').reduce((t, e) => t + (e.grossMyrMinor || 0), 0)))} taxed</td>
        <td class="num mono">${esc(fmt(sum('netMyrMinor')))}</td><td class="num mono">${esc(fmt(sum('taxMyrMinor')))}</td><td class="num mono"><b>${esc(fmt(sum('grossMyrMinor')))}</b></td><td colspan="3"></td></tr>` : ''}
    </table>`;
    $('#reg-bulk', root).innerHTML = view.selected.size ? `<div class="reg-bulk"><b>${view.selected.size} selected</b>
      ${view.deleted ? '<button type="button" class="ghost btn-sm" data-bulk="restore">Restore</button>' : `
        <select id="bulk-status">${options(STATUSES.map(s => [s, STATUS_LABEL[s]]), 'paid')}</select><button type="button" class="ghost btn-sm" data-bulk="status">Set status</button>
        <button type="button" class="ghost btn-sm" data-bulk="recalculate">Recalculate…</button><button type="button" class="ghost btn-sm" data-bulk="delete">Delete</button>`}</div>` : '';
  }
  draw();

  const find = id => ctx.fin.entries.find(e => e.id === id), picked = () => [...view.selected];
  const removeThem = ids => confirm(`Delete ${ids.length === 1 ? `invoice ${find(ids[0])?.invoiceNo || ''}` : `${ids.length} invoices`}? They stop counting at once. You can bring them back with "Show deleted" > Restore.`)
    && act(ctx, msg, () => finance.remove('entry', ids));

  $('#reg-q', root).oninput = e => { view.q = e.target.value; draw(); };
  $('#reg-deleted', root).onchange = e => { view.deleted = e.target.checked; view.selected.clear(); draw(); };
  root.querySelectorAll('[data-filter]').forEach(s => s.onchange = () => { view[s.dataset.filter] = s.value; draw(); });
  $('#reg-add', root).onclick = () => openRecord('entry', ctx, { preset: { jdaId: jdaId || view.jda, projectId } });
  $('#reg-import', root).onclick = () => openImport('entry', ctx, jdaId || view.jda);
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
    if (t.dataset.status) act(ctx, msg, () => finance.setStatus([t.dataset.status], t.value));
  };
  root.onclick = e => {
    const d = e.target.closest('button')?.dataset;
    if (!d) return;
    if (d.sort) { view.dir = view.sort === d.sort ? -view.dir : 1; view.sort = d.sort; draw(); }
    if (d.edit) openRecord('entry', ctx, { record: find(d.edit) });
    if (d.history) openAudit(`History of invoice ${find(d.history)?.invoiceNo || ''}`, d.history);
    if (d.delete) removeThem([d.delete]);
    if (d.restore) act(ctx, msg, () => finance.restore('entry', [d.restore]));
    if (d.bulk === 'status') act(ctx, msg, () => finance.setStatus(picked(), $('#bulk-status', root).value));
    if (d.bulk === 'delete') removeThem(picked());
    if (d.bulk === 'restore') act(ctx, msg, () => finance.restore('entry', picked()));
    if (d.bulk === 'recalculate') openRecalculate(ctx, picked().map(find));
  };
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
  const page = $('#page');
  page.innerHTML = '<p>Loading the CJI3 register…</p>';
  const ctx = await loadCtx(() => renderCji3(jdaId, projectId));
  const jda = ctx.jdas.find(j => j.id === jdaId), project = jda && ctx.projects.find(p => p.id === projectId && p.jdaId === jda.id);
  page.innerHTML = `
    <div class="section-head"><h2>CJI3 register</h2>
      <div class="row"><a class="ghost" href="${jda ? `#/jda/${esc(jda.id)}` : '#/'}">← ${esc(jda ? jda.name : 'All JDAs')}</a>
        <a class="ghost" href="#/payments${jda ? '/' + esc(jda.id) : ''}${project ? '/' + esc(project.id) : ''}">Payment table</a></div></div>
    ${scopeBar(ctx, '#/cji3', jda?.id || '', project?.id || '', true)}
    ${storageNotice(ctx)}
    <div class="section" id="register"></div>`;
  wireScope('#/cji3', jda?.id);
  renderRegister($('#register'), ctx, { jdaId: jda?.id || '', projectId: project?.id || '', full: true, title: jda ? `Invoices · ${jda.name}${project ? ' / ' + project.name : ''}` : 'All invoices' });

  const { settings } = ctx.fin, alive = ctx.fin.entries.filter(e => !e.deletedAt && (!jda || e.jdaId === jda.id) && (!project || e.projectId === project.id));
  state.page = 'cji3';
  state.context = () => ({
    page: `CJI3 register (${jda ? jda.name + (project ? ' / ' + project.name : '') : 'all invoices'})`, taxRate: fromBps(settings.taxRateBps) + '%', note: 'Only Paid invoices count as actual spend. Amounts are MYR after tax unless a currency is shown.',
    invoices: alive.map(e => ({ jda: e.jdaName, project: e.projectCode, partner: e.partner, invoiceNo: e.invoiceNo, date: e.documentDate, month: e.month, original: money(e.netMinor, e.currency), rate: e.rate, taxedMYR: fmt(e.grossMyrMinor), status: STATUS_LABEL[e.status] }))
  });
}
