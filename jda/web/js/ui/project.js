import { getProject, getJda, listScope, listInvoices, listAllProjectsWithJda, addScope, updateProject, updateInvoice, deleteInvoice, addLog, listLog } from '../services/db.js';
import { computeReport, paymentStatusOf, toMYR, STATUS_LABEL } from '../services/analytics.js';
import { $, esc, rm, pct, monthName, spendBar, jdaRange } from './dom.js';
import { state } from './state.js';
import { openForm } from './modal.js';
import { renderTimeline } from './timeline.js';
import { renderLog } from './log.js';
import { currencyCheck, sstSummary } from './tables.js';

const SORTS = {
  'date-desc': (a, b) => (b.date || '').localeCompare(a.date || ''),
  'date-asc': (a, b) => (a.date || '').localeCompare(b.date || ''),
  'due-asc': (a, b) => (a.dueDate || '9999-99-99').localeCompare(b.dueDate || '9999-99-99'),
  'due-desc': (a, b) => (b.dueDate || '0000-00-00').localeCompare(a.dueDate || '0000-00-00'),
  'amount-desc': (a, b) => toMYR(b) - toMYR(a),
  'amount-asc': (a, b) => toMYR(a) - toMYR(b),
  'vendor-az': (a, b) => (a.vendor || '').localeCompare(b.vendor || ''),
  'vendor-za': (a, b) => (b.vendor || '').localeCompare(a.vendor || '')
};
const SORT_LABEL = {
  'date-desc': 'Date: newest first', 'date-asc': 'Date: oldest first',
  'due-asc': 'Due date: soonest first', 'due-desc': 'Due date: furthest first',
  'amount-desc': 'Amount: high to low', 'amount-asc': 'Amount: low to high',
  'vendor-az': 'Vendor: A to Z', 'vendor-za': 'Vendor: Z to A'
};
const miss = () => '<span class="pill notpaid">missing</span>';

// Persists across refresh() calls for the same project; resets when you open a different one.
let filterState = { projectId: null, sort: 'date-desc', status: 'all', wbs: 'all' };

function dueClass(inv, asOf) {
  if (paymentStatusOf(inv) === 'paid') return 'due-paid';
  if (!inv.dueDate) return 'due-none';
  const days = Math.floor((new Date(inv.dueDate) - new Date(asOf)) / 86400000);
  return days <= 0 ? 'due-late' : days <= 7 ? 'due-soon' : 'due-ok';
}
function dueCountdown(inv, asOf) {
  if (paymentStatusOf(inv) === 'paid') return 'Paid';
  if (!inv.dueDate) return 'No due date';
  const days = Math.floor((new Date(inv.dueDate) - new Date(asOf)) / 86400000);
  if (days > 0) return `${days}d left`;
  if (days === 0) return 'Due today';
  return `${Math.abs(days)}d overdue`;
}

function openInvoiceEditor(inv, allProjects, projectId, refresh) {
  openForm({
    title: `Edit invoice${inv.invoiceNo ? ' — ' + inv.invoiceNo : ''}`,
    fields: [
      { name: 'vendor', label: 'Vendor', value: inv.vendor || '' },
      { name: 'invoiceNo', label: 'Invoice number', value: inv.invoiceNo || '' },
      { name: 'date', label: 'Invoice date', type: 'date', value: inv.date || '' },
      { name: 'currency', label: 'Currency (e.g. MYR)', value: inv.currency || 'MYR' },
      { name: 'amount', label: 'Amount', type: 'number', value: inv.amount ?? '' },
      { name: 'description', label: 'Description', value: inv.description || '', required: false },
      {
        name: 'projectId', label: 'Project', type: 'select', value: inv.projectId,
        options: allProjects.map(p => ({ value: p.id, label: `${p.jdaName} — ${p.name}` }))
      }
    ],
    onSubmit: async v => {
      await updateInvoice(inv.id, {
        vendor: v.vendor, invoiceNo: v.invoiceNo, date: v.date, currency: v.currency,
        amount: Number(v.amount), description: v.description, projectId: v.projectId, missingFields: []
      });
      const proj = allProjects.find(p => p.id === v.projectId);
      const moved = v.projectId !== inv.projectId;
      await addLog(v.projectId, 'invoice', `${v.vendor} ${v.invoiceNo} edited${moved ? ` and moved to ${proj.jdaName} — ${proj.name}` : ''}`);
      refresh();
    }
  });
}

export async function renderProject(id) {
  if (filterState.projectId !== id) filterState = { projectId: id, sort: 'date-desc', status: 'all', wbs: 'all' };

  const page = $('#page');
  page.innerHTML = '<p>Loading report…</p>';
  const [project, scope, invoices, activity, allProjects] = await Promise.all([getProject(id), listScope(id), listInvoices(id), listLog(id), listAllProjectsWithJda()]);
  const jda = project.jdaId ? await getJda(project.jdaId) : null;
  const r = computeReport(project, scope, invoices);
  const refresh = () => renderProject(id);

  const isUnsorted = project.name === 'UNSORTED';
  const filtered = invoices
    .filter(i => filterState.status === 'all' || paymentStatusOf(i) === filterState.status)
    .filter(i => filterState.wbs === 'all' || (filterState.wbs === 'none' ? !i.matchedScopeId : i.matchedScopeId === filterState.wbs))
    .sort(SORTS[filterState.sort]);

  page.innerHTML = `
    <div class="section-head"><h2>${esc(project.name)}</h2>
      <div class="row">
        ${jda ? `<a class="ghost" href="#/jda/${jda.id}" style="text-decoration:none;display:inline-flex;align-items:center">← ${esc(jda.name)}</a>` : ''}
        <button class="ghost" id="edit-project">Edit budget</button>
        <button class="ghost" id="add-scope">Add WBS item</button>
      </div></div>

    <div class="banner ${r.overPlan ? 'over' : ''}">
      Up to ${monthName(r.asOf)} the plan calls for <b>${rm(r.planned)}</b>. Spend so far is <b>${rm(r.actual)}</b> —
      ${r.overPlan ? `<b>${rm(r.variance)} over</b> plan.` : `${rm(-r.variance)} under plan.`}
    </div>

    <div class="kpis">
      <div class="kpi"><small>Total budget</small><b>${rm(project.budget)}</b></div>
      <div class="kpi ${r.overPlan ? 'bad' : 'good'}"><small>Spent (MYR)</small><b>${rm(r.actual)}</b></div>
      <div class="kpi"><small>Budget used</small><b>${pct(r.budgetUsedPct)}</b></div>
      <div class="kpi ${r.forecastOverBudget ? 'bad' : 'good'}"><small>Forecast at completion</small><b>${rm(r.forecast)}</b></div>
      <div class="kpi ${r.counts.needsReview ? 'bad' : ''}"><small>Need review</small><b>${r.counts.needsReview}</b></div>
    </div>

    <div class="section" id="timeline"></div>

    <div class="section"><h3>WBS progress</h3>
      <table><tr><th>Item</th><th>Planned date</th><th class="num">Scope</th><th class="num">Invoiced</th><th>Progress</th></tr>
      ${r.scopeProgress.map(s => `<tr><td>${esc(s.description)}</td><td>${esc(s.plannedDate)}</td>
        <td class="num">${rm(s.amount)}</td><td class="num">${rm(s.spent)}</td>
        <td style="min-width:170px">${spendBar(s.pct)}</td></tr>`).join('')
        || '<tr><td colspan="5">No WBS items yet. Add one to compare invoices against.</td></tr>'}</table></div>

    <div class="section">
      <div class="section-head"><h3>Invoices</h3>
        <div class="toolbar">
          <select id="inv-sort">${Object.entries(SORT_LABEL).map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select>
          <select id="inv-status-filter">
            <option value="all">All statuses</option>
            ${Object.entries(STATUS_LABEL).map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}
          </select>
          <select id="inv-wbs-filter">
            <option value="all">All WBS items</option>
            <option value="none">No WBS linked</option>
            ${scope.map(s => `<option value="${s.id}">${esc(s.description)}</option>`).join('')}
          </select>
        </div></div>
      <table><tr><th>Vendor</th><th>Invoice #</th><th>Date</th><th>Due date</th><th class="num">Amount</th>${isUnsorted ? '' : '<th>WBS</th><th>Status</th>'}<th>Description</th><th>Actions</th></tr>
      ${filtered.map(i => `<tr>
        <td>${i.vendor ? esc(i.vendor) : miss()}</td>
        <td>${i.invoiceNo ? esc(i.invoiceNo) : miss()}</td>
        <td>${i.date ? esc(i.date) : miss()}</td>
        <td class="due-cell">
          <div class="due-line"><span class="due-dot ${dueClass(i, r.asOf)}"></span>
            <input type="date" class="due-input" data-inv="${i.id}" data-field="dueDate" value="${esc(i.dueDate || '')}"></div>
          <div class="due-count ${dueClass(i, r.asOf)}">${dueCountdown(i, r.asOf)}</div>
        </td>
        <td class="num">${i.amount != null ? `${esc(i.currency || '')} ${Number(i.amount).toLocaleString()}` : miss()}</td>
        ${isUnsorted ? '' : `<td><select data-inv="${i.id}" data-field="matchedScopeId" class="wbs-select">
          <option value="">none</option>${scope.map(x => `<option value="${x.id}" ${x.id === i.matchedScopeId ? 'selected' : ''}>${esc(x.description)}</option>`).join('')}</select></td>
        <td>${i.missingFields?.length
          ? `<div class="incomplete"><span class="pill notpaid">Incomplete</span><ul class="incomplete-list">${i.missingFields.map(m => `<li>${esc(m)}</li>`).join('')}</ul></div>`
          : `<select data-inv="${i.id}" data-field="status" class="pill-select ${paymentStatusOf(i)}">
          ${Object.entries(STATUS_LABEL).map(([v, label]) => `<option value="${v}" ${v === paymentStatusOf(i) ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select>`}</td>`}
        <td class="desc-cell">${isUnsorted && i.missingFields?.length ? `<b style="color:var(--red)">Missing: ${i.missingFields.map(esc).join(', ')}.</b> ` : ''}${esc(i.description || i.aiReasoning || '—')}</td>
        <td class="row" style="justify-content:flex-start;flex-wrap:nowrap">
          <button type="button" class="ghost btn-sm" data-edit="${i.id}">Edit</button>
          <button type="button" class="ghost btn-sm" data-delete="${i.id}" style="color:var(--red)">Delete</button>
        </td></tr>`).join('')
        || `<tr><td colspan="${isUnsorted ? 7 : 9}">${invoices.length ? 'No invoices match this filter.' : 'No invoices yet. Put files in the shared Drive inbox, then click Sync from Drive.'}</td></tr>`}</table></div>

    ${currencyCheck(r.foreign)}

    ${sstSummary(r.sst, 'Total SST so far')}

    <div class="section"><h3>Change log</h3>${renderLog(activity)}</div>`;

  renderTimeline($('#timeline'), { project, scope, invoices, range: jda ? jdaRange(jda) : null });

  $('#inv-sort').value = filterState.sort;
  $('#inv-status-filter').value = filterState.status;
  $('#inv-wbs-filter').value = filterState.wbs;
  $('#inv-sort').onchange = e => { filterState.sort = e.target.value; refresh(); };
  $('#inv-status-filter').onchange = e => { filterState.status = e.target.value; refresh(); };
  $('#inv-wbs-filter').onchange = e => { filterState.wbs = e.target.value; refresh(); };

  page.querySelectorAll('[data-edit]').forEach(btn => btn.onclick = () => {
    const inv = invoices.find(x => x.id === btn.dataset.edit);
    openInvoiceEditor(inv, allProjects, id, refresh);
  });

  page.querySelectorAll('[data-delete]').forEach(btn => btn.onclick = async () => {
    const inv = invoices.find(x => x.id === btn.dataset.delete);
    if (!confirm(`Delete this invoice - ${inv.vendor || 'unknown vendor'} ${inv.invoiceNo || '(no #)'}? This can't be undone.`)) return;
    await deleteInvoice(inv.id);
    await addLog(id, 'invoice', `Deleted ${inv.vendor || 'unknown vendor'} ${inv.invoiceNo || '(no #)'}`);
    refresh();
  });

  page.querySelectorAll('[data-inv]').forEach(el => el.onchange = async () => {
    const inv = invoices.find(x => x.id === el.dataset.inv);
    await updateInvoice(el.dataset.inv, { [el.dataset.field]: el.value || null });
    if (el.dataset.field === 'status') await addLog(id, 'status', `${inv.vendor} ${inv.invoiceNo} marked ${STATUS_LABEL[el.value]}`);
    if (el.dataset.field === 'matchedScopeId') {
      const s = scope.find(x => x.id === el.value);
      await addLog(id, 'scope-link', `${inv.vendor} ${inv.invoiceNo} linked to ${s ? s.description : 'no WBS item'}`);
    }
    refresh();
  });

  $('#edit-project').onclick = () => openForm({
    title: 'Edit project',
    fields: [
      { name: 'budget', label: 'Total budget (RM)', type: 'number', value: project.budget },
      { name: 'startDate', label: 'Start date', type: 'date', value: project.startDate },
      { name: 'endDate', label: 'End date', type: 'date', value: project.endDate }
    ],
    onSubmit: async v => {
      await updateProject(id, v);
      await addLog(id, 'project', `Budget/dates updated: RM ${Number(v.budget).toLocaleString()}, ${v.startDate} to ${v.endDate}`);
      refresh();
    }
  });

  $('#add-scope').onclick = () => openForm({
    title: 'Add WBS item',
    fields: [
      { name: 'description', label: 'Description' },
      { name: 'amount', label: 'Planned amount (RM)', type: 'number' },
      { name: 'plannedDate', label: 'Planned spend date', type: 'date' }
    ],
    onSubmit: async v => {
      await addScope({ ...v, projectId: id });
      await addLog(id, 'scope', `WBS item added: "${v.description}" (RM ${Number(v.amount).toLocaleString()})`);
      refresh();
    }
  });

  state.page = 'project';
  state.context = () => ({
    page: `Project report: ${project.name}`,
    project: { name: project.name, budget: project.budget, start: project.startDate, end: project.endDate },
    report: { ...r, months: Object.fromEntries(r.months) },
    wbs: r.scopeProgress.map(({ id, description, amount, plannedDate, spent }) => ({ id, description, amount, plannedDate, spent })),
    invoices: invoices.map(i => ({
      vendor: i.vendor, invoiceNo: i.invoiceNo, date: i.date, dueDate: i.dueDate, currency: i.currency,
      amount: i.amount, status: STATUS_LABEL[paymentStatusOf(i)], description: i.description || i.aiReasoning
    }))
  });
}
