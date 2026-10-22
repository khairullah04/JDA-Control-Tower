// A JDA's invoices from the Microsoft List (before approval), under its graphs on the tracker's JDA page.
// The PM pulls the List (from Microsoft, or an export of it), ticks invoices, and generates the
// approval-request email to the Project Lead. Generating it sends them: they move to Pending Lead
// approval in Approvals (finance/service.js sendListToLead). Proof links come from the List itself.
import { $, esc } from './dom.js';
import * as finance from '../services/finance.js';
import { money } from '../finance/money.js';
import { LIST_FIELDS, suggestMapping, unmappedNeeded, itemsFrom, inJda, selectionTotals } from '../finance/list-source.js';
import { emailHtml, emlFile, subjectFor, mailtoLink } from '../finance/email.js';
import { stageOf, STAGE_LABEL } from '../finance/workflow.js';
import { recipientsFor, SIGN_OFF } from '../config/email-recipients.js';
import { dialog } from './finance-ui.js';

const picked = {}; // per JDA: the ticked invoices, kept while the page redraws
const rowsRead = {}; // per JDA: the rows last read from the List, to change the column mapping without reading again
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

  const draw = () => {
    const t = selectionTotals(items, sel), all = items.length > 0 && items.every(i => sel.has(i.key));
    root.innerHTML = `
      <div class="section-head"><h3>Invoices from the Microsoft List</h3>
        <div class="row">
          ${state.graph ? '<button type="button" class="primary btn-sm" id="li-pull">Pull from the List</button>' : ''}
          <label class="ghost btn-sm li-file">${state.graph ? 'Import an export instead' : 'Import the List (export)'}<input type="file" accept=".xlsx,.csv" id="li-file" hidden></label>
          ${state.items.length ? '<button type="button" class="ghost btn-sm" id="li-map">Columns…</button>' : ''}
        </div></div>
      <p class="legend">${state.pulledAt ? `Pulled ${esc(when(state.pulledAt))} by ${esc(state.pulledBy)}${state.fileName ? ` from ${esc(state.fileName)}` : state.source === 'graph' ? ' from Microsoft' : ''} · ${items.length} invoice${items.length === 1 ? '' : 's'} for ${esc(jda.name)}`
        : state.graph ? 'Pull the List to see the invoices waiting for approval.' : 'Not connected to Microsoft: export the List (to Excel or CSV) and import the file here.'}</p>
      <p class="msg" id="li-msg"></p>
      ${items.length ? `
      <div class="li-bar"><span><b>${t.count}</b> selected${t.count ? ` · Total ${t.byCurrency.map(c => `<b class="mono">${esc(money(c.minor, c.currency))}</b>`).join(' + ') || '—'}` : ''}</span>
        <button type="button" class="primary btn-sm" id="li-email" ${t.count ? '' : 'disabled'}>Generate Email</button></div>
      <div class="pt-scroll"><table class="reg-table li-table">
        <tr><th><input type="checkbox" id="li-all" aria-label="Select all" ${all ? 'checked' : ''}></th><th>Invoice No.</th><th>Partner</th><th class="num">Amount</th><th>Description</th><th>Supporting documents</th></tr>
        ${items.map(i => { const r = inRegister(i); return `<tr class="${i.missing.length ? 'li-gap' : ''}">
          <td><input type="checkbox" data-pick="${esc(i.key)}" aria-label="Select ${esc(i.invoiceNo || 'this invoice')}" ${sel.has(i.key) ? 'checked' : ''}></td>
          <td><b>${esc(i.invoiceNo || '—')}</b>${r ? ` <span class="st ${stageOf(r) === 'received' ? 'pending' : 'approved'}" title="Already in the register">${esc(STAGE_LABEL[stageOf(r)])}</span>` : ''}
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
    if ($('#li-map', root)) $('#li-map', root).onclick = () => remap();
    if ($('#li-all', root)) $('#li-all', root).onchange = e => { items.forEach(i => e.target.checked ? sel.add(i.key) : sel.delete(i.key)); draw(); };
    root.querySelectorAll('[data-pick]').forEach(c => c.onchange = () => { c.checked ? sel.add(c.dataset.pick) : sel.delete(c.dataset.pick); draw(); });
    if ($('#li-email', root)) $('#li-email', root).onclick = () => generate();
  };

  // Rows from the List or a file -> the column mapping (asked when it is new or no longer fits) -> kept.
  let lastRows = rowsRead[jda.id] || null;
  async function pull(file) {
    msg('Reading the List…');
    try {
      const got = await finance.listRows(file);
      if (!got.rows.length) throw new Error('No invoices found under the column headings.');
      lastRows = rowsRead[jda.id] = { ...got, source: file ? 'file' : 'graph', fileName: file?.name || '' };
      const mapping = suggestMapping(got.headers, state.mapping), fits = Object.keys(state.mapping || {}).length && LIST_FIELDS.every(f => state.mapping[f.key] === mapping[f.key]) && !unmappedNeeded(mapping).length;
      if (fits) await keep(mapping); else askMapping(got.headers, mapping);
    } catch (e) { msg(e.message); }
  }
  async function keep(mapping) {
    const pulled = await finance.saveListPull({ items: itemsFrom(lastRows.rows, mapping), mapping, source: lastRows.source, fileName: lastRows.fileName });
    state = { ...state, ...pulled };
    renderListInvoices(root, ctx, jda);
  }
  function remap() {
    if (!lastRows) return msg('Import the List again to change which column is which.');
    askMapping(lastRows.headers, suggestMapping(lastRows.headers, state.mapping));
  }
  function askMapping(headers, mapping) {
    const d = dialog(`<form><h3>Which column is which?</h3>
      <p class="legend">Proposed from the column names in the List: check each one. This is remembered for the next time.</p>
      <div class="rec-grid">${LIST_FIELDS.map(f => `<label>${esc(f.label)}${f.need ? ' *' : ''}<select name="${f.key}">
        <option value="">${f.need ? 'Choose…' : '— not in the List —'}</option>${headers.map(h => `<option ${mapping[f.key] === h ? 'selected' : ''}>${esc(h)}</option>`).join('')}</select></label>`).join('')}</div>
      <p class="legend">JDA: when the List has no JDA column, every row shows on every JDA's page. Supporting documents: a link column, or a text column with one link per line.</p>
      <p class="msg" id="map-msg"></p>
      <div class="row"><button type="button" class="ghost" id="cancel">Cancel</button><button class="primary">Use these columns</button></div></form>`, true);
    $('#cancel', d).onclick = () => { d.close(); msg(''); };
    $('form', d).onsubmit = async e => {
      e.preventDefault();
      const chosen = Object.fromEntries(LIST_FIELDS.map(f => [f.key, e.target.elements[f.key].value]));
      const need = unmappedNeeded(chosen);
      if (need.length) { $('#map-msg', d).textContent = `Choose the column for: ${need.join(', ')}.`; return; }
      d.close();
      try { await keep(chosen); } catch (err) { msg(err.message); }
    };
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
      <p class="legend">Generating sends these invoices to the Project Lead: they move to <b>Pending Lead approval</b> in Approvals, and the email is logged.</p>
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
