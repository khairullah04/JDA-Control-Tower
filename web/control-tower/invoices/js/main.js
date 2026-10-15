import { logout, onUser, usernameOf } from './services/auth.js';
import { renderProject } from './ui/project.js';
import { renderJda } from './ui/jda.js';
import { renderCji3 } from './ui/cji3.js';
import { renderPaymentsPage } from './ui/payments.js';
import { initCopilot, refreshCopilot } from './ui/copilot.js';
import { $ } from './ui/dom.js';
import { show } from './ui/render.js';
import { toLogin, me } from '../../../shared/lib/session.js';
import { mountCtSidebar } from '../../components/ct-sidebar.js';

// The tracker's pages. Its old front page (a card per JDA) is the JDA Control Tower landing page now.
const sidebar = mountCtSidebar({ wrap: $('#app-view'), bar: $('.topbar') });
async function route() {
  const [, kind, id, sub] = location.hash.slice(1).split('/');
  sidebar.mark(`/control-tower/invoices/#/${kind}`);
  if (!['project', 'jda', 'cji3', 'payments'].includes(kind) || ((kind === 'project' || kind === 'jda') && !id)) return location.replace('/control-tower/');
  $('#page').classList.toggle('wide', kind === 'cji3' || kind === 'payments'); // the two wide tables get the whole window
  await show(kind === 'project' && id ? () => renderProject(id) : kind === 'jda' && id ? () => renderJda(id)
    : kind === 'cji3' ? () => renderCji3(id, sub) : () => renderPaymentsPage(id, sub));
  refreshCopilot();
}

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
