import { Router } from 'express';
import { publicMessage } from '../errors.js';
import { listInbox, fetchInboxFile } from '../drive.js';
import { analyzeInvoice } from '../analyze.js';

const router = Router();

router.get('/files', async (req, res) => {
  try { res.json(await listInbox()); }
  catch (e) { res.status(e.status || 500).json({ error: publicMessage(e, 'Google Drive could not be reached just now. Try again, or tell the administrator.') }); }
});

router.post('/analyze', async (req, res) => {
  try {
    const { fileId, catalog } = req.body;
    res.json(await analyzeInvoice({ ...(await fetchInboxFile(fileId)), catalog }));
  } catch (e) { res.status(e.status || 500).json({ error: publicMessage(e, 'Google Drive could not be reached just now. Try again, or tell the administrator.') }); }
});

export default router;
