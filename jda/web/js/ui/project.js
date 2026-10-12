import { updateProject, addLog, listLog } from '../services/db.js';
import { audit } from '../services/finance.js';
import { computeReport, ofProject } from '../services/analytics.js';
import { money } from '../finance/money.js';
import { paymentTable, STATUS_LABEL } from '../finance/core.js';
import { $, esc, rm, pct, monthName, jdaRange } from './dom.js';
import { state } from './state.js';
import { openForm } from './modal.js';
import { renderTimeline } from './timeline.js';
import { renderLog } from './log.js';
import { loadCtx, storageNotice, auditLine, financeSummary } from './finance-ui.js';

export async function renderProject(id) {
  const page = $('#page');
  page.innerHTML = '<p>Loading report…</p>';
  const refresh = () => renderProject(id);
  const ctx = await loadCtx(refresh);
  const project = ctx.projects.find(p => p.id === id);
  if (!project) throw new Error('That project no longer exists.');
  const jda = ctx.jdas.find(j => j.id === project.jdaId);
  const sanctioned = ofProject(ctx.fin.sanctioned, id), entries = ofProject(ctx.fin.entries, id);
  const r = computeReport(project, sanctioned, entries);
  const activity = [...await listLog(id), ...(await audit()).map(auditLine).filter(a => a.projectId === id)].sort((a, b) => b.ts.localeCompare(a.ts));

  page.innerHTML = `
    <div class="section-head"><h2>${esc(project.name)}</h2>
      <div class="row">
        ${jda ? `<a class="ghost" href="#/jda/${jda.id}" style="text-decoration:none;display:inline-flex;align-items:center">← ${esc(jda.name)}</a>` : ''}
        <button class="ghost" id="edit-project">Edit budget</button>
      </div></div>
    ${storageNotice(ctx)}

    <div class="banner ${r.overPlan ? 'over' : ''}">
      Up to ${monthName(r.asOf)} <b>${rm(r.planned)}</b> has been sanctioned, tax included. Paid so far is <b>${rm(r.actual)}</b> —
      ${r.overPlan ? `<b>${rm(r.variance)} over</b> the sanctioned amount.` : `${rm(-r.variance)} under the sanctioned amount.`}
    </div>

    <div class="kpis">
      <div class="kpi"><small>Total budget</small><b>${rm(r.budget)}</b></div>
      <div class="kpi ${r.overPlan ? 'bad' : 'good'}"><small>Paid (MYR)</small><b>${rm(r.actual)}</b></div>
      <div class="kpi"><small>Budget used</small><b>${pct(r.budgetUsedPct)}</b></div>
      <div class="kpi ${r.forecastOverBudget ? 'bad' : 'good'}"><small>Forecast at completion</small><b>${rm(r.forecast)}</b></div>
      <div class="kpi ${r.counts.pending ? 'bad' : ''}"><small>Invoices pending</small><b>${r.counts.pending}</b></div>
    </div>

    <div class="section" id="timeline"></div>
    ${jda ? financeSummary(sanctioned, entries, `${esc(jda.id)}/${esc(id)}`) : ''}

    <div class="section"><h3>Change log</h3>${renderLog(activity)}</div>`;

  renderTimeline($('#timeline'), { project, sanctioned, entries, range: jda ? jdaRange(jda) : null });

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

  state.page = 'project';
  state.context = () => ({
    page: `Project report: ${project.name}`, note: 'Actual spend counts paid invoices only, in MYR after tax. Planned is the sanctioned amount with tax, up to this month.',
    project: { name: project.name, budget: money(r.budget), start: project.startDate, end: project.endDate },
    report: { asOf: r.asOf, sanctionedToDate: money(r.planned), paid: money(r.actual), invoiced: money(r.invoiced), variance: money(r.variance), overSanctioned: r.overPlan, budgetUsed: pct(r.budgetUsedPct), forecast: money(r.forecast), invoicesByStatus: r.counts },
    paymentTable: paymentTable(sanctioned, entries).map(row => ({ id: row.id, month: row.month, partner: row.partner, sanctionedWithTax: money(row.withTaxMinor), paid: money(row.actualMinor), variance: money(row.varianceMinor), status: row.flag })),
    invoices: entries.filter(e => !e.deletedAt).map(e => ({ invoiceNo: e.invoiceNo, partner: e.partner, date: e.documentDate, month: e.month, dueDate: e.dueDate, original: money(e.netMinor, e.currency), taxedMYR: money(e.grossMyrMinor), status: STATUS_LABEL[e.status], description: e.description }))
  });
}
