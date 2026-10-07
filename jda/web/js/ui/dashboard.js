import { listJdas, listProjectsByJda, listInvoices, listScope, addJda, addLog, listLog } from '../services/db.js';
import { computeReport } from '../services/analytics.js';
import { $, esc, rm, spendBar, JDA_DATE_FIELDS, checkDates } from './dom.js';
import { state } from './state.js';
import { openForm } from './modal.js';
import { runSync } from './sync.js';
import { renderLog } from './log.js';

export async function renderDashboard() {
  const page = $('#page');
  page.innerHTML = '<p>Loading JDAs…</p>';
  const jdas = await listJdas();
  const allProjects = [];
  const rollups = await Promise.all(jdas.map(async j => {
    const projects = await listProjectsByJda(j.id);
    allProjects.push(...projects.map(p => ({ ...p, jdaName: j.name })));
    const reports = await Promise.all(projects.map(async p => computeReport(p, await listScope(p.id), await listInvoices(p.id))));
    const r = reports.reduce((acc, rep) => ({
      budget: acc.budget + rep.budget, actual: acc.actual + rep.actual, forecast: acc.forecast + rep.forecast,
      needsReview: acc.needsReview + rep.counts.needsReview, projectCount: acc.projectCount + 1
    }), { budget: 0, actual: 0, forecast: 0, needsReview: 0, projectCount: 0 });
    return { j, r };
  }));
  const activity = await listLog();
  const named = activity.map(a => {
    const p = allProjects.find(x => x.id === a.projectId);
    return { ...a, detail: p ? `${p.jdaName} / ${p.name}: ${a.detail}` : a.detail };
  });

  page.innerHTML = `<div class="section-head"><h2>JDAs</h2><button class="primary" id="sync-drive">Sync from Drive</button></div><div class="grid-4">
    ${rollups.map(({ j, r }) => `
      <a class="card" href="#/jda/${j.id}">
        <h3>${esc(j.name)}</h3>
        <div>${rm(r.actual)} of ${rm(r.budget)}</div>
        ${spendBar(r.budget ? r.actual / r.budget : 0)}
        <small>${r.projectCount} project(s) · ${r.needsReview} need review</small>
      </a>`).join('')}
    <div class="card add" id="add-jda" role="button" tabindex="0">+ Add JDA</div></div>

    <div class="section"><h3>Recent activity</h3>${renderLog(named)}</div>`;

  $('#sync-drive').onclick = e => runSync(e.target, renderDashboard);
  $('#add-jda').onclick = () => openForm({
    title: 'Add JDA',
    fields: [{ name: 'name', label: 'Name (e.g. JDA 5)' }, ...JDA_DATE_FIELDS()],
    onSubmit: async v => {
      checkDates(v);
      const created = await addJda(v);
      await addLog(created.id, 'jda', `JDA "${v.name}" created, ${v.startDate} to ${v.endDate}`);
      renderDashboard();
    }
  });

  state.page = 'dashboard';
  state.context = () => ({
    page: 'Dashboard (all JDAs)',
    jdas: rollups.map(({ j, r }) => ({ name: j.name, projects: r.projectCount, budget: r.budget, actual: r.actual, forecast: r.forecast, needsReview: r.needsReview }))
  });
}
