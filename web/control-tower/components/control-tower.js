// The JDA Control Tower landing page: one tab per JDA, each showing at a glance its progress, cost and
// latest key update (from the JDA's report, i.e. Overall and Weekly progress, and from the Invoice
// Tracker), its documents, key insights and challenges. What edit mode writes (/api/site/controlTower)
// overrides a derived value and is labelled as an override. The Drive sync and Add JDA are the Invoice
// Tracker's own, run from here.
import { getDoc } from '../../shared/vendor/firebase-firestore.js';
import { esc } from '../../shared/lib/esc.js';
import { toLogin } from '../../shared/lib/session.js';
import { JDAS } from '../../shared/config/jdas.js';
import { jdaFigures, costsByName, costPercent, REPORT_STATUS } from '../lib/jda-figures.js';
import { contentFor } from '../config/jda-content.js';
import { isConfigured, reportRefFor, auth } from '../../shared/lib/firebase.js';
import '../../shared/components/account.js';
import { mountCtSidebar } from './ct-sidebar.js';

const $ = id => document.getElementById(id);
mountCtSidebar({ wrap: document.querySelector('.app'), bar: document.querySelector('.topbar-inner'), current: 'home' });
const FAILED = { failed: true };
const SEVERITY = { high: 'High', medium: 'Medium', low: 'Low' };
const STATUS = REPORT_STATUS;
const SHOWN = 4; // boxes shown before "Show all"
const STALE_DAYS = 14; // a latest key update older than this is marked
const reportUrl = (j, screen = '') => `jda-report.html#/${encodeURIComponent(j.id)}${screen}`;
const fmtDate = iso => { const d = new Date(`${iso}T00:00:00`); return isNaN(d) ? esc(iso || '') : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); };
const daysAgo = iso => { const d = new Date(`${iso}T00:00:00`); return isNaN(d) ? null : Math.floor((Date.now() - d) / 86_400_000); };
const age = n => n === null ? '' : n <= 0 ? 'today' : n === 1 ? 'yesterday' : n < 14 ? `${n} days ago` : n < 60 ? `${Math.round(n / 7)} weeks ago` : `${Math.round(n / 30)} months ago`;
const svg = (paths, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
// Whole ringgit, without needing the Invoice Tracker's code (the page still works if that fails to load).
const rm = myr => `RM ${Math.round(myr).toLocaleString('en-MY')}`;
const notice = (text, warn = false) => { $('ctNotice').textContent = text; $('ctNotice').hidden = !text; $('ctNotice').classList.toggle('warn', warn); };

// The Invoice Tracker's own modules. If they cannot be loaded, the report-based parts still work.
const T = '/control-tower/invoices/js/';
let tracker = null;
try {
  const [db, finance, core, money, sync, modal, log, financeUi, dom] = await Promise.all([
    import(`${T}services/db.js`), import(`${T}services/finance.js`), import(`${T}finance/core.js`), import(`${T}finance/money.js`),
    import(`${T}ui/sync.js`), import(`${T}ui/modal.js`), import(`${T}ui/log.js`), import(`${T}ui/finance-ui.js`), import(`${T}ui/dom.js`)
  ]);
  tracker = { ...db, finance, ...core, ...money, ...sync, ...modal, ...log, auditLine: financeUi.auditLine, ...dom };
} catch (e) {
  console.error('The Invoice Tracker could not be loaded:', e);
  notice('The Invoice Tracker could not be loaded just now, so cost figures, Sync from Drive, Add JDA and Recent activity are unavailable. Reload to try again.', true);
  for (const id of ['syncBtn', 'addJdaBtn']) $(id).disabled = true;
}

async function getJson(url) {
  const res = await fetch(url);
  const out = await res.json().catch(() => ({}));
  if (res.status === 401 && out.signIn) toLogin();
  if (!res.ok) throw new Error(out.error || `Error ${res.status}`);
  return out;
}
async function loadReport(j) {
  if (!isConfigured(j)) return null;
  try { const snap = await getDoc(reportRefFor(j)); return snap.exists() ? snap.data() : null; }
  catch (e) { console.error(`Could not load ${j.name}'s report:`, e); return FAILED; }
}
// For each JDA in the Invoice Tracker, by its name: paid (with tax, MYR) against sanctioned (with tax),
// and how many invoices are waiting (Pending).
async function loadCosts() {
  if (!tracker) throw new Error('the Invoice Tracker is not loaded');
  const [trackerJdas, fin] = await Promise.all([tracker.listJdas(), tracker.finance.data()]);
  return costsByName(trackerJdas, fin);
}

/* ---------- One JDA ---------- */
// What the page shows for a JDA (lib/jda-figures.js), with where each value came from.
const figures = (j, report, written, costs) => jdaFigures(j, report === FAILED ? null : report, written, costs, { failed: report === FAILED, tagline: contentFor(j).tagline });

const ring = (pct, label, aria, cls = '') => {
  const p = pct === null || pct === undefined ? null : Math.max(0, Math.min(100, pct));
  return `<div class="ct-ring ${cls}" role="img" aria-label="${esc(aria)}: ${p === null ? 'not known yet' : `${pct}%`}">
    <svg viewBox="0 0 120 120" aria-hidden="true"><circle class="ct-ring-bg" cx="60" cy="60" r="50"/><circle class="ct-ring-fg" cx="60" cy="60" r="50" pathLength="100" style="--p:${p ?? 0}"/></svg>
    <span class="ct-ring-label"><b>${p === null ? '—' : `${pct}%`}</b><small>${esc(label)}</small></span>
  </div>`;
};
// A box shows its title and the start of its text; a long one opens to the rest.
const box = (b, hidden) => {
  const head = `${b.severity ? `<span class="ct-sev">${esc(SEVERITY[b.severity] || b.severity)}</span>` : ''}<h5>${esc(b.title || 'Untitled')}</h5>`;
  const long = (b.text || '').length > 160;
  return `<article class="ct-box${b.severity ? ` sev-${esc(b.severity)}` : ''}"${hidden ? ' hidden data-more' : ''}>
    ${head}${b.text ? (long ? `<details><summary><span class="ct-box-start">${esc(b.text.slice(0, 150).replace(/\s+\S*$/, ''))}…</span><span class="ct-box-more">Read all</span></summary><p>${esc(b.text)}</p></details>` : `<p>${esc(b.text)}</p>`) : ''}
  </article>`;
};
const boxes = (list, kind, empty) => list.length ? `<div class="ct-boxes ${kind}">${list.map((b, i) => box(b, i >= SHOWN)).join('')}</div>
  ${list.length > SHOWN ? `<button type="button" class="ct-more" data-more-toggle aria-expanded="false">Show all ${list.length}</button>` : ''}`
  : `<p class="ct-empty">${empty}</p>`;
const tag = text => `<span class="ct-tag" title="Written in edit mode instead of the figure worked out from the data">${text}</span>`;

function panel(j, f, written, costsFailed) {
  const { pct: pctCost, unsanctioned } = costPercent(f.cost); // paid with nothing sanctioned: over
  const stale = f.latest ? daysAgo(f.latest.date) : null;
  return `
  <div class="ct-panel-head">
    <div class="ct-panel-title">
      <button type="button" class="ct-info-btn" data-info="${esc(j.id)}" aria-haspopup="dialog">${svg('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>')}<span>Agreement &amp; BRD</span></button>
      <div><h3>${esc(j.name)}</h3>${f.tagline ? `<p>${esc(f.tagline)}</p>` : ''}</div>
    </div>
    <nav class="ct-links" aria-label="${esc(j.name)} pages">
      <a href="${reportUrl(j)}">Master Page</a><a href="${reportUrl(j, '/progress')}">Overall progress</a><a href="${reportUrl(j, '/weekly')}">Weekly progress &amp; tasks</a>
      <a href="${reportUrl(j, '/edit/weekly')}">Edit tasks</a><a href="/jda/${encodeURIComponent(j.id)}/info" target="_blank" rel="noopener">Public page ↗</a>
    </nav>
  </div>
  ${f.failed ? `<p class="ct-notice warn">${esc(j.name)}'s report could not be read just now, so its progress, update and challenges are missing. Reload to try again.</p>` : ''}

  <section class="ct-card ct-status" aria-label="${esc(j.name)} at a glance">
    <div class="ct-gauge">
      <h4>Progress</h4>
      ${ring(f.progress, 'complete', 'Progress')}
      <div class="ct-gauge-meta">
        ${f.status ? `<span class="status-pill ${f.status}">${STATUS[f.status]}</span>` : ''}
        <span>${f.projects ? `${f.projects} project${f.projects === 1 ? '' : 's'}` : 'No projects yet'}</span>
        ${f.progressOverride ? tag('Set by hand') : '<span class="ct-hint">Average of its projects</span>'}
      </div>
    </div>
    <div class="ct-latest">
      <h4>Latest key update</h4>
      ${f.latest ? `<p class="ct-when"><time datetime="${esc(f.latest.date || '')}">${fmtDate(f.latest.date)}</time><span class="${stale !== null && stale > STALE_DAYS ? 'ct-stale' : 'ct-hint'}">${age(stale)}</span></p><p class="ct-clamp">${esc(f.latest.text)}</p>`
        : `<p class="ct-empty">No key updates yet. They come from the Weekly progress page.</p>`}
      <a class="ct-arrow" href="${reportUrl(j, '/weekly')}">All updates and tasks${f.updates > 1 ? ` (${f.updates} updates)` : ''} →</a>
    </div>
    <div class="ct-gauge cost">
      <h4>Cost ${f.cost?.override ? tag('Set by hand') : ''}</h4>
      ${ring(pctCost, unsanctioned ? 'unsanctioned' : 'paid', 'Cost: paid of sanctioned', `cost${unsanctioned || (pctCost !== null && pctCost > 100) ? ' over' : ''}`)}
      <div class="ct-gauge-meta">
        ${f.cost ? `<span><b class="mono">${esc(rm(f.cost.spent))}</b> paid</span><span class="ct-hint">${f.cost.sanctioned > 0 ? `of <b class="mono">${esc(rm(f.cost.sanctioned))}</b> sanctioned, with tax` : 'Nothing is sanctioned yet.'}</span>${f.twice ? '<span class="ct-stale">Two Invoice Tracker JDAs have this name: their figures are added together.</span>' : ''}`
          : `<span class="ct-hint">${costsFailed ? 'Cost figures could not be read just now. Reload to try again.' : 'Not in the Invoice Tracker yet.'}</span>`}
        ${f.pending ? `<a class="ct-pending" href="invoices/#/cji3/${encodeURIComponent(f.trackerId)}">${f.pending} invoice${f.pending === 1 ? '' : 's'} pending: open the register →</a>` : ''}
        ${f.trackerId ? `<a class="ct-btn ghost small" href="invoices/#/jda/${encodeURIComponent(f.trackerId)}">Invoices &amp; payments →</a>` : ''}
      </div>
    </div>
  </section>

  <div class="ct-two">
    <section class="ct-card" aria-labelledby="ins-${esc(j.id)}">
      <h4 id="ins-${esc(j.id)}">Key insights</h4>
      ${boxes(written.keyInsights || [], 'insights', 'No key insights written yet. Add them with Edit page.')}
    </section>
    <section class="ct-card" aria-labelledby="ch-${esc(j.id)}">
      <h4 id="ch-${esc(j.id)}">Challenges ${f.challengesOverride ? tag('Written by hand') : '<span class="ct-hint">from Overall progress</span>'}</h4>
      ${boxes(f.challenges, 'challenges', 'No challenges recorded.')}
    </section>
  </div>`;
}

/* ---------- Page ---------- */
let state = { jdas: JDAS, reports: [], written: {}, costs: null, costsFailed: false };

function draw(selected = location.hash.slice(1)) {
  const { jdas } = state;
  const at = Math.max(0, jdas.findIndex(j => j.id === selected));
  const all = jdas.map((j, i) => figures(j, state.reports[i], state.written[j.id] || {}, state.costs));
  $('ctTabs').innerHTML = jdas.map((j, i) => `<button type="button" role="tab" id="tab-${esc(j.id)}" aria-controls="panel-${esc(j.id)}" aria-selected="${i === at}" tabindex="${i === at ? 0 : -1}">
      <span>${esc(j.name)}</span><small aria-label="progress">${all[i].progress === null ? '—' : `${all[i].progress}%`}</small></button>`).join('');
  $('ctPanels').innerHTML = jdas.map((j, i) => `<section class="ct-panel" role="tabpanel" id="panel-${esc(j.id)}" aria-labelledby="tab-${esc(j.id)}"${i === at ? '' : ' hidden'}>
    ${panel(j, all[i], state.written[j.id] || {}, state.costsFailed)}</section>`).join('');
}

function select(tab, focus) {
  const tabs = [...$('ctTabs').querySelectorAll('[role="tab"]')];
  tabs.forEach(t => { const on = t === tab; t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1; $(t.getAttribute('aria-controls')).hidden = !on; });
  history.replaceState(null, '', `#${tab.id.slice(4)}`);
  if (focus) tab.focus();
}

function openInfo(j) {
  const w = state.written[j.id] || {};
  const list = (items, what) => items?.length ? `<ul class="ct-doclist">${items.map(l => `<li>${l.url ? `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label || l.url)} ↗</a>` : esc(l.label)}</li>`).join('')}</ul>`
    : `<p class="ct-empty">No ${what} linked yet. Add the link with Edit page.</p>`;
  const d = $('infoDialog');
  d.innerHTML = `<div class="ct-dialog-body">
    <h3 id="infoTitle">${esc(j.name)}: documents</h3>
    <h4>Agreement</h4><p class="ct-hint">The signed Joint Development Agreement.</p>${list(w.agreement, 'agreement')}
    <h4>Business Requirement Document (BRD)</h4>${list(w.brd, 'BRD')}
    <div class="ct-dialog-actions"><button type="button" class="ct-btn primary" data-close>Close</button></div></div>`;
  d.querySelector('[data-close]').onclick = () => d.close();
  d.showModal();
}

// The Invoice Tracker's own Drive sync, with the whole button held while it runs (a second click would read the same files again).
async function sync() {
  const btn = $('syncBtn');
  if (btn.disabled) return;
  btn.disabled = true; btn.setAttribute('aria-busy', 'true');
  try { await tracker.runSync(btn.querySelector('span'), refreshCosts); } // it shows its own result, errors included
  finally { btn.disabled = false; btn.removeAttribute('aria-busy'); }
}

function wire() {
  $('ctTabs').addEventListener('click', e => { const t = e.target.closest('[role="tab"]'); if (t) select(t, false); });
  $('ctTabs').addEventListener('keydown', e => {
    const tabs = [...$('ctTabs').querySelectorAll('[role="tab"]')], i = tabs.indexOf(document.activeElement);
    const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (i < 0 || to === undefined) return;
    e.preventDefault(); select(tabs[(to + tabs.length) % tabs.length], true);
  });
  // Edit mode (control-tower-edit.js): what is written for each JDA; then the page is drawn again from the server's copy.
  $('editPageBtn').onclick = async () => {
    $('editPageBtn').disabled = true;
    const open = () => $('ctTabs').querySelector('[aria-selected="true"]')?.id.slice(4);
    try {
      await (await import('./control-tower-edit.js')).start({
        token: () => auth.currentUser ? auth.currentUser.getIdToken() : Promise.resolve(''),
        jdas: state.jdas,
        figures: j => figures(j, state.reports[state.jdas.indexOf(j)], state.written[j.id] || {}, state.costs),
        redraw: () => safeDraw(open()),
        saved: async () => { const at = open(); state.written = (await getJson('/api/site/controlTower')).jdas; safeDraw(at); notice('Saved. The Control Tower shows the new content.'); }
      });
    } catch (e) { notice(`Edit mode could not open: ${e.message}`, true); }
    finally { $('editPageBtn').disabled = false; }
  };
  $('ctPanels').addEventListener('click', e => {
    const info = e.target.closest('[data-info]');
    if (info) return openInfo(state.jdas.find(j => j.id === info.dataset.info));
    const more = e.target.closest('[data-more-toggle]');
    if (more) {
      const open = more.getAttribute('aria-expanded') !== 'true';
      more.previousElementSibling.querySelectorAll('[data-more]').forEach(b => { b.hidden = !open; });
      more.setAttribute('aria-expanded', open); more.textContent = open ? 'Show fewer' : `Show all ${more.previousElementSibling.children.length}`;
    }
  });
  if (!tracker) return;
  $('syncBtn').onclick = sync;
  $('addJdaBtn').onclick = () => tracker.openForm({
    title: 'Add JDA (Invoice Tracker)',
    fields: [{ name: 'name', label: 'Name, in the form JDA <number>' }, ...tracker.JDA_DATE_FIELDS()],
    onSubmit: async v => {
      tracker.checkDates(v);
      const created = await tracker.addJda(v);
      await tracker.addLog(created.id, 'jda', `JDA "${v.name}" created, ${v.startDate} to ${v.endDate}`);
      notice(`${v.name} was added to the Invoice Tracker, where its projects and invoices can be entered now. To give it a tab, report and public page here, ask the Control Tower administrator to add it to the JDA list.`);
      refreshCosts();
    }
  });
  $('ctActivity').addEventListener('toggle', () => { if ($('ctActivity').open) loadActivity(); });
}

async function refreshCosts() {
  try { state.costs = await loadCosts(); state.costsFailed = false; }
  catch (e) { state.costs = null; state.costsFailed = true; console.error(e); }
  safeDraw($('ctTabs').querySelector('[aria-selected="true"]')?.id.slice(4));
  if ($('ctActivity').open) loadActivity();
}

// Each line says which JDA and project it is about, as the tracker's old front page did.
async function loadActivity() {
  if (!tracker) return;
  try {
    const [projects, jdas, own, audit] = await Promise.all([tracker.listAllProjectsWithJda(), tracker.listJdas(), tracker.listLog(null, tracker.LOG_LINES), tracker.finance.audit({ limit: tracker.LOG_LINES })]);
    const lines = [...own, ...audit.map(tracker.auditLine)].sort((a, b) => String(b.ts).localeCompare(String(a.ts))).map(l => {
      const p = projects.find(x => x.id === l.projectId), j = jdas.find(x => x.id === (l.jdaId || l.projectId));
      return { ...l, detail: p ? `${p.jdaName} / ${p.name}: ${l.detail}` : j ? `${j.name}: ${l.detail}` : l.detail };
    });
    $('activityBody').innerHTML = tracker.renderLog(lines);
  } catch (e) { $('activityBody').innerHTML = `<p class="ct-empty">Recent activity could not be read: ${esc(e.message)}</p>`; }
}

async function start() {
  wire();
  const [reports, written, costs] = await Promise.all([
    Promise.all(JDAS.map(loadReport)),
    getJson('/api/site/controlTower').then(c => c.jdas).catch(e => { notice(`The Control Tower's own content could not be read: ${e.message}`, true); return {}; }),
    tracker ? loadCosts().catch(e => { console.error(e); return FAILED; }) : FAILED
  ]);
  state = { jdas: JDAS, reports, written, costs: costs === FAILED ? null : costs, costsFailed: costs === FAILED };
  safeDraw();
}
// A drawing error must not leave the page on "Loading…".
function safeDraw(selected) {
  try { draw(selected); }
  catch (e) { console.error(e); notice(`Part of this page could not be drawn: ${e.message}. Reload to try again.`, true); }
}
// A JDA chosen in the sidebar (/control-tower/#jda2) while already here.
addEventListener('hashchange', () => { const tab = $(`tab-${location.hash.slice(1)}`); if (tab) select(tab, false); });
start();
