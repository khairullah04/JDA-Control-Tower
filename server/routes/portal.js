import { Router } from 'express';
import { publicMessage } from '../errors.js';
import { syncJda } from '../portal-sync.js';
import { masterFolderUrl } from '../portal-drive.js';
import { reports } from '../report-store.js';
import { forgetReport } from '../report-reader.js';
import { saveUpload } from '../site-content.js';
import { JDAS } from '../../web/shared/config/jdas.js';

const router = Router();
const running = new Set(); // the syncs in flight, as "<jda>|<scope>"

// The JDA report pages' editor, Edit report and Drive sync. These routes sit behind the JDA Control
// Tower sign-in (app.js): anyone signed in may edit any JDA's report. The request says only which JDA
// (its id); its name, and so its Drive folder, and where its report document lives come from the
// portal's own list. A name sent by the page is ignored, so a request cannot point at another folder.
router.use((req, res, next) => {
  const known = JDAS.find(j => j.id === req.body?.jda?.id);
  if (!known) return res.status(400).json({ error: 'Which JDA?' });
  req.jda = { id: known.id, name: known.name, source: known.source || { project: 'portal', collection: 'jdaReports', doc: known.id } };
  next();
});

// The one way a report document is changed: see portal-save.js. { patch, remove, base, force } -> the saved document.
router.post('/save', async (req, res) => {
  try { const saved = await reports().save(req.jda.source, req.body); forgetReport(req.jda.id); res.json({ saved }); }
  catch (e) { res.status(e.status || 500).json({ error: publicMessage(e, 'The report could not be saved just now. Try again.'), changed: e.changed }); }
});

// A picture for the Master Page (a logo, the press release picture): stored now, named in the page when saved.
router.post('/upload', (req, res) => {
  try { res.json(saveUpload(req.body?.image)); }
  catch (e) { if (!e.status) console.error(e); res.status(e.status || 500).json({ error: e.status ? e.message : 'The picture could not be stored just now.' }); }
});

router.post('/master-folder', async (req, res) => {
  try { res.json({ url: await masterFolderUrl(req.jda) }); }
  catch (e) { res.status(e.status || 500).json({ error: publicMessage(e) }); }
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
  catch (e) { res.status(e.status || 500).json({ error: publicMessage(e) }); }
  finally { running.delete(key); }
});

export default router;
