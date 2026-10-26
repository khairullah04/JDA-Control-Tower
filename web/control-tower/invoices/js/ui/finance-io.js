// Getting existing records in: a CJI3 sheet or a Payment Table from Excel/CSV, and the invoices
// the tracker held before the register existed. Always a preview first; nothing is saved until
// the rows have been seen.
import { $, esc } from './dom.js';
import * as finance from '../services/finance.js';
import { listLegacyScope, listLegacyInvoices } from '../services/db.js';
import { config } from '../config/index.js';
import { money } from '../finance/money.js';
import { isMonth, rowId } from '../finance/core.js';
import { tableIn, tableEnd, entryInputs, entryDateOrder, sampleDate, toIsoDate, sanctionedInputs, legacyEntryInput, legacySanctionedInput, ENTRY_HEADERS, SANCTIONED_HEADERS } from '../finance/sheets.js';
import { dialog, options, monthLabel, statusBadge } from './finance-ui.js';

const KIND = {
  entry: { title: 'Import invoices from a CJI3 sheet', headers: ENTRY_HEADERS, read: entryInputs, columns: 'Reference (invoice name), CO Object Name or Name, Transaction Currency, Value TranCurr, Document Date',
    name: r => r.invoiceNo || '(no number)' },
  sanctioned: { title: 'Import sanctioned amounts from a Payment Table', headers: SANCTIONED_HEADERS, read: sanctionedInputs, columns: 'Month (PT), Partner, Project, PT Amount (MYR) or PT Amount (Original Currency)',
    name: r => isMonth(r.month) && r.projectCode ? rowId(r.projectCode, r.partner, r.month) : '(incomplete)' }
};

export function openImport(kind, ctx, jdaId = '') {
  const k = KIND[kind], entry = kind === 'entry';
  const d = dialog(`<form><h3>${k.title}</h3>
    <p class="legend">An Excel workbook (.xlsx) or a CSV file whose header row has: ${esc(k.columns)}. An export from this page imports back as it is. ${entry ? 'An invoice already in the register is left out, so importing a file twice adds nothing.' : ''}</p>
    <div class="rec-grid">
      <label>JDA the rows belong to<select name="jdaId" required>${options(ctx.jdas.map(j => [j.id, j.name]), jdaId, 'Choose…')}</select></label>
      ${entry ? '<p class="legend">Imported invoices start at Received (pending), whatever the sheet says about their status; a CJI3 payment line makes them Paid.</p>' : ''}
      <label>File<input name="file" type="file" accept=".xlsx,.csv" required></label>
    </div>
    <div id="import-preview"></div>
    <p class="msg" id="form-msg"></p>
    <div class="row"><button type="button" class="ghost" id="cancel">Cancel</button><button class="primary" id="import-go" disabled>Import</button></div></form>`, true);
  const form = $('form', d), el = form.elements, msg = $('#form-msg', d), go = $('#import-go', d), out = $('#import-preview', d);
  let ready = [];

  // Read the file, turn its rows into inputs, and ask what each would become - without saving anything.
  // A sanctioned amount that matches one already entered is shown as such and left out, unless the
  // box is ticked to say it really is a further amount.
  let fresh = [], repeats = [], order = ''; // order: how the file's dates are written, once the person importing has said
  const chosen = () => [...fresh, ...($('#import-repeats', d)?.checked ? repeats : [])];
  const count = () => { go.disabled = !chosen().length; go.textContent = `Import ${chosen().length} row(s)`; };
  async function preview() {
    fresh = []; repeats = []; go.disabled = true; out.innerHTML = ''; msg.textContent = '';
    const file = el.file.files[0], jda = ctx.jdas.find(j => j.id === el.jdaId.value);
    if (!file || !jda) return;
    out.innerHTML = '<p class="legend">Reading the file…</p>';
    try {
      const rows = tableIn(await finance.readFile(file), k.headers);
      if (!rows) throw new Error(`No header row with the expected columns was found in that file (${k.columns}).`);
      // What was read, said in full: how many rows, where reading stopped, and which way round the dates were taken.
      const end = tableEnd(rows), dates = entry ? entryDateOrder(rows) : { sure: true }, sample = entry ? sampleDate(rows) : '', as = order || dates.order;
      const said = d => new Date(toIsoDate(sample, d) + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
      const notes = `<p class="legend">${rows.length} row(s) read from the file.</p>
        ${end.after ? `<p class="msg">Reading stopped at the blank line ${end.blankLine}: ${end.after} line(s) below it were not read. If they belong to this table, remove the blank line from the file and choose it again.</p>` : ''}
        ${sample ? `<label class="${dates.sure ? '' : 'msg'}">${dates.sure ? 'Dates in this file are read' : `The dates in this file could be read either way (${esc(sample)}). Check that they are read`}
          <select id="import-order"><option value="mdy" ${as === 'mdy' ? 'selected' : ''}>month first: ${esc(sample)} is ${said('mdy')}</option><option value="dmy" ${as === 'dmy' ? 'selected' : ''}>day first: ${esc(sample)} is ${said('dmy')}</option></select></label>` : ''}`;
      const read = k.read(rows, { jda, projects: ctx.projects.filter(p => p.jdaId === jda.id), status: 'pending', ...(entry && { order: as }) });
      if (entry) read.forEach(r => { if (r.input && r.input.source !== 'migrated') r.input.status = 'pending'; }); // as the server will
      const usable = read.filter(r => !r.error), checked = (await finance.importRecords(kind, usable.map(r => r.input), { dryRun: true })).results;
      const lines = read.map(r => r.error ? { line: r.line, ok: false, errors: [r.error], record: r.input } : { line: r.line, input: r.input, ...checked[usable.indexOf(r)] });
      fresh = lines.filter(l => l.ok && !l.duplicate).map(l => l.input); repeats = lines.filter(l => l.ok && l.duplicate).map(l => l.input);
      const refused = lines.length - fresh.length - repeats.length;
      out.innerHTML = `${notes}<p><b>${fresh.length}</b> of ${lines.length} row(s) can be imported.${refused ? ` ${refused} cannot; each says why and will be left out.` : ''}</p>
        ${repeats.length ? `<label class="check"><input type="checkbox" id="import-repeats"> Also add the ${repeats.length} row(s) that match a sanctioned amount already entered (same project, partner, month and amount). Tick this only if they really are further amounts; otherwise the sanctioned total is counted twice.</label>` : ''}
        <div class="pt-scroll import-preview"><table><tr><th>Line</th><th>${entry ? 'Invoice' : 'ID'}</th><th>Month</th><th>Partner</th><th class="num">Original</th><th class="num">MYR</th><th class="num">${entry ? 'Taxed MYR' : 'w TAX'}</th>${entry ? '<th>Status</th>' : ''}<th>Result</th></tr>
        ${lines.map(l => { const r = l.record || {}; return `<tr class="${l.ok ? '' : 'bad'}"><td>${l.line}</td><td>${esc(k.name(r))}</td><td>${monthLabel(r.month)}</td><td>${esc(r.partner)}</td>
          <td class="num mono">${l.ok ? esc(money(r.netMinor, r.currency)) : esc(r.amount ?? '')}</td><td class="num mono">${l.ok ? esc(money(r.netMyrMinor)) : ''}</td><td class="num mono">${l.ok ? esc(money(r.grossMyrMinor)) : ''}</td>
          ${entry ? `<td>${l.ok ? statusBadge(r.status) : ''}</td>` : ''}<td>${!l.ok ? esc(l.errors.join('. ')) : l.duplicate ? 'Already entered' : 'Ready'}</td></tr>`; }).join('')}</table></div>`;
      if ($('#import-repeats', d)) $('#import-repeats', d).onchange = e => { e.stopPropagation(); count(); };
      count();
    } catch (e) { out.innerHTML = ''; msg.textContent = e.message; }
  }
  form.onchange = e => {
    if (e.target.id === 'import-repeats') return;
    order = e.target.id === 'import-order' ? e.target.value : e.target === el.file ? '' : order; // a new file is judged afresh
    preview();
  };
  $('#cancel', d).onclick = () => d.close();
  form.onsubmit = async e => {
    e.preventDefault();
    go.disabled = true; msg.textContent = 'Importing…';
    try { await finance.importRecords(kind, chosen(), { duplicates: $('#import-repeats', d)?.checked ? 'add' : 'skip' }); d.close(); ctx.refresh(); }
    catch (err) { msg.textContent = err.message; go.disabled = false; }
  };
}

// One time only: the invoices and WBS items the tracker kept before the register become CJI3
// entries and sanctioned amounts. The old records are read, not changed, and each carries its old
// id across, so however often this is run nothing comes over twice. Nothing is saved until the
// preview has been seen: it lists what will come over and, row by row, what will not and why.
// Only after a confirmed run is the offer withdrawn.
export async function bringOverOldRecords(ctx, button, msg) {
  button.disabled = true; msg.textContent = 'Reading the old records…';
  try {
    const [invoices, scope] = await Promise.all([listLegacyInvoices(), listLegacyScope()]);
    const where = projectId => {
      const p = ctx.projects.find(x => x.id === projectId) || {}, j = ctx.jdas.find(x => x.id === p.jdaId) || {};
      return { jdaId: j.id || '', jdaName: j.name || '', projectId: p.id || '', projectCode: p.name || '' };
    };
    const vendorOf = item => invoices.find(i => i.matchedScopeId === item.id)?.vendor; // an old WBS item's partner: whoever invoiced against it
    const fromInvoices = invoices.map(i => legacyEntryInput(i, where(i.projectId), config.fxToMYR)), fromWbs = scope.map(s => legacySanctionedInput(s, where(s.projectId), vendorOf(s)));
    const [e, w] = await Promise.all([finance.importRecords('entry', fromInvoices, { dryRun: true }), finance.importRecords('sanctioned', fromWbs, { dryRun: true })]);
    msg.textContent = '';
    const coming = r => r.ok && !r.duplicate;
    const nE = e.results.filter(coming).length, nW = w.results.filter(coming).length, incomplete = e.results.filter(r => coming(r) && r.record.missing?.length).length;
    const refused = [...e.results.map(r => ['Invoice', r]), ...w.results.map(r => ['WBS item', r])].filter(([, r]) => !coming(r));
    const d = dialog(`<form><h3>Bring over old tracker records</h3>
      <p>The old tracker holds <b>${invoices.length}</b> invoice record(s) and <b>${scope.length}</b> WBS item(s). <b>${nE}</b> invoice(s) and <b>${nW}</b> sanctioned amount(s) will come over${incomplete ? `; ${incomplete} of the invoices are incomplete and will be marked "Incomplete" for you to finish with Edit` : ''}. The old records themselves are not changed.</p>
      ${refused.length ? `<p class="msg">${refused.length} will not come over:</p><div class="pt-scroll import-preview"><table><tr><th>What</th><th>Record</th><th>Why</th></tr>
        ${refused.map(([what, r]) => `<tr class="bad"><td>${what}</td><td>${esc(what === 'Invoice' ? `${r.record.vendor || 'unknown vendor'} ${r.record.invoiceNo || '(no number)'}` : `${r.record.projectCode || '?'} ${r.record.month || ''} ${r.record.description || ''}`)}</td>
          <td>${esc(r.ok ? 'A sanctioned amount with the same project, partner, month and amount is already entered' : r.errors.join('. '))}</td></tr>`).join('')}</table></div>` : ''}
      <p class="legend">After this the offer is withdrawn. Run it again before then and nothing comes over twice.</p>
      <p class="msg" id="form-msg"></p>
      <div class="row"><button type="button" class="ghost" id="cancel">Not now</button><button class="primary">${nE + nW ? `Bring over ${nE} invoice(s) and ${nW} sanctioned amount(s)` : 'Nothing to bring over: stop offering this'}</button></div></form>`, true);
    $('#cancel', d).onclick = () => d.close();
    $('form', d).onsubmit = async ev => {
      ev.preventDefault();
      const go = $('.primary', d), note = $('#form-msg', d);
      go.disabled = true; note.textContent = 'Bringing them over…';
      try {
        await finance.importRecords('entry', fromInvoices);
        await finance.importRecords('sanctioned', fromWbs);
        await finance.saveSettings({ migratedAt: new Date().toISOString() });
        d.close(); ctx.refresh();
      } catch (err) { note.textContent = `${err.message} Nothing is lost: press the button again to carry on where it stopped.`; go.disabled = false; }
    };
  } catch (e) { msg.textContent = e.message; }
  button.disabled = false;
}
