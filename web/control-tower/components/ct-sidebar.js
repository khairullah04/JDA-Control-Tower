// The Control Tower's sidebar, the same on every private page (its landing page, a JDA's pages and the
// Invoice Tracker): the Control Tower, each JDA, the tracker's two registers and the public site. It is
// drawn here so the pages only need the stylesheet (/shared/styles/sidebar.css), a wrapper to sit
// beside it (`wrap`) and a top bar to hold the phone's menu button (`bar`).
import { esc } from '/shared/lib/esc.js';
import { JDAS, DEFAULT_JDA_ICON } from '/shared/config/jdas.js';
import { mountSidebar } from '/shared/components/sidebar.js';

const svg = d => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const ICON = {
  home: '<path d="M4 11.5 12 4l8 7.5"/><path d="M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9"/>',
  cji3: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  pay: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
  site: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  collapse: '<path d="m15 6-6 6 6 6"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>'
};

// `current`: 'home', a JDA's id, 'cji3' or 'payments', marked as the page you are on.
export function mountCtSidebar({ wrap, bar, current = '' }) {
  const link = (href, key, label, icon, extra = '') => `<a href="${esc(href)}"${key === current ? ' aria-current="page"' : ''}${extra}>${svg(icon)}<span>${esc(label)}</span></a>`;
  const aside = document.createElement('aside');
  Object.assign(aside, { className: 'sidebar', id: 'sidebar' });
  aside.setAttribute('aria-label', 'Control Tower');
  aside.innerHTML = `
    <div class="side-top">
      <a class="brand" href="/control-tower/"><span class="brand-mark" aria-hidden="true">T</span><span class="brand-text"><span class="brand-name">TriCipta AI</span><span class="brand-sub">JDA Control Tower</span></span></a>
      <button type="button" class="side-collapse" aria-expanded="true" aria-controls="sidebar" aria-label="Collapse the menu">${svg(ICON.collapse)}</button>
    </div>
    <nav class="side-nav" aria-label="Control Tower">
      ${link('/control-tower/', 'home', 'Control Tower', ICON.home)}
      <p class="side-label">JDAs</p>
      ${JDAS.map(j => link(`/control-tower/${j.id}/overall-progress`, j.id, j.name, j.icon || DEFAULT_JDA_ICON)).join('')}
      <p class="side-label">Public site</p>
      ${link('/control-tower/site', 'site', 'Edit public site', '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>')}
      <p class="side-label">Invoice Tracker</p>
      ${link('/control-tower/invoices/#/cji3', 'cji3', 'CJI3 register', ICON.cji3)}
      ${link('/control-tower/invoices/#/payments', 'payments', 'Payment tables', ICON.pay)}
    </nav>
    <nav class="side-nav side-foot" aria-label="Elsewhere">
      ${link('/', '', 'View public site', ICON.site, ' target="_blank" rel="noopener"')}
    </nav>`;
  const scrim = Object.assign(document.createElement('div'), { className: 'scrim', hidden: true });
  const menuBtn = Object.assign(document.createElement('button'), { type: 'button', className: 'menu-btn' });
  menuBtn.setAttribute('aria-controls', 'sidebar');
  menuBtn.innerHTML = `${svg(ICON.menu)}<span class="visually-hidden">Menu</span>`;
  document.body.prepend(aside, scrim);
  bar?.prepend(menuBtn);
  wrap.classList.add('with-side');
  document.body.classList.add('has-side');
  const links = [...aside.querySelectorAll('.side-nav a')];
  // Pages whose place changes without loading again (the tracker's registers) mark it with this.
  const mark = href => links.forEach(a => a.getAttribute('href') === href ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
  return { ...mountSidebar({ sidebar: aside, menuBtn, scrim, main: wrap, storageKey: 'ct.sidebar.collapsed' }), mark };
}
