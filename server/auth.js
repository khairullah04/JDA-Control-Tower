import { createHash } from 'node:crypto';
import { Router } from 'express';
import { sessionEmail, setSession, clearSession } from './session.js';

// Who may use the Invoice Tracker: the email addresses in ALLOWED_EMAILS (server/.env, comma-separated).
// There is no self-registration; an administrator creates each account in the Firebase console and
// adds its address here. The same list is copied into Firestore for the database rules (access-list.js).
export const allowedEmails = () => (process.env.ALLOWED_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

// A token Google has confirmed is taken as confirmed for five minutes, or until the token itself runs
// out if that is sooner, so one page that makes ten calls asks Google once. Only who the token belongs
// to is remembered (under a hash of the token, never the token); whether that person is on the access
// list is looked at afresh on every call, and a refusal is never remembered.
const KEEP_MS = 5 * 60_000, MAX_KEPT = 1000, confirmed = new Map();
export const forgetTokens = () => confirmed.clear();
const runsOutAt = token => { try { return JSON.parse(Buffer.from(token.split('.')[1], 'base64url')).exp * 1000 || Infinity; } catch { return Infinity; } };
function remember(key, email, token, now) {
  if (confirmed.size >= MAX_KEPT) for (const [k, v] of confirmed) if (v.until <= now) confirmed.delete(k);
  if (confirmed.size >= MAX_KEPT) confirmed.clear();
  confirmed.set(key, { email, until: Math.min(now + KEEP_MS, runsOutAt(token)) });
}

// Who a Firebase ID token belongs to, checked with Google's REST API: { email } or { status, error }.
async function tokenEmail(token) {
  const key = createHash('sha256').update(token).digest('base64'), now = Date.now(), kept = confirmed.get(key);
  if (kept && kept.until > now) return { email: kept.email };
  try {
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${process.env.FIREBASE_API_KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: token }), signal: AbortSignal.timeout(15000)
    });
    if (!r.ok) {
      const reason = (await r.json().catch(() => ({}))).error?.message || '';
      if (/API key/i.test(reason)) { console.error('Sign-ins cannot be checked: FIREBASE_API_KEY in server/.env is missing or wrong. It is the apiKey in web/shared/config/firebase-config.js.'); return { status: 500, error: 'Sign-in is not set up on the server yet. Contact your administrator.' }; }
      return { status: 401, error: 'Session expired. Sign in again.' };
    }
    const email = ((await r.json()).users?.[0]?.email || '').toLowerCase();
    if (email) remember(key, email, token, now);
    return { email };
  } catch { return { status: 500, error: 'We could not check your sign-in just now. Try again in a minute.' }; }
}
// Why `email` may not come in, or '' when it may.
function refusal(email) {
  const allowed = allowedEmails();
  if (!allowed.length) { console.error('No one can sign in: ALLOWED_EMAILS in server/.env is empty.'); return 'Sign-in is not set up yet: no one is on the access list. Contact your administrator.'; }
  if (!allowed.includes(email)) return `${email || 'This account'} is not on the access list. Ask the administrator to add it.`;
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
    if (!refusal(email)) setSession(req, res, email);
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

// /api/auth: the sign-in page trades a Firebase ID token for the session cookie; sign out clears it;
// `me` tells a public page whether its visitor is signed in (to show Edit page).
export const authRoutes = Router()
  .post('/session', async (req, res) => {
    if (signInOff()) return res.json({ email: LOCAL.email });
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(400).json({ error: 'Sign in with your account first.' });
    const who = await tokenEmail(token);
    if (who.error) return res.status(who.status).json({ error: who.error });
    const no = refusal(who.email);
    if (no) return res.status(403).json({ error: no });
    setSession(req, res, who.email);
    res.json({ email: who.email });
  })
  .post('/logout', (req, res) => { clearSession(req, res); res.json({ ok: true }); })
  .get('/me', (req, res) => {
    if (signInOff()) return res.json({ signedIn: true, email: LOCAL.email, signInOff: true });
    const email = sessionEmail(req);
    res.json(email && !refusal(email) ? { signedIn: true, email } : { signedIn: false });
  });
