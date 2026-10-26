// A JDA's invoices from the Microsoft List (before approval), under its graphs on the tracker's JDA page.
// The PM pulls the List (from Microsoft with their own sign-in, or an export of it; the columns are
// found automatically), ticks invoices, and generates the
// approval-request email to the Project Lead. Generating it sends them: they move to Pending Lead
// approval (finance/service.js sendListToLead); a CJI3 payment line later marks them Paid. Proof links come from the List itself.
import { $, esc } from './dom.js';
import * as finance from '../services/finance.js';
import { money } from '../finance/money.js';
import { LIST_FIELDS, autoMapping, notFound, itemsFrom, inJda, selectionTotals } from '../finance/list-source.js';
import { emailHtml, emlFile, subjectFor, mailtoLink } from '../finance/email.js';
import { stageOf, STAGE_LABEL } from '../finance/workflow.js';
import { recipientsFor, SIGN_OFF } from '../config/email-recipients.js';
import { dialog } from './finance-ui.js';

const picked = {}; // per JDA: the ticked invoices, kept while the page redraws
const when = iso => iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

export async function renderListInvoices(root, ctx, jda) {
  root.innerHTML = '<p class="legend">Loading the Microsoft List…</p>';
  let state;
  try { state = await finance.listState(); } catch (e) { root.innerHTML = `<p class="msg">${esc(e.message)}</p>`; return; }
  const items = state.items.filter(i => inJda(i, jda.name, state.mapping));
  const sel = picked[jda.id] ||= new Set();
  for (const k of [...sel]) if (!items.some(i => i.key === k)) sel.delete(k);
  // Already in the register (sent before, or entered by hand): its stage, so nobody sends it twice.
  const key = v => String(v || '').toUpperCase().replace(/\s+/g, '');
  const inRegister = i => ctx.fin.entries.find(e => !e.deletedAt && e.jdaId === jda.id && (e.listItemId === i.key || (i.invoiceNo && key(e.invoiceNo) === key(i.invoiceNo))));

  const ms = state.ms || {}, canPull = state.graph || ms.signedIn;
  const draw = () => {
    const t = selectionTotals(items, sel), all = items.length > 0 && items.every(i => sel.has(i.key));
    root.innerHTML = `
      <div class="section-head"><h3>Invoices from the Microsoft List</h3>
        <div class="row">
          ${canPull ? '<button type="button" class="primary btn-sm" id="li-pull">Pull from the List</button>' : ''}
          <label class="ghost btn-sm li-file">${canPull ? 'Import an export instead' : 'Import the List (export)'}<input type="file" accept=".xlsx,.csv" id="li-file" hidden></label>
        </div></div>
      ${state.graph || state.demo ? '' : `<div class="li-connect">${ms.signedIn
        ? `<span>Signed in to Microsoft as <b>${esc(ms.account || 'you')}</b> · <button type="button" class="link" id="li-signout">Sign out</button></span>
           <label>List link <input type="url" id="li-url" placeholder="https://….sharepoint.com/sites/…/Lists/…" value="${esc(state.listUrl)}"></label>`
        : ms.pending
          ? `<span>Open <a href="${esc(ms.pending.url)}" target="_blank" rel="noopener">${esc(ms.pending.url.replace(/^https:\/\//, ''))}</a> and enter the code <b class="mono li-code">${esc(ms.pending.code)}</b>, then sign in with your work account. Waiting…</span>`
          : '<span>To pull the List straight from Microsoft, sign in with your work account (no IT setup).</span> <button type="button" class="ghost btn-sm" id="li-signin">Sign in to Microsoft</button>'}</div>`}
      <p class="legend">${state.pulledAt ? `Pulled ${esc(when(state.pulledAt))} by ${esc(state.pulledBy)}${state.fileName ? ` from ${esc(state.fileName)}` : state.source === 'graph' ? ' from Microsoft' : ''} · ${items.length} invoice${items.length === 1 ? '' : 's'} for ${esc(jda.name)}`
        : canPull ? 'Pull the List to see the invoices waiting for approval.' : 'Export the List (to Excel or CSV) and import the file here, or sign in to Microsoft above.'}</p>
      ${state.pulledAt ? `<p class="legend li-cols">Columns found: ${LIST_FIELDS.filter(f => f.key !== 'id' && state.mapping[f.key]).map(f => `${esc(f.label)} ← <b>${esc(state.mapping[f.key])}</b>`).join(' · ') || 'none'}${notFound(state.mapping).length ? ` · <span class="li-missing">Not in the List: ${esc(notFound(state.mapping).join(', '))}</span>` : ''}</p>` : ''}
      <p class="msg" id="li-msg"></p>
      ${items.length ? `
      <div class="li-bar"><span><b>${t.count}</b> selected${t.count ? ` · Total ${t.byCurrency.map(c => `<b class="mono">${esc(money(c.minor, c.currency))}</b>`).join(' + ') || '—'}` : ''}</span>
        <button type="button" class="primary btn-sm" id="li-email" ${t.count ? '' : 'disabled'}>Generate Email</button></div>
      <div class="pt-scroll"><table class="reg-table li-table">
        <tr><th><input type="checkbox" id="li-all" aria-label="Select all" ${all ? 'checked' : ''}></th><th>Invoice No.</th><th>Partner</th><th class="num">Amount</th><th>Description</th><th>Supporting documents</th></tr>
        ${items.map(i => { const r = inRegister(i); return `<tr class="${i.missing.length ? 'li-gap' : ''}">
          <td><input type="checkbox" data-pick="${esc(i.key)}" aria-label="Select ${esc(i.invoiceNo || 'this invoice')}" ${sel.has(i.key) ? 'checked' : ''}></td>
          <td><b>${esc(i.invoiceNo || '—')}</b>${r ? ` <span class="st ${esc(r.status)}" title="Already in the register">${esc(STAGE_LABEL[stageOf(r)])}</span>` : ''}
            ${i.missing.length ? `<br><small class="li-missing">Missing: ${esc(i.missing.join(', '))}</small>` : ''}</td>
          <td>${esc(i.partner || '—')}</td>
          <td class="num mono">${i.amountMinor != null ? esc(money(i.amountMinor, i.currency || '')) : esc(i.amountText || '—')}</td>
          <td class="desc-cell"><div class="clamp" title="${esc(i.description)}">${esc(i.description || '—')}</div></td>
          <td>${i.proofs.map((p, n) => `<a class="li-chip" href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.label || `Document ${n + 1}`)}</a>`).join('') || '<span class="legend">None</span>'}</td></tr>`; }).join('')}
      </table></div>` : ''}`;
    wire();
  };

  const msg = t => { const m = $('#li-msg', root); if (m) m.textContent = t; };
  const wire = () => {
    $('#li-file', root).onchange = e => e.target.files[0] && pull(e.target.files[0]);
    if ($('#li-pull', root)) $('#li-pull', root).onclick = () => pull(null);
    if ($('#li-signin', root)) $('#li-signin', root).onclick = () => signIn();
    if ($('#li-signout', root)) $('#li-signout', root).onclick = async () => { await finance.msSignOut(); renderListInvoices(root, ctx, jda); };
    if ($('#li-all', root)) $('#li-all', root).onchange = e => { items.forEach(i => e.target.checked ? sel.add(i.key) : sel.delete(i.key)); draw(); };
    root.querySelectorAll('[data-pick]').forEach(c => c.onchange = () => { c.checked ? sel.add(c.dataset.pick) : sel.delete(c.dataset.pick); draw(); });
    if ($('#li-email', root)) $('#li-email', root).onclick = () => generate();
  };

  // Sign-in by a device code: Microsoft shows the code's page; this waits until the person has signed in.
  async function signIn() {
    try { await finance.msSignIn(); } catch (e) { return msg(e.message); }
    renderListInvoices(root, ctx, jda);
  }
  if (ms.pending) (async function wait() { // look again every few seconds; redraw once signed in (or the code expired)
    await new Promise(r => setTimeout(r, 4000));
    if (!root.isConnected) return;
    const now = await finance.listState().catch(() => null);
    if (now && !now.ms?.pending) renderListInvoices(root, ctx, jda); else wait();
  })();

  // Rows from the List or a file -> the columns, found automatically -> kept.
  async function pull(file) {
    const listUrl = file ? '' : ($('#li-url', root)?.value || state.listUrl || '').trim();
    msg('Reading the List…');
    try {
      const got = await finance.listRows(file, listUrl);
      if (!got.rows.length) throw new Error('No invoices found under the column headings.');
      const mapping = autoMapping(got.headers, got.rows);
      const pulled = await finance.saveListPull({ items: itemsFrom(got.rows, mapping), mapping, source: file ? 'file' : 'graph', fileName: file?.name || '', listUrl });
      state = { ...state, ...pulled };
      renderListInvoices(root, ctx, jda);
    } catch (e) { msg(e.message); }
  }

  // Generate Email: what the List lacks is said first, invoice by invoice; then the preview; then a draft.
  function generate() {
    const chosen = selectionTotals(items, sel).chosen, gaps = chosen.filter(i => i.missing.length);
    if (!gaps.length) return preview(chosen);
    const d = dialog(`<form><h3>Some information is missing from the List</h3>
      <p>These invoices do not have everything an approval request should carry:</p>
      <ul class="li-gaps">${gaps.map(i => `<li><b>${esc(i.invoiceNo || '(no invoice number)')}</b>${i.partner ? ` · ${esc(i.partner)}` : ''}<ul>${i.missing.map(m => `<li>${esc(m)}</li>`).join('')}</ul></li>`).join('')}</ul>
      <p>Are you sure you want to proceed? The email will show "—" or "None" where these are missing.</p>
      <div class="row"><button type="button" class="ghost" id="cancel">Cancel</button><button class="primary">Proceed anyway</button></div></form>`, true);
    $('#cancel', d).onclick = () => d.close();
    $('form', d).onsubmit = e => { e.preventDefault(); d.close(); preview(chosen); };
  }

  function preview(chosen) {
    const who = recipientsFor(jda.name), subject = subjectFor(jda.name, chosen.length);
    const html = emailHtml({ jdaName: jda.name, items: chosen, recipient: who.greeting, sender: SIGN_OFF });
    const d = dialog(`<form class="li-preview"><h3>Approval request · ${chosen.length} invoice${chosen.length === 1 ? '' : 's'}</h3>
      <p class="legend"><b>Subject:</b> ${esc(subject)}<br><b>To:</b> ${esc(who.to) || '<i>blank: fill in, in Outlook</i>'}${who.cc ? ` · <b>Cc:</b> ${esc(who.cc)}` : ''}</p>
      <iframe class="li-frame" title="Preview of the email" sandbox></iframe>
      <p class="legend">Generating sends these invoices to the Project Lead: they move to <b>Pending Lead approval</b>, and the email is logged. A CJI3 payment line marks them Paid.</p>
      <p class="msg" id="pv-msg" role="status"></p>
      <div class="row"><button type="button" class="ghost" id="cancel">Cancel</button>
        <button type="button" class="ghost" id="pv-copy">Copy formatted email</button>
        ${state.mail ? '<button type="button" class="ghost" id="pv-draft">Create Outlook draft</button>' : ''}
        <button type="button" class="primary" id="pv-eml">Generate email (.eml)</button></div></form>`, true);
    $('.li-frame', d).srcdoc = html;
    let done = null;
    const send = async () => done ||= finance.sendListToLead({ jdaId: jda.id, jdaName: jda.name, keys: chosen.map(i => i.key), subject });
    const finish = async how => {
      const out = await send();
      chosen.forEach(i => sel.delete(i.key));
      $('#pv-msg', d).className = 'ok';
      $('#pv-msg', d).innerHTML = `${esc(how)} ${out.sent.length ? `Sent to the Project Lead: ${esc(out.sent.map(s => s.invoiceNo).join(', '))} ${out.sent.length === 1 ? 'is' : 'are'} now Pending Lead approval.` : ''}
        ${out.skipped.length ? `<br>Not moved: ${out.skipped.map(s => `${esc(s.invoiceNo)} (${esc(s.why)})`).join('; ')}.` : ''}`;
      $('#cancel', d).textContent = 'Close';
      $('#cancel', d).onclick = () => { d.close(); ctx.refresh(); };
    };
    const fail = e => { $('#pv-msg', d).className = 'msg'; $('#pv-msg', d).textContent = e.message; };
    $('#cancel', d).onclick = () => d.close();
    $('#pv-eml', d).onclick = async () => {
      try {
        const blob = new Blob([emlFile({ to: who.to, cc: who.cc, subject, html })], { type: 'message/rfc822' });
        const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${subject.replace(/[\\/:*?"<>|]/g, '-')}.eml` });
        document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        await finish('The draft is downloaded: open it to edit and send it in Outlook.');
      } catch (e) { fail(e); }
    };
    $('#pv-copy', d).onclick = async () => {
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([subject], { type: 'text/plain' }) })]);
        location.href = mailtoLink({ to: who.to, cc: who.cc, subject }); // subject and recipients only: paste the body
        await finish('The email is copied: paste it into the new message (Ctrl+V).');
      } catch (e) { fail(new Error(`The email could not be copied (${e.message}). Use Generate email (.eml) instead.`)); }
    };
    if ($('#pv-draft', d)) $('#pv-draft', d).onclick = async () => {
      try { const { webLink } = await finance.listDraft({ to: who.to, cc: who.cc, subject, html }); if (webLink) open(webLink, '_blank', 'noopener'); await finish('The draft is in Outlook.'); }
      catch (e) { fail(e); }
    };
  }

  draw();
}
