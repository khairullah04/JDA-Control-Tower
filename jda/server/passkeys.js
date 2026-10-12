import crypto from 'node:crypto';
import fs from 'node:fs';

// Passkeys are checked here, on the server: one per JDA for the portal's editors, and "admin" for
// the Invoice Tracker. They live in portal-passkeys.json (read on every check, so a change needs
// no restart). The browser never holds a passkey: a correct one is exchanged for a signed session
// token, and that token is what each protected request presents.
export const ADMIN = 'admin';
const SESSION_MS = 8 * 60 * 60 * 1000;
const MAX_TRIES = 5, LOCKOUT_MS = 60_000;
const tries = {};

// PASSKEYS_FILE names another file to read them from (a deployment's own location; the tests' fixture).
const passkeysFile = () => process.env.PASSKEYS_FILE || new URL('./portal-passkeys.json', import.meta.url);
export function passkeyFor(scope) {
  try { const v = JSON.parse(fs.readFileSync(passkeysFile(), 'utf8'))[scope]; return typeof v === 'string' && v ? v : null; }
  catch { return null; }
}

const SECRET = crypto.randomBytes(32); // per process: a restart signs everyone out
// The passkey is part of what is signed, so changing a passkey ends its open sessions.
const sign = (scope, exp, passkey) => crypto.createHmac('sha256', SECRET).update(`${scope}|${exp}|${passkey}`).digest('hex');
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

export function validToken(token, scope) {
  const [id, exp, mac] = String(token || '').split('.');
  const passkey = passkeyFor(scope);
  return !!passkey && id === scope && Number(exp) > Date.now() && same(mac, sign(scope, exp, passkey));
}

// POST { jdaId, passkey } -> { token }. `jdaId` is a JDA's id, or "admin" for the Invoice Tracker.
export function unlock(req, res) {
  const { jdaId, passkey } = req.body || {};
  if (typeof jdaId !== 'string' || typeof passkey !== 'string') return res.status(400).json({ error: 'Which JDA?' });
  const expected = passkeyFor(jdaId);
  if (!expected) return res.status(503).json({ error: `No passkey is set for ${jdaId} in server/portal-passkeys.json` });
  const key = `${req.ip}|${jdaId}`, t = tries[key] || (tries[key] = { n: 0, until: 0 });
  if (t.until > Date.now()) return res.status(429).json({ error: 'Too many wrong passkeys. Try again in a minute.' });
  if (!same(passkey, expected)) {
    if (++t.n >= MAX_TRIES) { t.n = 0; t.until = Date.now() + LOCKOUT_MS; }
    return res.status(401).json({ error: 'Incorrect passkey.' });
  }
  delete tries[key];
  const exp = Date.now() + SESSION_MS;
  res.json({ token: `${jdaId}.${exp}.${sign(jdaId, exp, expected)}` });
}
