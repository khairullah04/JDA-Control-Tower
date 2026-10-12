// The portal's main page: one card per JDA (live progress) and the Administration gateway.
import { getDoc } from '../../shared/vendor/firebase-firestore.js';
import { JDAS, INVOICE_TRACKER_URL } from './config/app-config.js';
import { portalApi } from './api.js';
import { esc } from '../../shared/esc.js';
import { isConfigured, reportRefFor } from './config/firebase.js';

const $ = id => document.getElementById(id);
const statusLabel = { green: 'On track', amber: 'At risk', red: 'Delayed' };
const reportUrl = j => `jda-report.html#/${j.id}`; // hash, not ?jda=: see the note at the top of report.js

// Top-bar tabs jump to this page's two sections; the highlighted one follows the scroll position.
const navTabs = [...document.querySelectorAll('#portalNav .pagenav-tab')];
const setActiveTab = hash => navTabs.forEach(t => t.classList.toggle('active', t.getAttribute('href') === hash));
navTabs.forEach(t => t.addEventListener('click', () => setActiveTab(t.getAttribute('href'))));
const navSpy = new IntersectionObserver(entries => {
  const visible = entries.filter(e => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
  if (visible) setActiveTab('#' + visible.target.id);
}, { rootMargin: '-20% 0px -50% 0px', threshold: [0, .25, .5, .75, 1] });
navTabs.forEach(t => navSpy.observe(document.querySelector(t.getAttribute('href'))));

// null: this JDA has no report yet. FAILED: it could not be read, which is not the same thing.
const FAILED = { failed: true };
async function loadReport(j) {
  if (!isConfigured(j)) return null;
  try { const snap = await getDoc(reportRefFor(j)); return snap.exists() ? snap.data() : null; }
  catch (e) { console.error(`Could not load ${j.name}'s report:`, e); return FAILED; }
}

// A JDA with no report yet keeps the same card with its progress left blank - no zeros. One whose
// report could not be read looks the same but says so, so an outage is not taken for an empty JDA.
function card(j, data) {
  const failed = data === FAILED;
  if (failed) data = null;
  const projects = data?.projects || [];
  const pct = projects.length ? Math.round(projects.reduce((s, p) => s + (p.pct || 0), 0) / projects.length) : null;
  const status = statusLabel[data?.overallStatus] ? data.overallStatus : 'green';
  return `<a class="collab-card jda-card" href="${reportUrl(j)}">
    <div class="jda-card-top">
      <div class="progress-ring">
        <svg width="84" height="84" viewBox="0 0 92 92">
          <circle class="ring-bg" cx="46" cy="46" r="39"></circle>
          <circle class="ring-fg" cx="46" cy="46" r="39" stroke-dasharray="245" stroke-dashoffset="245" data-pct="${pct ?? 0}"></circle>
        </svg>
        <div class="ring-label">${pct === null ? '—' : pct + '%'}</div>
      </div>
      <div>
        <h4>${esc(j.name)}</h4>
        <div class="stat-label">Overall completion</div>
        <span class="status-pill ${status}">${data ? statusLabel[status] : '—'}</span>
      </div>
    </div>
    <div class="progress-track"><div class="progress-fill" data-pct="${pct ?? 0}"></div></div>
    <div class="project-meta"><span>${data ? `${projects.length} workstream(s)` : failed ? 'Couldn’t load' : 'No report yet'}</span><b>View report →</b></div>
  </a>`;
}

async function renderGrid() {
  const grid = $('jdaGrid');
  grid.innerHTML = JDAS.map(j => card(j, null)).join('');
  const reports = await Promise.all(JDAS.map(loadReport));
  grid.innerHTML = JDAS.map((j, i) => card(j, reports[i])).join('');
  requestAnimationFrame(() => requestAnimationFrame(() => {
    grid.querySelectorAll('.ring-fg').forEach(r => { r.style.strokeDashoffset = 245 - (r.dataset.pct / 100) * 245; });
    grid.querySelectorAll('.progress-fill').forEach(f => { f.style.width = f.dataset.pct + '%'; });
  }));
}

// The Invoice Tracker's passkey ("admin" in jda/server/portal-passkeys.json) is checked by the server,
// which hands back a session token. It is left in this tab's session storage, where the tracker
// picks it up, so the passkey is asked for once. The tracker's invoices and payments cannot be read
// without that token, however the tracker is reached.
function wireAdmin() {
  const open = () => { $('adminLocked').hidden = true; $('adminOpen').hidden = false; $('adminMsg').textContent = ''; };
  $('adminLink').href = INVOICE_TRACKER_URL;
  const tryUnlock = async () => {
    $('adminMsg').textContent = '';
    try { sessionStorage.setItem('jda-finance-token', (await portalApi('unlock', { jdaId: 'admin', passkey: $('adminPasskey').value })).token); open(); }
    catch (e) { $('adminMsg').textContent = e.message; }
  };
  $('adminUnlock').onclick = tryUnlock;
  $('adminPasskey').addEventListener('keydown', e => { if (e.key === 'Enter') tryUnlock(); });
}

const revealObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('in'); revealObserver.unobserve(entry.target); } });
}, { threshold: .12 });
document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

document.addEventListener('scroll', () => {
  const h = document.documentElement;
  $('scrollProgress').style.width = (h.scrollHeight > h.clientHeight ? (h.scrollTop / (h.scrollHeight - h.clientHeight)) * 100 : 0) + '%';
}, { passive: true });

renderGrid();
wireAdmin();
