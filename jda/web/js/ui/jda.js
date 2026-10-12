import { updateJda, addProject, addLog, listLog } from '../services/db.js';
import { audit } from '../services/finance.js';
import { computeReport, ofProject } from '../services/analytics.js';
import { money } from '../finance/money.js';
import { $, esc, rm, pct, spendBar, jdaRange, JDA_DATE_FIELDS, checkDates } from './dom.js';
import { state } from './state.js';
import { openForm } from './modal.js';
import { runSync } from './sync.js';
import { renderTimeline } from './timeline.js';
import { renderLog } from './log.js';
import { loadCtx, storageNotice, auditLine, financeSummary } from './finance-ui.js';

export async function renderJda(id) {
  const page = $('#page');
  page.innerHTML = '<p>Loading JDA…</p>';
  const refresh = () => renderJda(id);
  const ctx = await loadCtx(refresh), { fin } = ctx;
  const jda = ctx.jdas.find(j => j.id === id);
  if (!jda) throw new Error('That JDA no longer exists.');
  const projects = ctx.projects.filter(p => p.jdaId === id);
  const perProject = projects.map(p => ({ p, r: computeReport(p, ofProject(fin.sanctioned, p.id), ofProject(fin.entries, p.id)) }));
  const ids = new Set(projects.map(p => p.id));
  const activity = [...await listLog(), ...(await audit()).map(auditLine)].filter(a => ids.has(a.projectId) || a.projectId === id || a.jdaId === id).sort((a, b) => b.ts.localeCompare(a.ts));

  // The JDA as a whole: every project's sanctioned amounts and invoices together, against the budgets added up.
  const sanctioned = fin.sanctioned.filter(s => s.jdaId === id), entries = fin.entries.filter(e => e.jdaId === id);
  const starts = projects.map(p => p.startDate).filter(Boolean).sort(), ends = projects.map(p => p.endDate).filter(Boolean).sort();
  const whole = { budgetMinor: perProject.reduce((t, { r }) => t + r.budget, 0), startDate: starts[0] || '2026-01-01', endDate: ends[ends.length - 1] || '2026-12-31' };
  const totals = computeReport(whole, sanctioned, entries);
  totals.forecast = perProject.reduce((t, { r }) => t + r.forecast, 0); // each project forecast over its own dates

  page.innerHTML = `
    <div class="section-head"><h2>${esc(jda.name)}</h2>
      <div class="row">
        <a class="ghost" href="#/" style="text-decoration:none;display:inline-flex;align-items:center">← All JDAs</a>
        <button class="ghost" id="edit-jda">Edit dates</button>
        <button class="ghost" id="add-project">+ Add project</button>
        <button class="primary" id="sync-drive">Sync from Drive</button>
      </div></div>
    ${storageNotice(ctx)}

    <div class="kpis">
      <div class="kpi"><small>Total budget</small><b>${rm(totals.budget)}</b></div>
      <div class="kpi ${totals.overPlan ? 'bad' : 'good'}"><small>Paid (MYR)</small><b>${rm(totals.actual)}</b></div>
      <div class="kpi"><small>Budget used</small><b>${totals.budget ? pct(totals.budgetUsedPct) : '—'}</b></div>
      <div class="kpi ${totals.actual && totals.forecast > totals.budget ? 'bad' : 'good'}"><small>Forecast at completion</small><b>${rm(totals.forecast)}</b></div>
      <div class="kpi ${totals.counts.pending ? 'bad' : ''}"><small>Invoices pending</small><b>${totals.counts.pending}</b></div>
    </div>

    <div class="section" id="timeline"></div>

    <div class="section-head"><h3>Projects in ${esc(jda.name)}</h3></div>
    <div class="grid-4">
      ${perProject.map(({ p, r }) => `
        <a class="card" href="#/project/${p.id}">
          <h3>${esc(p.name)}</h3>
          <div>${rm(r.actual)} paid of ${rm(r.budget)}</div>
          ${spendBar(r.budgetUsedPct)}
          <small>${r.counts.pending} invoice(s) pending</small>
        </a>`).join('') || '<p class="legend">No projects in this JDA yet.</p>'}
    </div>

    ${financeSummary(sanctioned, entries, esc(id))}

    <div class="section"><h3>Change log</h3>${renderLog(activity)}</div>`;

  renderTimeline($('#timeline'), { project: whole, sanctioned, entries, range: jdaRange(jda) });

  $('#sync-drive').onclick = e => runSync(e.target, refresh);
  $('#edit-jda').onclick = () => openForm({
    title: `Edit ${jda.name} dates`,
    fields: JDA_DATE_FIELDS(jda),
    onSubmit: async v => {
      checkDates(v);
      await updateJda(id, v);
      await addLog(id, 'jda', `${jda.name} dates set: ${v.startDate} to ${v.endDate}`);
      refresh();
    }
  });
  $('#add-project').onclick = () => openForm({
    title: 'Add project',
    fields: [
      { name: 'name', label: 'Project code (e.g. AD)' },
      { name: 'budget', label: 'Total budget (RM)', type: 'number' },
      { name: 'startDate', label: 'Start date', type: 'date' },
      { name: 'endDate', label: 'End date', type: 'date' }
    ],
    onSubmit: async v => {
      const created = await addProject({ ...v, jdaId: id });
      await addLog(created.id, 'project', `Project "${v.name}" added to ${jda.name}`);
      refresh();
    }
  });

  state.page = 'jda';
  state.context = () => ({
    page: `JDA overview: ${jda.name}`, note: 'Actual spend counts paid invoices only, in MYR after tax. Planned is the sanctioned amount with tax, up to this month.',
    totals: { budget: money(totals.budget), paid: money(totals.actual), sanctionedToDate: money(totals.planned), invoiced: money(totals.invoiced), forecast: money(totals.forecast), pendingInvoices: totals.counts.pending },
    projects: perProject.map(({ p, r }) => ({ name: p.name, budget: money(r.budget), paid: money(r.actual), forecast: money(r.forecast), pendingInvoices: r.counts.pending }))
  });
}
