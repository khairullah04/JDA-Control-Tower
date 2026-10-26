// Invoice history (#/cji3[/<jda>]): every invoice there has been, whatever became of it (paid, pending,
// approved, rejected), newest first. Filter by JDA, by that JDA's partners and by status, search, and
// sort or filter any column from its heading. Each invoice's History says who did what and when.
// Nothing is added here: invoices come from the Microsoft List (Approvals) and are paid by CJI3 lines.
// Edit stays, to complete what the List does not give (project, dates).
import { $, esc } from './dom.js';
import { state, CONTEXT_ROWS } from './state.js';
import { startRender } from './render.js';
import * as finance from '../services/finance.js';
import { config } from '../config/index.js';
import { money, fmt, fromBps } from '../finance/money.js';
import { STATUSES, STATUS_LABEL } from '../finance/core.js';
import { entrySheet } from '../finance/sheets.js';
import { loadCtx, storageNotice, monthLabel, statusBadge, dialog, openRecord, openAudit, exportButtons, exportSheet, options } from './finance-ui.js';
import { bringOverOldRecords } from './finance-io.js';
import { openColumnFilter, filterHeading } from './column-filter.js';
import { stageOf, STAGE_LABEL } from '../finance/workflow.js';

const view = { q: '', partner: '', status: '', cols: {}, sort: 'when', dir: -1 }; // kept while the page redraws
const when = e => e.stageAt || e.updatedAt || e.createdAt || '';
const day = iso => iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
const COLS = [['when', 'Last change'], ['documentDate', 'Invoice date'], ['invoiceNo', 'Invoice #'], ['jdaName', 'JDA'], ['projectCode', 'Project'], ['partner', 'Partner'],
  ['netMinor', 'Amount', 'num'], ['grossMyrMinor', 'Taxed MYR', 'num'], ['status', 'Status']];
const NUMERIC = new Set(['netMinor', 'grossMyrMinor']);
const cellText = (e, k) => k === 'when' ? day(when(e)) : k === 'status' ? STATUS_LABEL[e.status] || e.status || ''
  : k === 'netMinor' ? (e.netMinor == null ? '' : money(e.netMinor, e.currency)) : k === 'grossMyrMinor' ? (e.grossMyrMinor == null ? '' : fmt(e.grossMyrMinor)) : String(e[k] ?? '');
const sortValue = (e, k) => k === 'when' ? when(e) : e[k] ?? '';

export async function renderCji3(jdaId = '') {
  const r = startRender('Loading the invoice history…', () => renderCji3(jdaId)), { page } = r;
  const ctx = await loadCtx(r), { settings } = ctx.fin;
  const jda = ctx.jdas.find(j => j.id === jdaId);
  const all = ctx.fin.entries.filter(e => !e.deletedAt && (!jda || e.jdaId === jda.id));
  const partners = [...new Set(all.map(e => e.partner).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  if (view.partner && !partners.includes(view.partner)) view.partner = '';
  r.current();
  page.innerHTML = `
    <div class="section-head"><h2>Invoice history</h2>
      <div class="row">${exportButtons()}<button type="button" class="ghost btn-sm" id="reg-audit">Audit log</button>
        <button type="button" class="ghost btn-sm" id="reg-tax">Tax rate: ${esc(fromBps(settings.taxRateBps))}%</button>
        ${!settings.migratedAt && !config.demoMode ? '<button type="button" class="ghost btn-sm" id="reg-old">Bring over old tracker invoices</button>' : ''}</div></div>
    ${storageNotice(ctx)}
    <div class="toolbar reg-filters">
      <select id="h-jda" aria-label="JDA">${options(ctx.jdas.map(j => [j.id, j.name]), jda?.id || '', 'All JDAs')}</select>
      <select id="h-partner" aria-label="Partner">${options(partners.map(p => [p, p]), view.partner, jda ? `All ${jda.name} partners` : 'All partners')}</select>
      <select id="h-status" aria-label="Status">${options(STATUSES.map(s => [s, STATUS_LABEL[s]]), view.status, 'Every status')}</select>
      <input type="search" id="reg-q" placeholder="Search invoice number, partner, description" value="${esc(view.q)}">
      <button type="button" class="ghost btn-sm" id="reg-clear-cols" ${Object.keys(view.cols).length ? '' : 'hidden'}>Clear column filters</button>
    </div>
    <p class="msg" id="reg-msg"></p>
    <div class="section pt-scroll" id="reg-table"></div>`;

  const msg = $('#reg-msg'), text = e => [e.invoiceNo, e.partner, e.vendor, e.description, e.remarks, e.projectCode].join(' ').toLowerCase();
  const passing = (skip = '') => all.filter(e => (!view.partner || e.partner === view.partner) && (!view.status || e.status === view.status)
    && (!view.q || text(e).includes(view.q.toLowerCase())) && Object.entries(view.cols).every(([k, allowed]) => k === skip || allowed.has(cellText(e, k))));
  const shown = () => passing().sort((a, b) => {
    const x = sortValue(a, view.sort), y = sortValue(b, view.sort);
    return view.dir * (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true }));
  });
  const draw = () => {
    const list = shown(), taxed = st => fmt(list.filter(e => !st || e.status === st).reduce((t, e) => t + (e.grossMyrMinor || 0), 0));
    $('#reg-table').innerHTML = `<table class="reg-table">
      <tr>${COLS.map(([k, label, cls]) => `<th class="${cls || ''}">${filterHeading(k, label, { sorted: view.sort === k ? view.dir : 0, filtered: !!view.cols[k] })}</th>`).join('')}<th></th></tr>
      ${list.map(e => `<tr>
        <td title="${esc(when(e))}">${esc(day(when(e)))}</td><td>${esc(e.documentDate || '')}</td>
        <td title="${esc(e.invoiceNo)}"><b>${esc(e.invoiceNo || '(no number)')}</b>${e.missing?.length ? ` <span class="st rejected" title="${esc(e.missing.join('\n'))}">Incomplete</span>` : ''}
          ${e.fileUrl ? ` <a href="${esc(e.fileUrl)}" target="_blank" rel="noopener" title="Open the invoice file">file</a>` : ''}</td>
        <td>${esc(e.jdaName)}</td><td>${esc(e.projectCode)}</td><td>${esc(e.partner)}</td>
        <td class="num mono">${e.netMinor == null ? '' : esc(money(e.netMinor, e.currency))}</td><td class="num mono">${esc(fmt(e.grossMyrMinor))}</td>
        <td title="${esc(STAGE_LABEL[stageOf(e)])}">${statusBadge(e.status)}</td>
        <td class="actions"><button type="button" class="ghost btn-sm" data-history="${esc(e.id)}">History</button><button type="button" class="ghost btn-sm" data-edit="${esc(e.id)}">Edit</button></td></tr>`).join('')
        || `<tr><td colspan="${COLS.length + 1}">${all.length ? 'No invoices match these filters.' : 'No invoices yet. They arrive from the Microsoft List (Approvals).'}</td></tr>`}
      ${list.length ? `<tr class="reg-total"><td colspan="7">${list.length} invoice${list.length === 1 ? '' : 's'} · paid ${esc(taxed('paid'))} MYR taxed</td><td class="num mono"><b>${esc(taxed())}</b></td><td colspan="2"></td></tr>` : ''}
    </table>`;
  };
  draw();

  const find = id => ctx.fin.entries.find(e => e.id === id);
  $('#h-jda').onchange = e => { location.hash = `#/cji3${e.target.value ? '/' + e.target.value : ''}`; };
  $('#h-partner').onchange = e => { view.partner = e.target.value; draw(); };
  $('#h-status').onchange = e => { view.status = e.target.value; draw(); };
  $('#reg-q').oninput = e => { view.q = e.target.value; draw(); };
  $('#reg-clear-cols').onclick = e => { view.cols = {}; e.target.hidden = true; draw(); };
  $('#reg-audit').onclick = () => openAudit('Audit log: every change to invoices, sanctioned amounts and settings');
  $('#reg-tax').onclick = () => openTaxRate(ctx);
  if ($('#reg-old')) $('#reg-old').onclick = e => bringOverOldRecords(ctx, e.target, msg);
  page.querySelectorAll('[data-export]').forEach(b => b.onclick = () => exportSheet(`Invoice history${jda ? ' ' + jda.name : ''}`, entrySheet(shown()), b.dataset.export).catch(e => { msg.textContent = e.message; }));
  const openCol = btn => {
    const k = btn.dataset.col, label = COLS.find(c => c[0] === k)[1], seen = new Map();
    for (const e of passing(k)) { const t = cellText(e, k); if (!seen.has(t)) seen.set(t, sortValue(e, k)); }
    const values = [...seen].sort(([, a], [, b]) => typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), undefined, { numeric: true })).map(([t]) => ({ value: t, label: t }));
    openColumnFilter({ anchor: btn, label, kind: NUMERIC.has(k) ? 'number' : ['when', 'documentDate'].includes(k) ? 'date' : 'text', values, allowed: view.cols[k] || null,
      onSort: dir => { view.sort = k; view.dir = dir; draw(); },
      onApply: allowed => { if (allowed) view.cols[k] = allowed; else delete view.cols[k]; $('#reg-clear-cols').hidden = !Object.keys(view.cols).length; draw(); page.querySelector(`[data-col="${k}"]`)?.focus(); } });
  };
  $('#reg-table').onclick = e => {
    const d = e.target.closest('button')?.dataset;
    if (!d) return;
    if (d.col) openCol(e.target.closest('button'));
    if (d.edit) openRecord('entry', ctx, { record: find(d.edit) });
    if (d.history) openAudit(`History of invoice ${find(d.history)?.invoiceNo || ''}`, d.history);
  };

  state.page = 'cji3';
  // The assistant gets the totals of what is in view, and row by row only the first CONTEXT_ROWS on screen.
  const taxedOf = list => fmt(list.reduce((t, e) => t + (e.grossMyrMinor || 0), 0));
  state.context = () => {
    const list = shown();
    return {
      page: `Invoice history (${jda ? jda.name : 'all JDAs'}${view.partner ? ', ' + view.partner : ''})`, note: 'Every invoice, whatever its status. Only Paid ones (matched to a CJI3 payment line) count as spend. Amounts are MYR after tax unless a currency is shown.',
      summary: { invoices: all.length, taxedMYR: taxedOf(all), byStatus: Object.fromEntries(STATUSES.map(s => { const of = all.filter(e => e.status === s); return [STATUS_LABEL[s], { invoices: of.length, taxedMYR: taxedOf(of) }]; })) },
      rowsShown: `${Math.min(list.length, CONTEXT_ROWS)} of the ${list.length} invoice(s) the filters on screen leave`,
      invoices: list.slice(0, CONTEXT_ROWS).map(e => ({ jda: e.jdaName, project: e.projectCode, partner: e.partner, invoiceNo: e.invoiceNo, date: e.documentDate, original: money(e.netMinor, e.currency), taxedMYR: fmt(e.grossMyrMinor), status: STATUS_LABEL[e.status], stage: STAGE_LABEL[stageOf(e)] }))
    };
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
