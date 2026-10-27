// CJI3 payments (#/cji3-lines/<jda12|jda3>): the payment evidence. One tab per file the company sends:
// JDA 1 + JDA 2 together, and JDA 3. Upload a file (a preview first, then the import: lines already in
// are skipped, changed ones updated, nothing doubled), see every line with the invoice it paid, match
// by hand the lines that could not be matched, see the log of past uploads, and export the lines.
import { $, esc } from './dom.js';
import { state } from './state.js';
import { startRender } from './render.js';
import * as finance from '../services/finance.js';
import { fmt } from '../finance/money.js';
import { GROUPS, COLUMNS, MATCH_LABEL, inGroup, candidatesFor, lineMyr } from '../finance/cji3.js';
import { STAGE_LABEL, stageOf } from '../finance/workflow.js';
import { loadCtx, storageNotice, options, dialog, exportButtons, exportSheet } from './finance-ui.js';

const views = {};
const viewFor = g => views[g] ||= { show: 'all', q: '' };
const SHOW = [['all', 'All lines'], ['open', 'Not matched'], ['check', 'To check: amount, part paid, not approved or incomplete'], ['matched', 'Matched']];
const CHECK = ['part_paid', 'amount_differs', 'incomplete', 'not_approved'];
const when = iso => iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
const num = (minor, cur) => minor == null ? '' : { n: fmt(minor, cur, true) };

export async function renderCji3Lines(groupId = 'jda12') {
  const group = GROUPS[groupId] ? groupId : 'jda12';
  const r = startRender('Loading the CJI3 payments…', () => renderCji3Lines(group)), { page } = r;
  const [ctx, lines, imports] = await Promise.all([loadCtx(r), finance.cji3Lines(group), finance.cji3Imports()]);
  r.current();
  const view = viewFor(group), invoices = ctx.fin.entries.filter(e => !e.deletedAt && inGroup(group, e.jdaName)), byId = new Map(ctx.fin.entries.map(e => [e.id, e]));
  const open = lines.filter(l => !l.invoiceId).length;
  page.innerHTML = `
    <div class="section-head"><h2>CJI3 payments</h2>
      <div class="row"><a class="ghost" href="#/payments">Payment tables</a></div></div>
    ${storageNotice(ctx)}
    <nav class="scope-bar" aria-label="CJI3 file">${Object.entries(GROUPS).map(([id, g]) => `<a class="ghost${id === group ? ' on' : ''}" href="#/cji3-lines/${id}"${id === group ? ' aria-current="page"' : ''}>${esc(g.label)}</a>`).join('')}</nav>

    <div class="section cj-upload">
      <h3>Upload the ${esc(GROUPS[group].label)} CJI3 file</h3>
      <p class="legend">The .xlsx exported from SAP, as often as payments are made. Lines already in are skipped and changed ones updated, so the same or an overlapping file never doubles anything. You see what it will do before anything is saved.</p>
      <div class="row"><input type="file" id="cj-file" accept=".xlsx,.csv" aria-label="CJI3 file"><button type="button" class="primary" id="cj-preview" disabled>Preview</button></div>
      <div id="cj-result" role="status"></div>
    </div>

    <div class="section">
      <div class="section-head"><h3>Lines · ${esc(GROUPS[group].label)} <span class="legend">${lines.length} line(s), ${open} not matched</span></h3>
        <div class="row">${open ? '<button type="button" class="ghost btn-sm" id="cj-rematch" title="Match again the lines not yet matched, against the invoices there are now">Match again</button>' : ''}${exportButtons()}</div></div>
      <div class="toolbar reg-filters">
        <input type="search" id="cj-q" placeholder="Search reference, WBS, name, header text" value="${esc(view.q)}">
        <select id="cj-show" aria-label="Show">${options(SHOW, view.show)}</select>
      </div>
      <p class="msg" id="cj-msg" role="status"></p>
      <div class="pt-scroll" id="cj-table"></div>
    </div>

    <div class="section"><h3>Uploads</h3>
      ${imports.filter(i => i.group === group).length ? `<div class="pt-scroll"><table class="reg-table">
        <tr><th>When</th><th>Who</th><th>File</th><th class="num">Rows</th><th class="num">Added</th><th class="num">Skipped</th><th class="num">Updated</th><th class="num">Not readable</th><th>Matched</th></tr>
        ${imports.filter(i => i.group === group).map(i => `<tr><td class="mono">${esc(when(i.at))}</td><td>${esc(i.by)}</td><td>${esc(i.fileName)}</td><td class="num">${i.rows}</td><td class="num">${i.added}</td><td class="num">${i.skipped}</td><td class="num">${i.updated}</td>
          <td class="num" title="${esc((i.malformed || []).map(m => `Line ${m.line}: ${m.why}`).join('\n'))}">${(i.malformed || []).length}</td>
          <td class="legend">${i.match ? `${i.match.paid} paid, ${(i.match.part_paid ?? 0) + (i.match.amount_differs ?? 0)} amount to check, ${i.match.linked} added to paid, ${i.match.none + i.match.ambiguous} to match` : ''}</td></tr>`).join('')}
      </table></div>` : '<p class="legend">No uploads yet.</p>'}</div>`;

  const text = l => [l.reference, l.wbs, l.name, l.headerText, l.coObject, byId.get(l.invoiceId)?.invoiceNo].join(' ').toLowerCase();
  const shown = () => lines.filter(l => (view.show === 'all' || (view.show === 'open' ? !l.invoiceId : view.show === 'check' ? CHECK.includes(l.matchState) : l.invoiceId && !CHECK.includes(l.matchState)))
    && (!view.q || text(l).includes(view.q.toLowerCase())));
  function draw() {
    const list = shown();
    $('#cj-table').innerHTML = `<table class="reg-table cj-table">
      <tr><th>Posting date</th><th>Reference</th><th>WBS Element</th><th>CO Object</th><th>Name</th><th>Doc. type</th><th class="num">Value TranCurr</th><th class="num">Val/COArea</th><th>Invoice</th></tr>
      ${list.map(l => { const inv = byId.get(l.invoiceId); return `<tr class="${l.invoiceId ? '' : 'cj-open'}">
        <td class="mono">${esc(l.postingDate)}</td><td><b>${esc(l.reference || '—')}</b></td><td class="mono">${esc(l.wbs)}</td><td>${esc(l.coObject)}</td><td>${esc(l.name)}</td><td>${esc(l.documentType)}</td>
        <td class="num mono">${esc(l.currency)} ${esc(fmt(l.valueTranMinor, l.currency))}</td><td class="num mono">${esc(l.valueCoAreaMinor == null ? '' : fmt(l.valueCoAreaMinor))}</td>
        <td>${inv ? `<b>${esc(inv.invoiceNo)}</b> <small class="legend">${esc(inv.jdaName)} / ${esc(inv.projectCode)} · ${esc(STAGE_LABEL[stageOf(inv)])}</small><br>` : ''}<span class="st ${['paid', 'linked', 'manual'].includes(l.matchState) ? 'paid' : 'pending'}">${esc(MATCH_LABEL[l.matchState] || (l.invoiceId ? 'Matched' : 'Not matched'))}</span>
          ${inv ? `<small class="legend cj-amounts">Line ${esc(lineMyr(l) == null ? '—' : fmt(lineMyr(l)))} · invoice ${esc(fmt(inv.grossMyrMinor))}${l.amountCheck?.lines != null && l.amountCheck.lines !== lineMyr(l) ? ` · all its lines ${esc(fmt(l.amountCheck.lines))}` : ''}</small>` : ''}
          ${['part_paid', 'amount_differs'].includes(l.matchState) && inv && ['to_be_paid', 'sent_to_pd'].includes(stageOf(inv)) && inv.projectId && /^\d{4}-\d{2}$/.test(inv.month || '') ? `<button type="button" class="primary btn-sm" data-confirm="${esc(l.id)}">Confirm invoice Paid</button>` : ''}
          ${l.invoiceId ? `<button type="button" class="ghost btn-sm" data-unmatch="${esc(l.id)}">Undo match</button>` : `<button type="button" class="primary btn-sm" data-match="${esc(l.id)}">Match…</button>`}</td></tr>`; }).join('')
        || `<tr><td colspan="9">${lines.length ? 'No lines match these filters.' : 'No lines yet. Upload this file above.'}</td></tr>`}
    </table>`;
  }
  draw();
  $('#cj-q').oninput = e => { view.q = e.target.value; draw(); };
  $('#cj-show').onchange = e => { view.show = e.target.value; draw(); };
  const say = t => { $('#cj-msg').textContent = t; };
  $('#cj-table').addEventListener('click', async ev => {
    const m = ev.target.closest('[data-match]'), u = ev.target.closest('[data-unmatch]'), c = ev.target.closest('[data-confirm]');
    if (c) {
      const l = lines.find(x => x.id === c.dataset.confirm), inv = byId.get(l.invoiceId);
      if (confirm(`Mark invoice ${inv?.invoiceNo || ''} Paid? Its CJI3 line(s) come to ${fmt(l.amountCheck?.lines ?? lineMyr(l) ?? 0)} against ${fmt(inv?.grossMyrMinor ?? 0)} invoiced. Do this only once you have checked the difference.`)) {
        try { await finance.matchLine(l.id, l.invoiceId); ctx.refresh(); } catch (e) { say(e.message); }
      }
    }
    if (m) openMatch(ctx, lines.find(l => l.id === m.dataset.match), invoices);
    if (u && confirm('Undo this match? If this line is what made its invoice Paid, the invoice goes back to the To Be Paid queue.')) {
      try { await finance.matchLine(u.dataset.unmatch, ''); ctx.refresh(); } catch (e) { say(e.message); }
    }
  });
  $('#cj-rematch')?.addEventListener('click', async () => {
    try { const c = await finance.rematch(group); say(`${c.paid} line(s) made their invoice Paid, ${c.part_paid} part payment(s), ${c.amount_differs} with an amount to check, ${c.linked} added to paid invoices, ${c.not_approved ?? 0} waiting for their invoice to be approved, ${c.incomplete ?? 0} waiting for their invoice to be completed, ${c.none + c.ambiguous} still to match.`); setTimeout(ctx.refresh, 1500); }
    catch (e) { say(e.message); }
  });
  page.querySelectorAll('[data-export]').forEach(b => b.onclick = () => exportSheet(`CJI3 ${GROUPS[group].label}`, sheetOf(shown(), byId), b.dataset.export));
  wireUpload(ctx, group);
  state.page = 'cji3-lines';
  state.context = () => `CJI3 payments, ${GROUPS[group].label}: ${lines.length} line(s), ${open} not matched.`;
}

// The lines as the file had them, then what the tracker knows: the invoice each paid, and how it was matched.
const sheetOf = (lines, byId) => [[...COLUMNS.map(([, label]) => label), 'Invoice', 'Invoice JDA', 'Invoice project', 'Match'],
  ...lines.map(l => { const inv = byId.get(l.invoiceId); return [...COLUMNS.map(([k]) => k === 'valueTran' ? num(l.valueTranMinor, l.currency) : k === 'valueObj' ? num(l.valueObjMinor) : k === 'valueCoArea' ? num(l.valueCoAreaMinor) : l[k] ?? ''),
    inv?.invoiceNo || '', inv?.jdaName || '', inv?.projectCode || '', MATCH_LABEL[l.matchState] || (l.invoiceId ? 'Matched' : 'Not matched')]; })];

function wireUpload(ctx, group) {
  const input = $('#cj-file'), btn = $('#cj-preview'), out = $('#cj-result');
  input.onchange = () => { btn.disabled = !input.files[0]; out.innerHTML = ''; };
  btn.onclick = async () => {
    const file = input.files[0];
    if (!file) return;
    btn.disabled = true; out.innerHTML = '<p class="legend">Reading the file…</p>';
    try {
      const p = await finance.importCji3(group, file, { dryRun: true });
      out.innerHTML = `<div class="cj-preview">
        <p><b>${esc(file.name)}</b>: ${p.rows} row(s). <b>${p.added}</b> new line(s) will be added, ${p.skipped} already in (skipped), ${p.updated} changed (updated).</p>
        ${p.malformed.length ? `<p class="msg">${p.malformed.length} row(s) cannot be read and will be left out:</p><ul class="legend">${p.malformed.slice(0, 20).map(m => `<li>Line ${m.line}: ${esc(m.why)}</li>`).join('')}${p.malformed.length > 20 ? `<li>…and ${p.malformed.length - 20} more</li>` : ''}</ul>` : ''}
        <div class="row">${p.added || p.updated ? `<button type="button" class="primary" id="cj-go">Import ${p.added + p.updated} line(s)</button>` : '<span class="legend">Nothing new in this file.</span>'}<button type="button" class="ghost" id="cj-cancel">Cancel</button></div></div>`;
      $('#cj-cancel').onclick = () => { out.innerHTML = ''; input.value = ''; btn.disabled = true; };
      $('#cj-go')?.addEventListener('click', async ev => {
        ev.target.disabled = true; ev.target.textContent = 'Importing…';
        try {
          const done = await finance.importCji3(group, file);
          const m = done.match || {};
          out.innerHTML = `<p class="ok">Imported: ${done.added} added, ${done.skipped} skipped, ${done.updated} updated. ${m.paid || 0} invoice(s) now Paid; ${(m.none || 0) + (m.ambiguous || 0)} line(s) to match by hand.</p>`;
          setTimeout(ctx.refresh, 1800);
        } catch (e) { out.innerHTML = `<p class="msg">${esc(e.message)}</p>`; }
      });
    } catch (e) { out.innerHTML = `<p class="msg">${esc(e.message)}</p>`; btn.disabled = false; }
  };
}

// Matching a line by hand: its candidates first (when several invoices could match), then any open invoice of its file's JDAs.
function openMatch(ctx, l, invoices) {
  if (!l) return;
  const cands = candidatesFor({ ...l, coObject: '' }, invoices), others = invoices.filter(e => e.status !== 'rejected' && !cands.includes(e)).sort((a, b) => String(a.invoiceNo).localeCompare(String(b.invoiceNo), undefined, { numeric: true }));
  const label = e => `${e.invoiceNo} · ${e.jdaName} / ${e.projectCode} · ${e.partner} · ${fmt(e.grossMyrMinor)} MYR · ${STAGE_LABEL[stageOf(e)]}`;
  const d = dialog(`<form class="rec-form"><h3>Match this CJI3 line to an invoice</h3>
    <p><b>${esc(l.reference || '(no reference)')}</b> · ${esc(l.postingDate)} · WBS ${esc(l.wbs)} · ${esc(l.currency)} ${esc(fmt(l.valueTranMinor, l.currency))}${l.headerText ? ` · ${esc(l.headerText)}` : ''}</p>
    <label>Invoice<select id="cj-inv" required>${cands.length ? `<optgroup label="Same reference">${cands.map(e => `<option value="${esc(e.id)}">${esc(label(e))}</option>`).join('')}</optgroup>` : '<option value="">Choose an invoice</option>'}
      <optgroup label="Other invoices of ${esc(GROUPS[l.group].label)}">${others.map(e => `<option value="${esc(e.id)}">${esc(label(e))}</option>`).join('')}</optgroup></select></label>
    <p class="legend">An invoice that is To Be Paid or Sent to PD becomes Paid. One not yet approved is linked, not moved.</p>
    <p class="msg" id="cj-dmsg" role="status"></p>
    <div class="row"><button type="button" class="ghost" data-cancel>Cancel</button><button class="primary">Match</button></div></form>`, true);
  $('[data-cancel]', d).onclick = () => d.close();
  $('form', d).onsubmit = async ev => {
    ev.preventDefault();
    const id = $('#cj-inv', d).value;
    if (!id) return;
    try { await finance.matchLine(l.id, id); d.close(); ctx.refresh(); } catch (e) { $('#cj-dmsg', d).textContent = e.message; }
  };
}
