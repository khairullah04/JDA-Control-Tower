import { ask, parseJson } from './claude.js';
import { INVOICE_SYSTEM } from './prompts.js';

// file (base64) + the full project catalogue -> one invoice, sorted into per-project allocations.
export async function analyzeInvoice({ fileBase64, mediaType, catalog }) {
  const fileBlock = mediaType === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: mediaType, data: fileBase64 } }
    : { type: 'image', source: { type: 'base64', media_type: mediaType, data: fileBase64 } };
  const text = await ask({
    system: INVOICE_SYSTEM, maxTokens: 2000,
    messages: [{ role: 'user', content: [
      fileBlock,
      { type: 'text', text: `Project catalogue: ${JSON.stringify(catalog)}` }
    ] }]
  });
  return parseJson(text);
}
