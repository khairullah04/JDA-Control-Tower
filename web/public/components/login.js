import { getAuth, signInWithEmailAndPassword, signOut } from '/shared/vendor/firebase-auth.js';
import { USERNAME_DOMAIN } from '/shared/config/firebase-config.js';
import { mainApp } from '/shared/lib/firebase-main.js';
import { nextPath, startSession, me } from '/shared/lib/session.js';

// Employee sign-in. A correct password is not enough: the server also checks the account is on the
// access list (ALLOWED_EMAILS) before it hands out the session cookie.
const auth = getAuth(mainApp());
const $ = id => document.getElementById(id);
const next = nextPath(new URLSearchParams(location.search).get('next'), { hash: location.hash });
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
  'auth/invalid-credential': 'That username and password do not match.', 'auth/wrong-password': 'That username and password do not match.',
  'auth/user-not-found': 'That username and password do not match.', 'auth/invalid-email': 'Enter a username or an email address.',
  'auth/too-many-requests': 'Too many tries. Wait a few minutes, then try again.', 'auth/network-request-failed': 'No connection to the sign-in service. Check the network and try again.',
  'auth/user-disabled': 'This account is switched off. Contact your administrator.'
};

async function enter(user) {
  try { await startSession(user); location.replace(next); }
  catch (e) { await signOut(auth); busy(false); msg(e.message); }
}

$('login-form').onsubmit = async e => {
  e.preventDefault();
  if (!$('username').value.trim()) return msg('Enter your username.', 'username');
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
else $('username').focus();
