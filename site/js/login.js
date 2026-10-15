import { initializeApp } from '/shared/vendor/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, signOut } from '/shared/vendor/firebase-auth.js';
import { firebaseConfig, USERNAME_DOMAIN } from '/shared/firebase-config.js';
import { nextPath, startSession, me } from '/shared/session.js';

// Employee sign-in. A correct password is not enough: the server also checks the account is on the
// access list (ALLOWED_EMAILS) before it hands out the session cookie.
const auth = getAuth(initializeApp(firebaseConfig));
const $ = id => document.getElementById(id);
const next = nextPath(new URLSearchParams(location.search).get('next'));
const msg = text => { $('login-msg').textContent = text; };
const toEmail = name => name.includes('@') ? name.trim().toLowerCase() : `${name.trim().toLowerCase()}@${USERNAME_DOMAIN}`;
const REASONS = {
  'auth/invalid-credential': 'That username and password do not match.', 'auth/wrong-password': 'That username and password do not match.',
  'auth/user-not-found': 'That username and password do not match.', 'auth/invalid-email': 'Enter a username or an email address.',
  'auth/too-many-requests': 'Too many tries. Wait a few minutes, then try again.', 'auth/network-request-failed': 'No connection to the sign-in service. Check the network and try again.'
};

async function enter(user) {
  try { await startSession(user); location.replace(next); }
  catch (e) { await signOut(auth); msg(e.message); $('login-btn').disabled = false; }
}

$('login-form').onsubmit = async e => {
  e.preventDefault();
  if (!$('username').value.trim() || !$('password').value) return msg('Enter your username and password.');
  $('login-btn').disabled = true; msg('');
  try { await enter((await signInWithEmailAndPassword(auth, toEmail($('username').value), $('password').value)).user); }
  catch (err) { msg(REASONS[err.code] || err.message.replace('Firebase: ', '')); $('login-btn').disabled = false; }
};

// Already signed in (both the session cookie and Firebase, which the private pages need): straight on.
// Still signed in to Firebase, but the cookie has run out: a new cookie without typing the password again.
const status = await me();
await auth.authStateReady();
if (status.signInOff || (status.signedIn && auth.currentUser)) location.replace(next);
else if (auth.currentUser) { msg('Signing you in…'); $('login-btn').disabled = true; enter(auth.currentUser); }
else $('username').focus();
