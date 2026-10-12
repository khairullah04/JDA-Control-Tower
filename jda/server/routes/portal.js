import { Router } from 'express';
import { syncJda } from '../portal-sync.js';
import { masterFolderUrl } from '../portal-drive.js';
import { ADMIN, validToken, unlock } from '../passkeys.js';

const router = Router();
const COOLDOWN_MS = 30_000;
const lastRun = {};

// The portal has no login, so these routes can't use the Firebase check the rest of /api uses.
// Each JDA has its own passkey (see passkeys.js): a correct one is exchanged for a signed session
// token, and that token is what the editor, Edit report and the Drive sync present.
router.post('/unlock', unlock);

// Everything below needs the session token for the JDA it names.
router.use((req, res, next) => {
  const jda = req.body?.jda;
  if (!jda || typeof jda.id !== 'string' || typeof jda.name !== 'string' || jda.id === ADMIN) return res.status(400).json({ error: 'Which JDA?' }); // the tracker's passkey opens no JDA
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
