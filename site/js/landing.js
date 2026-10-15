// The public TriCipta AI landing page. Everything on it comes from the server (/api/public/site),
// which sends only what may be shown; this file draws it. Each piece of text carries data-field, the
// place it is saved under, which edit mode (edit.js) uses.
import { esc } from '/shared/esc.js';
import { me, endSession } from '/shared/session.js';

const $ = id => document.getElementById(id);
export const STATUS = {
  'in-the-works': { label: 'In the works', icon: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>' },
  'in-progress': { label: 'In progress', icon: '<path d="M3 12h4l3-8 4 16 3-8h4"/>' },
  finished: { label: 'Finished', icon: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>' }
};
const icon = (paths, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
// Text as paragraphs: a blank line starts a new one.
const paras = (text, field) => `<div class="prose" data-field="${field}" data-multiline>${String(text || '').split(/\n\s*\n/).map(p => `<p>${esc(p.trim())}</p>`).join('')}</div>`;
const initials = name => (String(name).match(/\b\p{L}/gu) || ['?']).slice(0, 2).join('').toUpperCase();
const PROJECTS_SHOWN = 6;

export const sectionHead = (s, key, eyebrow = '') => `
  <header class="sec-head">
    ${eyebrow ? `<span class="eyebrow">${esc(eyebrow)}</span>` : ''}
    <h2 data-field="${key}.title">${esc(s.title)}</h2>
    <p class="sec-sub" data-field="${key}.subtitle">${esc(s.subtitle)}</p>
  </header>`;

const person = (p, list, i) => `
  <li class="person" data-list="${list}" data-index="${i}">
    <span class="avatar" aria-hidden="true">${esc(initials(p.name))}</span>
    <span><b data-field="${list}.${i}.name">${esc(p.name)}</b><span class="person-title" data-field="${list}.${i}.title">${esc(p.title)}</span></span>
  </li>`;

export function jdaPanel(j) {
  const base = `jdas.${j.id}`, shown = j.projects.slice(0, PROJECTS_SHOWN), more = j.projects.length - shown.length;
  return `
    <div class="jda-panel-grid">
      <div class="jda-main">
        <p class="jda-title" data-field="${base}.title">${esc(j.title || 'Title TBC')}</p>
        <h3 class="mini-head">Press release overview</h3>
        <div class="clamp-wrap">
          <p class="clamp" id="press-${j.id}" data-field="${base}.pressRelease" data-multiline>${esc(j.pressRelease || 'No press release yet.')}</p>
          <button type="button" class="link-btn clamp-toggle" aria-expanded="false" aria-controls="press-${j.id}" hidden>Read more</button>
        </div>
        <h3 class="mini-head">Projects under ${esc(j.name)} <span class="count">${j.projectCount}</span></h3>
        ${j.projects.length ? `<ul class="chips" data-field="${base}.projects" data-list-of="text">${shown.map(p => `<li title="${esc(p)}">${esc(p)}</li>`).join('')}${more > 0 ? `<li class="chip-more"><a href="/jda/${encodeURIComponent(j.id)}/info">+${more} more</a></li>` : ''}</ul>`
          : '<p class="muted" data-field="' + base + '.projects" data-list-of="text">No projects listed yet.</p>'}
      </div>
      <div class="jda-people">
        <h3 class="mini-head">Program Lead</h3>
        <ul class="people" data-people="${base}.programLeads">${j.programLeads.map((p, i) => person(p, `${base}.programLeads`, i)).join('')}</ul>
        <h3 class="mini-head sub">Business Champions</h3>
        <ul class="people" data-people="${base}.businessChampions">${j.businessChampions.map((p, i) => person(p, `${base}.businessChampions`, i)).join('')}</ul>
      </div>
    </div>
    <div class="panel-foot"><a class="btn ghost" href="/jda/${encodeURIComponent(j.id)}/info">View more about ${esc(j.name)} ${icon('<path d="M5 12h14M13 6l6 6-6 6"/>')}</a></div>`;
}

export const statusBadge = (status, field = '') => {
  const s = STATUS[status] || STATUS['in-the-works'];
  return `<span class="status-badge ${esc(status)}"${field ? ` data-field="${field}" data-choice="status"` : ''}>${icon(s.icon)}${esc(s.label)}</span>`;
};

// A contact card: a link when written, "To be announced" (and no link) until then.
const contact = (label, field, value, href, paths) => {
  const body = `${icon(paths)}<span><small>${label}</small><b data-field="${field}"${field.endsWith('address') ? ' data-multiline' : ''}>${esc(value || 'To be announced')}</b></span>`;
  return value && href ? `<a class="contact-card" href="${esc(href)}">${body}</a>` : `<div class="contact-card${value ? '' : ' tba'}">${body}</div>`;
};

export function render(site) {
  const c = site, at = Math.max(0, c.jdas.findIndex(j => j.id === new URLSearchParams(location.search).get('jda'))); // ?jda=jda3 opens JDA 3's tab
  return `
  <section class="hero" id="home" aria-labelledby="heroTitle">
    <div class="hero-inner">
      <span class="eyebrow" data-field="header.eyebrow">${esc(c.header.eyebrow)}</span>
      <h1 id="heroTitle" data-field="header.title">${esc(c.header.title)}</h1>
      <p class="hero-tagline" data-field="header.tagline">${esc(c.header.tagline)}</p>
      <div class="hero-actions">
        <a class="btn primary" href="#jdas">Explore the JDAs</a>
        <a class="btn ghost on-dark" href="#status">See JDA status</a>
      </div>
    </div>
  </section>

  <section class="sec" id="overview">${sectionHead(c.overview, 'overview')}${paras(c.overview.body, 'overview.body')}</section>

  <section class="sec" id="roles">
    ${sectionHead(c.roles, 'roles')}
    <figure class="roles-figure">
      ${c.roles.image ? `<img src="${esc(c.roles.image)}" alt="${esc(c.roles.alt)}" loading="lazy">`
        : `<div class="roles-placeholder">${icon('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 17-5-5-9 8"/>')}<p><b>Roles chart coming soon</b><span>It will appear here once it is added.</span></p></div>`}
    </figure>
  </section>

  <section class="sec" id="what-is-jda">${sectionHead(c.whatIsJda, 'whatIsJda')}${paras(c.whatIsJda.body, 'whatIsJda.body')}</section>

  <section class="sec" id="jdas">
    ${sectionHead(c.existing, 'existing')}
    <div class="jda-tabs">
      <div class="tablist" role="tablist" aria-label="JDAs">
        ${c.jdas.map((j, i) => `<button type="button" role="tab" id="tab-${j.id}" aria-controls="panel-${j.id}" aria-selected="${i === at}" tabindex="${i === at ? 0 : -1}">${esc(j.name)}</button>`).join('')}
      </div>
      ${c.jdas.map((j, i) => `<div class="tab-panel" role="tabpanel" id="panel-${j.id}" aria-labelledby="tab-${j.id}" tabindex="0"${i === at ? '' : ' hidden'}>${jdaPanel(j)}</div>`).join('')}
    </div>
  </section>

  <section class="sec" id="status">
    ${sectionHead(c.status, 'status')}
    <div class="status-grid">
      ${c.jdas.map(j => `
        <article class="status-card ${esc(j.status)}">
          <div class="status-top"><h3>${esc(j.name)}</h3>${statusBadge(j.status, `jdas.${j.id}.status`)}</div>
          <p class="status-title">${esc(j.title || 'Title TBC')}</p>
          <p class="status-count"><b data-field="jdas.${j.id}.projectCount" data-number>${j.projectCount}</b> ${j.projectCount === 1 ? 'project' : 'projects'}</p>
        </article>`).join('')}
    </div>
  </section>

  <section class="sec" id="contacts">
    ${sectionHead(c.contacts, 'contacts')}
    <div class="contact-grid">
      ${contact('Email', 'contacts.email', c.contacts.email, c.contacts.email && `mailto:${c.contacts.email}`, '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>')}
      ${contact('Phone', 'contacts.phone', c.contacts.phone, c.contacts.phone && `tel:${String(c.contacts.phone).replace(/[^\d+]/g, '')}`, '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>')}
      ${contact('Address', 'contacts.address', c.contacts.address, '', '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11Z"/><circle cx="12" cy="10" r="2.5"/>')}
    </div>
  </section>

  <footer class="site-foot"><span>© ${new Date().getFullYear()} <span data-field="footer.text">${esc(c.footer.text)}</span></span><a href="/login" id="footSignIn">Employee sign-in</a></footer>`;
}

/* ---------- Behaviour ---------- */
export function wireTabs(root) {
  const tabs = [...root.querySelectorAll('[role="tab"]')];
  const select = (tab, focus = true) => {
    tabs.forEach(t => {
      const on = t === tab;
      t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1;
      root.querySelector(`#${t.getAttribute('aria-controls')}`).hidden = !on;
    });
    if (focus) tab.focus();
    wireClamps(root);
  };
  tabs.forEach((t, i) => {
    t.onclick = () => select(t, false);
    t.onkeydown = e => {
      const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (to === undefined) return;
      e.preventDefault(); select(tabs[(to + tabs.length) % tabs.length]);
    };
  });
}
// A long press release shows five lines and "Read more"; a short one shows no button.
export function wireClamps(root) {
  root.querySelectorAll('.clamp-wrap').forEach(w => {
    const p = w.querySelector('.clamp'), b = w.querySelector('.clamp-toggle');
    if (p.offsetParent === null || w.classList.contains('open')) return;
    b.hidden = p.scrollHeight <= p.clientHeight + 2;
    b.onclick = () => { const open = w.classList.toggle('open'); b.textContent = open ? 'Show less' : 'Read more'; b.setAttribute('aria-expanded', open); };
  });
}

function wireNav() {
  const links = [...document.querySelectorAll('.side-nav a')];
  const current = id => links.forEach(a => a.getAttribute('href') === `#${id}` ? a.setAttribute('aria-current', 'location') : a.removeAttribute('aria-current'));
  const spy = new IntersectionObserver(entries => {
    const seen = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
    if (seen) current(seen.target.id);
  }, { rootMargin: '-35% 0px -55% 0px' });
  const watch = () => links.map(a => document.getElementById(a.getAttribute('href').slice(1))).filter(Boolean).forEach(s => spy.observe(s));
  // the last section is short: at the very bottom of the page it is the current one
  addEventListener('scroll', () => { if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4) current(links.at(-1).getAttribute('href').slice(1)); }, { passive: true });

  // On a phone the sidebar is a drawer: closed, nothing in it can be reached; open, nothing behind it can.
  const phone = matchMedia('(max-width:900px)');
  const open = (on, refocus = false) => {
    document.body.classList.toggle('menu-open', on); $('menuBtn').setAttribute('aria-expanded', on); $('scrim').hidden = !on;
    $('sidebar').inert = phone.matches && !on;
    $('main').inert = on; document.querySelector('.mobilebar').inert = false;
    if (on) $('sidebar').querySelector('a').focus(); else if (refocus) $('menuBtn').focus();
  };
  open(false);
  phone.addEventListener('change', () => open(false));
  $('menuBtn').onclick = () => open(!document.body.classList.contains('menu-open'));
  $('scrim').onclick = () => open(false, true);
  $('sidebar').addEventListener('click', e => { if (e.target.closest('a[href^="#"]') && phone.matches) open(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.body.classList.contains('menu-open')) open(false, true); });
  return watch;
}

// Signed in: the sidebar and footer lead to the Control Tower, with Sign out.
async function account() {
  const who = await me();
  if (!who.signedIn) return;
  for (const a of [$('signInBtn'), $('footSignIn')].filter(Boolean)) a.href = '/control-tower/';
  $('signInBtn').lastChild.textContent = ' Open Control Tower';
  if ($('footSignIn')) $('footSignIn').textContent = 'Open Control Tower';
  document.querySelector('.side-note').textContent = who.signInOff ? 'Sign-in is off (local)' : `Signed in as ${String(who.email).split('@')[0]}`;
  if (!who.signInOff) {
    const out = Object.assign(document.createElement('button'), { type: 'button', className: 'btn ghost small side-signout', textContent: 'Sign out' });
    out.onclick = () => endSession();
    $('sideFoot').append(out);
  }
}

let current;
export async function show(site) {
  current = site || current;
  $('page').innerHTML = render(current);
  $('page').hidden = false; $('loadNote').hidden = true;
  wireTabs($('page'));
  wireClamps($('page'));
}

async function start() {
  const watch = wireNav(); // the menu works even if the page's content cannot be loaded
  try {
    const res = await fetch('/api/public/site');
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Error ${res.status}`);
    await show(await res.json());
    watch();
    new ResizeObserver(() => wireClamps($('page'))).observe($('page'));
    let target = null;
    try { target = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1))); } catch { /* a malformed address: stay at the top */ }
    target?.scrollIntoView();
  } catch (e) {
    $('loadNote').innerHTML = `This page could not be loaded just now (${esc(e.message)}). <a href="">Try again</a> · <a href="/login">Employee sign-in</a>`;
  }
  account();
}
start();
