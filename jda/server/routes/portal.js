import { Router } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { syncJda } from '../portal-sync.js';
import { masterFolderUrl } from '../portal-drive.js';

const router = Router();
const COOLDOWN_MS = 30_000;
const SESSION_MS = 8 * 60 * 60 * 1000;
const MAX_TRIES = 5, LOCKOUT_MS = 60_000;
const lastRun = {}, tries = {};

// The portal has no login, so these routes can't use the Firebase check the rest of /api uses.
// Each JDA has its own passkey in portal-passkeys.json (read on every unlock, so a change needs no
// restart). The browser never holds a passkey: a correct one is exchanged for a signed session
// token, and that token is what the editor, Edit report and the Drive sync present.
const PASSKEYS = new URL('../portal-passkeys.json', import.meta.url);
function passkeyFor(jdaId) {
  try { const v = JSON.parse(fs.readFileSync(PASSKEYS, 'utf8'))[jdaId]; return typeof v === 'string' && v ? v : null; }
  catch { return null; }
}

const SECRET = crypto.randomBytes(32); // per process: a restart signs everyone out
// The passkey is part of what is signed, so changing a JDA's passkey ends its open sessions.
const sign = (jdaId, exp, passkey) => crypto.createHmac('sha256', SECRET).update(`${jdaId}|${exp}|${passkey}`).digest('hex');
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

function validToken(token, jdaId) {
  const [id, exp, mac] = String(token || '').split('.');
  const passkey = passkeyFor(jdaId);
  return !!passkey && id === jdaId && Number(exp) > Date.now() && same(mac, sign(jdaId, exp, passkey));
}

router.post('/unlock', (req, res) => {
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
});

// Everything below needs the session token for the JDA it names.
router.use((req, res, next) => {
  const jda = req.body?.jda;
  if (!jda || typeof jda.id !== 'string' || typeof jda.name !== 'string') return res.status(400).json({ error: 'Which JDA?' });
  if (!validToken(req.headers['x-portal-token'], jda.id)) return res.status(401).json({ error: 'Your editing session has ended. Enter the passkey again.' });
  req.jda = { id: jda.id, name: jda.name };
  next();
});

router.post('/session', (req, res) => res.json({ ok: true }));

router.post('/master-folder', async (req, res) => {
  try { res.json({ url: await masterFolderUrl(req.jda) }); }
  catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// scope 'master' = the Master File folder (the Editor Page); 'progress' = Overall + Weekly Progress
// (Edit report). The cooldown is friction; the result cache in portal-sync.js is what keeps
// repeated calls from spending on Claude.
router.post('/sync', async (req, res) => {
  const { scope, currentProjects } = req.body;
  if (scope !== 'master' && scope !== 'progress') return res.status(400).json({ error: 'Sync what? scope must be "master" or "progress"' });
  const key = `${req.jda.id}|${scope}`;
  if (Date.now() - (lastRun[key] || 0) < COOLDOWN_MS) return res.status(429).json({ error: 'A sync for this JDA just ran. Try again in half a minute.' });
  lastRun[key] = Date.now();
  try { res.json(await syncJda(req.jda, { scope, currentProjects })); }
  catch (e) { console.error(e); delete lastRun[key]; res.status(500).json({ error: e.message }); } // a failed run may be retried at once
});

export default router;
