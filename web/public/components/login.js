import { getAuth, signInWithEmailAndPassword, signOut, sendEmailVerification } from '/shared/vendor/firebase-auth.js';
import { USERNAME_DOMAIN } from '/shared/config/firebase-config.js';
import { mainApp } from '/shared/lib/firebase-main.js';
import { nextPath, startSession, me } from '/shared/lib/session.js';

// Sign in, create an account, reset a password. A correct password is not enough: the server also
// checks the address is a verified @petronas.com one (or on the list of exceptions) before it hands
// out the session cookie. Creating an account and resetting a password go through the server
// (/api/auth/signup, /api/auth/reset), which checks the domain; Firebase sends the emails.
const auth = getAuth(mainApp());
const $ = id => document.getElementById(id);
const next = nextPath(new URLSearchParams(location.search).get('next'), { hash: ['#signup', '#reset'].includes(location.hash) ? '' : location.hash });
// Errors in the alert line, marking the fields; progress in the status line; the button says what is happening.
function msg(text, field) {
  $('login-msg').textContent = ''; $('login-status').textContent = '';
  for (const id of ['username', 'password']) $(id).removeAttribute('aria-invalid');
  requestAnimationFrame(() => { $('login-msg').textContent = text; }); // set after clearing, so the same message is announced again
  if (text && field) { $(field).setAttribute('aria-invalid', 'true'); $(field).focus(); }
}
function busy(on, text = '') {
  $('login-btn').disabled = on; $('login-btn').textContent = on ? 'Signing in…' : 'Sign in';
  $('login-form').setAttribute('aria-busy', String(on)); $('login-status').textContent = text;
}
const toEmail = name => name.includes('@') ? name.trim().toLowerCase() : `${name.trim().toLowerCase()}@${USERNAME_DOMAIN}`;
const REASONS = {
  'auth/invalid-credential': 'That email and password do not match.', 'auth/wrong-password': 'That email and password do not match.',
  'auth/user-not-found': 'That email and password do not match.', 'auth/invalid-email': 'Enter your email address.',
  'auth/too-many-requests': 'Too many tries. Wait a few minutes, then try again.', 'auth/network-request-failed': 'No connection to the sign-in service. Check the network and try again.',
  'auth/user-disabled': 'This account is switched off. Contact your administrator.'
};

// Not verified yet: the server says so; the person may ask for the link again before being signed out.
let unverified = null;
async function enter(user) {
  try { await startSession(user); location.replace(next); }
  catch (e) {
    busy(false); msg(e.message);
    if (/not verified/.test(e.message)) { unverified = user; $('resend-btn').hidden = false; }
    else await signOut(auth);
  }
}
$('resend-btn').onclick = async () => {
  if (!unverified) return;
  try { await sendEmailVerification(unverified); $('resend-btn').hidden = true; msg(''); $('login-status').textContent = 'Sent. Open the link in the email, then sign in again.'; }
  catch (err) { msg(REASONS[err.code] || 'The email could not be sent just now. Try again in a few minutes.'); }
  finally { await signOut(auth); unverified = null; }
};

// The three forms on this page: sign in, create an account, reset a password (#signup, #reset).
const VIEWS = { login: 'login-form', signup: 'signup-form', reset: 'reset-form' };
function show(view) {
  for (const [v, id] of Object.entries(VIEWS)) $(id).hidden = v !== view;
  $(VIEWS[view]).querySelector('input')?.focus();
}
addEventListener('hashchange', () => show(VIEWS[location.hash.slice(1)] ? location.hash.slice(1) : 'login'));
document.addEventListener('click', e => { const a = e.target.closest('[data-view]'); if (a) { e.preventDefault(); history.replaceState(null, '', a.dataset.view === 'login' ? location.pathname + location.search : '#' + a.dataset.view); show(a.dataset.view); } });
// Sends one of the two forms to the server; its answer goes in the form's status line.
async function ask(form, path, body, done) {
  const btn = form.querySelector('button.primary'), say = (id, t) => { form.querySelector(id).textContent = t; };
  say('.msg[role=alert]', ''); say('.msg.ok', ''); btn.disabled = true;
  try {
    const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) { say('.msg[role=alert]', out.error || `That did not go through (error ${res.status}).`); if (out.field) form.elements[out.field]?.focus(); return; }
    say('.msg.ok', out.message); done?.();
  } catch { say('.msg[role=alert]', 'No connection to the server. Check the network and try again.'); }
  finally { btn.disabled = false; }
}
const PETRONAS = /^[^@\s]+@petronas\.com$/i;
$('signup-form').onsubmit = e => {
  e.preventDefault();
  const f = e.target.elements, email = f.email.value.trim(), say = t => { $('signup-msg').textContent = t; };
  if (!PETRONAS.test(email)) { f.email.focus(); return say('Use your @petronas.com email address.'); }
  if (f.password.value.length < 10 || !/[a-z]/i.test(f.password.value) || !/\d/.test(f.password.value)) { f.password.focus(); return say('Use at least 10 characters, with letters and a digit.'); }
  if (f.password.value !== f.again.value) { f.again.focus(); return say('The two passwords are not the same.'); }
  ask(e.target, '/api/auth/signup', { email, password: f.password.value }, () => { f.password.value = f.again.value = ''; });
};
$('reset-form').onsubmit = e => {
  e.preventDefault();
  const email = e.target.elements.email.value.trim();
  if (!email.includes('@')) { e.target.elements.email.focus(); return void ($('reset-msg').textContent = 'Enter your email address.'); }
  ask(e.target, '/api/auth/reset', { email });
};

$('login-form').onsubmit = async e => {
  e.preventDefault();
  if (!$('username').value.trim()) return msg('Enter your email.', 'username');
  $('resend-btn').hidden = true;
  if (!$('password').value) return msg('Enter your password.', 'password');
  msg(''); busy(true);
  try { await enter((await signInWithEmailAndPassword(auth, toEmail($('username').value), $('password').value)).user); }
  catch (err) { busy(false); msg(REASONS[err.code] || 'Sign-in did not go through. Try again, or contact your administrator.', 'password'); }
};

// Already signed in (both the session cookie and Firebase, which the private pages need): straight on.
// Still signed in to Firebase, but the cookie has run out: a new cookie without typing the password again.
const status = await me();
await auth.authStateReady();
if (status.signInOff || (status.signedIn && auth.currentUser)) location.replace(next);
else if (auth.currentUser) { busy(true, 'Signing you in…'); enter(auth.currentUser); }
else if (VIEWS[location.hash.slice(1)]) show(location.hash.slice(1));
else $('username').focus();
