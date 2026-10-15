// Edit public site (/control-tower/site): one place to edit what the public sees. A tab each for the
// TriCipta AI page and every JDA's Master Page; the chosen page is shown below in edit mode (the page
// itself, loaded with ?edit, opens its own editor: landing edit.js, or master-edit.js). #main, #jda1…
// in the address choose the tab, so the Control Tower and the public pages can link straight to one.
import { esc } from '../../shared/lib/esc.js';
import { JDAS } from '../../shared/config/jdas.js';
import '../../shared/components/account.js';
import { mountCtSidebar } from './ct-sidebar.js';
import { mountCtTopbar } from './ct-topbar.js';

const $ = id => document.getElementById(id);
mountCtSidebar({ wrap: document.querySelector('.app'), bar: document.querySelector('.topbar-inner'), current: 'site' });
mountCtTopbar({ bar: document.querySelector('.topbar-inner') });

const PAGES = [
  { id: 'main', name: 'Main page', live: '/', note: 'The TriCipta AI page: every heading and text, the hero and section pictures, the figures, each JDA\'s tab, contacts and footer.' },
  ...JDAS.map(j => ({ id: j.id, name: j.name, live: `/jda/${encodeURIComponent(j.id)}/info`, note: `${j.name}'s Master Page: banner, winning aspiration, AI solutions and their detail pages, collaborators, press release, added sections and their order.` }))
];
const frame = $('siteFrame'), tabs = $('siteTabs');
tabs.innerHTML = PAGES.map(p => `<button type="button" role="tab" id="sitetab-${p.id}" aria-controls="siteFrame" aria-selected="false" tabindex="-1">${esc(p.name)}</button>`).join('');
const buttons = [...tabs.querySelectorAll('[role="tab"]')];

// Leaving a page with unsaved changes asks first (the page in the frame knows whether it has any).
const unsaved = () => { try { return !!frame.contentWindow?.hasUnsavedChanges?.(); } catch { return false; } };
window.hasUnsavedChanges = unsaved; // Sign out asks too (account.js)
addEventListener('beforeunload', e => { if (unsaved()) e.preventDefault(); });

let at = -1;
function choose(i, { focus = false, ask = true } = {}) {
  if (i === at) return;
  if (ask && at !== -1 && unsaved() && !confirm(`You have unsaved changes on ${PAGES[at].name}. Leave them and open ${PAGES[i].name}?`)) { buttons[at].focus(); return; }
  at = i;
  const p = PAGES[i];
  buttons.forEach((b, k) => { b.setAttribute('aria-selected', String(k === i)); b.tabIndex = k === i ? 0 : -1; });
  if (focus) buttons[i].focus();
  frame.title = `${p.name}, in edit mode`;
  frame.src = `${p.live}?edit`;
  $('siteOpen').href = p.live;
  $('siteFrameNote').textContent = p.note;
  history.replaceState(null, '', `#${p.id}`);
}
buttons.forEach((b, i) => {
  b.onclick = () => choose(i);
  b.onkeydown = e => {
    const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: buttons.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault(); choose((to + buttons.length) % buttons.length, { focus: true });
  };
});
// The frame fills the window below it, so the page's own Save bar (at the frame's bottom) is always in view.
const fit = () => { frame.style.height = `${Math.max(480, innerHeight - (frame.getBoundingClientRect().top + scrollY) - 12)}px`; };
addEventListener('resize', fit);
new ResizeObserver(fit).observe(document.querySelector('.ct-head'));
fit();
const fromHash = () => Math.max(0, PAGES.findIndex(p => p.id === location.hash.slice(1)));
addEventListener('hashchange', () => choose(fromHash()));
choose(fromHash(), { ask: false });
