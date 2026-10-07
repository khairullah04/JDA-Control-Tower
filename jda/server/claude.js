import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env
export const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5';

export async function ask({ system, messages, maxTokens = 1500 }) {
  const res = await client.messages.create({ model: MODEL, max_tokens: maxTokens, system, messages });
  return res.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
}

export function parseJson(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('AI did not return JSON');
  return JSON.parse(m[0]);
}
