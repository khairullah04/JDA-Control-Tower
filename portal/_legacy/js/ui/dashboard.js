import { $, esc, ring, icon } from './dom.js';
import { wireGate } from './adminGate.js';
import { getReport } from '../services/jdaReports.js';
import { JDAS, INVOICE_TRACKER_URL } from '../config/app-config.js';

async function renderGrid() {
  const grid = $('#jda-grid');
  const cards = await Promise.all(JDAS.map(async j => {
    const data = await getReport(j.id);
    const projects = data?.projects || [];
    const avg = projects.length ? projects.reduce((s, p) => s + (p.pct || 0), 0) / projects.length : 0;
    const worst = projects.some(p => p.status === 'red') ? 'red' : projects.some(p => p.status === 'amber') ? 'amber' : 'green';
    return `<a class="card" href="jda-report.html?jda=${j.id}">
      <div style="display:flex;align-items:center;gap:14px">
        ${ring(avg)}
        <div><h3>${esc(j.name)}</h3><span class="status-pill ${projects.length ? worst : 'amber'}">${projects.length ? worst : 'No data yet'}</span></div>
      </div>
      <div class="progress-track"><div class="progress-fill" style="width:${avg}%"></div></div>
      <small style="color:var(--muted)">${projects.length} project(s)</small>
    </a>`;
  }));
  grid.innerHTML = cards.join('');
}

function wireAdminPanel() {
  $('#lock-icon').innerHTML = icon.lock;
  $('#external-icon').innerHTML = icon.external;
  $('#admin-link').href = INVOICE_TRACKER_URL;
  wireGate({
    storageKey: 'jda-admin-unlocked',
    lockedEl: $('#admin-locked'), openEl: $('#admin-open'),
    passkeyInput: $('#admin-passkey'), msgEl: $('#admin-msg'), unlockBtn: $('#admin-unlock')
  });
}

export function initDashboard() {
  renderGrid();
  wireAdminPanel();
}
