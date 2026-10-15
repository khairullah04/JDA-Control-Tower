// Shared by the CJI3 register and the Payment Tables: loading the data, the form a record is
// entered and corrected in, the change history, and file downloads.
import { $, esc } from './dom.js';
import { listJdas, listAllProjectsWithJda } from '../services/db.js';
import * as finance from '../services/finance.js';
import { money, fmt, toMinor, normRate, toBps, fromBps } from '../finance/money.js';
import { amounts, paymentTable, tableTotals, monthsBetween, spreadOverMonths, MAX_SPAN, BASE, STATUSES, STATUS_LABEL, SAP_FIELDS } from '../finance/core.js';
import { toCsv } from '../finance/sheets.js';
import { localToday } from '../../../../shared/lib/dates.js';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const monthLabel = m => /^\d{4}-\d{2}$/.test(m || '') ? `${MON[m.slice(5) - 1]}-${m.slice(2, 4)}` : '—'; // 2025-08 -> Aug-25
export const statusBadge = s => `<span class="st ${esc(s)}">${esc(STATUS_LABEL[s] || s)}</span>`;
export const today = () => localToday(); // in Malaysia: see shared/dates.js
export const options = (pairs, selected, first) => (first == null ? '' : `<option value="">${esc(first)}</option>`) +
  pairs.map(([v, label]) => `<option value="${esc(v)}" ${String(v) === String(selected) ? 'selected' : ''}>${esc(label)}</option>`).join('');

// Everything a finance screen draws from. Opening a page reads it from the server. A redraw after a
// change on the page (`r.again`) reads nothing: the change has already been put into the page's copy
// of the register (finance/book.js), and the JDAs and projects are as they were. `r` is the render
// (ui/render.js); `ctx.refresh` redraws the page.
let places = null; // the JDAs and projects as last read
export const forget = () => { places = null; }; // a JDA or project was added or changed: read everything again on the next draw
export async function loadCtx(r) {
  const kept = r.again && places;
  if (!kept) {
    const jdas = await listJdas(); // first, alone: the very first call also creates the starting JDAs
    places = { jdas, projects: await listAllProjectsWithJda(jdas) };
  }
  return { ...places, fin: await finance.data({ cached: !!kept }), refresh: r.refresh };
}
export const storageNotice = ctx => ctx.fin.storage === 'file'
  ? '<div class="banner over notice">Invoices and payments are being saved on this server only, not in Firebase, because the server has no Firebase service-account key yet. See docs/server-and-invoices.md, "Where invoices and payments are saved".</div>' : '';
export const partnersIn = fin => [...new Set([...fin.entries, ...fin.sanctioned].filter(r => !r.deletedAt).map(r => r.partner).filter(Boolean))].sort();

// The Payment Table and the CJI3 register each have a page of their own, as wide as the window.
// At the top of both: a tab per JDA and, inside a JDA, a project filter. `base` is '#/payments' or '#/cji3'.
export const scopeBar = (ctx, base, jdaId, projectId, all = false) => `<div class="scope-bar">
    ${all ? `<a class="ghost${jdaId ? '' : ' on'}" href="${base}">All JDAs</a>` : ''}
    ${ctx.jdas.map(j => `<a class="ghost${j.id === jdaId ? ' on' : ''}" href="${base}/${esc(j.id)}">${esc(j.name)}</a>`).join('')}
    ${jdaId ? `<select data-scope aria-label="Project">${options(ctx.projects.filter(p => p.jdaId === jdaId).map(p => [p.id, p.name]), projectId, 'All projects')}</select>` : ''}</div>`;
export function wireScope(base, jdaId) {
  const select = $('[data-scope]');
  if (select) select.onchange = () => { location.hash = `${base}/${jdaId}${select.value ? '/' + select.value : ''}`; };
}
// The summary cells: sanctioned, invoiced, paid, and what is left.
export const summaryCells = t => `<div class="pt-summary">
      <div><small>Total sanctioned (w TAX)</small><b>${money(t.sanctionedMinor)}</b></div>
      <div><small>Total invoiced amount</small><b>${money(t.invoicedMinor)}</b></div>
      <div><small>Total actual (paid)</small><b>${money(t.actualMinor)}</b></div>
      <div class="${t.remainingMinor < 0 ? 'over' : ''}"><small>Remaining</small><b>${money(t.remainingMinor)}</b></div>
    </div>`;
// What a JDA or project page shows of its invoices and payments: the totals, and the way to the two pages.
export const financeSummary = (sanctioned, entries, where) => `<div class="section">
    <div class="section-head"><h3>Invoices and payments</h3>
      <div class="row"><a class="primary" href="#/payments/${where}">Open Payment Table</a><a class="ghost" href="#/cji3/${where}">Open invoices (CJI3)</a></div></div>
    ${summaryCells(tableTotals(paymentTable(sanctioned, entries)))}</div>`;

export function dialog(html, wide = false) {
  const d = $('#modal');
  d.className = wide ? 'wide' : '';
  d.innerHTML = html;
  d.showModal();
  return d;
}
// Runs one change and redraws on success. If it is refused, `undo` puts the control that asked for it
// back as it was, and the reason is shown where it can be seen.
export async function act(ctx, msgEl, fn, undo) {
  if (msgEl) msgEl.textContent = '';
  try { await fn(); ctx.refresh(); }
  catch (e) {
    undo?.();
    if (msgEl) { msgEl.textContent = e.message; msgEl.scrollIntoView?.({ block: 'nearest' }); } else alert(e.message);
  }
}

/* ---------- Files out ---------- */
function download(name, blob) {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
export const exportButtons = () => `<button type="button" class="ghost btn-sm" data-export="csv">Export CSV</button>` +
  (finance.workbook ? '<button type="button" class="ghost btn-sm" data-export="xlsx">Export Excel</button>' : '');
export async function exportSheet(name, rows, as) {
  if (as === 'xlsx') download(`${name}.xlsx`, await finance.workbook([{ name, rows }]));
  else download(`${name}.csv`, new Blob(['﻿' + toCsv(rows)], { type: 'text/csv;charset=utf-8' }));
}

/* ---------- The form: one CJI3 entry ('entry') or one sanctioned amount ('sanctioned') ---------- */
// `record` when correcting an existing one; `preset` fills a new one in (the JDA, project, partner or month it was opened from).
export function openRecord(kind, ctx, { record = null, preset = {} } = {}) {
  const entry = kind === 'entry', r = record || {}, { settings } = ctx.fin;
  const v = k => r[k] ?? preset[k] ?? '';
  const input = (name, label, value, attrs = '') => `<label>${esc(label)}<input name="${name}" value="${esc(value)}" maxlength="${name === 'description' || name === 'remarks' ? 1000 : 200}" ${attrs}></label>`;
  const currencies = [...new Set([...settings.currencies, r.currency].filter(Boolean))];

  const d = dialog(`<form class="rec-form">
    <h3>${record ? 'Edit' : 'Add'} ${entry ? `invoice${r.invoiceNo ? ' ' + esc(r.invoiceNo) : ''}` : 'sanctioned amount'}</h3>
    ${r.missing?.length ? `<p class="msg">This invoice came in incomplete: ${esc(r.missing.join('. '))}.</p>` : ''}
    <div class="rec-grid">
      <label>JDA<select name="jdaId" required>${options(ctx.jdas.map(j => [j.id, j.name]), v('jdaId'), 'Choose…')}</select></label>
      <label>Project<select name="projectId" required></select></label>
      <label>Partner<input name="partner" list="partner-list" maxlength="40" required value="${esc(v('partner'))}" placeholder="e.g. IBM"></label>
      <datalist id="partner-list">${partnersIn(ctx.fin).map(p => `<option value="${esc(p)}">`).join('')}</datalist>
      ${entry ? input('invoiceNo', 'Invoice number', v('invoiceNo'), 'required') + input('documentDate', 'Invoice date', v('documentDate'), 'type="date" required') : ''}
      ${input('month', entry ? 'Payment month' : record ? 'Month (PT)' : 'Month (PT), or the first month', v('month'), 'type="month" required')}
      ${entry || record ? '' : input('toMonth', 'Last month (only if it covers several)', '', 'type="month"')
        + `<label>The amount is<select name="spanMode"><option value="each">for each month</option><option value="split">the total, split evenly over the months</option></select></label>`}
      <label>Currency<select name="currency">${options(currencies.map(c => [c, c]), v('currency') || BASE)}</select></label>
      ${input('amount', entry ? 'Amount before tax, in the invoice’s currency' : 'PT amount, in its original currency', r.netMinor != null ? fmt(r.netMinor, r.currency, true) : '', 'inputmode="decimal" required autocomplete="off"')}
      ${input('taxRate', 'Tax rate %', fromBps(r.taxRateBps ?? settings.taxRateBps), 'inputmode="decimal" required autocomplete="off"')}
    </div>
    <div class="rec-rate" id="rate-block">
      ${input('rate', 'Rate to MYR', v('rate') === '1' ? '' : v('rate'), 'inputmode="decimal" autocomplete="off"')}
      ${input('rateDate', 'Rate date', v('rateDate'), 'type="date"')}
      ${input('rateSource', 'Rate source', v('rateSource') === 'base' ? '' : v('rateSource'), 'autocomplete="off"')}
      <button type="button" class="ghost btn-sm" id="fetch-rate">Get Bank Negara rate</button>
      <small class="legend" id="rate-note"></small>
    </div>
    <div class="rec-preview" id="preview"></div>
    <small class="legend" id="span-note"></small>
    <div class="rec-grid">
      ${entry ? input('vendor', 'Vendor name on the invoice (optional)', v('vendor') === v('partner') ? '' : v('vendor'))
        + input('postingDate', 'Posting date (optional)', v('postingDate'), 'type="date"') + input('dueDate', 'Due date (optional)', v('dueDate'), 'type="date"')
        + `<label>Payment status<select name="status">${options(STATUSES.map(s => [s, STATUS_LABEL[s]]), v('status') || 'pending')}</select></label>`
        + input('fileUrl', 'Link to the invoice file (optional)', v('fileUrl'), 'type="url" placeholder="https://…"') : ''}
      ${input('description', 'Description (optional)', v('description'))}
      ${input('remarks', 'Remarks (optional)', v('remarks'))}
    </div>
    ${entry ? `<details><summary>SAP columns of the CJI3 line (optional)</summary><div class="rec-grid">${SAP_FIELDS.map(([k, label]) => input('sap.' + k, label, r.sap?.[k] ?? '')).join('')}</div></details>` : ''}
    <p class="msg" id="form-msg"></p>
    <div class="row"><button type="button" class="ghost" id="cancel">Cancel</button><button class="primary">Save</button></div></form>`, true);

  const form = $('form', d), el = form.elements, get = name => String(el[name]?.value ?? '').trim();
  const projectsOf = jdaId => ctx.projects.filter(p => p.jdaId === jdaId);
  const fillProjects = keep => { el.projectId.innerHTML = options(projectsOf(get('jdaId')).map(p => [p.id, p.name]), keep, 'Choose…'); };
  fillProjects(v('projectId'));
  el.jdaId.onchange = () => fillProjects('');

  // The payment month follows the invoice date until someone sets it themselves.
  let monthTyped = !!v('month');
  if (entry) {
    el.month.oninput = () => { monthTyped = true; };
    el.documentDate.oninput = () => { if (!monthTyped) el.month.value = get('documentDate').slice(0, 7); };
  }

  // A rate that came from a published source and is then typed over is marked as overridden.
  let published = record && !record.rateOverridden && record.rate && record.rateSource && !/hand|manual|base/i.test(record.rateSource) ? { rate: record.rate, source: record.rateSource } : null;
  let overridden = record?.rateOverridden === true;
  const note = text => { $('#rate-note', d).textContent = text; };
  if (overridden) note('Overridden: this rate was typed over a published one.');
  el.rate.oninput = () => {
    if (!published) return;
    overridden = normRate(get('rate')) !== published.rate;
    el.rateSource.value = overridden ? 'Entered by hand' : published.source;
    note(overridden ? `Overridden: ${published.source} gave ${published.rate}.` : '');
  };
  $('#fetch-rate', d).onclick = async e => {
    e.target.disabled = true; note('Getting the rate…');
    try {
      const got = await finance.forex(get('currency'), entry ? get('documentDate') : '');
      published = got; overridden = false;
      el.rate.value = got.rate; el.rateDate.value = got.date; el.rateSource.value = got.source;
      note(`${got.source} for ${got.date}.`);
    } catch (err) { note(err.message); }
    e.target.disabled = false;
    preview();
  };

  // The three amounts, worked out as the fields are typed, by the same rule the server saves with.
  function preview() {
    const currency = get('currency'), foreign = currency !== BASE;
    $('#rate-block', d).hidden = !foreign;
    const netMinor = toMinor(get('amount'), currency), taxRateBps = toBps(get('taxRate')), rate = foreign ? normRate(get('rate')) : '1';
    const ok = netMinor > 0 && taxRateBps !== null && rate;
    const a = ok ? amounts({ currency, netMinor, rate, taxRateBps }) : null;
    $('#preview', d).innerHTML = a
      ? `<span><small>Original</small><b>${esc(money(netMinor, currency))}</b></span><span class="arrow">→</span><span><small>MYR${foreign ? ' at ' + esc(rate) : ''}</small><b>${money(a.netMyrMinor)}</b></span>
         <span class="arrow">+</span><span><small>Tax ${esc(fromBps(taxRateBps))}%</small><b>${money(a.taxMyrMinor)}</b></span><span class="arrow">=</span><span><small>${entry ? 'Taxed MYR' : 'w TAX'}</small><b>${money(a.grossMyrMinor)}</b></span>`
      : `<small class="legend">Enter the amount${foreign ? ', the rate' : ''} and the tax rate to see the MYR and taxed MYR figures.</small>`;
  }
  // A sanctioned amount that covers several months is saved as one record per month, so each month's row has its own figure.
  const spanning = !entry && !record;
  const span = () => spanning && get('toMonth') ? monthsBetween(get('month'), get('toMonth')) : [];
  function spanNote() {
    if (!spanning) return;
    const months = span(), split = get('spanMode') === 'split', total = toMinor(get('amount'), get('currency'));
    el.spanMode.closest('label').hidden = !get('toMonth');
    $('#span-note', d).textContent = !get('toMonth') ? '' : months.length < 2 ? `The last month must be after the first, and no more than ${MAX_SPAN} months on.`
      : `Covers ${months.length} months, ${monthLabel(months[0])} to ${monthLabel(months.at(-1))}: one sanctioned amount is added to each month, ` + (total > 0
        ? (split ? `${money(Math.floor(total / months.length), get('currency'))} each${total % months.length ? ' (the first months one sen more, so they add up exactly)' : ''}, ${money(total, get('currency'))} in all.`
          : `${money(total, get('currency'))} each, ${money(total * months.length, get('currency'))} in all.`) + ' The figures above are for the amount as typed.' : 'once you enter the amount.');
  }
  form.addEventListener('input', () => { preview(); spanNote(); });
  form.addEventListener('change', spanNote);
  preview(); spanNote();

  $('#cancel', d).onclick = () => d.close();
  form.onsubmit = async e => {
    e.preventDefault();
    const btn = $('.primary', d), msg = $('#form-msg', d), jda = ctx.jdas.find(j => j.id === get('jdaId')), project = ctx.projects.find(p => p.id === get('projectId'));
    const foreign = get('currency') !== BASE;
    const out = {
      ...(record && { id: record.id, expectedUpdatedAt: record.updatedAt }), jdaId: jda?.id || '', jdaName: jda?.name || '', projectId: project?.id || '', projectCode: project?.name || '', partner: get('partner'),
      month: get('month'), currency: get('currency'), amount: get('amount'), taxRate: get('taxRate'), description: get('description'), remarks: get('remarks'),
      ...(foreign && { rate: get('rate'), rateDate: get('rateDate'), rateSource: get('rateSource') || 'Entered by hand', rateOverridden: overridden }),
      ...(entry && {
        invoiceNo: get('invoiceNo'), documentDate: get('documentDate'), vendor: get('vendor'), postingDate: get('postingDate'), dueDate: get('dueDate'),
        status: get('status'), fileUrl: get('fileUrl'), sap: Object.fromEntries(SAP_FIELDS.map(([k]) => [k, get('sap.' + k)]))
      })
    };
    btn.disabled = true; msg.textContent = 'Saving…';
    if (spanning && get('toMonth') && span().length < 2) { msg.textContent = `The last month must be after the first, and no more than ${MAX_SPAN} months on.`; btn.disabled = false; return; }
    try {
      if (span().length > 1) await finance.saveSanctionedOver(spreadOverMonths(out, get('toMonth'), get('spanMode') === 'split'));
      else await finance.save(kind, out);
      d.close(); ctx.refresh();
    }
    catch (err) {
      msg.textContent = err.message; btn.disabled = false;
      if (err.status === 409) ctx.refresh(); // someone else changed it: show what is there now, behind this form
    }
  };
}

/* ---------- Change history ---------- */
const ACTION = { create: 'Entered', import: 'Imported', edit: 'Changed', status: 'Status', recalculate: 'Recalculated', delete: 'Deleted', restore: 'Restored' };
const when = iso => new Date(iso).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' });
// One audit line as a sentence, for the pages' change logs.
export const auditLine = l => ({ ts: l.at, by: l.by, projectId: l.projectId, jdaId: l.jdaId,
  detail: `${l.ref}: ${(ACTION[l.action] || l.action).toLowerCase()}${l.field ? ` ${l.field} from ${l.old || 'empty'} to ${l.new || 'empty'}` : l.new ? ` (${l.new})` : ''}` });

// Every recorded change (who, when, field, old value, new value), for one record or for everything.
export async function openAudit(title, entityId = '') {
  const d = dialog(`<form><h3>${esc(title)}</h3><div id="audit-body"><p class="legend">Loading…</p></div><div class="row"><button class="primary">Close</button></div></form>`, true);
  $('form', d).onsubmit = e => { e.preventDefault(); d.close(); };
  try {
    const lines = await finance.audit({ entityId });
    $('#audit-body', d).innerHTML = lines.length ? `<div class="pt-scroll audit"><table>
      <tr><th>When</th><th>Who</th>${entityId ? '' : '<th>Record</th>'}<th>What</th><th>Field</th><th>Old value</th><th>New value</th></tr>
      ${lines.map(l => `<tr><td class="mono">${esc(when(l.at))}</td><td><span class="log-user">${esc(l.by)}</span></td>${entityId ? '' : `<td>${esc(l.ref)}</td>`}
        <td>${esc(ACTION[l.action] || l.action)}</td><td>${esc(l.field)}</td><td>${esc(l.old)}</td><td>${esc(l.new)}</td></tr>`).join('')}</table></div>`
      : '<p class="legend">No changes recorded yet.</p>';
  } catch (e) { $('#audit-body', d).innerHTML = `<p class="msg">${esc(e.message)}</p>`; }
}
