import { Router } from 'express';
import { ask } from '../claude.js';
import { chatSystem } from '../prompts.js';

const router = Router();

router.post('/', async (req, res) => {
  try {
    const { messages, context } = req.body;
    const reply = await ask({ system: chatSystem(context), messages, maxTokens: 800 });
    res.json({ reply });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

export default router;
