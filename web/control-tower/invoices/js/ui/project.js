import { updateProject, addLog, listLog } from '../services/db.js';
import { audit } from '../services/finance.js';
import { computeReport, ofProject, budgetMinorOf, FORECAST_NOTE } from '../services/analytics.js';
import { money, fmt } from '../finance/money.js';
import { paymentTable, STATUS_LABEL } from '../finance/core.js';
import { $, esc, rm, pct, monthName, jdaRange, checkProject } from './dom.js';
import { state, CONTEXT_ROWS, firstRows } from './state.js';
import { openForm } from './modal.js';
import { renderTimeline } from './timeline.js';
import { renderLog, LOG_LINES } from './log.js';
import { loadCtx, forget, storageNotice, auditLine, financeSummary, costKpis } from './finance-ui.js';
import { startRender } from './render.js';

export async function renderProject(id) {
  const r0 = startRender('Loading report…', () => renderProject(id)), { page, refresh } = r0;
  const ctx = await loadCtx(r0);
  const project = ctx.projects.find(p => p.id === id);
  if (!project) throw new Error('That project no longer exists.');
  const jda = ctx.jdas.find(j => j.id === project.jdaId);
  const sanctioned = ofProject(ctx.fin.sanctioned, id), entries = ofProject(ctx.fin.entries, id);
  const r = computeReport(project, sanctioned, entries);
  const activity = [...await listLog([id], LOG_LINES), ...(await audit({ projectId: id, limit: LOG_LINES })).map(auditLine)].sort((a, b) => b.ts.localeCompare(a.ts));

  r0.current();
  page.innerHTML = `
    <div class="section-head"><h2>${esc(project.name)}</h2>
      <div class="row">
        ${jda ? `<a class="ghost" href="#/jda/${jda.id}" style="text-decoration:none;display:inline-flex;align-items:center">← ${esc(jda.name)}</a>` : ''}
        <button class="ghost" id="edit-project">Edit budget</button>
      </div></div>
    ${storageNotice(ctx)}

    <div class="banner ${r.overSanctioned ? 'over' : ''}">
      Up to ${monthName(r.asOf)} <b>${rm(r.sanctionedToDate)}</b> has been sanctioned, tax included. Paid so far is <b>${rm(r.actual)}</b> —
      ${r.overSanctioned ? `<b>${rm(r.variance)} over</b> the sanctioned amount.` : `${rm(-r.variance)} under the sanctioned amount.`}
    </div>

    ${costKpis(sanctioned, entries, { budgetMinor: r.budget, forecastMinor: r.forecast, forecastBad: r.forecastOverBudget, waiting: r.counts.pending })}

    <div class="section" id="timeline"></div>
    ${jda ? financeSummary(sanctioned, entries, `${esc(jda.id)}/${esc(id)}`) : ''}

    <div class="section"><h3>Change log</h3>${renderLog(activity)}</div>`;

  renderTimeline($('#timeline'), { project, sanctioned, entries, range: jda ? jdaRange(jda) : null });

  $('#edit-project').onclick = () => openForm({
    title: 'Edit project',
    fields: [
      { name: 'budget', label: 'Total budget (RM)', type: 'number', value: fmt(budgetMinorOf(project), 'MYR', true) },
      { name: 'startDate', label: 'Start date', type: 'date', value: project.startDate },
      { name: 'endDate', label: 'End date', type: 'date', value: project.endDate }
    ],
    onSubmit: async v => {
      const saved = checkProject(v);
      await updateProject(id, saved);
      await addLog(id, 'project', `Budget/dates updated: ${money(saved.budgetMinor)}, ${v.startDate} to ${v.endDate}`);
      forget(); refresh();
    }
  });

  state.page = 'project';
  state.context = () => ({
    page: `Project report: ${project.name}`, note: `Actual spend counts paid invoices only, in MYR after tax. Planned is the sanctioned amount with tax, up to this month. Forecast: ${FORECAST_NOTE}`,
    project: { name: project.name, budget: money(r.budget), start: project.startDate, end: project.endDate },
    report: { asOf: r.asOf, sanctionedToDate: money(r.sanctionedToDate), paid: money(r.actual), invoiced: money(r.invoiced), variance: money(r.variance), overSanctioned: r.overSanctioned, budgetUsed: pct(r.budgetUsedPct), forecast: money(r.forecast), invoicesByStatus: r.counts },
    ...firstRows(entries.filter(e => !e.deletedAt)),
    paymentTable: paymentTable(sanctioned, entries).slice(0, CONTEXT_ROWS).map(row => ({ id: row.id, month: row.month, partner: row.partner, sanctionedWithTax: money(row.withTaxMinor), paid: money(row.actualMinor), variance: money(row.varianceMinor), status: row.flag })),
    invoices: entries.filter(e => !e.deletedAt).slice(0, CONTEXT_ROWS).map(e => ({ invoiceNo: e.invoiceNo, partner: e.partner, date: e.documentDate, month: e.month, dueDate: e.dueDate, original: money(e.netMinor, e.currency), taxedMYR: money(e.grossMyrMinor), status: STATUS_LABEL[e.status], description: e.description }))
  });
}
