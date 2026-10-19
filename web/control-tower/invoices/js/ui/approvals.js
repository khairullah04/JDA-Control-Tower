// Approvals (#/approvals/<queue>[/<jda>]): the invoices waiting at each step of the approval process
// (finance/workflow.js), one queue per step: Intake (Accountant 1 chooses the route), PM validation,
// Lead approval, To Be Paid (Accountant 2), Paid, and the archive of rejected invoices. Each invoice
// shows the moves it can make now; every move is confirmed first, with a note (a reason when it is
// required), and is kept in the invoice's history. Paid comes from a CJI3 line, never from here.
import { $, esc } from './dom.js';
import { state } from './state.js';
import { startRender } from './render.js';
import * as finance from '../services/finance.js';
import { fmt } from '../finance/money.js';
import { QUEUES, STAGE_LABEL, stageOf, queueOf, movesFrom, routeOf } from '../finance/workflow.js';
import { loadCtx, storageNotice, options, dialog, today, monthLabel } from './finance-ui.js';

const ROUTE = { direct: 'Route 1: Direct', validation: 'Route 2: Validation' };
const when = iso => iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

export async function renderApprovals(queueId = 'intake', jdaId = '') {
  const r = startRender('Loading the approval queues…', () => renderApprovals(queueId, jdaId)), { page } = r;
  const ctx = await loadCtx(r);
  const queue = QUEUES.find(q => q.id === queueId) || QUEUES[0], jda = ctx.jdas.find(j => j.id === jdaId);
  const live = ctx.fin.entries.filter(e => !e.deletedAt && (!jda || e.jdaId === jda.id));
  const inQueue = q => live.filter(e => queueOf(e)?.id === q.id);
  // To Be Paid: the oldest due date first (payments go one at a time by due date); elsewhere the oldest waiting first.
  const list = inQueue(queue).sort(queue.id === 'pay'
    ? (a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || (a.documentDate || '').localeCompare(b.documentDate || '')
    : (a, b) => (a.stageAt || a.createdAt || '').localeCompare(b.stageAt || b.createdAt || ''));
  r.current();
  const base = id => `#/approvals/${id}${jda ? '/' + jda.id : ''}`;
  page.innerHTML = `
    <div class="section-head"><h2>Approvals</h2>
      <div class="row"><a class="ghost" href="#/cji3${jda ? '/' + esc(jda.id) : ''}">CJI3 register</a></div></div>
    ${storageNotice(ctx)}
    <nav class="scope-bar ap-queues" aria-label="Queues">
      ${QUEUES.map(q => `<a class="ghost${q.id === queue.id ? ' on' : ''}" href="${base(q.id)}"${q.id === queue.id ? ' aria-current="page"' : ''}>${esc(q.label)} <span class="ap-count">${inQueue(q).length}</span></a>`).join('')}
      <select id="ap-jda" aria-label="JDA">${options(ctx.jdas.map(j => [j.id, j.name]), jda?.id || '', 'All JDAs')}</select>
    </nav>
    <p class="legend">${queue.who ? `<b>${esc(queue.who)}</b> · ` : ''}${esc(HELP[queue.id])}</p>
    <p class="msg" id="ap-msg" role="status"></p>
    <div class="section pt-scroll">
      <table class="reg-table ap-table">
        <tr><th>Invoice #</th><th>Invoice date</th><th>Due</th>${jda ? '' : '<th>JDA</th>'}<th>Project</th><th>Partner</th><th>Month</th><th class="num">Taxed MYR</th><th>Stage</th><th>Since</th><th></th></tr>
        ${list.map(e => row(e, !jda)).join('') || `<tr><td colspan="${jda ? 10 : 11}">Nothing in this queue${jda ? ` for ${esc(jda.name)}` : ''}.</td></tr>`}
        ${list.length ? `<tr class="reg-total"><td colspan="${jda ? 6 : 7}">${list.length} invoice(s)</td><td class="num mono"><b>${esc(fmt(list.reduce((t, e) => t + (e.grossMyrMinor || 0), 0)))}</b></td><td colspan="3"></td></tr>` : ''}
      </table>
    </div>`;

  $('#ap-jda').onchange = e => { location.hash = `#/approvals/${queue.id}${e.target.value ? '/' + e.target.value : ''}`; };
  page.querySelector('.ap-table').addEventListener('click', ev => {
    const move = ev.target.closest('[data-move]'), hist = ev.target.closest('[data-history]');
    if (move) confirmMove(ctx, live.find(e => e.id === move.dataset.id), move.dataset.move);
    if (hist) openHistory(live.find(e => e.id === hist.dataset.history));
  });
  state.page = 'approvals';
  state.context = () => `Approvals, queue "${queue.label}"${jda ? `, ${jda.name}` : ''}: ${list.length} invoice(s), ${fmt(list.reduce((t, e) => t + (e.grossMyrMinor || 0), 0))} MYR taxed.`;
}

const HELP = {
  intake: 'New invoices. Choose the route for each: Route 1 sends it direct to PD; Route 2 sends it to the Project Manager to validate.',
  pm: 'Check the invoice against its supporting documents, then send it to the Project Lead, or return it to intake.',
  lead: 'Approve (it goes to To Be Paid) or reject (it is archived, with your reason). You can also return it to the PM.',
  pay: 'Approved invoices and those sent to PD, oldest due date first. Each becomes Paid when a CJI3 line shows its payment.',
  paid: 'Paid invoices, each with the CJI3 line(s) that showed the payment.',
  archive: 'Rejected invoices, kept with who rejected them and why. Restore sends one back to the Project Lead.'
};

function row(e, showJda) {
  const overdue = e.dueDate && e.dueDate < today() && stageOf(e) !== 'paid';
  return `<tr>
    <td><b>${esc(e.invoiceNo || '(no number)')}</b>${e.missing?.length ? ` <span class="st rejected" title="${esc(e.missing.join('\n'))}">Incomplete</span>` : ''}
      ${e.fileUrl ? ` <a href="${esc(e.fileUrl)}" target="_blank" rel="noopener" title="Open the invoice file">file</a>` : ''}</td>
    <td>${esc(e.documentDate || '')}</td><td class="${overdue ? 'overdue' : ''}">${esc(e.dueDate || '—')}</td>
    ${showJda ? `<td>${esc(e.jdaName || '')}</td>` : ''}<td>${esc(e.projectCode || '')}</td><td>${esc(e.partner || '')}</td><td>${monthLabel(e.month)}</td>
    <td class="num mono"><b>${esc(fmt(e.grossMyrMinor))}</b></td>
    <td><span class="st ${esc(e.status)}">${esc(STAGE_LABEL[stageOf(e)])}</span>${routeOf(e) ? `<br><small class="legend">${esc(ROUTE[routeOf(e)])}</small>` : ''}</td>
    <td class="legend">${esc(when(e.stageAt || e.createdAt))}${e.stageBy ? `<br>by ${esc(e.stageBy)}` : ''}</td>
    <td class="actions">${movesFrom(e).map(m => `<button type="button" class="${m.to === 'rejected' ? 'ghost danger' : m.to === 'received' || m.to === 'with_pm' && m.from === 'pending_lead' ? 'ghost' : 'primary'} btn-sm" data-move="${esc(m.to)}" data-id="${esc(e.id)}">${esc(m.action)}</button>`).join('')}
      <button type="button" class="ghost btn-sm" data-history="${esc(e.id)}">History</button></td>
  </tr>`;
}

// Every move is confirmed first: what moves where, by whom, with a note (required where the process says so).
function confirmMove(ctx, e, to) {
  const move = movesFrom(e).find(m => m.to === to);
  if (!e || !move) return;
  const d = dialog(`<form class="rec-form ap-confirm">
    <h3>${esc(move.action)}?</h3>
    <p><b>Invoice ${esc(e.invoiceNo || '(no number)')}</b> · ${esc(e.jdaName || '')} / ${esc(e.projectCode || '')} · ${esc(e.partner || '')} · <span class="mono">${esc(fmt(e.grossMyrMinor))}</span> MYR taxed</p>
    <p>${esc(STAGE_LABEL[stageOf(e)])} → <b>${esc(STAGE_LABEL[to])}</b>${to === 'rejected' ? '. It leaves the active queues and is kept in the archive.' : ''}</p>
    <label>${move.note ? 'Reason (required)' : 'Note (optional)'}<textarea id="ap-note" rows="3" maxlength="1000" ${move.note ? 'required' : ''}></textarea></label>
    <p class="msg" id="ap-dmsg" role="status"></p>
    <div class="row"><button type="button" class="ghost" data-cancel>Cancel</button><button class="primary">Confirm</button></div>
  </form>`);
  const form = $('form', d), note = $('#ap-note', d);
  $('[data-cancel]', d).onclick = () => d.close();
  note.focus();
  form.onsubmit = async ev => {
    ev.preventDefault();
    const btn = $('button.primary', d);
    btn.disabled = true;
    try {
      const out = await finance.moveStage([e.id], to, note.value);
      if (out.refused?.length) { $('#ap-dmsg', d).textContent = out.refused[0].why; btn.disabled = false; return; }
      d.close();
      ctx.refresh();
    } catch (err) { $('#ap-dmsg', d).textContent = err.message; btn.disabled = false; }
  };
}

async function openHistory(e) {
  if (!e) return;
  const d = dialog(`<form><h3>Invoice ${esc(e.invoiceNo || '(no number)')}: its way through approval</h3><div id="ap-hist"><p class="legend">Loading…</p></div><div class="row"><button class="primary">Close</button></div></form>`, true);
  $('form', d).onsubmit = ev => { ev.preventDefault(); d.close(); };
  try {
    const lines = await finance.stageHistory(e.id);
    $('#ap-hist', d).innerHTML = lines.length ? `<div class="pt-scroll audit"><table>
      <tr><th>When</th><th>Who</th><th>From</th><th>To</th><th>Note</th></tr>
      ${lines.map(l => `<tr><td class="mono">${esc(when(l.at))}</td><td><span class="log-user">${esc(l.by)}</span></td><td>${esc(STAGE_LABEL[l.from] || l.from)}</td><td>${esc(STAGE_LABEL[l.to] || l.to)}${l.byCji3 ? ' <small class="legend">(CJI3)</small>' : ''}</td><td>${esc(l.note)}</td></tr>`).join('')}
    </table></div>` : `<p class="legend">No moves yet: it is ${esc(STAGE_LABEL[stageOf(e)])}${e.stage ? '' : ' (read from its status: it was entered before the approval process)'}.</p>`;
  } catch (err) { $('#ap-hist', d).innerHTML = `<p class="msg">${esc(err.message)}</p>`; }
}
