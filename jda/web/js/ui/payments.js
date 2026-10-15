// A JDA's Payment Table: one row per project, partner and month, laid out as the payment table
// sheet is (ID, Month (PT), Partner, Project, the three PT amounts, then the invoices and their three
// amounts), with the variance against the sanctioned amount. Nothing in it is typed twice: the left
// half is the sanctioned amounts, the right half is the CJI3 entries, and a row opens to show both.
import { $, esc } from './dom.js';
import * as finance from '../services/finance.js';
import { money, fmt } from '../finance/money.js';
import { paymentTable, tableTotals, rowId, isMonth, BASE, FLAG_LABEL } from '../finance/core.js';
import { paymentSheet, ptOriginal, rowRemarks } from '../finance/sheets.js';
import { state, CONTEXT_ROWS, firstRows } from './state.js';
import { startRender } from './render.js';
import { loadCtx, storageNotice, scopeBar, wireScope, summaryCells, monthLabel, statusBadge, openRecord, openAudit, exportButtons, exportSheet, act } from './finance-ui.js';
import { openImport } from './finance-io.js';

const open = new Set(); // rows left open stay open when the page redraws after an edit

// `projectId` narrows the table to one project (the project page); without it, the whole JDA.
export function renderPayments(root, ctx, { jda, projectId = '' }) {
  const mine = r => r.jdaId === jda.id && (!projectId || r.projectId === projectId);
  const rows = paymentTable(ctx.fin.sanctioned.filter(mine), ctx.fin.entries.filter(mine)), t = tableTotals(rows);
  const preset = { jdaId: jda.id, projectId }, gone = ctx.fin.sanctioned.filter(s => mine(s) && s.deletedAt);
  const amount = (minor, currency = BASE) => `<span class="mono">${esc(fmt(minor, currency))}</span>`;
  const lines = (list, cell) => list.map(i => `<div class="pt-line${i.status === 'paid' ? '' : ' unpaid'}">${cell(i)}</div>`).join('') || '<span class="pt-none">—</span>';
  // An amount in its own currency: the code small beside the figure, and the whole of it quiet when it only repeats the MYR column.
  const original = (minor, currency) => `<span class="pt-orig${currency === BASE ? ' same' : ''}"><small>${esc(currency)}</small><span class="mono">${esc(fmt(minor, currency))}</span></span>`;
  const signed = minor => `<span class="mono">${minor > 0 ? '+' : minor < 0 ? '−' : ''}${esc(fmt(Math.abs(minor)))}</span>`; // +162,000.00 over, −1,080,000.00 under
  const varianceOf = minor => minor > 0 ? 'over' : minor < 0 ? 'under' : 'within';
  const totalVarianceMinor = t.actualMinor - t.sanctionedMinor;

  root.innerHTML = `
    <div class="section-head"><h3>Payment table${projectId ? '' : ` · ${esc(jda.name)}`}</h3>
      <div class="row">
        <button type="button" class="ghost btn-sm" id="pt-add">+ Add sanctioned amount</button>
        <button type="button" class="ghost btn-sm" id="pt-import">Import</button>
        ${exportButtons()}
      </div></div>
    ${summaryCells(t)}
    <p class="msg" id="pt-msg"></p>
    <div class="pt-scroll pt-sheet"><table class="pt-table">
      <thead>
      <tr class="pt-groups"><th colspan="4"></th><th colspan="3" class="grp pt">Sanctioned <small>Payment Table</small></th><th colspan="4" class="grp cji3">Invoiced <small>CJI3</small></th>
        <th colspan="3" class="grp pin result">Result <small>paid against sanctioned</small></th><th></th></tr>
      <tr class="pt-cols"><th>ID</th><th title="Month (PT)">Month</th><th>Partner</th><th>Project</th>
        <th class="num edge" title="PT Amount (Original Currency)">Original</th><th class="num" title="PT Amount (MYR)">MYR</th><th class="num" title="PT Amount with tax (MYR)">w TAX</th>
        <th class="edge">Invoice</th><th class="num" title="CJI3 (Original Currency)">Original</th><th class="num" title="CJI3 (MYR)">MYR</th><th class="num" title="CJI3 with tax (MYR)">w TAX</th>
        <th class="num pin total" title="Paid invoices, with tax (MYR)">Total</th><th class="num pin var" title="Total (paid) − w TAX">Variance</th><th class="pin status">Status</th><th>Remarks</th></tr>
      </thead><tbody>
      ${rows.map(r => {
        const pt = ptOriginal(r), has = r.sanctioned.length > 0;
        return `<tr class="pt-row ${r.flag}${open.has(r.key) ? ' open' : ''}" data-key="${esc(r.key)}" tabindex="0" title="Click to see this row's invoices and sanctioned amounts">
          <td class="mono pt-id" title="${esc(r.id)}">${esc(r.id)}</td><td class="pt-month">${monthLabel(r.month)}</td><td title="${esc(r.partner)}">${esc(r.partner)}</td><td title="${esc(r.projectCode)}">${esc(r.projectCode)}</td>
          <td class="num edge">${pt ? original(pt.minor, pt.currency) : has ? '<span class="pt-none">several</span>' : ''}</td>
          <td class="num">${has ? amount(r.ptMyrMinor) : ''}</td><td class="num strong">${has ? amount(r.withTaxMinor) : ''}</td>
          <td class="edge pt-inv">${lines(r.invoices, i => `<span class="pt-no" title="${esc(i.invoiceNo)}">${esc(i.invoiceNo || '(no number)')}</span>${i.status === 'paid' ? '' : statusBadge(i.status)}`)}</td>
          <td class="num">${lines(r.invoices, i => original(i.netMinor, i.currency))}</td>
          <td class="num">${lines(r.invoices, i => amount(i.netMyrMinor))}</td><td class="num">${lines(r.invoices, i => amount(i.grossMyrMinor))}</td>
          <td class="num pin total strong${r.actualMinor ? '' : ' zero'}">${amount(r.actualMinor)}</td><td class="num pin var variance">${signed(r.varianceMinor)}</td>
          <td class="pin status"><span class="flag ${r.flag}">${esc(has ? FLAG_LABEL[r.flag] : 'No sanctioned amount')}</span></td><td class="desc-cell"><div class="clamp" title="${esc(rowRemarks(r))}">${esc(rowRemarks(r))}</div></td></tr>
        <tr class="pt-detail" ${open.has(r.key) ? '' : 'hidden'}><td colspan="15">
          <div class="pt-detail-grid">
            <div><h4>Sanctioned for ${esc(r.id)}</h4>
              <table><tr><th>Description</th><th class="num">Original</th><th class="num">Rate</th><th class="num">MYR</th><th class="num">w TAX</th><th>Remarks</th><th></th></tr>
              ${r.sanctioned.map(s => `<tr><td>${esc(s.description || '—')}</td><td class="num mono">${esc(money(s.netMinor, s.currency))}</td><td class="num mono">${s.currency === BASE ? '—' : esc(s.rate)}</td>
                <td class="num">${amount(s.netMyrMinor)}</td><td class="num">${amount(s.grossMyrMinor)}</td><td>${esc(s.remarks)}</td>
                <td class="actions"><button type="button" class="ghost btn-sm" data-edit-s="${esc(s.id)}">Edit</button><button type="button" class="ghost btn-sm" data-history="${esc(s.id)}">History</button><button type="button" class="ghost btn-sm" data-delete-s="${esc(s.id)}">Delete</button></td></tr>`).join('')
                || '<tr><td colspan="7">Nothing sanctioned for this project, partner and month yet.</td></tr>'}</table>
              <button type="button" class="ghost btn-sm" data-add-s="${esc(r.key)}">+ Add sanctioned amount to this row</button></div>
            <div><h4>Invoices counted in ${esc(r.id)}</h4>
              <table><tr><th>Invoice #</th><th>Date</th><th>Status</th><th class="num">Original</th><th class="num">Rate</th><th class="num">MYR</th><th class="num">Taxed MYR</th><th></th></tr>
              ${r.invoices.map(i => `<tr><td>${esc(i.invoiceNo || '(no number)')}</td><td>${esc(i.documentDate)}</td><td>${statusBadge(i.status)}</td><td class="num mono">${esc(money(i.netMinor, i.currency))}</td>
                <td class="num mono">${i.currency === BASE ? '—' : esc(i.rate)}</td><td class="num">${amount(i.netMyrMinor)}</td><td class="num">${amount(i.grossMyrMinor)}</td>
                <td class="actions"><button type="button" class="ghost btn-sm" data-edit-e="${esc(i.id)}">Edit</button></td></tr>`).join('') || '<tr><td colspan="8">No invoices for this row yet.</td></tr>'}</table>
              <p class="legend">Total is the paid invoices only: ${money(r.actualMinor)} of ${money(r.invoicedMinor)} invoiced.</p>
              <button type="button" class="ghost btn-sm" data-add-e="${esc(r.key)}">+ Add invoice to this row</button></div>
          </div></td></tr>`;
      }).join('') || '<tr><td colspan="15" class="pt-empty">Nothing here yet. Add a sanctioned amount, or enter an invoice in the CJI3 register (Invoices (CJI3), above).</td></tr>'}
      </tbody>
      ${rows.length ? `<tfoot><tr class="pt-foot ${varianceOf(totalVarianceMinor)}"><td colspan="4">${rows.length} ${rows.length === 1 ? 'row' : 'rows'}</td>
        <td class="edge"></td><td></td><td class="num strong">${amount(t.sanctionedMinor)}</td>
        <td class="edge"></td><td></td><td></td><td class="num" title="Invoiced, with tax. Rejected invoices are not counted.">${amount(t.invoicedMinor)}</td>
        <td class="num pin total strong">${amount(t.actualMinor)}</td><td class="num pin var variance">${signed(totalVarianceMinor)}</td><td class="pin status"></td><td></td></tr></tfoot>` : ''}
    </table></div>
    <p class="legend pt-legend">Click a row to see its invoices and sanctioned amounts. Variance = Total (paid) − w TAX. <span class="flag over">Over sanctioned</span> <span class="flag within">Within sanctioned</span> <span class="flag under">Under sanctioned</span></p>
    ${gone.length ? `<details class="pt-gone"><summary>Deleted sanctioned amounts (${gone.length})</summary><table>
      ${gone.map(s => `<tr><td class="mono">${esc(isMonth(s.month) ? rowId(s.projectCode, s.partner, s.month) : s.projectCode)}</td><td>${esc(s.description)}</td><td class="num">${amount(s.grossMyrMinor)}</td>
        <td class="legend">deleted by ${esc(s.deletedBy)} on ${esc(String(s.deletedAt).slice(0, 10))}</td><td class="actions"><button type="button" class="ghost btn-sm" data-restore-s="${esc(s.id)}">Restore</button></td></tr>`).join('')}</table></details>` : ''}`;

  const msg = $('#pt-msg', root), byKey = key => rows.find(r => r.key === key);
  const ofRow = key => { const r = byKey(key); return { jdaId: jda.id, projectId: r.projectId, partner: r.partner, month: r.month }; };
  const find = (list, id) => list.find(x => x.id === id);
  $('#pt-add', root).onclick = () => openRecord('sanctioned', ctx, { preset });
  $('#pt-import', root).onclick = () => openImport('sanctioned', ctx, jda.id);
  root.querySelectorAll('[data-export]').forEach(b => b.onclick = () => exportSheet(`Payment table ${jda.name}${projectId ? ' ' + rows[0]?.projectCode : ''}`, paymentSheet(rows), b.dataset.export).catch(e => { msg.textContent = e.message; }));

  const table = $('.pt-table', root);
  // Total, Variance and Status are pinned to the right edge. Each sits clear of the ones after it, whatever width their figures need.
  const width = cls => $(`th.pin.${cls}`, table).offsetWidth;
  table.style.setProperty('--pin-var', `${width('status')}px`);
  table.style.setProperty('--pin-total', `${width('status') + width('var')}px`);
  const toggle = tr => {
    const key = tr.dataset.key, now = !open.has(key);
    now ? open.add(key) : open.delete(key);
    tr.classList.toggle('open', now); tr.nextElementSibling.hidden = !now;
  };
  table.onclick = e => {
    const b = e.target.closest('button'), d = b?.dataset;
    if (!b) { const tr = e.target.closest('.pt-row'); if (tr) toggle(tr); return; }
    if (d.editS) openRecord('sanctioned', ctx, { record: find(ctx.fin.sanctioned, d.editS) });
    if (d.editE) openRecord('entry', ctx, { record: find(ctx.fin.entries, d.editE) });
    if (d.addS) openRecord('sanctioned', ctx, { preset: ofRow(d.addS) });
    if (d.addE) openRecord('entry', ctx, { preset: ofRow(d.addE) });
    if (d.history) openAudit('History of this sanctioned amount', d.history);
    if (d.deleteS && confirm('Delete this sanctioned amount? It stops counting at once, and can be restored from "Deleted sanctioned amounts" under the table.')) act(ctx, msg, () => finance.remove('sanctioned', [d.deleteS]));
  };
  root.querySelectorAll('[data-restore-s]').forEach(b => b.onclick = () => act(ctx, msg, () => finance.restore('sanctioned', [b.dataset.restoreS])));
  table.onkeydown = e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.pt-row')) { e.preventDefault(); toggle(e.target); } };
}

// The Payment Table on a page of its own (#/payments/<jda>[/<project>]): the full width of the window, one JDA at a time.
export async function renderPaymentsPage(jdaId = '', projectId = '') {
  const r0 = startRender('Loading the Payment Table…', () => renderPaymentsPage(jdaId, projectId)), { page } = r0;
  const ctx = await loadCtx(r0);
  const jda = ctx.jdas.find(j => j.id === jdaId) || ctx.jdas[0];
  if (!jda) throw new Error('There are no JDAs yet. Add one on the dashboard first.');
  const project = ctx.projects.find(p => p.id === projectId && p.jdaId === jda.id);
  r0.current();
  page.innerHTML = `
    <div class="section-head"><h2>Payment table</h2>
      <div class="row"><a class="ghost" href="#/jda/${esc(jda.id)}">← ${esc(jda.name)}</a><a class="ghost" href="#/cji3/${esc(jda.id)}${project ? '/' + esc(project.id) : ''}">Invoices (CJI3)</a></div></div>
    ${scopeBar(ctx, '#/payments', jda.id, project?.id || '')}
    ${storageNotice(ctx)}
    <div class="section" id="payments"></div>`;
  wireScope('#/payments', jda.id);
  renderPayments($('#payments'), ctx, { jda, projectId: project?.id || '' });

  const mine = r => r.jdaId === jda.id && (!project || r.projectId === project.id);
  const rows = paymentTable(ctx.fin.sanctioned.filter(mine), ctx.fin.entries.filter(mine)), t = tableTotals(rows);
  state.page = 'payments';
  state.context = () => ({
    page: `Payment table: ${jda.name}${project ? ' / ' + project.name : ''}`, note: 'Total counts paid invoices only. Variance = Total minus w TAX. Amounts are MYR.',
    totals: { sanctionedWithTax: money(t.sanctionedMinor), invoiced: money(t.invoicedMinor), paid: money(t.actualMinor), remaining: money(t.remainingMinor) },
    ...firstRows(rows),
    rows: rows.slice(0, CONTEXT_ROWS).map(r => ({ id: r.id, month: r.month, partner: r.partner, project: r.projectCode, sanctionedWithTax: money(r.withTaxMinor), paid: money(r.actualMinor), variance: money(r.varianceMinor), status: r.flag, invoices: r.invoices.map(i => i.invoiceNo) }))
  });
}
