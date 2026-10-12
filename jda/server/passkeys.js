import crypto from 'node:crypto';
import fs from 'node:fs';

// Passkeys are checked here, on the server: one per JDA for the portal's editors, and "admin" for
// the Invoice Tracker. They live in portal-passkeys.json (read on every check, so a change needs
// no restart). The browser never holds a passkey: a correct one is exchanged for a signed session
// token, and that token is what each protected request presents.
//
// The file is not in git: copy portal-passkeys.example.json to portal-passkeys.json and put your
// own passkeys in. One shorter than MIN_LENGTH, or still an example value, is treated as not set,
// and the server refuses to start while the file holds one.
export const ADMIN = 'admin';
export const MIN_LENGTH = 8;
const SESSION_MS = 8 * 60 * 60 * 1000;
const MAX_TRIES = 5, LOCKOUT_MS = 60_000;      // per address: five wrong tries, then a minute's wait
const FREE_FAILS = 10, MAX_WAIT_MS = 15 * 60_000; // per passkey, whatever the address: see `slowDown`
const tries = {}, scopes = {};

// PASSKEYS_FILE names another file to read them from (a deployment's own location; the tests' fixture).
const passkeysFile = () => process.env.PASSKEYS_FILE || new URL('./portal-passkeys.json', import.meta.url);
const EXAMPLES = new URL('./portal-passkeys.example.json', import.meta.url);
const readJson = file => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };
const usable = (value, examples) => typeof value === 'string' && value.length >= MIN_LENGTH && !examples.includes(value);
export function passkeyFor(scope) {
  const v = readJson(passkeysFile())?.[scope];
  return usable(v, Object.values(readJson(EXAMPLES) || {})) ? v : null;
}
// What is wrong with the passkey file, as sentences; empty when it is fit to start with.
export function passkeyProblems() {
  const all = readJson(passkeysFile()), examples = Object.values(readJson(EXAMPLES) || {});
  if (!all || typeof all !== 'object') return ['There is no readable passkey file. Copy server/portal-passkeys.example.json to server/portal-passkeys.json and set your own passkeys in it.'];
  const bad = Object.entries(all).filter(([, v]) => !usable(v, examples)).map(([scope, v]) =>
    `"${scope}" ${examples.includes(v) ? 'is still the example value' : `must be at least ${MIN_LENGTH} characters`}`);
  return [...bad, ...(ADMIN in all ? [] : [`"${ADMIN}" (the Invoice Tracker's passkey) is missing`])];
}

// Guessing one passkey from many addresses: after FREE_FAILS wrong tries in a row on a passkey, each
// further wrong try doubles the wait before anyone may try that passkey again (1 s, 2 s, 4 s ... up
// to 15 minutes). A correct passkey clears it.
function slowDown(scope) {
  const s = scopes[scope] ||= { fails: 0, until: 0 };
  if (++s.fails > FREE_FAILS) s.until = Date.now() + Math.min(1000 * 2 ** (s.fails - FREE_FAILS - 1), MAX_WAIT_MS);
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
  if (!expected) return res.status(503).json({ error: `No usable passkey is set for ${jdaId} in server/portal-passkeys.json (at least ${MIN_LENGTH} characters).` });
  const key = `${req.ip}|${jdaId}`, t = tries[key] || (tries[key] = { n: 0, until: 0 });
  if (t.until > Date.now()) return res.status(429).json({ error: 'Too many wrong passkeys. Try again in a minute.' });
  const wait = (scopes[jdaId]?.until || 0) - Date.now();
  if (wait > 0) return res.status(429).json({ error: `Too many wrong passkeys have been tried for this. Try again in ${wait > 90_000 ? `${Math.ceil(wait / 60_000)} minutes` : `${Math.ceil(wait / 1000)} seconds`}.` });
  if (!same(passkey, expected)) {
    if (++t.n >= MAX_TRIES) { t.n = 0; t.until = Date.now() + LOCKOUT_MS; }
    slowDown(jdaId);
    return res.status(401).json({ error: 'Incorrect passkey.' });
  }
  delete tries[key]; delete scopes[jdaId];
  const exp = Date.now() + SESSION_MS;
  res.json({ token: `${jdaId}.${exp}.${sign(jdaId, exp, expected)}` });
}
