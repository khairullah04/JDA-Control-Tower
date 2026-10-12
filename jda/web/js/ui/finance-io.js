// Getting existing records in: a CJI3 sheet or a Payment Table from Excel/CSV, and the invoices
// the tracker held before the register existed. Always a preview first; nothing is saved until
// the rows have been seen.
import { $, esc } from './dom.js';
import * as finance from '../services/finance.js';
import { listLegacyScope, listLegacyInvoices } from '../services/db.js';
import { config } from '../config/index.js';
import { money } from '../finance/money.js';
import { STATUSES, STATUS_LABEL, isMonth, rowId } from '../finance/core.js';
import { tableIn, entryInputs, sanctionedInputs, legacyEntryInput, legacySanctionedInput, ENTRY_HEADERS, SANCTIONED_HEADERS } from '../finance/sheets.js';
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
      ${entry ? `<label>Status for rows that do not state one<select name="status" required>${options(STATUSES.map(s => [s, STATUS_LABEL[s]]), '', 'Choose…')}</select></label>` : ''}
      <label>File<input name="file" type="file" accept=".xlsx,.csv" required></label>
    </div>
    <div id="import-preview"></div>
    <p class="msg" id="form-msg"></p>
    <div class="row"><button type="button" class="ghost" id="cancel">Cancel</button><button class="primary" id="import-go" disabled>Import</button></div></form>`, true);
  const form = $('form', d), el = form.elements, msg = $('#form-msg', d), go = $('#import-go', d), out = $('#import-preview', d);
  let ready = [];

  // Read the file, turn its rows into inputs, and ask what each would become - without saving anything.
  async function preview() {
    ready = []; go.disabled = true; out.innerHTML = ''; msg.textContent = '';
    const file = el.file.files[0], jda = ctx.jdas.find(j => j.id === el.jdaId.value);
    if (!file || !jda || (entry && !el.status.value)) return;
    out.innerHTML = '<p class="legend">Reading the file…</p>';
    try {
      const rows = tableIn(await finance.readFile(file), k.headers);
      if (!rows) throw new Error(`No header row with the expected columns was found in that file (${k.columns}).`);
      const read = k.read(rows, { jda, projects: ctx.projects.filter(p => p.jdaId === jda.id), status: entry ? el.status.value : '' });
      const usable = read.filter(r => !r.error), checked = (await finance.importRecords(kind, usable.map(r => r.input), { dryRun: true })).results;
      const lines = read.map(r => r.error ? { line: r.line, ok: false, errors: [r.error], record: r.input } : { line: r.line, input: r.input, ...checked[usable.indexOf(r)] });
      ready = lines.filter(l => l.ok).map(l => l.input);
      out.innerHTML = `<p><b>${ready.length}</b> of ${lines.length} row(s) can be imported.${lines.length > ready.length ? ' The others are listed with the reason and will be left out.' : ''}</p>
        <div class="pt-scroll import-preview"><table><tr><th>Line</th><th>${entry ? 'Invoice' : 'ID'}</th><th>Month</th><th>Partner</th><th class="num">Original</th><th class="num">MYR</th><th class="num">${entry ? 'Taxed MYR' : 'w TAX'}</th>${entry ? '<th>Status</th>' : ''}<th>Result</th></tr>
        ${lines.map(l => { const r = l.record || {}; return `<tr class="${l.ok ? '' : 'bad'}"><td>${l.line}</td><td>${esc(k.name(r))}</td><td>${monthLabel(r.month)}</td><td>${esc(r.partner)}</td>
          <td class="num mono">${l.ok ? esc(money(r.netMinor, r.currency)) : esc(r.amount ?? '')}</td><td class="num mono">${l.ok ? esc(money(r.netMyrMinor)) : ''}</td><td class="num mono">${l.ok ? esc(money(r.grossMyrMinor)) : ''}</td>
          ${entry ? `<td>${l.ok ? statusBadge(r.status) : ''}</td>` : ''}<td>${l.ok ? 'Ready' : esc(l.errors.join('. '))}</td></tr>`; }).join('')}</table></div>`;
      go.disabled = !ready.length; go.textContent = `Import ${ready.length} row(s)`;
    } catch (e) { out.innerHTML = ''; msg.textContent = e.message; }
  }
  form.onchange = preview;
  $('#cancel', d).onclick = () => d.close();
  form.onsubmit = async e => {
    e.preventDefault();
    go.disabled = true; msg.textContent = 'Importing…';
    try { await finance.importRecords(kind, ready); d.close(); ctx.refresh(); }
    catch (err) { msg.textContent = err.message; go.disabled = false; }
  };
}

// One time only: the invoices and WBS items the tracker kept before the register become CJI3
// entries and sanctioned amounts. The old records are read, not changed. Anything incomplete
// comes over as a Pending invoice that says what it is missing.
export async function bringOverOldRecords(ctx, button, msg) {
  if (!confirm('Copy the old tracker\'s invoices and WBS items into the CJI3 register and the sanctioned amounts? The old records are left as they are. This is done once.')) return;
  button.disabled = true; msg.textContent = 'Reading the old records…';
  try {
    const [invoices, scope] = await Promise.all([listLegacyInvoices(), listLegacyScope()]);
    const where = projectId => {
      const p = ctx.projects.find(x => x.id === projectId) || {}, j = ctx.jdas.find(x => x.id === p.jdaId) || {};
      return { jdaId: j.id || '', jdaName: j.name || '', projectId: p.id || '', projectCode: p.name || '' };
    };
    const vendorOf = item => invoices.find(i => i.matchedScopeId === item.id)?.vendor; // an old WBS item's partner: whoever invoiced against it
    const entries = await finance.importRecords('entry', invoices.map(i => legacyEntryInput(i, where(i.projectId), config.fxToMYR)));
    const sanctioned = await finance.importRecords('sanctioned', scope.map(s => legacySanctionedInput(s, where(s.projectId), vendorOf(s))));
    await finance.saveSettings({ migratedAt: new Date().toISOString() });
    const skipped = [...entries.results, ...sanctioned.results].filter(r => !r.ok).length;
    alert(`Brought over ${entries.imported} invoice(s) and ${sanctioned.imported} sanctioned amount(s).${skipped ? ` ${skipped} could not be brought over.` : ''} Invoices that came over incomplete are marked "Incomplete": open each one with Edit.`);
    ctx.refresh();
  } catch (e) { msg.textContent = e.message; button.disabled = false; }
}
