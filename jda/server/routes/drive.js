import { Router } from 'express';
import { listInbox, fetchInboxFile } from '../drive.js';
import { analyzeInvoice } from '../analyze.js';

const router = Router();

router.get('/files', async (req, res) => {
  try { res.json(await listInbox()); }
  catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

router.post('/analyze', async (req, res) => {
  try {
    const { fileId, catalog } = req.body;
    res.json(await analyzeInvoice({ ...(await fetchInboxFile(fileId)), catalog }));
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

export default router;
