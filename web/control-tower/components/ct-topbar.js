// The Control Tower's top bar, the same on its landing page and every JDA page: on the left its title
// and the JDA tabs, on the right the page's own actions (Sync from Drive, Edit page), View public site,
// and the user menu (who is signed in, Sign out). On a JDA's page, the tabs keep the page you are on
// (JDA 1's Weekly progress → JDA 2's Weekly progress), and a breadcrumb and the JDA's own pages sit
// under the bar (jdaNav). The page's HTML holds #whoami and #signOutBtn, which account.js fills and
// wires; they are moved into the user menu here.
import { esc } from '../../shared/lib/esc.js';
import { JDAS } from '../../shared/config/jdas.js';

const svg = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
// A JDA's pages, in the order of its sub-navigation. `invoices` is the Invoice Tracker's page for it.
export const JDA_PAGES = [
  { key: 'documents', label: 'Agreement & BRD' },
  { key: 'overall-progress', label: 'Overall progress' },
  { key: 'weekly-progress', label: 'Weekly progress' },
  { key: 'invoices', label: 'Invoices & payments' }
];
export const jdaPage = (id, key) => `/control-tower/${encodeURIComponent(id)}/${key}`;

// `tabs`: { current, href(jda) } for links, or an element to place there (the landing page's own tablist).
// `actions`: elements for the right-hand side, before View public site.
export function mountCtTopbar({ bar, tabs = null, actions = [] }) {
  const who = document.getElementById('whoami'), out = document.getElementById('signOutBtn');
  bar.querySelector('.topbar-account')?.remove();
  bar.classList.add('ct-topbar');

  const left = document.createElement('div');
  left.className = 'ct-top-left';
  if (tabs instanceof Element) left.append(tabs);
  else if (tabs) {
    const nav = document.createElement('nav');
    nav.className = 'ct-top-tabs';
    nav.setAttribute('aria-label', 'JDAs');
    nav.innerHTML = JDAS.map(j => `<a href="${esc(tabs.href(j))}"${j.id === tabs.current ? ' aria-current="page"' : ''}>${esc(j.name)}</a>`).join('');
    left.append(nav);
  }

  const right = document.createElement('div');
  right.className = 'ct-top-right';
  const site = Object.assign(document.createElement('a'), { className: 'ct-top-link', href: '/', target: '_blank', rel: 'noopener' });
  site.innerHTML = `${svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>')}<span>View public site</span><span class="visually-hidden"> (opens in a new tab)</span>`;
  // The user menu: a button that opens a small panel with who is signed in and Sign out.
  const menu = document.createElement('div');
  menu.className = 'ct-user';
  menu.innerHTML = `<button type="button" class="ct-user-btn" aria-expanded="false" aria-controls="ctUserMenu">${svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>')}<span class="visually-hidden">Account</span></button>
    <div class="ct-user-menu" id="ctUserMenu" hidden></div>`;
  const btn = menu.querySelector('button'), panel = menu.querySelector('.ct-user-menu');
  if (who) panel.append(who);
  if (out) { out.className = 'ct-btn ghost small'; panel.append(out); }
  const open = on => { panel.hidden = !on; btn.setAttribute('aria-expanded', String(on)); if (on) out?.focus(); };
  btn.onclick = () => open(panel.hidden);
  document.addEventListener('click', e => { if (!menu.contains(e.target)) open(false); });
  menu.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) { open(false); btn.focus(); } });
  menu.addEventListener('focusout', e => { if (!menu.contains(e.relatedTarget)) open(false); }); // tabbing away closes it
  // every action reads the same way: an icon and its name (the name hidden on a phone)
  for (const a of actions) if (!a.querySelector('svg')) { const name = a.textContent.trim(); a.innerHTML = `${svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>')}<span>${esc(name)}</span>`; }
  right.append(...actions, site, menu);

  bar.append(left, right);
  return { left, right };
}

// Under the top bar of a JDA's page: where you are, and the JDA's other pages (and its public Master Page).
// `tabs`: the JDA tabs here too, for a page whose top bar is its own (the Invoice Tracker).
export function jdaNav(jda, current, { tabs = false } = {}) {
  const here = JDA_PAGES.find(p => p.key === current);
  const nav = document.createElement('div');
  nav.className = 'ct-jda-nav';
  nav.innerHTML = `${tabs ? `<nav class="ct-top-tabs" aria-label="JDAs">${JDAS.map(j => `<a href="${jdaPage(j.id, current)}"${j.id === jda.id ? ' aria-current="page"' : ''}>${esc(j.name)}</a>`).join('')}</nav>` : ''}
    <nav class="ct-crumbs" aria-label="Breadcrumb"><ol>
      <li><a href="/control-tower/">Control Tower</a></li>
      <li><a href="/control-tower/#${esc(jda.id)}" title="${esc(jda.name)} at a glance">${esc(jda.name)}</a></li>
      <li aria-current="page">${esc(here?.label || '')}</li>
    </ol></nav>
    <nav class="ct-subnav" aria-label="${esc(jda.name)} pages">
      ${JDA_PAGES.map(p => `<a href="${jdaPage(jda.id, p.key)}" data-page="${p.key}"${p.key === current ? ' aria-current="page"' : ''}>${esc(p.label)}</a>`).join('')}
      <a href="/jda/${encodeURIComponent(jda.id)}/info" target="_blank" rel="noopener" title="View or edit it on the public Info page (Edit Master Page, signed in)">Master Page (public)<span aria-hidden="true"> ↗</span><span class="visually-hidden"> (opens in a new tab)</span></a>
    </nav>`;
  return nav;
}
