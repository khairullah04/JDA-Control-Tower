import { login, register, logout, onUser, usernameOf } from './services/auth.js';
import { renderDashboard } from './ui/dashboard.js';
import { renderProject } from './ui/project.js';
import { renderJda } from './ui/jda.js';
import { initCopilot, refreshCopilot } from './ui/copilot.js';
import { $ } from './ui/dom.js';
import { config } from './config/index.js';

async function route() {
  const [, kind, id] = location.hash.slice(1).split('/');
  try {
    if (kind === 'project' && id) await renderProject(id);
    else if (kind === 'jda' && id) await renderJda(id);
    else await renderDashboard();
  } catch (e) { $('#page').innerHTML = `<p class="msg">Could not load: ${e.message}</p>`; }
  refreshCopilot();
}

async function authAction(fn) {
  const msg = $('#login-msg'); msg.textContent = '';
  try { await fn($('#username').value, $('#password').value); }
  catch (e) { msg.textContent = e.message.replace('Firebase: ', ''); }
}

$('#login-form').onsubmit = e => { e.preventDefault(); authAction(login); };
$('#register-btn').onclick = () => authAction(register);
$('#logout-btn').onclick = logout;
document.querySelectorAll('[data-portal-link]').forEach(a => a.href = config.portalUrl);
initCopilot();
window.addEventListener('hashchange', route);

if (config.requireLogin) {
  onUser(user => {
    $('#login-view').hidden = !!user;
    $('#app-view').hidden = !user;
    if (user) { $('#whoami').textContent = usernameOf(user); route(); }
  });
} else { // login skipped: go straight to the app
  $('#login-view').hidden = true;
  $('#app-view').hidden = false;
  $('#whoami').hidden = $('#logout-btn').hidden = true;
  route();
}
