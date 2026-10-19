import { logout, onUser, usernameOf } from './services/auth.js';
import { renderProject } from './ui/project.js';
import { renderJda } from './ui/jda.js';
import { renderCji3 } from './ui/cji3.js';
import { renderPaymentsPage } from './ui/payments.js';
import { renderApprovals } from './ui/approvals.js';
import { initCopilot, refreshCopilot } from './ui/copilot.js';
import { $ } from './ui/dom.js';
import { show } from './ui/render.js';
import { toLogin, me } from '../../../shared/lib/session.js';
import { mountCtSidebar } from '../../components/ct-sidebar.js';
import { jdaNav } from '../../components/ct-topbar.js';
import { JDAS } from '../../../shared/config/jdas.js';
import { jdaNameKey } from '../../lib/jda-figures.js';
import { listJdas } from './services/db.js';
import { esc } from './ui/dom.js';

// The tracker's pages. Its old front page (a card per JDA) is the JDA Control Tower landing page now.
const sidebar = mountCtSidebar({ wrap: $('#app-view'), bar: $('.topbar') });
async function route() {
  const [, kind, id, sub] = location.hash.slice(1).split('/');
  sidebar.mark(`/control-tower/invoices/#/${kind}`);
  $('#jdaNavSlot').replaceChildren();
  // /control-tower/<jda>/invoices arrives as #/named/<JDA name>: the tracker's JDA of that name.
  if (kind === 'named') {
    const name = decodeURIComponent(id || ''), hit = (await listJdas()).find(j => sameName(j.name, name));
    if (hit) return location.replace(`#/jda/${hit.id}`);
    $('#page').innerHTML = `<div class="card"><h2>${esc(name)} is not in the Invoice Tracker yet</h2><p>Add it with "+ Add JDA (invoices)" on the <a href="/control-tower/">Control Tower</a>, then its projects and invoices.</p></div>`;
    const ct = JDAS.find(j => sameName(j.name, name));
    if (ct) $('#jdaNavSlot').replaceChildren(jdaNav(ct, 'invoices', { tabs: true }));
    return;
  }
  if (kind === 'approvals') { $('#page').classList.add('wide'); await show(() => renderApprovals(id || 'intake', sub || '')); refreshCopilot(); return; }
  if (!['project', 'jda', 'cji3', 'payments'].includes(kind) || ((kind === 'project' || kind === 'jda') && !id)) return location.replace('/control-tower/');
  $('#page').classList.toggle('wide', kind === 'cji3' || kind === 'payments'); // the two wide tables get the whole window
  await show(kind === 'project' && id ? () => renderProject(id) : kind === 'jda' && id ? () => renderJda(id)
    : kind === 'cji3' ? () => renderCji3(id, sub) : () => renderPaymentsPage(id, sub));
  refreshCopilot();
  // A JDA's page here, and its CJI3 register and Payment Table, are its "Invoices & payments": the
  // breadcrumb, its other pages and the JDA tabs.
  if (['jda', 'cji3', 'payments'].includes(kind) && id) {
    const tracked = (await listJdas()).find(j => j.id === id), ct = tracked && JDAS.find(j => sameName(j.name, tracked.name));
    if (ct) $('#jdaNavSlot').replaceChildren(jdaNav(ct, 'invoices', { tabs: true }));
  }
}
const sameName = (a, b) => jdaNameKey(a) === jdaNameKey(b);

$('#logout-btn').onclick = logout;
initCopilot();
window.addEventListener('hashchange', route);

// The server only sends this page to someone signed in to the JDA Control Tower (/login). The page
// also needs that person's Firebase sign-in, which /login made, to read JDAs and projects; if it has
// gone (signed out in another tab), /login is asked again and brings the person back here.
onUser(user => {
  if (!user) return me().then(m => m.signInOff ? showApp('Sign-in off (local)') : toLogin());
  showApp(`Signed in as ${usernameOf(user)}`);
});
function showApp(who) {
  $('#whoami').textContent = who;
  $('#app-view').hidden = false;
  route();
}
