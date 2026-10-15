// The sidebar of both sides (public site and Control Tower): on a desktop it can collapse to a rail of
// icons (their names show as tooltips), which this browser remembers; on a phone it is a drawer behind
// a menu button. Markup: <aside class="sidebar" id="…"> with a .side-collapse button inside, a
// .menu-btn outside (phones), a .scrim, and the page's <main>.
const PHONE = matchMedia('(max-width:900px)');
const remembered = key => { try { return localStorage.getItem(key) === '1'; } catch { return false; } };
const remember = (key, on) => { try { localStorage.setItem(key, on ? '1' : '0'); } catch { /* private window: not remembered */ } };

export function mountSidebar({ sidebar, menuBtn, scrim, main, storageKey }) {
  const collapseBtn = sidebar.querySelector('.side-collapse');
  // Desktop: collapsed to a rail, or not.
  const setCollapsed = on => {
    document.body.classList.toggle('side-collapsed', on);
    collapseBtn?.setAttribute('aria-expanded', String(!on));
    collapseBtn?.setAttribute('aria-label', on ? 'Expand the menu' : 'Collapse the menu');
  };
  setCollapsed(remembered(storageKey));
  if (collapseBtn) collapseBtn.onclick = () => { const on = !document.body.classList.contains('side-collapsed'); setCollapsed(on); remember(storageKey, on); };
  // In the rail, each link's name is its tooltip (and its accessible name stays the visible text).
  sidebar.querySelectorAll('.side-nav a, .side-nav button').forEach(a => { if (!a.dataset.tip) a.dataset.tip = a.textContent.trim(); });

  // Phone: a drawer. Closed, nothing in it can be reached; open, nothing behind it can.
  const open = (on, refocus = false) => {
    document.body.classList.toggle('menu-open', on);
    menuBtn?.setAttribute('aria-expanded', String(on));
    if (scrim) scrim.hidden = !on;
    sidebar.inert = PHONE.matches && !on;
    if (main) main.inert = on;
    if (on) sidebar.querySelector('a, button')?.focus(); else if (refocus) menuBtn?.focus();
  };
  open(false);
  PHONE.addEventListener('change', () => open(false));
  if (menuBtn) menuBtn.onclick = () => open(!document.body.classList.contains('menu-open'));
  if (scrim) scrim.onclick = () => open(false, true);
  // any link closes the drawer: one on this page (a section, a JDA's tab) would otherwise stay covered by it
  sidebar.addEventListener('click', e => { if (e.target.closest('a') && PHONE.matches) open(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.body.classList.contains('menu-open')) open(false, true); });
  return { close: () => open(false) };
}
