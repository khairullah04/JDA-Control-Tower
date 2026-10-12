import { addJda, addLog, listLog } from '../services/db.js';
import { audit } from '../services/finance.js';
import { computeReport, ofProject } from '../services/analytics.js';
import { money } from '../finance/money.js';
import { $, esc, rm, spendBar, JDA_DATE_FIELDS, checkDates } from './dom.js';
import { state } from './state.js';
import { openForm } from './modal.js';
import { runSync } from './sync.js';
import { renderLog, LOG_LINES } from './log.js';
import { loadCtx, forget, storageNotice, auditLine } from './finance-ui.js';
import { startRender } from './render.js';

export async function renderDashboard() {
  const r = startRender('Loading JDAs…', renderDashboard), { page, refresh } = r;
  const ctx = await loadCtx(r), { jdas, projects, fin } = ctx;
  const rollups = jdas.map(j => {
    const mine = projects.filter(p => p.jdaId === j.id);
    const r = mine.map(p => computeReport(p, ofProject(fin.sanctioned, p.id), ofProject(fin.entries, p.id))).reduce((acc, rep) => ({
      budget: acc.budget + rep.budget, actual: acc.actual + rep.actual, forecast: acc.forecast + rep.forecast, pending: acc.pending + rep.counts.pending
    }), { budget: 0, actual: 0, forecast: 0, pending: 0 });
    return { j, r: { ...r, projectCount: mine.length } };
  });
  // Changes to JDAs and projects are logged by the tracker; changes to invoices and payments by the audit log. One list shows both.
  const named = [...await listLog(null, LOG_LINES), ...(await audit({ limit: LOG_LINES })).map(auditLine)].sort((a, b) => b.ts.localeCompare(a.ts)).map(a => {
    const p = projects.find(x => x.id === a.projectId);
    return { ...a, detail: p ? `${p.jdaName} / ${p.name}: ${a.detail}` : a.detail };
  });

  r.current();
  page.innerHTML = `<div class="section-head"><h2>JDAs</h2><div class="row"><a class="ghost" href="#/cji3">CJI3 register</a><button class="primary" id="sync-drive">Sync from Drive</button></div></div>
    ${storageNotice(ctx)}<div class="grid-4">
    ${rollups.map(({ j, r }) => `
      <a class="card" href="#/jda/${j.id}">
        <h3>${esc(j.name)}</h3>
        <div>${rm(r.actual)} paid of ${rm(r.budget)}</div>
        ${spendBar(r.budget ? r.actual / r.budget : 0)}
        <small>${r.projectCount} project(s) · ${r.pending} invoice(s) pending</small>
      </a>`).join('')}
    <div class="card add" id="add-jda" role="button" tabindex="0">+ Add JDA</div></div>

    <div class="section"><h3>Recent activity</h3>${renderLog(named)}</div>`;

  $('#sync-drive').onclick = e => runSync(e.target, refresh);
  $('#add-jda').onclick = () => openForm({
    title: 'Add JDA',
    fields: [{ name: 'name', label: 'Name (e.g. JDA 5)' }, ...JDA_DATE_FIELDS()],
    onSubmit: async v => {
      checkDates(v);
      const created = await addJda(v);
      await addLog(created.id, 'jda', `JDA "${v.name}" created, ${v.startDate} to ${v.endDate}`);
      forget(); refresh();
    }
  });

  state.page = 'dashboard';
  state.context = () => ({
    page: 'Dashboard (all JDAs)', note: 'Actual spend counts paid invoices only, in MYR after tax.',
    jdas: rollups.map(({ j, r }) => ({ name: j.name, projects: r.projectCount, budget: money(r.budget), paid: money(r.actual), forecast: money(r.forecast), pendingInvoices: r.pending }))
  });
}
