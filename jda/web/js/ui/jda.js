import { getJda, updateJda, listProjectsByJda, listScope, listInvoices, addProject, addLog, listLog } from '../services/db.js';
import { computeReport } from '../services/analytics.js';
import { $, esc, rm, pct, spendBar, jdaRange, JDA_DATE_FIELDS, checkDates } from './dom.js';
import { state } from './state.js';
import { openForm } from './modal.js';
import { runSync } from './sync.js';
import { renderTimeline } from './timeline.js';
import { renderLog } from './log.js';
import { currencyCheck, sstSummary } from './tables.js';

export async function renderJda(id) {
  const page = $('#page');
  page.innerHTML = '<p>Loading JDA…</p>';
  const jda = await getJda(id);
  const projects = await listProjectsByJda(id);
  const perProject = await Promise.all(projects.map(async p => {
    const scope = await listScope(p.id), invoices = await listInvoices(p.id);
    return { p, scope, invoices, r: computeReport(p, scope, invoices) };
  }));
  const ids = new Set(projects.map(p => p.id));
  const activity = (await listLog()).filter(a => ids.has(a.projectId) || a.projectId === id);
  const refresh = () => renderJda(id);

  const totals = perProject.reduce((acc, { r }) => ({
    budget: acc.budget + r.budget, actual: acc.actual + r.actual, forecast: acc.forecast + r.forecast,
    needsReview: acc.needsReview + r.counts.needsReview
  }), { budget: 0, actual: 0, forecast: 0, needsReview: 0 });

  // Merge every sub-project's WBS + invoices so the timeline, currency check and SST summary
  // below give the same view for the whole JDA that each project page gives for one project.
  const allScope = perProject.flatMap(({ scope }) => scope);
  const allInvoices = perProject.flatMap(({ invoices }) => invoices);
  const starts = projects.map(p => p.startDate).filter(Boolean).sort();
  const ends = projects.map(p => p.endDate).filter(Boolean).sort();
  const pseudoProject = { budget: totals.budget, startDate: starts[0] || '2026-01-01', endDate: ends[ends.length - 1] || '2026-12-31' };
  const combined = computeReport(pseudoProject, allScope, allInvoices);

  page.innerHTML = `
    <div class="section-head"><h2>${esc(jda.name)}</h2>
      <div class="row">
        <a class="ghost" href="#/" style="text-decoration:none;display:inline-flex;align-items:center">← All JDAs</a>
        <button class="ghost" id="edit-jda">Edit dates</button>
        <button class="ghost" id="add-project">+ Add project</button>
        <button class="primary" id="sync-drive">Sync from Drive</button>
      </div></div>

    <div class="kpis">
      <div class="kpi"><small>Total budget</small><b>${rm(totals.budget)}</b></div>
      <div class="kpi ${combined.overPlan ? 'bad' : 'good'}"><small>Spent (MYR)</small><b>${rm(totals.actual)}</b></div>
      <div class="kpi"><small>Budget used</small><b>${totals.budget ? pct(totals.actual / totals.budget) : '—'}</b></div>
      <div class="kpi ${totals.actual && totals.forecast > totals.budget ? 'bad' : 'good'}"><small>Forecast at completion</small><b>${rm(totals.forecast)}</b></div>
      <div class="kpi ${totals.needsReview ? 'bad' : ''}"><small>Need review</small><b>${totals.needsReview}</b></div>
    </div>

    <div class="section" id="timeline"></div>

    <div class="section-head"><h3>Projects in ${esc(jda.name)}</h3></div>
    <div class="grid-4">
      ${perProject.map(({ p, r }) => `
        <a class="card" href="#/project/${p.id}">
          <h3>${esc(p.name)}</h3>
          <div>${rm(r.actual)} of ${rm(p.budget)}</div>
          ${spendBar(r.budgetUsedPct)}
          <small>${r.counts.needsReview} need review</small>
        </a>`).join('') || '<p class="legend">No projects in this JDA yet.</p>'}
    </div>

    ${currencyCheck(combined.foreign)}

    ${sstSummary(combined.sst, `Total SST across ${jda.name}`)}

    <div class="section"><h3>Change log</h3>${renderLog(activity)}</div>`;

  renderTimeline($('#timeline'), { project: pseudoProject, scope: allScope, invoices: allInvoices, range: jdaRange(jda) });

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
    page: `JDA overview: ${jda.name}`, totals,
    projects: perProject.map(({ p, r }) => ({ name: p.name, budget: p.budget, actual: r.actual, forecast: r.forecast, needsReview: r.counts.needsReview }))
  });
}
