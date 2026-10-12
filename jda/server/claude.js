import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env
export const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5';

// An answer cut off at the length limit is an error here, not a half answer: half a table of invoice
// lines would otherwise fail later as unreadable data, or worse, be read as the whole invoice.
export async function ask({ system, messages, maxTokens = 1500 }) {
  const res = await client.messages.create({ model: MODEL, max_tokens: maxTokens, system, messages });
  if (res.stop_reason === 'max_tokens') throw new Error('The AI ran out of room before it finished its answer. Split the file into smaller ones, or ask a narrower question, and try again.');
  if (res.stop_reason === 'refusal') throw new Error('The AI declined to answer this.');
  return res.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
}

// The data in an answer that may have words around it: from its first { to its last }.
export function parseJson(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('The AI did not answer with data that could be read. Try again.');
  try { return JSON.parse(m[0]); }
  catch { throw new Error('The AI answered with data that could not be read. Try again.'); }
}
