import { createHash } from 'node:crypto';

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

// Only signed-in users on the access list may call the API (AI, Drive, invoices and payments).
// Verifies the Firebase ID token via Google's REST API.
export async function requireUser(req, res, next) {
  if (process.env.REQUIRE_AUTH === 'false') return next();
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Not signed in' });
  try {
    const key = createHash('sha256').update(token).digest('base64'), now = Date.now(), kept = confirmed.get(key);
    if (kept && kept.until > now) return admit(kept.email, req, res, next);
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${process.env.FIREBASE_API_KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: token }), signal: AbortSignal.timeout(15000)
    });
    if (!r.ok) {
      const reason = (await r.json().catch(() => ({}))).error?.message || '';
      if (/API key/i.test(reason)) return res.status(500).json({ error: 'The server cannot check sign-ins: FIREBASE_API_KEY in server/.env is missing or wrong. It is the apiKey in shared/firebase-config.js.' });
      return res.status(401).json({ error: 'Session expired. Sign in again.' });
    }
    const email = ((await r.json()).users?.[0]?.email || '').toLowerCase();
    if (email) remember(key, email, token, now);
    admit(email, req, res, next);
  } catch { res.status(500).json({ error: 'Auth check failed' }); }
}
function admit(email, req, res, next) {
  const allowed = allowedEmails();
  if (!allowed.length) return res.status(403).json({ error: 'No one is on the access list yet. The administrator must set ALLOWED_EMAILS in server/.env.' });
  if (!allowed.includes(email)) return res.status(403).json({ error: `${email || 'This account'} is not on the access list. Ask the administrator to add it.` });
  req.user = { email, name: email.split('@')[0] }; // who made a change, for the audit log
  next();
}
