import { Router } from 'express';
import { syncJda } from '../portal-sync.js';
import { masterFolderUrl } from '../portal-drive.js';
import { validToken, unlock } from '../passkeys.js';
import { reports } from '../report-store.js';
import { JDAS } from '../../../portal/js/config/app-config.js';

const router = Router();
const running = new Set(); // the syncs in flight, as "<jda>|<scope>"

// The portal has no login, so these routes can't use the Firebase check the rest of /api uses.
// Each JDA has its own passkey (see passkeys.js): a correct one is exchanged for a signed session
// token, and that token is what the editor, Edit report and the Drive sync present.
router.post('/unlock', unlock);

// Everything below needs the session token for the JDA it names. The request says only which JDA
// (its id); its name, and so its Drive folder, and where its report document lives come from the
// portal's own list. A name sent by the page is ignored, so one JDA's session cannot be pointed at
// another JDA's folder. (The Invoice Tracker's passkey, "admin", is not a JDA and opens none.)
router.use((req, res, next) => {
  const known = JDAS.find(j => j.id === req.body?.jda?.id);
  if (!known) return res.status(400).json({ error: 'Which JDA?' });
  if (!validToken(req.headers['x-portal-token'], known.id)) return res.status(401).json({ error: 'Your editing session has ended. Enter the passkey again.' });
  req.jda = { id: known.id, name: known.name, source: known.source || { project: 'portal', collection: 'jdaReports', doc: known.id } };
  next();
});

router.post('/session', (req, res) => res.json({ ok: true }));

// The one way a report document is changed: see portal-save.js. { patch, remove, base, force } -> the saved document.
router.post('/save', async (req, res) => {
  try { res.json({ saved: await reports().save(req.jda.source, req.body) }); }
  catch (e) { if (!e.status) console.error(e); res.status(e.status || 500).json({ error: e.message, changed: e.changed }); }
});

router.post('/master-folder', async (req, res) => {
  try { res.json({ url: await masterFolderUrl(req.jda) }); }
  catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// scope 'master' = the Master File folder (the Editor Page); 'progress' = Overall + Weekly Progress
// (Edit report). One sync per JDA and scope runs at a time: a second click while it is still
// reading would pay for the same extraction twice. Once it has finished, the result cache in
// portal-sync.js makes a repeat cost nothing.
router.post('/sync', async (req, res) => {
  const { scope, currentProjects } = req.body;
  if (scope !== 'master' && scope !== 'progress') return res.status(400).json({ error: 'Sync what? scope must be "master" or "progress"' });
  const key = `${req.jda.id}|${scope}`;
  if (running.has(key)) return res.status(429).json({ error: 'A sync for this JDA is still running. Wait for it to finish.' });
  running.add(key);
  try { res.json(await syncJda(req.jda, { scope, currentProjects })); }
  catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
  finally { running.delete(key); }
});

export default router;
