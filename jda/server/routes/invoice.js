import { Router } from 'express';
import { analyzeInvoice } from '../analyze.js';

const router = Router();
router.post('/analyze', async (req, res) => {
  try { res.json(await analyzeInvoice(req.body)); }
  catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});
export default router;
