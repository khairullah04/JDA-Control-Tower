// Approvals (#/approvals[/<jda>]): the invoices waiting for approval in the Microsoft List, for one JDA
// at a time. The PM pulls the List, ticks invoices and generates the approval-request email to the
// Project Lead (ui/list-invoices.js, the same view as under each JDA's graphs). Approval itself happens
// by email; the CJI3 payment line is the proof, and marks the invoice Paid.
import { $, esc } from './dom.js';
import { startRender } from './render.js';
import { loadCtx, storageNotice, options } from './finance-ui.js';
import { renderListInvoices } from './list-invoices.js';

export async function renderApprovals(jdaId = '') {
  const r = startRender('Loading approvals…', () => renderApprovals(jdaId)), { page } = r;
  const ctx = await loadCtx(r);
  const jdas = ctx.jdas.filter(j => j.name !== 'Unsorted'), jda = jdas.find(j => j.id === jdaId) || jdas[0];
  r.current();
  page.innerHTML = `
    <div class="section-head"><h2>Approvals</h2>
      <div class="row"><select id="ap-jda" aria-label="JDA">${options(jdas.map(j => [j.id, j.name]), jda?.id || '')}</select></div></div>
    ${storageNotice(ctx)}
    <div class="section" id="list-invoices">${jda ? '' : '<p class="legend">No JDA yet.</p>'}</div>`;
  $('#ap-jda').onchange = e => { location.hash = `#/approvals/${e.target.value}`; };
  if (jda) renderListInvoices($('#list-invoices'), ctx, jda);
}
