import { createHash } from 'node:crypto';
import { Router } from 'express';
import { sessionEmail, setSession, clearSession } from './session.js';
import { rateLimit } from './rate-limit.js';

// Who may use the JDA Control Tower: anyone with a verified @petronas.com address, who signs up on
// /login (the verification link Firebase emails proves they own the inbox). ALLOWED_EMAILS (comma-
// separated) is only for exceptions outside that domain, such as an administrator's own account; it
// is copied into Firestore for the database rules (access-list.js), which check the domain too
// (firebase/firestore.rules: keep the domain there the same as SIGNUP_DOMAIN).
export const SIGNUP_DOMAIN = 'petronas.com';
export const allowedEmails = () => (process.env.ALLOWED_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
export const inDomain = email => { const m = /^[^@\s]+@([^@\s]+)$/.exec(String(email || '').trim().toLowerCase()); return !!m && m[1] === SIGNUP_DOMAIN; };

// A token Google has confirmed is taken as confirmed for five minutes, or until the token itself runs
// out if that is sooner, so one page that makes ten calls asks Google once. Only who the token belongs
// to is remembered (under a hash of the token, never the token); whether that person is on the access
// list is looked at afresh on every call, and a refusal is never remembered.
const KEEP_MS = 5 * 60_000, MAX_KEPT = 1000, confirmed = new Map();
const google = (method, body) => fetch(`https://identitytoolkit.googleapis.com/v1/accounts:${method}?key=${process.env.FIREBASE_API_KEY}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
export const forgetTokens = () => confirmed.clear();
const runsOutAt = token => { try { return JSON.parse(Buffer.from(token.split('.')[1], 'base64url')).exp * 1000 || Infinity; } catch { return Infinity; } };
function remember(key, email, verified, token, now) {
  if (confirmed.size >= MAX_KEPT) for (const [k, v] of confirmed) if (v.until <= now) confirmed.delete(k);
  if (confirmed.size >= MAX_KEPT) confirmed.clear();
  confirmed.set(key, { email, verified, until: Math.min(now + KEEP_MS, runsOutAt(token)) });
}

// Who a Firebase ID token belongs to, checked with Google's REST API: { email, verified } or { status, error }.
async function tokenEmail(token) {
  const key = createHash('sha256').update(token).digest('base64'), now = Date.now(), kept = confirmed.get(key);
  if (kept && kept.until > now) return { email: kept.email, verified: kept.verified };
  try {
    const r = await google('lookup', { idToken: token });
    if (!r.ok) {
      const reason = (await r.json().catch(() => ({}))).error?.message || '';
      if (/API key/i.test(reason)) { console.error('Sign-ins cannot be checked: FIREBASE_API_KEY in server/.env is missing or wrong. It is the apiKey in web/shared/config/firebase-config.js.'); return { status: 500, error: 'Sign-in is not set up on the server yet. Contact your administrator.' }; }
      return { status: 401, error: 'Session expired. Sign in again.' };
    }
    const u = (await r.json()).users?.[0] || {}, email = (u.email || '').toLowerCase(), verified = u.emailVerified === true;
    if (email) remember(key, email, verified, token, now);
    return { email, verified };
  } catch { return { status: 500, error: 'We could not check your sign-in just now. Try again in a minute.' }; }
}
// Why `email` may not come in, or '' when it may. `verified` is false for an address whose
// verification link has not been clicked yet (a session cookie is only given once it has been).
export const NOT_VERIFIED = 'Your email address is not verified yet. Click the link in the email we sent you, then sign in again.';
function refusal(email, { verified } = {}) {
  if (allowedEmails().includes(email)) return '';
  if (!inDomain(email)) return `Only @${SIGNUP_DOMAIN} addresses can use the JDA Control Tower.`;
  if (verified === false) return NOT_VERIFIED;
  return '';
}
const signInOff = () => process.env.REQUIRE_AUTH === 'false';
const userOf = email => ({ email, name: email.split('@')[0] }); // who made a change, for the audit log
const LOCAL = userOf('local@sign-in-off');

// Every private API call: the session cookie set at /login, or a Firebase ID token as
// "Authorization: Bearer ...". The pages send both, so a save still goes through after the cookie
// has run out while the person was working: the token is checked and the cookie renewed. Either way
// the person must still be on the access list, which is looked at afresh on every call.
export async function requireUser(req, res, next) {
  // A change must come as JSON: a form or a text/plain post from another site (which the browser
  // could send with the cookie) is refused before anything else. GET, HEAD and OPTIONS change nothing.
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !/^application\/json\b/i.test(req.headers['content-type'] || ''))
    return res.status(415).json({ error: 'Send changes as JSON (Content-Type: application/json).' });
  if (signInOff()) { req.user = LOCAL; return next(); }
  let email = sessionEmail(req);
  if (!email) {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Not signed in', signIn: true });
    const who = await tokenEmail(token);
    if (who.error) return res.status(who.status).json({ error: who.error, signIn: who.status === 401 });
    email = who.email;
    const no = refusal(email, who);
    if (no) return res.status(403).json({ error: no, verify: no === NOT_VERIFIED });
    setSession(req, res, email);
  }
  const no = refusal(email);
  if (no) return res.status(403).json({ error: no });
  req.user = userOf(email);
  next();
}

// Every private page and file: without a valid session, the browser is sent to /login, which
// brings it back here afterwards.
export function requirePage(req, res, next) {
  if (signInOff()) { req.user = LOCAL; return next(); }
  const email = sessionEmail(req);
  if (email && !refusal(email)) { req.user = userOf(email); return next(); }
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(401).json({ error: 'Not signed in', signIn: true });
  res.redirect(302, `/login?next=${encodeURIComponent(req.originalUrl)}`);
}

// Sign up: an @petronas.com address only, checked here (the page checks too, but cannot be trusted).
// The account is made in Firebase and Firebase emails the verification link; nothing opens until it
// has been clicked. Whether the address already had an account is not said (the answer is the same),
// so nobody can use this to find out who has one. Password: 10 or more characters, letters and digits.
export const passwordProblem = p => typeof p !== 'string' || p.length < 10 ? 'Use a password of at least 10 characters.'
  : p.length > 128 ? 'Use a password of at most 128 characters.' : !/[a-z]/i.test(p) || !/\d/.test(p) ? 'Use letters and at least one digit in the password.' : '';
const SENT = 'If this address can be used, a verification link is on its way to it. Open it, then sign in. Already have an account? Sign in, or reset your password.';
async function signUp(req, res) {
  const email = String(req.body?.email || '').trim().toLowerCase(), password = req.body?.password;
  if (!inDomain(email)) return res.status(400).json({ error: `Sign up with your @${SIGNUP_DOMAIN} email address.`, field: 'email' });
  const weak = passwordProblem(password);
  if (weak) return res.status(400).json({ error: weak, field: 'password' });
  try {
    const r = await google('signUp', { email, password, returnSecureToken: true }), out = await r.json().catch(() => ({}));
    if (!r.ok) {
      const reason = out.error?.message || '';
      if (/^EMAIL_EXISTS/.test(reason)) return res.json({ message: SENT });
      if (/^WEAK_PASSWORD|PASSWORD_DOES_NOT_MEET/.test(reason)) return res.status(400).json({ error: 'That password is too weak. Use a longer one, with letters and digits.', field: 'password' });
      if (/^TOO_MANY_ATTEMPTS/.test(reason)) return res.status(429).json({ error: 'Too many tries. Wait a few minutes, then try again.' });
      console.error('Sign-up refused by Firebase:', reason);
      return res.status(502).json({ error: 'The account could not be made just now. Try again later, or contact your administrator.' });
    }
    const sent = await google('sendOobCode', { requestType: 'VERIFY_EMAIL', idToken: out.idToken });
    if (!sent.ok) console.error('Verification email not sent:', (await sent.json().catch(() => ({}))).error?.message);
    res.json({ message: SENT });
  } catch { res.status(500).json({ error: 'We could not reach the sign-up service. Try again in a minute.' }); }
}
// Forgotten password: Firebase emails a reset link, for an address that may use the system. The
// answer is the same whether or not the address has an account.
async function resetPassword(req, res) {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!email.includes('@')) return res.status(400).json({ error: 'Enter your email address.', field: 'email' });
  const message = 'If this address has an account, a link to set a new password is on its way to it.';
  if (!inDomain(email) && !allowedEmails().includes(email)) return res.json({ message });
  try {
    const r = await google('sendOobCode', { requestType: 'PASSWORD_RESET', email });
    if (!r.ok) { const reason = (await r.json().catch(() => ({}))).error?.message || ''; if (!/^EMAIL_NOT_FOUND/.test(reason)) console.error('Reset email not sent:', reason); }
    res.json({ message });
  } catch { res.status(500).json({ error: 'We could not reach the sign-in service. Try again in a minute.' }); }
}
const slowly = rateLimit({ windowMs: 15 * 60_000, max: 5, what: 'tries' });

// /api/auth: the sign-in page trades a Firebase ID token for the session cookie; sign out clears it;
// `me` tells a public page whether its visitor is signed in (to show Edit page); sign up; reset password.
export const authRoutes = Router()
  .post('/signup', slowly, signUp)
  .post('/reset', slowly, resetPassword)
  .post('/session', async (req, res) => {
    if (signInOff()) return res.json({ email: LOCAL.email });
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(400).json({ error: 'Sign in with your account first.' });
    const who = await tokenEmail(token);
    if (who.error) return res.status(who.status).json({ error: who.error });
    const no = refusal(who.email, who);
    if (no) return res.status(403).json({ error: no, verify: no === NOT_VERIFIED });
    setSession(req, res, who.email);
    res.json({ email: who.email });
  })
  .post('/logout', (req, res) => { clearSession(req, res); res.json({ ok: true }); })
  .get('/me', (req, res) => {
    if (signInOff()) return res.json({ signedIn: true, email: LOCAL.email, signInOff: true });
    const email = sessionEmail(req);
    res.json(email && !refusal(email) ? { signedIn: true, email } : { signedIn: false });
  });
