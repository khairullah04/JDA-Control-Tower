// A JDA's private pages: Overall progress (/control-tower/<jda>/overall-progress) and Weekly progress
// (/weekly-progress), a project's page (#project/<slug>), Edit report (housekeeping), and edit mode
// (#edit). Its Master Page is public, on its Info page (/jda/<jda>/info), and edited there.
// Behaviour is ported from the JDA3 reference file's inline script; what differs per JDA is its
// content entry (config/jda-content.js) and where its report document lives (shared/config/jdas.js).
import { onSnapshot } from '../../shared/vendor/firebase-firestore.js';
import { JDAS, MS_CLIENT_ID, MS_AUTHORITY } from '../../shared/config/jdas.js';
import { portalApi } from '../../shared/lib/portal-api.js';
import { isConfigured, reportRefFor } from '../../shared/lib/firebase.js';
import '../../shared/components/account.js';
import { mountCtSidebar } from './ct-sidebar.js';
import { contentFor } from '../config/jda-content.js';
import { startEditor } from './editor.js';
import { contentFromOverview as overviewContent } from '../../shared/lib/overview.js';
import { esc } from '../../shared/lib/esc.js';
import { digest, digests } from '../../shared/lib/digest.js';
import { localToday } from '../../shared/lib/dates.js';
import { withProjectIds, linkTasks, tasksOf, normalizeTasks, mergeTasks, stampTasks, taskProgress, viewTasks, isOverdue as taskOverdue, TASK_STATUSES } from '../../shared/lib/progress.js';
import { newAddress } from '../lib/old-addresses.js';

// Addresses from before (jda-report.html#/jda1/...) lead to where that screen is now.
if (location.pathname.endsWith('/jda-report.html')) { location.replace(newAddress(location.hash, location.search)); await new Promise(() => {}); } // nothing more runs here

const $ = id => document.getElementById(id);
const empty = (text = 'Not added yet.', style = '') => `<p class="detail-tasks-empty"${style ? ` style="${style}"` : ''}>${text}</p>`;

const [, , jdaKey, pageName] = location.pathname.split('/'); // /control-tower/<jda>/<overall|weekly>-progress
const jda = JDAS.find(j => j.id === jdaKey);
if (!jda) { location.replace('/control-tower/'); await new Promise(() => {}); }
mountCtSidebar({ wrap: document.querySelector('.app'), bar: document.querySelector('.topbar-inner'), current: jda.id });
const PAGE_FOR = { 'screen-progress': 'overall-progress', 'screen-weekly': 'weekly-progress' };
const pathFor = screen => `/control-tower/${jda.id}/${PAGE_FOR[screen] || 'overall-progress'}`;
const baseContent = contentFor(jda);
let c = baseContent; // + the saved Master Page content (titles, intros), once the report document arrives

/* ---------- Saving goes through the JDA server, behind the JDA Control Tower sign-in ---------- */
// Back to the Control Tower lands on this JDA's tab; its Master Page is its public Info page.
document.querySelectorAll('a[href="/control-tower/"]').forEach(a => { a.href = `/control-tower/#${jda.id}`; });
$('navMaster').href = `/jda/${encodeURIComponent(jda.id)}/info`;
const api = (path, body = {}) => portalApi(path, { jda: { id: jda.id, name: jda.name }, ...body });
// Reading and edit mode differ only in the hash (#edit), so moving between them swaps it and reloads
// to start again in the other mode.
function goTo(address, notice){
  if (notice) sessionStorage.setItem('jda-notice', notice);
  history.replaceState(null, '', address);
  location.reload();
}

// Edit mode is this same page made editable, for anyone signed in to the JDA Control Tower.
const editing = location.hash === '#edit';
const hashParts = location.hash.replace(/^#/, '').split('/');
let editor = null, firstLoadDone;
const firstLoad = new Promise(resolve => { firstLoadDone = resolve; });
const starterData = baseContent.starter; // only a JDA with its own starter dataset has one

const statusColor = { green:"green", amber:"amber", red:"red" };
const statusLabel = { green:"On track", amber:"At risk", red:"Delayed" };
const taskStatusClass = Object.fromEntries(TASK_STATUSES.map((s, i) => [s, ["notstarted", "progress", "done"][i]]));
const sevLabel = { high:"HIGH", medium:"MEDIUM", low:"LOW" };

let chart, currentData = starterData || {};
const firebaseReady = isConfigured(jda);
let reportRef;

/* ---------- The page's titles, from the JDA's content (and what its Master Page saved) ---------- */
function renderHeader(){
  document.title = `${c.short}: progress · JDA Control Tower`;
  $('brandMark').textContent = c.mark;
  $('brandTitle').textContent = c.reportTitle;
  $('navJdaName').textContent = c.short;
  $('footBrand').textContent = c.footBrand;
  $('footNote').textContent = c.footNote;
  $('progressIntro').textContent = c.progressIntro;
  $('tasksIntro').textContent = c.tasksIntro;
}

const contentFromOverview = ov => overviewContent(ov, baseContent);

let appliedOverview = '';
function applyOverview(ov){
  const json = JSON.stringify(ov || null);
  if (json === appliedOverview) return;
  appliedOverview = json;
  c = contentFromOverview(ov);
  renderHeader();
}

function slugify(str){ return (str||"").toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,''); }

const todayISO = localToday(); // today in Malaysia (shared/dates.js), the same day every part of this page uses
function formatDueDate(iso){
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
}

// Which index in scurve.months/actual corresponds to the real calendar's
// current month, given a "YYYY-MM" cycle start — this is what keeps the
// S-curve's "current" point tied to today's actual date instead of just
// whichever slot happens to hold the last non-null mock value.
function getCurrentMonthIndex(startMonth){
  if (!startMonth) return -1;
  const [sy, sm] = startMonth.split('-').map(Number);
  if (!sy || !sm) return -1;
  const [y, m] = todayISO.split('-').map(Number);
  return (y - sy) * 12 + (m - sm);
}

function renderDetailTasks(project, tasks){
  const container = $('detailTasks');
  const assigned = tasksOf(project, tasks || [], currentData.projects || []);
  assigned.sort((a, b) => (a.due || '9999-99-99').localeCompare(b.due || '9999-99-99'));
  if (!assigned.length){
    container.innerHTML = empty('No tasks assigned yet.');
  } else {
    container.innerHTML = assigned.map(t => `
      <div class="detail-task-row">
        <span class="detail-task-name">${esc(t.task)}</span>
        <span class="task-status ${taskStatusClass[t.status] || 'notstarted'}">${esc(t.status)}</span>
        <span class="detail-task-due mono">${esc(formatDueDate(t.due))}</span>
      </div>
    `).join('');
  }
  return assigned;
}
$('todayLabel').textContent = "Today: " + formatDueDate(todayISO);
const pagenavTabFor = { "screen-progress":"screen-progress", "screen-project-detail":"screen-progress", "screen-weekly":"screen-weekly", "screen-edit":"screen-edit" };
function showScreen(id){
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
  // The address follows the screen, so a reload, a shared link or Leave returns to the same one.
  if (PAGE_FOR[id]) history.replaceState(null, '', pathFor(id) + (editor ? '#edit' : ''));
  const activeTab = pagenavTabFor[id];
  document.querySelectorAll('.pagenav-tab').forEach(t => t.classList.toggle('active', t.dataset.target === activeTab));
  const onEdit = id === 'screen-edit';
  $('pagenavEditSep').style.display = onEdit ? 'inline-flex' : 'none';
  $('pagenavEditTab').style.display = onEdit ? 'inline-flex' : 'none';
  window.scrollTo({top:0, behavior:'smooth'});
  updateScrollProgress();
}
document.querySelectorAll('.btn[data-target], .back-link, .crumb-link, .pagenav-tab[data-target]').forEach(btn => {
  btn.addEventListener('click', () => showScreen(btn.dataset.target));
});

document.addEventListener('keydown', (e) => {
  const typingTags = ['INPUT', 'TEXTAREA', 'SELECT'];
  if (document.activeElement && (typingTags.includes(document.activeElement.tagName) || document.activeElement.isContentEditable)) return;
  const order = ['screen-progress','screen-weekly']; // the two reading screens only: a stray arrow never leaves Edit report, or lands on it
  const current = order.find(id => $(id).classList.contains('active'));
  const idx = order.indexOf(current);
  if (idx === -1) return; // Edit report, a detail screen or the block editor: the arrow keys belong to the page
  if (e.key === 'ArrowRight' && idx < order.length - 1) showScreen(order[idx + 1]);
  if (e.key === 'ArrowLeft' && idx > 0) showScreen(order[idx - 1]);
});

function updateScrollProgress(){
  const h = document.documentElement;
  const pct = h.scrollHeight > h.clientHeight ? (h.scrollTop / (h.scrollHeight - h.clientHeight)) * 100 : 0;
  $('scrollProgress').style.width = pct + "%";
}
document.addEventListener('scroll', updateScrollProgress, {passive:true});

renderHeader();

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => { if (entry.isIntersecting){ entry.target.classList.add('in'); revealObserver.unobserve(entry.target); } });
}, {threshold:.12});
document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

function animateNumber(el, target, duration){
  const start = performance.now();
  function tick(now){
    const t = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = Math.round(eased * target) + "%";
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function animateCount(el, target, duration){
  const start = performance.now();
  function tick(now){
    const t = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = Math.round(eased * target);
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

const scurveOptions = {
  responsive: true,
  plugins: { legend: { position:'top', align:'end', labels:{ font:{family:"Segoe UI", size:13}, boxWidth:14, usePointStyle:true } } },
  scales: {
    y: { min:0, max:100, ticks:{ callback:v=>v+'%', font:{family:"'IBM Plex Mono'", size:11} }, grid:{color:'#dde6e5'} },
    x: { ticks:{ font:{family:"'IBM Plex Mono'", size:11} }, grid:{display:false} }
  }
};

let detailChart = null;
function showProjectDetail(slug){
  const p = (currentData.projects || []).find(pr => slugify(pr.name) === slug);
  if (!p) return;
  $('detailName').textContent = p.name;
  $('detailMeta').textContent = p.owner;
  const pill = $('detailStatusPill');
  pill.className = "status-pill " + (statusColor[p.status] || "green");
  pill.textContent = statusLabel[p.status] || "On track";
  $('detailPct').textContent = p.pct + "%";
  const assignedTasks = renderDetailTasks(p, currentData.tasks);
  $('detailDescription').textContent = p.description || "No description added yet.";
  const fill = $('detailFill');
  fill.style.width = "0";
  requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = p.pct + "%"; }));

  // Completion by partner — T.AI and IBM track their own progress
  // separately (from the "Percentage Completion" figures on each
  // project's Daily sheet); the main pct above is milestone-based and
  // synced independently, not derived from these two numbers.
  const breakdownSection = $('detailBreakdownSection');
  if (p.taiPct != null || p.ibmPct != null) {
    breakdownSection.style.display = "block";
    const taiPct = p.taiPct ?? 0;
    const ibmPct = p.ibmPct ?? 0;
    $('detailTaiPct').textContent = taiPct + "%";
    $('detailIbmPct').textContent = ibmPct + "%";
    const taiFill = $('detailTaiFill');
    const ibmFill = $('detailIbmFill');
    taiFill.style.width = "0"; ibmFill.style.width = "0";
    requestAnimationFrame(() => requestAnimationFrame(() => {
      taiFill.style.width = taiPct + "%";
      ibmFill.style.width = ibmPct + "%";
    }));
  } else {
    breakdownSection.style.display = "none";
  }

  // "Current milestone" = the nearest-due task actively in progress, falling
  // back to the nearest-due task that hasn't started yet - a stand-in for
  // the "Milestone: <name>" label the source Excel sheet's daily-update
  // block is written against, since that label itself isn't structured data.
  const milestoneSection = $('detailMilestoneSection');
  const milestoneTask = assignedTasks.find(t => t.status === 'In progress') || assignedTasks.find(t => t.status === 'Not started');
  if (milestoneTask) {
    milestoneSection.style.display = "block";
    $('detailMilestone').innerHTML = `
      <span class="n"><svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3Z" fill="#fff"/></svg></span>
      <span>${esc(milestoneTask.task)}</span>`;
  } else {
    milestoneSection.style.display = "none";
  }

  // "Daily updates" = this project's own slice of the shared Updates log,
  // tagged with a "[project name]" prefix when synced in (see api/sync-report.js).
  const updatesSection = $('detailUpdatesSection');
  const prefix = `[${p.name}]`;
  const ownUpdates = (currentData.updates || [])
    .filter(u => (u.text || '').startsWith(prefix))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (ownUpdates.length) {
    updatesSection.style.display = "block";
    $('detailUpdates').innerHTML = ownUpdates.map(u => `
      <div class="update-item">
        <div class="update-date">${esc(formatDueDate(u.date))}</div>
        <p>${esc(u.text.slice(prefix.length).trim())}</p>
      </div>
    `).join('');
  } else {
    updatesSection.style.display = "none";
  }

  const scurveSection = $('detailScurveSection');
  if (detailChart) { detailChart.destroy(); detailChart = null; }
  if (p.scurve && p.scurve.months && p.scurve.months.length) {
    scurveSection.style.display = "block";
    detailChart = new Chart($('detailSCurve'), {
      type: 'line',
      data: {
        labels: p.scurve.months,
        datasets: [
          { label:'Planned', data: p.scurve.planned, borderColor:'#8a9a97', borderDash:[4,3], borderWidth:2, pointRadius:0, tension:0.35 },
          { label:'Actual', data: p.scurve.actual, borderColor:'#00857c', backgroundColor:'rgba(0,133,124,0.1)', borderWidth:2.5, pointRadius:3, pointBackgroundColor:'#00857c', fill:true, tension:0.35 }
        ]
      },
      options: scurveOptions
    });
  } else {
    scurveSection.style.display = "none";
  }

  showScreen('screen-project-detail');
  history.replaceState(null, "", `${pathFor('screen-progress')}#project/${encodeURIComponent(slug)}`);
}

let initialRouteHandled = false;
function handleInitialRoute(){
  if (initialRouteHandled) return;
  initialRouteHandled = true;
  firstLoadDone();
  if (pageName === 'weekly-progress') showScreen('screen-weekly');
  if (!editing && hashParts[0] === 'project') { try { showProjectDetail(decodeURIComponent(hashParts[1] || '')); } catch { /* a malformed address: stay on the page */ } }
}

// `data` is null when this JDA has no report document yet: every section keeps its place and its
// values stay blank - no zeros, no sample numbers.
/* ---------- Weekly progress: the tasks. Filtered and sorted for reading; in the editor every task is
   shown in its stored order with its details open, so each row is the task it edits. ---------- */
const taskView = { status: '', owner: '', due: '', sort: 'due' }, openTasks = new Set(); // open rows, by task id
const PRIORITY_CLASS = { High: 'high', Medium: 'medium', Low: 'low' };
function taskDetails(t){
  const date = (label, iso, field) => `<div><dt>${label}</dt><dd class="mono" data-field="${field}">${iso ? esc(formatDueDate(iso)) : '—'}</dd></div>`;
  // Only what is filled in; what the row above already shows (project, due, progress) is not repeated.
  const main = [
    t.description && `<h5>Description</h5><p class="task-desc">${esc(t.description)}</p>`,
    t.checklist.length && `<h5>Checklist <span class="muted">${t.checklist.filter(c => c.done).length} of ${t.checklist.length} done</span></h5>
      <ul class="task-checklist">${t.checklist.map(c => `<li class="${c.done ? 'done' : ''}"><span class="tick" aria-hidden="true">${c.done ? '✓' : ''}</span><span class="visually-hidden">${c.done ? 'Done: ' : 'To do: '}</span>${esc(c.text)}</li>`).join('')}</ul>`,
    t.notes && `<h5>Notes and blockers</h5><p class="task-notes">${esc(t.notes)}</p>`
  ].filter(Boolean).join('') || '<p class="muted">No details yet. They can be added with Edit tasks.</p>';
  return `
    <div class="task-detail-grid">
      <div class="task-detail-main">${main}</div>
      <dl class="task-facts">
        ${date('Start', t.start, 'start')}${date('Completed', t.completed, 'completed')}
        <div><dt>Last updated</dt><dd class="mono">${t.updatedAt ? esc(formatDueDate(t.updatedAt)) : '—'}</dd></div>
      </dl>
    </div>`;
}
function renderTasks(raw){
  const tasks = normalizeTasks(raw).map((t, i) => ({ ...t, _i: i }));
  const owners = [...new Set(tasks.map(t => t.owner).filter(Boolean))].sort();
  $('taskOwner').innerHTML = '<option value="">Everyone</option>' + owners.map(o => `<option${o === taskView.owner ? ' selected' : ''}>${esc(o)}</option>`).join('');
  if (!owners.includes(taskView.owner)) taskView.owner = '';
  $('taskToolbar').hidden = editing;
  $('editTasksLink').href = `${pathFor('screen-weekly')}#edit`;
  const shown = editing ? tasks : viewTasks(tasks, taskView, todayISO);
  $('taskCount').textContent = editing || !tasks.length ? '' : `${shown.length} of ${tasks.length} task${tasks.length === 1 ? '' : 's'}`;
  const tbody = $('tasksBody');
  tbody.innerHTML = !tasks.length ? `<tr><td colspan="6">${empty('No tasks yet.')}</td></tr>`
    : !shown.length ? `<tr><td colspan="6">${empty('No tasks match these filters.')} <button type="button" class="link-like" id="clearTaskFilters">Clear filters</button></td></tr>` : shown.map(t => {
      const overdue = taskOverdue(t, todayISO), open = openTasks.has(t.id) || (editing && !t.task), pct = taskProgress(t);
      return `<tr class="task-row${open ? ' open' : ''}" data-index="${t._i}" data-id="${esc(t.id)}">
        <td data-cell="task" data-label="Task"><button type="button" class="task-toggle" aria-expanded="${open}" aria-controls="task-detail-${t._i}" aria-label="Details of ${esc(t.task || 'this task')}"><span class="chev" aria-hidden="true">›</span></button><span class="task-name">${esc(t.task)}</span>${t.project ? `<span class="task-project">${esc(t.project)}</span>` : ''}</td>
        <td data-cell="owner" data-label="Owner">${esc(t.owner) || '<span class="muted">—</span>'}</td>
        <td data-cell="priority" data-label="Priority">${t.priority ? `<span class="prio ${PRIORITY_CLASS[t.priority]}">${esc(t.priority)}</span>` : '<span class="prio none">—</span>'}</td>
        <td class="mono${overdue ? ' overdue' : ''}" data-cell="due" data-label="Due">${esc(formatDueDate(t.due))}${overdue ? ' <span class="overdue-tag">OVERDUE</span>' : ''}</td>
        <td data-cell="progress" data-label="Progress">${pct === null ? '<span class="muted">—</span>' : `<span class="task-bar" role="img" aria-label="${pct}% done"><span style="width:${pct}%"></span></span><span class="mono task-pct">${pct}%</span>`}</td>
        <td data-cell="status" data-label="Status"><span class="task-status ${taskStatusClass[t.status] || 'other'}">${esc(t.status)}</span></td>
      </tr>
      <tr class="task-detail" id="task-detail-${t._i}" data-index="${t._i}"${open ? '' : ' hidden'}><td colspan="6">${editing ? '' : taskDetails(t)}</td></tr>`;
    }).join('');
}
// Reading: a row opens and closes its details; the toolbar filters and sorts.
// In the editor only the arrow opens a row (the rest of the row is being edited).
$('tasksBody').addEventListener('click', e => {
  if (e.target.id === 'clearTaskFilters'){ Object.assign(taskView, { status: '', owner: '', due: '' }); for (const id of ['taskStatus', 'taskOwner', 'taskDue']) $(id).value = ''; renderTasks(currentData.tasks); return; }
  if (e.target.closest('a, select, input, textarea, .ed-btn, .ed-pill') || (editing && !e.target.closest('.task-toggle'))) return;
  const row = e.target.closest('.task-row');
  if (!row) return;
  const id = row.dataset.id, open = !openTasks.has(id);
  open ? openTasks.add(id) : openTasks.delete(id);
  row.classList.toggle('open', open);
  row.querySelector('.task-toggle').setAttribute('aria-expanded', open);
  row.nextElementSibling.hidden = !open;
});
for (const [id, key] of [['taskStatus', 'status'], ['taskDue', 'due'], ['taskOwner', 'owner'], ['taskSort', 'sort']]) $(id).onchange = e => { taskView[key] = e.target.value; renderTasks(currentData.tasks); };

function render(data){
  const hasReport = !!data;
  data = data || {};
  $('weekLabel').textContent = data.weekLabel || "Week of —";

  const projectsForAvg = data.projects || [];
  const pct = projectsForAvg.length
    ? Math.round(projectsForAvg.reduce((sum, p) => sum + (p.pct || 0), 0) / projectsForAvg.length)
    : null;
  const circumference = 245;
  const ring = $('ringFg');
  ring.style.strokeDashoffset = circumference - ((pct || 0) / 100) * circumference;
  if (pct === null) $('overallPct').textContent = "—";
  else animateNumber($('overallPct'), pct, 900);

  const pill = $('overallStatusPill');
  pill.className = "status-pill " + (statusColor[data.overallStatus] || "green");
  pill.textContent = hasReport ? (statusLabel[data.overallStatus] || "On track") : "—";

  const stat = (id, n) => hasReport ? animateCount($(id), n, 700) : ($(id).textContent = "—");
  stat('statWorkstreams', (data.projects || []).length);
  stat('statTasks', (data.tasks || []).filter(t => t.status !== 'Done').length);
  stat('statChallenges', (data.challenges || []).length);

  const grid = $('projectGrid');
  grid.innerHTML = (data.projects || []).length ? "" : empty('No projects yet.');
  (data.projects || []).forEach(p=>{
    const card = document.createElement('div');
    card.className = `project-card ${statusColor[p.status] || ''}`;
    card.innerHTML = `
      <div class="project-main"><h4>${esc(p.name)}</h4><div class="project-meta">${esc(p.owner)}</div></div>
      <div class="progress-track"><div class="progress-fill"></div></div>
      <div class="project-pct mono">${esc(p.pct)}%</div>`;
    grid.appendChild(card);
    if (!editing) card.addEventListener('click', () => showProjectDetail(slugify(p.name)));
    const fill = card.querySelector('.progress-fill');
    requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = p.pct + "%"; }));
  });

  renderTasks(data.tasks);

  const log = $('updatesLog');
  log.innerHTML = (data.updates || []).length ? "" : empty('No updates posted yet.', 'padding-left:24px');
  (data.updates || []).forEach(u=>{
    const item = document.createElement('div');
    item.className = "update-item";
    item.innerHTML = `<div class="update-date">${esc(formatDueDate(u.date))}</div><p>${esc(u.text)}</p>`;
    log.appendChild(item);
  });

  const challengesList = $('challengesList');
  challengesList.innerHTML = (data.challenges || []).length ? "" : empty('No challenges logged.');
  (data.challenges || []).forEach(ch=>{
    const item = document.createElement('div');
    item.className = "challenge-item";
    item.innerHTML = `
      <div class="sev-tag sev-${sevLabel[ch.severity] ? ch.severity : 'low'}">${sevLabel[ch.severity] || 'LOW'}</div>
      <div class="challenge-body">
        <h4>${esc(ch.title)}</h4>
        <p>${esc(ch.description || '')}</p>
        <div class="mitigation">Mitigation: ${esc(ch.mitigation || '—')}</div>
      </div>`;
    challengesList.appendChild(item);
  });

  if (chart){
    // The chart shows this document's curve and nothing else: a report with no S-curve leaves the
    // chart empty, so the starter dataset's sample curve is never mistaken for live figures.
    const curve = data.scurve || {};
    chart.data.labels = curve.months || [];
    chart.data.datasets[0].data = curve.planned || [];

    // The point for the real, current calendar month always reflects the live
    // project-average completion (`pct`), and every month after it is forced
    // back to null (not reached yet) — so the S-curve always lines up with
    // today's actual date instead of drifting from stale mock data. Months
    // before the current one keep whatever historical value was recorded.
    const actualArr = (curve.actual || []).slice();
    const curIdx = getCurrentMonthIndex(curve.startMonth || c.defaultStartMonth);
    if (pct !== null && curIdx >= 0 && curIdx < actualArr.length){
      actualArr[curIdx] = pct;
      for (let i = curIdx + 1; i < actualArr.length; i++) actualArr[i] = null;
    }
    chart.data.datasets[1].data = actualArr;

    chart.update();
  }
}

/* ---------- Edit report: housekeeping (Drive sync, calendar, clearing finished tasks). The report
   itself is edited in one place, the Editor Page, opened from the icon on the Master Page. Nothing
   here or there writes to the database: every save goes to the JDA server, which checks the
   sign-in, refuses to overwrite a part someone else changed since this
   page loaded it, and keeps the previous version. ---------- */
const REPORT_FIELDS = ['weekLabel', 'overallStatus', 'projects', 'challenges', 'tasks', 'updates'];
const saveReport = (patch, { remove = [], base = digests(currentData, [...Object.keys(patch), ...remove]), force = false } = {}) =>
  api('save', { patch, remove, base, force });
// Runs one save and always says how it went: the message on success, the reason in red (and left on screen) on failure.
async function attempt(msgId, action){
  try { flash(msgId, await action()); }
  catch (e){ flash(msgId, `Not saved: ${e.message}`, true); }
}

$('openEditBtn').onclick = () => showScreen('screen-edit');

// The starter dataset belongs to the JDA it was written for; a JDA without its own is never offered another one's.
$('bootstrapBtn').onclick = () => attempt('bootstrapMsg', async () => {
  await saveReport(Object.fromEntries(Object.entries(starterData).filter(([k]) => REPORT_FIELDS.includes(k) || k === 'scurve')));
  return 'Starter data loaded.';
});

// Finished tasks are removed on request, never by themselves, and only after saying how many.
$('clearDoneBtn').onclick = () => attempt('tasksMsg', async () => {
  const tasks = currentData.tasks || [], done = tasks.filter(t => t.status === 'Done').length;
  if (!done) return 'There are no completed tasks to clear.';
  if (!confirm(`Remove ${done} completed task${done === 1 ? '' : 's'} from the weekly report? The other ${tasks.length - done} stay.`)) return '';
  await saveReport({ tasks: tasks.filter(t => t.status !== 'Done') });
  return `Cleared ${done} completed task${done === 1 ? '' : 's'}.`;
});

/* ---------- Update progress from Google Drive: the server reads this JDA's Overall and Weekly Progress
   folders and Claude extracts them. The Master File folder belongs to the Editor Page. ---------- */
$('driveSyncBtn').onclick = async () => {
  const btn = $('driveSyncBtn'), status = $('driveSyncStatus'), skippedEl = $('driveSyncSkipped');
  const say = (text, color) => { status.textContent = text; status.style.color = color || 'var(--muted)'; };
  const files = (n, word = 'file') => `${n} ${word}${n === 1 ? '' : 's'}`;
  btn.disabled = true; skippedEl.innerHTML = "";
  say("Reading the Drive folder and extracting — this can take a minute or two…");
  try {
    const out = await api('sync', { scope: 'progress', currentProjects: currentData.projects || [] });
    if (!out.found) throw new Error(`No folder named "${jda.name}" in the JDA Control Tower's Drive folder.`);
    const { driveSync, ...sections } = out.patch;
    if (Object.keys(sections).length){
      // Projects from Drive keep the ids they had here, and tasks stay tied to them (progress.js).
      if (out.patch.projects) out.patch.projects = withProjectIds(out.patch.projects, currentData.projects || []);
      // Tasks are merged into the ones there: each keeps its id and every detail typed in the editor that the report does not state.
      if (out.patch.tasks){
        const was = normalizeTasks(currentData.tasks);
        out.patch.tasks = stampTasks(linkTasks(mergeTasks(out.patch.tasks, was), out.patch.projects || currentData.projects || []), was, todayISO);
      }
      await saveReport(out.patch);
      const n = out.counts, parts = [];
      if (n.overall && sections.challenges) parts.push(`overall progress (${files(n.overall)})`);
      if (sections.tasks) parts.push(`weekly progress (${files(n.weekly, 'report')})`);
      say("Updated from Drive: " + parts.join(', ') + ".", 'var(--green)');
    } else {
      say("Nothing to update: no readable files in this JDA's Overall Progress or Weekly Progress folders.");
    }
    skippedEl.innerHTML = out.skipped.map(x => `<div class="entry-row"><div class="entry-main"><div class="entry-title">Skipped</div><div class="entry-meta">${esc(x)}</div></div></div>`).join('');
  } catch (e){
    say(e.message, 'var(--red)');
  } finally {
    btn.disabled = false;
  }
};

let flashTimer = {};
function flash(id, text, failed = false){
  const el = $(id);
  el.textContent = text || "";
  el.style.color = failed ? 'var(--red)' : '';
  clearTimeout(flashTimer[id]);
  if (!failed) flashTimer[id] = setTimeout(()=>{ el.textContent = ""; }, 4000); // a failure stays until the next attempt
}

/* ---------- Microsoft Calendar sync (client-side OAuth via MSAL.js + Microsoft Graph) ---------- */
let msalInstance = null;
let msAccessToken = null;
const MS_EXT_PROP_ID = "String {8f3a1c2e-6b4d-4a2f-9c1e-5d7b3a9f2c11} Name jda3TaskKey";

function addDaysISO(iso, days){
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function setMsCalStatus(state, msg){
  const el = $('msCalStatus');
  const syncBtn = $('syncMsCalBtn');
  if (state === 'connected'){
    el.textContent = "Connected — ready to sync.";
    el.style.color = 'var(--green)';
    syncBtn.disabled = false;
  } else if (state === 'error'){
    el.textContent = msg || "Something went wrong.";
    el.style.color = 'var(--red)';
    syncBtn.disabled = true;
  } else {
    el.textContent = "Not connected.";
    el.style.color = 'var(--muted)';
    syncBtn.disabled = true;
  }
}

// The card is shown only once a client ID has been configured (config/app-config.js); until then
// there is nothing it could do. Microsoft's sign-in library is fetched when "Connect" is pressed,
// not with every report view, and only if it is byte for byte the version this page was written for.
const msCalConfigured = !!MS_CLIENT_ID && !MS_CLIENT_ID.startsWith('YOUR_');
$('msCalCard').hidden = !msCalConfigured;
const MSAL = { src: 'https://cdn.jsdelivr.net/npm/@azure/msal-browser@2.38.3/lib/msal-browser.min.js', integrity: 'sha384-OJTwghM0Gh3Zc+gmd6l0lz1pFw9KuHHq0mSEZgmQEKgMnuSWWDb3bU9KzuD7w2hU' };
let msalLoading;
const loadMsal = () => msalLoading ??= new Promise((resolve, reject) => {
  if (window.msal) return resolve();
  const s = Object.assign(document.createElement('script'), { ...MSAL, crossOrigin: 'anonymous', onload: resolve });
  s.onerror = () => { msalLoading = null; reject(new Error("Microsoft's sign-in library could not be loaded. Check the network and try again.")); };
  document.head.append(s);
});

function ensureMsalInstance(){
  if (msalInstance) return msalInstance;
  if (!window.msal) return null;
  msalInstance = new msal.PublicClientApplication({
    auth: {
      clientId: MS_CLIENT_ID,
      authority: MS_AUTHORITY,
      redirectUri: `${window.location.origin}/control-tower/` // one address for every JDA's pages, as registered in Azure
    }
  });
  return msalInstance;
}

$('connectMsCalBtn').onclick = async () => {
  if (!msCalConfigured){
    setMsCalStatus('error', "Microsoft Client ID isn't configured yet — see portal/README.md, \"Microsoft Calendar\".");
    return;
  }
  if (location.protocol === 'file:'){
    setMsCalStatus('error', "Microsoft sign-in needs http(s) — run a local server or use the deployed URL, not the file:// path.");
    return;
  }
  try {
    await loadMsal();
    const app = ensureMsalInstance();
    const resp = await app.loginPopup({ scopes: ['Calendars.ReadWrite'] });
    msAccessToken = resp.accessToken;
    setMsCalStatus('connected');
  } catch (e){
    setMsCalStatus('error', "Connection failed: " + (e && e.message ? e.message : e));
  }
};

$('syncMsCalBtn').onclick = async () => {
  if (!msAccessToken){ setMsCalStatus('error', "Connect first."); return; }
  const tasks = (currentData.tasks || []).filter(t => t.due && t.status !== 'Done');
  if (!tasks.length){ flash('msCalMsg', "No open tasks with a due date to sync."); return; }

  const btn = $('syncMsCalBtn');
  btn.disabled = true;
  const originalLabel = btn.textContent;
  btn.textContent = "Syncing…";

  let created = 0, updated = 0, failed = 0;
  for (const t of tasks){
    try {
      const key = jda.id + '-' + slugify(t.task);
      const filterVal = encodeURIComponent(
        `singleValueExtendedProperties/Any(ep: ep/id eq '${MS_EXT_PROP_ID}' and ep/value eq '${key}')`
      );
      const listRes = await fetch(
        `https://graph.microsoft.com/v1.0/me/events?$filter=${filterVal}`,
        { headers: { Authorization: `Bearer ${msAccessToken}` } }
      );
      const listData = await listRes.json();
      const existing = (listData.value || [])[0];

      const eventBody = {
        subject: `${c.short}: ${t.task}`,
        body: { contentType: "text", content: `Owner: ${t.owner || '—'}\nStatus: ${t.status}\nSynced from the ${c.short} weekly report.` },
        start: { dateTime: `${t.due}T00:00:00`, timeZone: "UTC" },
        end: { dateTime: `${addDaysISO(t.due, 1)}T00:00:00`, timeZone: "UTC" },
        isAllDay: true,
        singleValueExtendedProperties: [{ id: MS_EXT_PROP_ID, value: key }]
      };

      let res;
      if (existing){
        res = await fetch(`https://graph.microsoft.com/v1.0/me/events/${existing.id}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${msAccessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(eventBody)
        });
        res.ok ? updated++ : failed++;
      } else {
        res = await fetch(`https://graph.microsoft.com/v1.0/me/events`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${msAccessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(eventBody)
        });
        res.ok ? created++ : failed++;
      }
    } catch (e) { failed++; }
  }

  btn.disabled = false;
  btn.textContent = originalLabel;
  flash('msCalMsg', `Synced: ${created} created, ${updated} updated${failed ? `, ${failed} failed` : ''}.`);
};

const startCurve = starterData?.scurve || { months: [], planned: [], actual: [] };
chart = new Chart($('sCurve'), {
  type: 'line',
  data: {
    labels: startCurve.months,
    datasets: [
      { label:'Planned', data: startCurve.planned, borderColor:'#8a9a97', borderDash:[4,3], borderWidth:2, pointRadius:0, tension:0.35 },
      { label:'Actual', data: startCurve.actual, borderColor:'#00857c', backgroundColor:'rgba(0,133,124,0.1)', borderWidth:2.5, pointRadius:3, pointBackgroundColor:'#00857c', fill:true, tension:0.35, spanGaps:true }
    ]
  },
  options: scurveOptions
});

if (!firebaseReady) {
  $('setupBanner').style.display = "block";
  render(starterData);
  handleInitialRoute();
} else {
  reportRef = reportRefFor(jda);
  onSnapshot(reportRef, (snap) => {
    if (editor){ if (snap.exists()) currentData = snap.data(); return; } // the drafts are what's on the page
    if (!snap.exists()){
      // A JDA with a starter dataset is offered it; any other simply stays blank until its first edit.
      $('bootstrapCard').style.display = starterData ? "block" : "none";
      currentData = starterData || {};
      if (!starterData) render(null);
      handleInitialRoute();
      return;
    }
    $('bootstrapCard').style.display = "none";
    currentData = snap.data();
    applyOverview(currentData.overview);
    render(currentData);
    handleInitialRoute();
  }, (err) => {
    const banner = $('setupBanner');
    banner.textContent = `Couldn't load this report from Firestore (${err.code || err.message}). ` +
      (starterData ? 'Showing the starter data below, not live figures.' : 'Nothing is shown below until it loads.');
    banner.style.display = "block";
    render(starterData);
    handleInitialRoute();
  });
}

/* ---------- Edit mode: "Edit progress" in the bar at the bottom ---------- */
$('progressEditBtn').hidden = editing;
$('progressEditBtn').onclick = () => goTo(location.pathname + '#edit');

const notice = sessionStorage.getItem('jda-notice');
if (notice){
  sessionStorage.removeItem('jda-notice');
  $('setupBanner').textContent = notice;
  $('setupBanner').style.display = "block";
}

if (editing){
  // Hidden until the report has loaded, so nothing is edited from a half-drawn page.
  document.body.classList.add('editor-checking');
  firstLoad.then(() => {
    document.body.classList.replace('editor-checking', 'editing');
    // The editor works on drafts taken now. `loaded` remembers each part as it was at this moment, so a
    // save is refused if someone else has changed that part since; saving again then overwrites, knowingly.
    const loaded = digests(currentData, REPORT_FIELDS);
    let overwrite = false;
    async function saveDraft(patch, remove = []){
      const fields = [...Object.keys(patch), ...remove];
      try { await api('save', { patch, remove, base: Object.fromEntries(fields.map(k => [k, loaded[k]])), force: overwrite }); }
      catch (e){ if (e.status === 409) overwrite = true; throw e; }
      overwrite = false;
      for (const k of fields) loaded[k] = digest(patch[k]);
    }
    editor = startEditor({
      mode: 'progress', jda, api, showScreen,
      leave: () => goTo(location.pathname),
      // Overall and Weekly progress: the same screens, drawn from a draft of the report's progress fields.
      progress: JSON.parse(JSON.stringify({
        weekLabel: currentData.weekLabel || '', overallStatus: currentData.overallStatus || 'green',
        projects: currentData.projects || [], challenges: currentData.challenges || [], tasks: currentData.tasks || [], updates: currentData.updates || []
      })),
      showProgress(progress){ render({ ...currentData, ...progress }); },
      saveProgress: progress => saveDraft(progress),
      statusLabel, taskStatuses: TASK_STATUSES, today: todayISO, openTask: id => openTasks.add(id)
    });
  }).catch(e => {
    goTo(location.pathname, `Edit mode didn't open: ${e.message}`);
  });
}
