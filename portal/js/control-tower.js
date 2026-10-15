// The JDA Control Tower landing page: one tab per JDA, each showing at a glance its progress and
// latest key update (from the JDA's report, i.e. Overall and Weekly progress), its documents, key
// insights, challenges and cost (from the Invoice Tracker). What edit mode writes (/api/site/
// controlTower) overrides a derived value and is labelled as an override. The Drive sync and Add JDA
// are the Invoice Tracker's own, run from here.
import { getDoc } from '../../shared/vendor/firebase-firestore.js';
import { esc } from '../../shared/esc.js';
import { toLogin } from '../../shared/session.js';
import { JDAS } from './config/app-config.js';
import { contentFor } from './config/jda-content.js';
import { isConfigured, reportRefFor } from './config/firebase.js';
import './account.js';

const T = '/control-tower/tracker/js/';
const [{ listJdas, addJda, addLog, listLog }, finance, { paymentTable, tableTotals }, { ringgit }, { runSync }, { openForm }, { renderLog, LOG_LINES }, { auditLine }, { JDA_DATE_FIELDS, checkDates }] = await Promise.all([
  import(`${T}services/db.js`), import(`${T}services/finance.js`), import(`${T}finance/core.js`), import(`${T}finance/money.js`),
  import(`${T}ui/sync.js`), import(`${T}ui/modal.js`), import(`${T}ui/log.js`), import(`${T}ui/finance-ui.js`), import(`${T}ui/dom.js`)
]);

const $ = id => document.getElementById(id);
const FAILED = { failed: true };
const SEVERITY = { high: 'High', medium: 'Medium', low: 'Low' };
const STATUS = { green: 'On track', amber: 'At risk', red: 'Delayed' };
const SHOWN = 4; // boxes shown before "Show all"
const reportUrl = (j, screen = '') => `jda-report.html#/${encodeURIComponent(j.id)}${screen}`;
const fmtDate = iso => { const d = new Date(`${iso}T00:00:00`); return isNaN(d) ? esc(iso || '') : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); };
const svg = (paths, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

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
// Paid (with tax, MYR) against sanctioned (with tax) for each JDA in the Invoice Tracker, by its name.
async function loadCosts() {
  const [trackerJdas, fin] = await Promise.all([listJdas(), finance.data()]);
  return Object.fromEntries(trackerJdas.map(tj => {
    const mine = r => r.jdaId === tj.id;
    const t = tableTotals(paymentTable(fin.sanctioned.filter(mine), fin.entries.filter(mine)));
    return [tj.name.trim().toLowerCase(), { trackerId: tj.id, spentMinor: t.actualMinor, sanctionedMinor: t.sanctionedMinor }];
  }));
}

/* ---------- One JDA ---------- */
// What the page shows for a JDA, with where each value came from.
function figures(j, report, written, costs) {
  const failed = report === FAILED, r = failed ? null : report;
  const projects = Array.isArray(r?.projects) ? r.projects : [];
  const avg = projects.length ? Math.round(projects.reduce((s, p) => s + (Number(p.pct) || 0), 0) / projects.length) : null;
  const updates = (Array.isArray(r?.updates) ? r.updates : []).filter(u => u?.text).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const tracked = costs?.[j.name.trim().toLowerCase()];
  const cost = written.costOverride
    ? { spent: written.costOverride.spent, sanctioned: written.costOverride.sanctioned, override: true }
    : tracked && { spent: tracked.spentMinor / 100, sanctioned: tracked.sanctionedMinor / 100, trackerId: tracked.trackerId };
  return {
    failed, projects: projects.length, status: STATUS[r?.overallStatus] ? r.overallStatus : null,
    progress: written.progressOverride ?? avg, progressOverride: written.progressOverride !== null && written.progressOverride !== undefined,
    latest: updates[0] || null, updates: updates.length,
    challenges: written.challenges ?? (Array.isArray(r?.challenges) ? r.challenges.map(c => ({ title: c.title, text: c.description, severity: c.severity })) : []),
    challengesOverride: Array.isArray(written.challenges),
    cost, trackerId: tracked?.trackerId,
    tagline: r?.overview?.tagline || contentFor(j).tagline || ''
  };
}

const ring = (pct, label, cls = '') => {
  const p = pct === null || pct === undefined ? null : Math.max(0, Math.min(100, pct));
  return `<div class="ct-ring ${cls}" role="img" aria-label="${esc(label)}: ${p === null ? 'not known yet' : `${pct}%`}">
    <svg viewBox="0 0 120 120" aria-hidden="true"><circle class="ct-ring-bg" cx="60" cy="60" r="50"/><circle class="ct-ring-fg" cx="60" cy="60" r="50" pathLength="100" style="--p:${p ?? 0}"/></svg>
    <span class="ct-ring-label"><b>${p === null ? '—' : `${pct}%`}</b><small>${esc(label)}</small></span>
  </div>`;
};
const boxes = (list, kind, empty) => list.length ? `<div class="ct-boxes ${kind}">${list.map((b, i) => `
  <article class="ct-box${b.severity ? ` sev-${esc(b.severity)}` : ''}"${i >= SHOWN ? ' hidden data-more' : ''}>
    ${b.severity ? `<span class="ct-sev">${esc(SEVERITY[b.severity] || b.severity)}</span>` : ''}
    <h5>${esc(b.title || 'Untitled')}</h5>${b.text ? `<p>${esc(b.text)}</p>` : ''}
  </article>`).join('')}</div>
  ${list.length > SHOWN ? `<button type="button" class="ct-more" data-more-toggle aria-expanded="false">Show all ${list.length}</button>` : ''}`
  : `<p class="ct-empty">${empty}</p>`;
const tag = text => `<span class="ct-tag" title="Written in edit mode instead of the figure worked out from the data">${text}</span>`;

function panel(j, f, written) {
  const pctCost = f.cost && f.cost.sanctioned > 0 ? Math.round(f.cost.spent / f.cost.sanctioned * 100) : null;
  const detailCost = f.trackerId ? `tracker/#/jda/${encodeURIComponent(f.trackerId)}` : 'tracker/#/payments';
  return `
  <div class="ct-panel-head">
    <button type="button" class="ct-info-btn" data-info="${esc(j.id)}" aria-haspopup="dialog">${svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>')}<span>Agreement &amp; BRD</span></button>
    <div class="ct-panel-title"><h3>${esc(j.name)}</h3>${f.tagline ? `<p>${esc(f.tagline)}</p>` : ''}</div>
    <nav class="ct-links" aria-label="${esc(j.name)} pages">
      <a href="${reportUrl(j)}">Master Page</a><a href="${reportUrl(j, '/progress')}">Overall progress</a><a href="${reportUrl(j, '/weekly')}">Weekly progress</a>
      <a href="/jda/${encodeURIComponent(j.id)}/info" target="_blank" rel="noopener">Public page ↗</a>
    </nav>
  </div>
  ${f.failed ? `<p class="ct-notice warn">${esc(j.name)}'s report could not be read just now, so its progress, update and challenges are missing. Reload to try again.</p>` : ''}

  <section class="ct-card ct-status" aria-label="Progress and latest update">
    <div class="ct-status-ring">
      ${ring(f.progress, 'complete')}
      <div class="ct-status-meta">
        ${f.status ? `<span class="status-pill ${f.status}">${STATUS[f.status]}</span>` : ''}
        <span>${f.projects ? `${f.projects} project${f.projects === 1 ? '' : 's'}` : 'No projects yet'}</span>
        ${f.progressOverride ? tag('Set by hand') : '<span class="ct-hint">Average of its projects</span>'}
      </div>
    </div>
    <div class="ct-latest">
      <h4>Latest key update</h4>
      ${f.latest ? `<time datetime="${esc(f.latest.date || '')}">${fmtDate(f.latest.date)}</time><p class="ct-clamp">${esc(f.latest.text)}</p>`
        : `<p class="ct-empty">No key updates yet. They come from the Weekly progress page.</p>`}
      <a class="ct-arrow" href="${reportUrl(j, '/weekly')}">Weekly progress${f.updates > 1 ? ` (${f.updates} updates)` : ''} →</a>
    </div>
  </section>

  <div class="ct-two">
    <section class="ct-card" aria-labelledby="ins-${esc(j.id)}">
      <h4 id="ins-${esc(j.id)}">Key insights</h4>
      ${boxes(written.keyInsights, 'insights', 'No key insights written yet. Add them with Edit page.')}
    </section>
    <section class="ct-card" aria-labelledby="ch-${esc(j.id)}">
      <h4 id="ch-${esc(j.id)}">Challenges ${f.challengesOverride ? tag('Written by hand') : '<span class="ct-hint">from Overall progress</span>'}</h4>
      ${boxes(f.challenges, 'challenges', 'No challenges recorded.')}
    </section>
  </div>

  <section class="ct-card ct-cost" aria-label="Cost">
    ${ring(pctCost, 'spent', pctCost !== null && pctCost > 100 ? 'over' : '')}
    <div class="ct-cost-text">
      <h4>Cost ${f.cost?.override ? tag('Figures set by hand') : ''}</h4>
      ${f.cost ? `<p><b>${esc(ringgit(Math.round(f.cost.spent * 100)))}</b> paid of <b>${esc(ringgit(Math.round(f.cost.sanctioned * 100)))}</b> sanctioned</p>
        <p class="ct-hint">Paid invoices against sanctioned amounts, both with tax, in MYR.${f.cost.sanctioned > 0 ? '' : ' Nothing is sanctioned yet.'}</p>`
        : '<p class="ct-empty">No Invoice Tracker record for this JDA yet.</p>'}
    </div>
    <a class="ct-btn ghost small" href="${detailCost}">Detail cost →</a>
  </section>`;
}

/* ---------- Page ---------- */
let state = { jdas: JDAS, reports: [], written: {}, costs: null };
const notice = (text, warn = false) => { $('ctNotice').textContent = text; $('ctNotice').hidden = !text; $('ctNotice').classList.toggle('warn', warn); };

function draw(selected = location.hash.slice(1)) {
  const { jdas } = state;
  const at = Math.max(0, jdas.findIndex(j => j.id === selected));
  $('ctTabs').innerHTML = jdas.map((j, i) => {
    const f = figures(j, state.reports[i], state.written[j.id] || {}, state.costs);
    return `<button type="button" role="tab" id="tab-${esc(j.id)}" aria-controls="panel-${esc(j.id)}" aria-selected="${i === at}" tabindex="${i === at ? 0 : -1}">
      <span>${esc(j.name)}</span><small>${f.progress === null ? '—' : `${f.progress}%`}</small></button>`;
  }).join('');
  $('ctPanels').innerHTML = jdas.map((j, i) => `<section class="ct-panel" role="tabpanel" id="panel-${esc(j.id)}" aria-labelledby="tab-${esc(j.id)}" tabindex="0"${i === at ? '' : ' hidden'}>
    ${panel(j, figures(j, state.reports[i], state.written[j.id] || {}, state.costs), state.written[j.id] || { keyInsights: [] })}</section>`).join('');
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

function wire() {
  $('ctTabs').addEventListener('click', e => { const t = e.target.closest('[role="tab"]'); if (t) select(t, false); });
  $('ctTabs').addEventListener('keydown', e => {
    const tabs = [...$('ctTabs').querySelectorAll('[role="tab"]')], i = tabs.indexOf(document.activeElement);
    const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (i < 0 || to === undefined) return;
    e.preventDefault(); select(tabs[(to + tabs.length) % tabs.length], true);
  });
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
  // The Invoice Tracker's own Drive sync (its loading, success and error states included), then the cost figures again.
  $('syncBtn').onclick = () => runSync($('syncBtn').querySelector('span'), refreshCosts).catch(e => notice(`Sync from Drive failed: ${e.message}`, true));
  $('addJdaBtn').onclick = () => openForm({
    title: 'Add JDA (Invoice Tracker)',
    fields: [{ name: 'name', label: 'Name, in the form JDA <number>' }, ...JDA_DATE_FIELDS()],
    onSubmit: async v => {
      checkDates(v);
      const created = await addJda(v);
      await addLog(created.id, 'jda', `JDA "${v.name}" created, ${v.startDate} to ${v.endDate}`);
      notice(`${v.name} was added to the Invoice Tracker. To give it a tab and report here, it must also be added to the JDA list (portal/js/config/app-config.js).`);
      refreshCosts();
    }
  });
  $('ctActivity').addEventListener('toggle', loadActivity, { once: true });
  window.addEventListener('hashchange', () => { const t = $(`tab-${location.hash.slice(1)}`); if (t) select(t, false); });
}

async function refreshCosts() {
  try { state.costs = await loadCosts(); }
  catch (e) { state.costs = null; notice(`Cost figures could not be read from the Invoice Tracker: ${e.message}`, true); }
  const open = $('ctTabs').querySelector('[aria-selected="true"]')?.id.slice(4);
  draw(open);
}

async function loadActivity() {
  try {
    const lines = [...await listLog(null, LOG_LINES), ...(await finance.audit({ limit: LOG_LINES })).map(auditLine)].sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
    $('activityBody').innerHTML = renderLog(lines);
  } catch (e) { $('activityBody').innerHTML = `<p class="ct-empty">Recent activity could not be read: ${esc(e.message)}</p>`; }
}

async function start() {
  wire();
  const [reports, written, costs] = await Promise.all([
    Promise.all(JDAS.map(loadReport)),
    getJson('/api/site/controlTower').then(c => c.jdas).catch(e => { notice(`The Control Tower's own content could not be read: ${e.message}`, true); return {}; }),
    loadCosts().catch(e => { notice(`Cost figures could not be read from the Invoice Tracker: ${e.message}`, true); return null; })
  ]);
  state = { jdas: JDAS, reports, written, costs };
  draw();
}
start();
