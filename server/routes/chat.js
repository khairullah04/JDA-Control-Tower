import { Router } from 'express';
import { publicMessage } from '../errors.js';
import { ask } from '../claude.js';
import { chatSystem } from '../prompts.js';

const router = Router();
const MAX_TURNS = 20, MAX_TURN_CHARS = 4000, MAX_CONTEXT_CHARS = 200_000;

// What is passed to the AI is only ever a short run of plain-text turns and the page's own summary.
function checked({ messages, context } = {}) {
  const ok = Array.isArray(messages) && messages.length >= 1 && messages.length <= MAX_TURNS
    && messages.every(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.length >= 1 && m.content.length <= MAX_TURN_CHARS)
    && messages[0].role === 'user' && messages.at(-1).role === 'user';
  if (!ok) throw Object.assign(new Error('That question could not be sent. Keep it under 4,000 characters and try again.'), { status: 400 });
  if (context != null && (typeof context !== 'object' || JSON.stringify(context).length > MAX_CONTEXT_CHARS)) throw Object.assign(new Error('This page holds too much for the assistant to read at once. Narrow it with the filters and ask again.'), { status: 400 });
  return { messages: messages.map(m => ({ role: m.role, content: m.content })), context: context ?? {} };
}

router.post('/', async (req, res) => {
  try {
    const { messages, context } = checked(req.body);
    const reply = await ask({ system: chatSystem(context), messages, maxTokens: 800 });
    res.json({ reply });
  } catch (e) { if (!e.status) console.error(e); res.status(e.status || 500).json({ error: publicMessage(e, 'The assistant is not available just now.') }); }
});

export default router;
