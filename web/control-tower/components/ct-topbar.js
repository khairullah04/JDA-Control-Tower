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
// `actions`: the page's own actions (buttons), put in the Tools menu with Edit public site and View public site.
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
  const PEN = '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>';
  // Edit public site: the TriCipta AI page and the JDAs' Master Pages are edited there, in one place.
  const editSite = Object.assign(document.createElement('a'), { href: '/control-tower/site' });
  editSite.innerHTML = `${svg('<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>')}<span>Edit public site</span>`;
  if (location.pathname === '/control-tower/site') editSite.setAttribute('aria-current', 'page');
  const site = Object.assign(document.createElement('a'), { href: '/', target: '_blank', rel: 'noopener' });
  site.innerHTML = `${svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>')}<span>View public site</span><span class="visually-hidden"> (opens in a new tab)</span>`;
  // every action reads the same way in the menu: an icon and its name
  for (const a of actions) if (!a.querySelector('svg')) { const name = a.textContent.trim(); a.innerHTML = `${svg(PEN)}<span>${esc(name)}</span>`; }

  // Tools: the page's own actions (Edit page, Sync from Drive), Edit public site and View public site,
  // in one menu. What a running action says of itself ("Syncing: …") shows beside the button meanwhile.
  const tools = dropdown('ct-tools', `${svg('<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4Z"/>')}<span>Tools</span>${svg('<path d="m6 9 6 6 6-6"/>')}`, 'Tools', 'ctToolsMenu');
  for (const a of [...actions, editSite, site]) { a.classList.remove('ct-btn', 'ghost', 'primary', 'small'); a.classList.add('ct-menu-item'); a.setAttribute('role', 'menuitem'); tools.panel.append(a); }
  tools.panel.setAttribute('role', 'menu');
  tools.panel.addEventListener('click', e => { if (e.target.closest('.ct-menu-item')) tools.open(false); });
  const status = Object.assign(document.createElement('span'), { className: 'ct-tools-status' });
  status.setAttribute('role', 'status');
  let clear;
  const mirror = () => {
    const busy = actions.find(a => a.getAttribute('aria-busy') === 'true');
    if (busy) { clearTimeout(clear); status.textContent = busy.querySelector('span')?.textContent || 'Working…'; return; }
    clearTimeout(clear); clear = setTimeout(() => { status.textContent = ''; }, 8000); // the last word stays a moment
  };
  const watch = new MutationObserver(mirror);
  for (const a of actions) watch.observe(a, { attributes: true, attributeFilter: ['aria-busy'], subtree: true, characterData: true, childList: true });

  // The user menu: who is signed in, and Sign out.
  const user = dropdown('ct-user', `${svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>')}<span class="visually-hidden">Account</span>`, 'Account', 'ctUserMenu');
  if (who) user.panel.append(who);
  if (out) { out.className = 'ct-btn ghost small'; user.panel.append(out); }
  right.append(status, tools.el, user.el);

  bar.append(left, right);
  return { left, right };
}

// A button that opens a small panel under it; Escape, a click outside or tabbing away closes it.
function dropdown(cls, inner, label, id) {
  const el = document.createElement('div');
  el.className = `ct-drop ${cls}`;
  el.innerHTML = `<button type="button" class="${cls}-btn ct-drop-btn" aria-expanded="false" aria-controls="${id}" aria-haspopup="true" title="${esc(label)}">${inner}</button><div class="ct-drop-panel ${cls}-menu" id="${id}" hidden></div>`;
  const btn = el.querySelector('button'), panel = el.querySelector('.ct-drop-panel');
  const open = on => { panel.hidden = !on; btn.setAttribute('aria-expanded', String(on)); if (on) panel.querySelector('a, button:not([disabled])')?.focus(); };
  btn.onclick = () => open(panel.hidden);
  document.addEventListener('click', e => { if (!el.contains(e.target)) open(false); });
  el.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !panel.hidden) { open(false); btn.focus(); return; }
    // the arrow keys move through the menu's items
    const items = [...panel.querySelectorAll('a, button:not([disabled])')].filter(x => !x.hidden), at = items.indexOf(document.activeElement);
    if (!panel.hidden && at !== -1 && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); items[(at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus(); }
  });
  el.addEventListener('focusout', e => { if (!el.contains(e.relatedTarget)) open(false); });
  return { el, panel, open };
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
