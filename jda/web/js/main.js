import { login, logout, onUser, usernameOf } from './services/auth.js';
import { renderDashboard } from './ui/dashboard.js';
import { renderProject } from './ui/project.js';
import { renderJda } from './ui/jda.js';
import { renderCji3 } from './ui/cji3.js';
import { renderPaymentsPage } from './ui/payments.js';
import { session, unlock } from './services/finance.js';
import { initCopilot, refreshCopilot } from './ui/copilot.js';
import { $ } from './ui/dom.js';
import { config } from './config/index.js';

async function route() {
  const [, kind, id, sub] = location.hash.slice(1).split('/');
  $('#page').classList.toggle('wide', kind === 'cji3' || kind === 'payments'); // the two wide tables get the whole window
  try {
    if (kind === 'project' && id) await renderProject(id);
    else if (kind === 'jda' && id) await renderJda(id);
    else if (kind === 'cji3') await renderCji3(id, sub);
    else if (kind === 'payments') await renderPaymentsPage(id, sub);
    else await renderDashboard();
  } catch (e) { $('#page').innerHTML = '<p class="msg"></p>'; $('#page').firstChild.textContent = `Could not load: ${e.message}`; }
  refreshCopilot();
}

async function authAction(fn) {
  const msg = $('#login-msg'); msg.textContent = '';
  try { await fn($('#username').value, $('#password').value); }
  catch (e) { msg.textContent = e.message.replace('Firebase: ', ''); }
}

$('#login-form').onsubmit = e => { e.preventDefault(); authAction(login); };
$('#logout-btn').onclick = logout;
document.querySelectorAll('[data-portal-link]').forEach(a => a.href = config.portalUrl);
initCopilot();
window.addEventListener('hashchange', route);

// Signed in (or sign-in is off): invoices and payments are for passkey holders only, so the app
// opens once the server has confirmed a passkey session. The portal's Administration card starts
// one; arriving any other way, the passkey is asked for here.
async function enter() {
  let ok = false;
  try { ok = await session(); $('#passkey-msg').textContent = ''; }
  catch (e) { $('#passkey-msg').textContent = e.message; }
  $('#passkey-view').hidden = ok;
  $('#app-view').hidden = !ok;
  if (ok) route(); else $('#passkey').focus();
}
$('#passkey-form').onsubmit = async e => {
  e.preventDefault();
  try { await unlock($('#passkey').value); $('#passkey').value = ''; enter(); }
  catch (err) { $('#passkey-msg').textContent = err.message; }
};
window.addEventListener('finance-locked', enter); // the passkey session ended while the app was open

if (config.requireLogin) {
  onUser(user => {
    $('#login-view').hidden = !!user;
    if (user) { $('#whoami').textContent = usernameOf(user); enter(); }
    else $('#app-view').hidden = $('#passkey-view').hidden = true;
  });
} else { // login skipped: go straight to the passkey check
  $('#login-view').hidden = true;
  $('#whoami').hidden = $('#logout-btn').hidden = true;
  enter();
}
