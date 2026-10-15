// The public TriCipta AI landing page. Everything on it comes from the server (/api/public/site),
// which sends only what may be shown; this file draws it. Each piece of text carries data-field, the
// place it is saved under, which edit mode (edit.js) uses.
import { esc } from '/shared/lib/esc.js';
import { me, endSession } from '/shared/lib/session.js';
import { mountSidebar } from '/shared/components/sidebar.js';

const $ = id => document.getElementById(id);
const EDITOR = new URLSearchParams(location.search).has('edit') && window.parent !== window; // shown inside the Control Tower's editor
if (EDITOR) document.body.classList.add('in-editor');
export const STATUS = {
  'in-the-works': { label: 'In the works', icon: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>' },
  'in-progress': { label: 'In progress', icon: '<path d="M3 12h4l3-8 4 16 3-8h4"/>' },
  finished: { label: 'Finished', icon: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>' }
};
const icon = (paths, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
// Text as paragraphs: a blank line starts a new one.
const paras = (text, field) => `<div class="prose" data-field="${field}" data-multiline>${String(text || '').split(/\n\s*\n/).map(p => `<p>${esc(p.trim())}</p>`).join('')}</div>`;
const initials = name => (String(name).match(/\b\p{L}/gu) || ['?']).slice(0, 2).join('').toUpperCase();
const shorten = (t, n) => { t = String(t || ''); return t.length > n ? `${t.slice(0, n).replace(/\s+\S*$/, '')}…` : t; };
const fmtDate = iso => { const d = new Date(`${iso}T00:00:00`); return isNaN(d) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }); };
const PROJECTS_SHOWN = 6;
// The pictures already in the site. Only the two large photos are wide enough for the hero; the
// solution pictures (480px) are used at card size, never stretched.
const HERO = ['/shared/assets/photos/hero-banner.jpg', '/shared/assets/photos/press.jpg'];
const CARD_PICTURES = ['gai', 'sap', 'vision', 'agentic', 'integrity', 'maintenance', 'hse', 'production', 'workprocess'].map(k => `/shared/assets/solutions/sol-${k}.jpg`);
const cardPicture = (i, j = 0) => CARD_PICTURES[(i + j * 3) % CARD_PICTURES.length];

export const sectionHead = (s, key, eyebrow = '') => `
  <header class="sec-head">
    ${eyebrow ? `<span class="eyebrow">${esc(eyebrow)}</span>` : ''}
    <h2 data-field="${key}.title">${esc(s.title)}</h2>
    ${s.subtitle !== undefined ? `<p class="sec-sub" data-field="${key}.subtitle">${esc(s.subtitle)}</p>` : ''}
  </header>`;

const person = (p, list, i) => `
  <li class="person" data-list="${list}" data-index="${i}">
    <span class="avatar" aria-hidden="true">${esc(initials(p.name))}</span>
    <span><b data-field="${list}.${i}.name">${esc(p.name)}</b><span class="person-title" data-field="${list}.${i}.title">${esc(p.title)}</span></span>
  </li>`;

/* ---------- Sections ---------- */
// The hero: one slide each for TriCipta AI, what a JDA is, and every JDA; their titles are the tabs below.
function hero(c) {
  const slides = [
    { tab: 'Overview', eyebrow: `<span data-field="header.eyebrow">${esc(c.header.eyebrow)}</span>`, title: `<h1 id="heroTitle" data-field="header.title">${esc(c.header.title)}</h1>`,
      text: `<p class="slide-text" data-field="header.tagline">${esc(c.header.tagline)}</p>`, href: '#overview', image: c.pictures?.hero || HERO[0] },
    { tab: 'What is a JDA', eyebrow: esc(c.whatIsJda.subtitle), title: `<h2>${esc(c.whatIsJda.title)}</h2>`, text: `<p class="slide-text">${esc(shorten(c.whatIsJda.body, 150))}</p>`, href: '#what-is-jda', image: c.pictures?.heroJda || HERO[1] },
    ...c.jdas.map((j, i) => ({ tab: j.name, eyebrow: esc(j.name), title: `<h2>${esc(j.title || 'Title TBC')}</h2>`, text: `<p class="slide-text">${esc(shorten(j.pressRelease, 150))}</p>`,
      href: `/jda/${encodeURIComponent(j.id)}/info`, image: j.image || HERO[i % 2], pos: i % 2 ? 'center 30%' : 'center 70%' }))
  ];
  return `
  <section class="hero" id="home" aria-roledescription="carousel" aria-label="TriCipta AI">
    <div class="slides">
      ${slides.map((s, i) => `<div class="slide${i === 0 ? ' on' : ''}" id="slide-${i}" role="tabpanel" aria-roledescription="slide" aria-label="${i + 1} of ${slides.length}: ${esc(s.tab)}"${i === 0 ? '' : ' hidden'}
        style="background-image:linear-gradient(100deg,rgba(1,39,36,.88) 0%,rgba(1,61,57,.7) 45%,rgba(1,61,57,.2) 100%),url('${esc(s.image)}');background-position:${s.pos || 'center'};--slide-img:url('${esc(s.image)}')">
        <div class="slide-inner">
          <span class="eyebrow">${s.eyebrow}</span>${s.title}${s.text}
          <a class="btn primary on-dark" href="${esc(s.href)}">Read more<span class="visually-hidden"> about ${esc(s.tab)}</span> ${icon('<path d="M5 12h14M13 6l6 6-6 6"/>')}</a>
        </div>
      </div>`).join('')}
    </div>
    <div class="slide-bar">
      <div class="slide-tabs" role="tablist" aria-label="Slides">
        ${slides.map((s, i) => `<button type="button" role="tab" id="slidetab-${i}" aria-controls="slide-${i}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}"><span>${esc(s.tab)}</span><i class="slide-progress" aria-hidden="true"></i></button>`).join('')}
      </div>
      <button type="button" class="slide-pause" id="slidePause" aria-label="Pause the slides">${icon('<path d="M9 5v14M15 5v14"/>')}</button>
    </div>
  </section>`;
}

const figures = c => {
  // under way: each JDA's projects less those finished (100% on Overall progress), never below 0
  const finished = c.jdas.reduce((n, j) => n + (j.finished || 0), 0), projects = c.jdas.reduce((n, j) => n + Math.max(0, (j.projectCount || 0) - (j.finished || 0)), 0);
  return `
  <section class="figures" aria-labelledby="figuresTitle">
    <h2 class="figures-title" id="figuresTitle" data-field="figures.title">${esc(c.figures.title)}</h2>
    <dl class="figure-strip">
      <div><dt data-field="figures.jdas">${esc(c.figures.jdas || 'Joint Development Agreements')}</dt><dd>${c.jdas.length}</dd></div>
      <div><dt data-field="figures.underWay">${esc(c.figures.underWay || 'Projects under way')}</dt><dd>${projects}</dd></div>
      <div><dt data-field="figures.finished">${esc(c.figures.finished || 'Projects finished')}</dt><dd>${finished}</dd></div>
    </dl>
  </section>`;
};

export function jdaPanel(j, jdaIndex = 0) {
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
      </div>
      <div class="jda-people">
        <h3 class="mini-head">Program Lead</h3>
        <ul class="people" data-people="${base}.programLeads">${j.programLeads.map((p, i) => person(p, `${base}.programLeads`, i)).join('')}</ul>
        <h3 class="mini-head sub">Business Champions</h3>
        <ul class="people" data-people="${base}.businessChampions">${j.businessChampions.map((p, i) => person(p, `${base}.businessChampions`, i)).join('')}</ul>
      </div>
    </div>
    <h3 class="mini-head">Projects under ${esc(j.name)} <span class="count">${j.projectCount}</span></h3>
    ${j.projects.length ? `<ul class="highlights" data-field="${base}.projects" data-list-of="text">${shown.map((p, i) => `
      <li class="highlight"><img src="${cardPicture(i, jdaIndex)}" alt="" loading="lazy" width="480" height="320"><span title="${esc(p)}">${esc(p)}</span></li>`).join('')}
      ${more > 0 ? `<li class="highlight more"><a href="/jda/${encodeURIComponent(j.id)}/info">+${more} more projects</a></li>` : ''}</ul>`
      : `<p class="muted" data-field="${base}.projects" data-list-of="text">No projects listed yet.</p>`}
    <div class="panel-foot"><a class="btn ghost" href="/jda/${encodeURIComponent(j.id)}/info">View more about ${esc(j.name)} ${icon('<path d="M5 12h14M13 6l6 6-6 6"/>')}</a></div>`;
}

// Latest press releases: the newest (by date, when dates are given) large, the others as smaller dated cards.
function news(c) {
  const items = c.jdas.filter(j => j.pressRelease).map((j, i) => ({ j, i })).sort((a, b) => (b.j.pressDate || '').localeCompare(a.j.pressDate || '') || a.i - b.i);
  if (!items.length) return '';
  const [first, ...rest] = items;
  const card = ({ j, i }, big) => `
    <a class="news-card${big ? ' featured' : ''}" href="/jda/${encodeURIComponent(j.id)}/info">
      <span class="news-pic"><img src="${esc(j.image || (big ? HERO[1] : cardPicture(i, 2)))}" alt="" loading="lazy"></span>
      <span class="news-body">
        <span class="news-meta">${esc(j.name)}${j.pressDate ? ` · <time datetime="${esc(j.pressDate)}">${esc(fmtDate(j.pressDate))}</time>` : ''}</span>
        <b>${esc(j.title || j.name)}</b>
        <span class="news-text">${esc(shorten(j.pressRelease, big ? 260 : 120))}</span>
        <span class="news-more">Read more ${icon('<path d="M5 12h14M13 6l6 6-6 6"/>')}</span>
      </span>
    </a>`;
  return `
  <section class="sec" id="news">
    ${sectionHead(c.news, 'news')}
    <div class="news-grid">${card(first, true)}<div class="news-side">${rest.map(r => card(r, false)).join('')}</div></div>
  </section>`;
}

export const statusBadge = (status, field = '') => {
  const s = STATUS[status] || STATUS['in-the-works'];
  return `<span class="status-badge ${esc(status)}"${field ? ` data-field="${field}" data-choice="status"` : ''}>${icon(s.icon)}${esc(s.label)}</span>`;
};

// A contact card: a link when written, "To be announced" (and no link) until then. `optional` cards
// (LinkedIn, website) only show once written, except in edit mode.
const contact = (label, field, value, href, paths, optional = false) => {
  const body = `${icon(paths)}<span><small>${label}</small><b data-field="${field}"${field.endsWith('address') ? ' data-multiline' : ''}>${esc(value || 'To be announced')}</b></span>`;
  const cls = `contact-card${value ? '' : ' tba'}${optional && !value ? ' optional' : ''}`;
  return value && href ? `<a class="${cls}" href="${esc(href)}"${/^https?:/.test(href) ? ' target="_blank" rel="noopener"' : ''}>${body}</a>` : `<div class="${cls}">${body}</div>`;
};
const webAddress = v => /^https?:\/\//i.test(String(v || '').trim()) ? String(v).trim() : '';

// A section's picture (uploaded in edit mode), or where it will go until one is supplied.
const sectionPicture = (key, name, url) => url
  ? `<figure class="sec-pic" data-picture="${key}"><img src="${esc(url)}" alt="${esc(name)}" loading="lazy"></figure>`
  : `<figure class="pic-placeholder" data-picture="${key}" aria-label="${esc(name)}: picture to come">
    ${icon('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 17-5-5-9 8"/>')}
    <figcaption><b>Picture coming soon</b><span>It will appear here once it is added.</span></figcaption>
  </figure>`;

export function render(site) {
  const c = site, at = Math.max(0, c.jdas.findIndex(j => j.id === new URLSearchParams(location.search).get('jda'))); // ?jda=jda3 opens JDA 3's tab
  return `
  ${hero(c)}
  ${figures(c)}

  <section class="sec" id="overview"><div class="soft-box with-pic"><div>${sectionHead(c.overview, 'overview')}${paras(c.overview.body, 'overview.body')}</div>${sectionPicture('overview', 'Overview', c.pictures?.overview)}</div></section>

  <section class="sec" id="roles">
    ${sectionHead(c.roles, 'roles')}
    <figure class="roles-figure" data-picture="roles">
      ${c.roles.image ? `<img src="${esc(c.roles.image)}" alt="${esc(c.roles.alt)}" loading="lazy">`
        : `<div class="roles-placeholder">${icon('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 17-5-5-9 8"/>')}<p><b>Roles chart coming soon</b><span>It will appear here once it is added.</span></p></div>`}
    </figure>
  </section>

  <section class="sec" id="what-is-jda"><div class="soft-box with-pic"><div>${sectionHead(c.whatIsJda, 'whatIsJda')}${paras(c.whatIsJda.body, 'whatIsJda.body')}</div>${sectionPicture('whatIsJda', 'What is a JDA', c.pictures?.whatIsJda)}</div></section>

  <section class="sec" id="jdas">
    ${sectionHead(c.existing, 'existing')}
    <div class="jda-tabs">
      <div class="tablist" role="tablist" aria-label="JDAs">
        ${c.jdas.map((j, i) => `<button type="button" role="tab" id="tab-${j.id}" aria-controls="panel-${j.id}" aria-selected="${i === at}" tabindex="${i === at ? 0 : -1}">${esc(j.name)}</button>`).join('')}
      </div>
      ${c.jdas.map((j, i) => `<div class="tab-panel" role="tabpanel" id="panel-${j.id}" aria-labelledby="tab-${j.id}" tabindex="0"${i === at ? '' : ' hidden'}>${jdaPanel(j, i)}</div>`).join('')}
    </div>
  </section>

  ${news(c)}

  <section class="sec" id="status">
    ${sectionHead(c.status, 'status')}
    <div class="status-grid">
      ${c.jdas.map(j => `
        <article class="status-card ${esc(j.status)}">
          <span class="status-label">${esc(j.name)}</span>
          <h3 class="status-title">${esc(j.title || 'Title TBC')}</h3>
          <p class="status-line"><b data-field="jdas.${j.id}.projectCount" data-number>${j.projectCount}</b> ${j.projectCount === 1 ? 'project' : 'projects'} · ${statusBadge(j.status, `jdas.${j.id}.status`)}</p>
        </article>`).join('')}
    </div>
  </section>

  <section class="sec" id="contacts">
    ${sectionHead(c.contacts, 'contacts')}
    <div class="contact-grid">
      ${contact('Email', 'contacts.email', c.contacts.email, c.contacts.email && `mailto:${c.contacts.email}`, '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>')}
      ${contact('Phone', 'contacts.phone', c.contacts.phone, c.contacts.phone && `tel:${String(c.contacts.phone).replace(/[^\d+]/g, '')}`, '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>')}
      ${contact('Address', 'contacts.address', c.contacts.address, '', '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11Z"/><circle cx="12" cy="10" r="2.5"/>')}
      ${contact('LinkedIn', 'contacts.linkedin', c.contacts.linkedin, webAddress(c.contacts.linkedin), '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 10v7M8 7v.01M12 17v-4a2 2 0 0 1 4 0v4M12 10v7"/>', true)}
      ${contact('Website', 'contacts.website', c.contacts.website, webAddress(c.contacts.website), '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>', true)}
    </div>
  </section>

  <footer class="site-foot">
    <nav class="foot-links" aria-label="Footer"><a href="#home">Home</a><a href="#jdas">Existing JDAs</a><a href="#status">JDA Status</a><a href="#contacts">Contacts</a><a href="/login" id="footSignIn">Employee sign-in</a></nav>
    <div class="foot-row">
      <span>© ${new Date().getFullYear()} <span data-field="footer.text">${esc(c.footer.text)}</span></span>
      <span class="foot-social">${[['LinkedIn', c.contacts.linkedin], ['Website', c.contacts.website]].filter(([, v]) => webAddress(v)).map(([n, v]) => `<a href="${esc(webAddress(v))}" target="_blank" rel="noopener">${n}</a>`).join('')}</span>
    </div>
  </footer>`;
}

/* ---------- Behaviour ---------- */
export function wireTabs(root, selector = '.jda-tabs [role="tab"]', onSelect = () => {}) {
  const tabs = [...root.querySelectorAll(selector)];
  const select = (tab, focus = true) => {
    tabs.forEach(t => {
      const on = t === tab;
      t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1;
      const panel = root.querySelector(`#${t.getAttribute('aria-controls')}`);
      panel.hidden = !on; panel.classList.toggle('on', on);
    });
    if (focus) tab.focus();
    onSelect(tabs.indexOf(tab));
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
  return { select: i => select(tabs[(i + tabs.length) % tabs.length], false), count: tabs.length };
}

// The hero turns to its next slide every 7 seconds, except when motion is reduced, while the pointer
// or keyboard focus is in it, in edit mode, or after Pause.
function wireHero(root) {
  const hero = root.querySelector('.hero');
  if (!hero) return;
  let at = 0, paused = matchMedia('(prefers-reduced-motion: reduce)').matches, held = false, timer;
  const tabs = wireTabs(root, '.slide-tabs [role="tab"]', i => {
    at = i; restart();
    // keep the current slide's tab in view where the tabs scroll (a phone), without moving the page
    const tab = hero.querySelectorAll('.slide-tabs [role="tab"]')[i], row = tab?.parentElement;
    if (row && row.scrollWidth > row.clientWidth) row.scrollTo({ left: tab.offsetLeft - 16, behavior: 'smooth' });
  });
  const pauseBtn = hero.querySelector('#slidePause');
  const restart = () => {
    clearInterval(timer);
    hero.classList.toggle('running', !paused);
    if (!paused) timer = setInterval(() => { if (!held && !document.body.classList.contains('editing')) tabs.select(at + 1); }, 7000);
  };
  const setPaused = on => { paused = on; pauseBtn.setAttribute('aria-label', on ? 'Play the slides' : 'Pause the slides'); pauseBtn.innerHTML = icon(on ? '<path d="M7 5l12 7-12 7Z"/>' : '<path d="M9 5v14M15 5v14"/>'); restart(); };
  pauseBtn.onclick = () => setPaused(!paused);
  for (const [ev, on] of [['pointerenter', true], ['pointerleave', false], ['focusin', true], ['focusout', false]]) hero.addEventListener(ev, () => { held = on; hero.classList.toggle('held', on); });
  setPaused(paused);
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

// Sections fade in as they scroll into view (not when motion is reduced).
function wireReveal(root) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const seen = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); seen.unobserve(e.target); } }), { threshold: .08 });
  root.querySelectorAll('.sec, .figures').forEach(s => { s.classList.add('reveal'); seen.observe(s); });
}

let sidebar = { close: () => {} };
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
  sidebar = mountSidebar({ sidebar: $('sidebar'), menuBtn: $('menuBtn'), scrim: $('scrim'), main: $('main'), storageKey: 'tricipta.sidebar.collapsed' });
  return watch;
}

// Signed in: the sidebar and footer lead to the Control Tower, with Sign out.
async function account() {
  const who = await me();
  if (!who.signedIn) return;
  for (const a of [$('signInBtn'), $('footSignIn')].filter(Boolean)) a.href = '/control-tower/';
  $('signInBtn').querySelector('span').textContent = 'Open Control Tower';
  $('signInBtn').dataset.tip = 'Open Control Tower';
  if ($('footSignIn')) $('footSignIn').textContent = 'Open Control Tower';
  document.querySelector('.side-note').textContent = who.signInOff ? 'Sign-in is off (local)' : `Signed in as ${String(who.email).split('@')[0]}`;
  // Inside the Control Tower's "Edit public site" (?edit): straight into edit mode, and back into it
  // after each save or cancel (edit.js).
  if (EDITOR) return openEditor();
  // Otherwise the page is edited there, not here.
  const editLink = Object.assign(document.createElement('a'), { id: 'editPageBtn', className: 'btn ghost small side-edit', href: '/control-tower/site#main' });
  editLink.innerHTML = `${icon('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>')}<span>Edit in Control Tower</span>`;
  editLink.dataset.tip = 'Edit in Control Tower';
  $('sideFoot').append(editLink);
  if (!who.signInOff) {
    const out = Object.assign(document.createElement('button'), { type: 'button', className: 'btn ghost small side-signout' });
    out.innerHTML = `${icon('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>')}<span>Sign out</span>`;
    out.dataset.tip = 'Sign out';
    out.onclick = () => { if (!window.hasUnsavedChanges?.() || confirm('You have unsaved changes. Sign out anyway and lose them?')) endSession(); };
    $('sideFoot').append(out);
  }
}
async function openEditor() {
  if (!current) return toast('The page has not loaded, so it cannot be edited. Reload and try again.');
  let note = ''; // the message from before the reload (saved, or changes discarded)
  try { note = sessionStorage.getItem('editorNote') || ''; sessionStorage.removeItem('editorNote'); } catch { /* storage blocked */ }
  const done = text => { try { sessionStorage.setItem('editorNote', text); } catch { /* the message is lost */ } location.reload(); };
  try { await (await import('/public/components/edit.js')).start({ site: current, show, reload, done, discard: true }); if (note) toast(note); }
  catch (e) { toast(`Edit mode could not open: ${e.message}`); }
}
// A short message after edit mode (saved, cancelled, or why it could not open), read out by screen readers.
function toast(text) {
  let t = $('editToast');
  if (!t) { t = Object.assign(document.createElement('div'), { id: 'editToast', className: 'edit-toast' }); t.setAttribute('role', 'status'); document.body.append(t); }
  t.textContent = text; t.hidden = false;
  clearTimeout(t._timer); t._timer = setTimeout(() => { t.hidden = true; }, 6000);
}
// After a save: the page as the public now sees it.
async function reload() {
  const res = await fetch('/api/public/site');
  if (res.ok) await show(await res.json());
}

let current;
export async function show(site) {
  current = site || current;
  $('page').innerHTML = render(current);
  $('page').hidden = false; $('loadNote').hidden = true;
  wireTabs($('page'));
  wireHero($('page'));
  wireClamps($('page'));
  wireReveal($('page'));
  document.querySelectorAll('.side-nav a').forEach(a => { a.hidden = !document.getElementById(a.getAttribute('href').slice(1)); });
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
