// One JDA's page (jda-report.html#/<id>): its Master Page (the overview screen), progress screens
// and Edit report, plus the Editor Page (#/<id>/edit) - the same Master Page made editable.
// Behaviour is ported from the JDA3 reference file's inline script; what differs per JDA is its
// content entry (config/jda-content.js) and where its report document lives (config/app-config.js).
import { onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { JDAS, DEFAULT_JDA_ICON, MS_CLIENT_ID, MS_AUTHORITY, SYNC_API_URL } from './config/app-config.js';
import { isConfigured, reportRefFor } from './config/firebase.js';
import { contentFor, SOLUTION_ICONS } from './config/jda-content.js';
import { startEditor } from './editor.js';
import { blocksHtml } from './blocks.js';
import { logoFor, contentFromOverview as overviewContent, overviewFromContent as contentOverview, blocksOf } from './overview.js';
import { esc } from '../../shared/esc.js';
import { digest, digests } from '../../shared/digest.js';
import { localToday } from '../../shared/dates.js';
import { withProjectIds, linkTasks, tasksOf } from './progress.js';

const $ = id => document.getElementById(id);
const empty = (text = 'Not added yet.', style = '') => `<p class="detail-tasks-empty"${style ? ` style="${style}"` : ''}>${text}</p>`;

// The JDA is named in the hash (#/jda3, #/jda3/project/<slug>), not the query string: static servers
// that tidy URLs (e.g. `serve`) redirect jda-report.html to /jda-report and drop ?jda= on the way,
// while a hash survives any redirect. ?jda= is still read so older links keep working.
const hashParts = location.hash.replace(/^#\/?/, '').split('/');
const jdaKey = JDAS.some(j => j.id === hashParts[0]) ? hashParts.shift() : new URLSearchParams(location.search).get('jda');
const jda = JDAS.find(j => j.id === jdaKey);
if (!jda) { location.replace('index.html'); throw new Error('Unknown JDA'); }
const baseContent = contentFor(jda);
let c = { ...baseContent, extraSections: [], sectionOrder: ['aspiration', 'project', 'architecture', 'collaborators', 'press'] }; // + the saved Master Page content, once the report document arrives

/* ---------- Passkey sessions: the JDA server checks the passkey and hands back a session token ---------- */
// A session lasts for one visit only. The token is held in memory; sessionStorage is used just to
// carry it across the single reload that opens the Editor Page, and is emptied as soon as it is
// read - so a reload, a reopened link or a second click on the icon always asks for the passkey again.
const TOKEN_KEY = `jda-edit-${jda.id}`;
let token = sessionStorage.getItem(TOKEN_KEY) || '';
sessionStorage.removeItem(TOKEN_KEY);
const masterHash = `#/${jda.id}`;
async function api(path, body = {}){
  let res;
  try {
    res = await fetch(`${SYNC_API_URL}/api/portal/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Portal-Token': token },
      body: JSON.stringify({ jda: { id: jda.id, name: jda.name }, ...body })
    });
  } catch { throw new Error(`Couldn't reach the server at ${SYNC_API_URL || location.origin}. Is it running?`); }
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(out.error || 'Request failed'), { status: res.status, changed: out.changed });
  return out;
}
async function unlock(passkey){
  token = (await api('unlock', { jdaId: jda.id, passkey })).token;
}
// The Master Page and the Editor Page differ only in the hash, so moving between them swaps the
// hash and reloads to start again in the other mode.
function goTo(hash, notice){
  if (notice) sessionStorage.setItem('jda-notice', notice);
  history.replaceState(null, '', hash);
  location.reload();
}

// The Editor Page is this same page in editing mode. Opened without a session it goes straight
// back to the Master Page; with one, nothing is editable until the server has confirmed it.
const editing = hashParts[0] === 'edit';
if (editing && !token){ goTo(masterHash); throw new Error('Editor needs a passkey'); }
let editor = null, firstLoadDone;
const firstLoad = new Promise(resolve => { firstLoadDone = resolve; });
const starterData = baseContent.starter; // only a JDA with its own starter dataset has one

const statusColor = { green:"green", amber:"amber", red:"red" };
const statusLabel = { green:"On track", amber:"At risk", red:"Delayed" };
const taskStatusClass = { "Done":"done", "In progress":"progress", "Not started":"notstarted" };
const sevLabel = { high:"HIGH", medium:"MEDIUM", low:"LOW" };

let chart, currentData = starterData || {};
const firebaseReady = isConfigured(jda);
let reportRef;

/* ============= Overview: everything written about this JDA, or the same sections left empty ============= */
function renderOverview(){
  document.title = c.docTitle;
  $('brandMark').textContent = c.mark;
  $('brandTitle').textContent = c.reportTitle;
  $('navJdaName').textContent = c.short;
  $('footBrand').textContent = c.footBrand;
  $('footNote').textContent = c.footNote;

  $('heroEyebrow').textContent = c.eyebrow;
  $('heroTitle').innerHTML = esc(c.short) + (c.tagline || editing ? `<span class="hero-tagline">${esc(c.tagline)}</span>` : '');
  $('heroSub').textContent = c.sub; $('heroSub').hidden = !c.sub && !editing;
  $('heroMoreText').textContent = c.more; $('heroMoreBtn').hidden = !c.more || editing;

  $('aspirationIntro').textContent = c.aspirationIntro;
  $('aspirationBody').innerHTML = c.aspiration.length ? `
    <div class="aspiration-strip">${c.aspiration.map(a => `
      <div class="aspiration-chip${a.highlight ? ' highlight' : ''}"><strong>${esc(a.value)}</strong><span>${esc(a.label)}</span></div>`).join('')}
    </div>
    <div class="aspiration-bar"></div>` : empty();

  $('solutionsIntro').innerHTML = c.solutionsIntroHtml;
  $('solutionsBody').innerHTML = c.solutionGroups.length ? c.solutionGroups.map(g => `
    <div class="sol-group-label">${esc(g.label)}</div>
    <div class="sol-grid">${g.cards.map(({ key, tags }) => {
      const s = c.solutions[key], tier1 = s.tier === 'Tier 1';
      return `
      <div class="sol-card${tier1 ? '' : ' edge'}" data-sol="${key}">
        ${s.img === null ? '' : `<div class="sol-visual"><img src="${esc(s.img || `assets/sol-${key}.jpg`)}" alt="" onerror="this.closest('.sol-visual').style.display='none'"></div>`}
        <div class="sol-card-head">
          <span class="sol-icon"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${s.icon}</svg></span>
          <span class="sol-tier ${tier1 ? 'tier1' : 'edge'}">${esc(s.tier)}</span>
        </div>
        <div class="sol-card-body">
          <h4>${esc(s.title)}</h4>
          <div class="sol-tags">${tags.map(([text, accent]) => accent
            ? `<span class="sol-tag accent"><i class="dot"></i><span>${esc(text)}</span></span>`
            : `<span class="sol-tag"><span>${esc(text)}</span></span>`).join('')}</div>
        </div>
      </div>`; }).join('')}
    </div>`).join('') : empty();

  $('archIntro').textContent = c.archIntro;
  $('archTeaserCard').hidden = !c.architecture; $('archEmpty').hidden = !!c.architecture;

  $('collabIntro').textContent = c.collabIntro;
  $('collabBody').innerHTML = c.collaborators.length ? `
    <div class="collab-grid">${c.collaborators.map((p, i) => `
      <div class="collab-card">
        ${p.logo ? `<div class="logo-holder"><img src="${esc(p.logo)}" alt="${esc(p.alt)}"></div>` : ''}
        <h4>${esc(p.name)}</h4>
        <div class="collab-role">${esc(p.role)}</div>
        <p>${esc(p.text)}</p>
        ${p.more || editing ? `<button type="button" class="collab-more-toggle" data-target="collabMore${i}" aria-expanded="false">
          <span>Read more</span><span class="chev">&#8250;</span>
        </button>
        <div class="collab-more" id="collabMore${i}"><p>${esc(p.more)}</p></div>` : ''}
      </div>`).join('')}
    </div>` : empty();

  $('pressIntro').textContent = c.pressIntro;
  const pr = c.press;
  $('pressBody').innerHTML = pr ? `
    <div class="press-card">
      ${pr.img ? `<div class="press-visual"><img src="${esc(pr.img)}" alt="${esc(pr.alt)}"></div>` : ''}
      <div class="press-body">
        <p>${esc(pr.text)}</p>
        ${pr.more || editing ? `<button type="button" class="collab-more-toggle" data-target="pressMore" aria-expanded="false">
          <span>Read more</span><span class="chev">&#8250;</span>
        </button>
        <div class="collab-more" id="pressMore"><p>${esc(pr.more)}</p></div>` : ''}
        ${pr.href || editing ? `<a href="${esc(pr.href)}" target="_blank" rel="noopener">${esc(pr.linkText)}</a>` : ''}
      </div>
    </div>` : empty();

  // Sections added on the Editor Page: a heading, an intro and a row of cards, in the reference's own blocks.
  document.querySelectorAll('#screen-overview > .extra-block').forEach(n => n.remove());
  $('extraSections').innerHTML = c.extraSections.map(sec => `
    <div class="block reveal in extra-block" data-key="x:${esc(sec.id)}">
      <h3>${esc(sec.title)}</h3>
      <p class="block-intro">${esc(sec.intro)}</p>
      ${sec.cards.length ? `<div class="collab-grid">${sec.cards.map(card => `
        <div class="collab-card">
          <h4>${esc(card.title)}</h4>
          <div class="collab-role">${esc(card.sub)}</div>
          <p>${esc(card.text)}</p>
        </div>`).join('')}
      </div>` : ''}
    </div>`).join('');

  placeSections();

  $('progressIntro').textContent = c.progressIntro;
  $('tasksIntro').textContent = c.tasksIntro;
  bindOverview();
  if (editor) editor.decorate();
}

// The Master Page's sections in the order saved from the Editor Page (the built-in order if none
// was saved). The jump bar under the banner follows the same order.
function placeSections(){
  const anchor = $('extraSections');
  const extras = Object.fromEntries([...anchor.children].map(n => [n.dataset.key, n]));
  c.sectionOrder.forEach((key, i) => {
    const node = extras[key] || $('ov-' + key);
    if (!node) return;
    anchor.before(node);
    node.style.marginTop = i === 0 ? '0' : '';
  });
  const nav = document.querySelector('.jumpnav-card');
  c.sectionOrder.map(key => nav.querySelector(`[data-anchor="ov-${key}"]`)).filter(Boolean).forEach((step, i) => {
    nav.append(step);
    step.querySelector('.n').textContent = i + 1;
  });
}

const contentFromOverview = ov => overviewContent(ov, baseContent);
const overviewFromContent = () => contentOverview(c);

let appliedOverview = '';
function applyOverview(ov){
  const json = JSON.stringify(ov || null);
  if (json === appliedOverview) return;
  appliedOverview = json;
  c = contentFromOverview(ov);
  renderOverview();
}

function slugify(str){ return (str||"").toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,''); }

const todayISO = localToday(); // today in Malaysia (shared/dates.js), the same day every part of this page uses
function formatDueDate(iso){
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
}
function isOverdue(iso, status){
  return !!iso && status !== 'Done' && iso < todayISO;
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
const pagenavTabFor = { "screen-overview":"screen-overview", "screen-progress":"screen-progress", "screen-project-detail":"screen-progress", "screen-solution-detail":"screen-overview", "screen-blocks":"screen-overview", "screen-weekly":"screen-weekly", "screen-edit":"screen-edit" };
const SCREEN_FOR = { progress: 'screen-progress', weekly: 'screen-weekly' };
function showScreen(id){
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
  // The Editor Page keeps the screen in the address, so a reload or Leave returns to the same one.
  if (editor) history.replaceState(null, '', `${masterHash}/edit${['', '/progress', '/weekly'][['screen-overview', 'screen-progress', 'screen-weekly'].indexOf(id)] || ''}`);
  const activeTab = pagenavTabFor[id];
  document.querySelectorAll('.pagenav-tab').forEach(t => t.classList.toggle('active', t.dataset.target === activeTab));
  const onEdit = id === 'screen-edit';
  $('pagenavEditSep').style.display = onEdit ? 'inline-flex' : 'none';
  $('pagenavEditTab').style.display = onEdit ? 'inline-flex' : 'none';
  window.scrollTo({top:0, behavior:'smooth'});
  updateScrollProgress();
  if (id === 'screen-edit'){
    lockEditScreen();
  }
}
document.querySelectorAll('.btn[data-target], .back-link, .crumb-link, .pagenav-tab[data-target]').forEach(btn => {
  btn.addEventListener('click', () => showScreen(btn.dataset.target));
});

function showSolutionDetail(key){
  const s = c.solutions[key];
  if (!s) return;
  const tierClass = s.tier === 'Tier 1' ? 'tier1' : 'edge';
  $('solDetailIcon').innerHTML = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${s.icon}</svg>`;
  const tierEl = $('solDetailTier');
  tierEl.textContent = s.tier;
  tierEl.className = `sol-tier ${tierClass}`;
  $('solDetailTitle').textContent = s.title;
  $('solDetailBoxes').innerHTML = blocksHtml(blocksOf(s));

  showScreen('screen-solution-detail');
  history.replaceState(null, "", `#/${jda.id}/solution/${key}`);
}
// Runs after every overview render: the cards and toggles it wires are rebuilt each time.
function bindOverview(){
  if (editing) return; // the Editor Page edits cards in place instead of opening them
  document.querySelectorAll('.sol-card').forEach(card => {
    card.setAttribute('tabindex', '0');
    card.setAttribute('role', 'button');
    card.addEventListener('click', () => showSolutionDetail(card.dataset.sol));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); showSolutionDetail(card.dataset.sol); }
    });
  });
  document.querySelectorAll('.collab-more-toggle').forEach(btn => {
    const target = $(btn.dataset.target);
    if (!target) return;
    btn.addEventListener('click', () => {
      const open = target.classList.toggle('open');
      btn.setAttribute('aria-expanded', open);
      btn.querySelector('span').textContent = open ? 'Read less' : 'Read more';
    });
  });
}

document.querySelectorAll('[data-anchor]').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = $(btn.dataset.anchor);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

(function(){
  const steps = Array.from(document.querySelectorAll('.jumpnav-step'));
  if (!steps.length) return;
  const targets = steps.map(s => $(s.dataset.anchor)).filter(Boolean);
  if (!targets.length) return;
  const setCurrent = (id) => {
    steps.forEach(s => s.classList.toggle('current', s.dataset.anchor === id));
  };
  const spy = new IntersectionObserver((entries) => {
    const visible = entries.filter(e => e.isIntersecting).sort((a,b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (visible) setCurrent(visible.target.id);
  }, { rootMargin: '-20% 0px -60% 0px', threshold: [0, .25, .5, .75, 1] });
  targets.forEach(t => spy.observe(t));
})();

document.addEventListener('keydown', (e) => {
  const typingTags = ['INPUT', 'TEXTAREA', 'SELECT'];
  if (document.activeElement && (typingTags.includes(document.activeElement.tagName) || document.activeElement.isContentEditable)) return;
  const order = ['screen-overview','screen-progress','screen-weekly','screen-edit'];
  const current = order.find(id => $(id).classList.contains('active'));
  const idx = order.indexOf(current);
  if (idx === -1) return; // a detail screen or the block editor: the arrow keys belong to the page
  if (e.key === 'ArrowRight' && idx < order.length - 1) showScreen(order[idx + 1]);
  if (e.key === 'ArrowLeft' && idx > 0) showScreen(order[idx - 1]);
});

function updateScrollProgress(){
  const h = document.documentElement;
  const pct = h.scrollHeight > h.clientHeight ? (h.scrollTop / (h.scrollHeight - h.clientHeight)) * 100 : 0;
  $('scrollProgress').style.width = pct + "%";
}
document.addEventListener('scroll', updateScrollProgress, {passive:true});

const archViewBtn = $('archViewBtn');
const archTeaserCard = $('archTeaserCard');
const archModal = $('archModal');
const archModalClose = $('archModalClose');
const archModalBackdrop = $('archModalBackdrop');
function openArchModal(){ archModal.classList.add('open'); document.body.style.overflow = 'hidden'; }
function closeArchModal(){ archModal.classList.remove('open'); document.body.style.overflow = ''; }
if (archViewBtn && archModal){
  archViewBtn.addEventListener('click', openArchModal);
  archTeaserCard.addEventListener('click', openArchModal);
  archTeaserCard.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); openArchModal(); } });
  archModalClose.addEventListener('click', closeArchModal);
  archModalBackdrop.addEventListener('click', closeArchModal);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && archModal.classList.contains('open')) closeArchModal(); });
}

const heroMoreBtn = $('heroMoreBtn');
const heroMore = $('heroMore');
if (heroMoreBtn && heroMore){
  heroMoreBtn.addEventListener('click', () => {
    const open = heroMore.classList.toggle('open');
    heroMoreBtn.setAttribute('aria-expanded', open);
    heroMoreBtn.querySelector('span').textContent = open ? 'Read less' : 'Read more';
  });
}


renderOverview();

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
  history.replaceState(null, "", `#/${jda.id}/project/${slug}`);
}

let initialRouteHandled = false;
function handleInitialRoute(){
  if (initialRouteHandled) return;
  initialRouteHandled = true;
  firstLoadDone();
  if (!editing && SCREEN_FOR[hashParts[0]]) showScreen(SCREEN_FOR[hashParts[0]]);
  if (hashParts[0] === 'project') showProjectDetail(hashParts[1]);
  if (hashParts[0] === 'solution') showSolutionDetail(hashParts[1]);
}

// `data` is null when this JDA has no report document yet: every section keeps its place and its
// values stay blank - no zeros, no sample numbers.
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

  const tbody = $('tasksBody');
  tbody.innerHTML = (data.tasks || []).length ? "" : `<tr><td colspan="4">${empty('No tasks yet.')}</td></tr>`;
  (data.tasks || []).forEach(t=>{
    const overdue = isOverdue(t.due, t.status);
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${esc(t.task)}</td><td class="mono">${esc(t.owner)}</td>
      <td class="mono${overdue ? ' overdue' : ''}">${esc(formatDueDate(t.due))}${overdue ? ' <span class="overdue-tag">OVERDUE</span>' : ''}</td>
      <td><span class="task-status ${taskStatusClass[t.status]||'notstarted'}">${esc(t.status)}</span></td>`;
    tbody.appendChild(tr);
  });

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

/* ---------- Edit report: housekeeping behind the passkey (Drive sync, calendar, clearing finished
   tasks). The report itself is edited in one place, the Editor Page, opened from the icon on the
   Master Page. Nothing here or there writes to the database: every save goes to the JDA server,
   which checks the passkey session, refuses to overwrite a part someone else changed since this
   page loaded it, and keeps the previous version. ---------- */
const REPORT_FIELDS = ['weekLabel', 'overallStatus', 'projects', 'challenges', 'tasks', 'updates', 'overview', 'overviewBackup'];
const saveReport = (patch, { remove = [], base = digests(currentData, [...Object.keys(patch), ...remove]), force = false } = {}) =>
  api('save', { patch, remove, base, force });
// Runs one save and always says how it went: the message on success, the reason in red (and left on screen) on failure.
async function attempt(msgId, action){
  try { flash(msgId, await action()); }
  catch (e){ flash(msgId, `Not saved: ${e.message}`, true); }
}

let editUnlocked = false;

function updateEditGateUI(){
  $('editLockGate').style.display = editUnlocked ? 'none' : 'block';
  $('editFormContent').style.display = editUnlocked ? 'block' : 'none';
}

function lockEditScreen(){
  editUnlocked = false;
  const input = $('editPasskeyInput');
  input.value = "";
  $('editLockMsg').textContent = "";
  updateEditGateUI();
}

async function tryUnlock(){
  const input = $('editPasskeyInput');
  try {
    await unlock(input.value);
    editUnlocked = true;
    input.value = "";
    $('editLockMsg').textContent = "";
    updateEditGateUI();
  } catch (e){
    $('editLockMsg').textContent = e.message;
  }
}
$('editUnlockBtn').onclick = tryUnlock;
$('editPasskeyInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') tryUnlock();
});

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
    if (!out.found) throw new Error(`No folder named "${jda.name}" in the portal's Drive folder.`);
    const { driveSync, ...sections } = out.patch;
    if (Object.keys(sections).length){
      // Projects from Drive keep the ids they had here, and tasks stay tied to them (progress.js).
      if (out.patch.projects) out.patch.projects = withProjectIds(out.patch.projects, currentData.projects || []);
      if (out.patch.tasks) out.patch.tasks = linkTasks(out.patch.tasks, out.patch.projects || currentData.projects || []);
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

function ensureMsalInstance(){
  if (msalInstance) return msalInstance;
  if (!window.msal) return null;
  msalInstance = new msal.PublicClientApplication({
    auth: {
      clientId: MS_CLIENT_ID,
      authority: MS_AUTHORITY,
      redirectUri: window.location.origin + window.location.pathname
    }
  });
  return msalInstance;
}

$('connectMsCalBtn').onclick = async () => {
  if (MS_CLIENT_ID.startsWith("YOUR_")){
    setMsCalStatus('error', "Microsoft Client ID isn't configured yet — see SETUP.md.");
    return;
  }
  if (location.protocol === 'file:'){
    setMsCalStatus('error', "Microsoft sign-in needs http(s) — run a local server or use the deployed URL, not the file:// path.");
    return;
  }
  const app = ensureMsalInstance();
  if (!app){
    setMsCalStatus('error', "Microsoft sign-in library still loading — try again in a second.");
    return;
  }
  try {
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

/* ---------- Master Page: this JDA's own edit icon -> passkey prompt -> Editor Page ---------- */
const jdaIcon = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${jda.icon || DEFAULT_JDA_ICON}</svg>`;
const accessTitle = `Master Access ${jda.name}`;
$('unlockIcon').innerHTML = jdaIcon;
$('unlockTitle').textContent = accessTitle;
function closeUnlock(){ $('unlockModal').hidden = true; }
// The one way in: this JDA's icon on its Master Page, and the passkey every time. Inside the
// editor, the tabs in the top bar move between the Master Page, Overall progress and Weekly progress.
$('masterEditBtn').innerHTML = jdaIcon;
$('masterEditBtn').title = accessTitle;
$('masterEditBtn').setAttribute('aria-label', accessTitle);
$('masterEditBtn').onclick = () => {
  $('unlockModal').hidden = false;
  $('unlockInput').value = ""; $('unlockMsg').textContent = "";
  $('unlockInput').focus();
};
$('unlockClose').onclick = closeUnlock;
$('unlockBackdrop').onclick = closeUnlock;
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeUnlock(); });
async function openEditor(){
  $('unlockBtn').disabled = true;
  try { await unlock($('unlockInput').value); sessionStorage.setItem(TOKEN_KEY, token); goTo(masterHash + '/edit'); }
  catch (e){ $('unlockMsg').textContent = e.message; $('unlockBtn').disabled = false; }
}
$('unlockBtn').onclick = openEditor;
$('unlockInput').addEventListener('keydown', e => { if (e.key === 'Enter') openEditor(); });

const notice = sessionStorage.getItem('jda-notice');
if (notice){
  sessionStorage.removeItem('jda-notice');
  $('setupBanner').textContent = notice;
  $('setupBanner').style.display = "block";
}

if (editing){
  // Hidden until the server confirms the session, so an expired or made-up token never sees the editor.
  document.body.classList.add('editor-checking');
  Promise.all([api('session'), firstLoad]).then(() => {
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
      jda, api, logoFor, blocksOf, showScreen,
      iconFor: art => SOLUTION_ICONS[art] || SOLUTION_ICONS.agentic,
      leave: () => goTo(masterHash + ({ 'screen-progress': '/progress', 'screen-weekly': '/weekly' }[document.querySelector('.screen.active').id] || '')),
      toMaster: () => goTo(masterHash),
      // Overall and Weekly progress: the same screens, drawn from a draft of the report's progress fields.
      progress: JSON.parse(JSON.stringify({
        weekLabel: currentData.weekLabel || '', overallStatus: currentData.overallStatus || 'green',
        projects: currentData.projects || [], challenges: currentData.challenges || [], tasks: currentData.tasks || [], updates: currentData.updates || []
      })),
      showProgress(progress){ render({ ...currentData, ...progress }); },
      saveProgress: progress => saveDraft(progress),
      statusLabel, taskStatuses: ['Not started', 'In progress', 'Done'], today: todayISO,
      artKeys: Object.keys(SOLUTION_ICONS),
      draft: overviewFromContent(),
      sectionOrder: () => [...c.sectionOrder],
      show(overview){ c = contentFromOverview(overview); renderOverview(); },
      // `overview` is replaced whole (so parts the editor removed are gone) and progress is left alone.
      // The first time a page stored in the older (pre-block) shape is saved over, that version is kept as `overviewBackup`.
      save(overview){
        const old = currentData.overview;
        const backup = old && !currentData.overviewBackup && !JSON.stringify(old).includes('"blocks"');
        return saveDraft(backup ? { overview, overviewBackup: old } : { overview });
      },
      // Back to the content written in js/config/jda-content.js, which then shows again as it is edited there.
      reset: () => saveDraft({}, ['overview'])
    });
    if (SCREEN_FOR[hashParts[1]]) showScreen(SCREEN_FOR[hashParts[1]]);
  }).catch(e => {
    goTo(masterHash, `The editor didn't open: ${e.message}`);
  });
}
