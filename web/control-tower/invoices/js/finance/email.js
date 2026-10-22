// The approval-request email for invoices chosen from the Microsoft List: HTML that Outlook desktop
// renders as written (it uses Word's engine: tables only, inline styles only, no flex or grid, system
// fonts), its subject, and the .eml file that opens in Outlook as an editable draft. Every piece of text
// from the List is escaped, so nothing in it can become markup. Pure functions, shared by browser and server.
import { fmt } from './money.js';

export const escHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const ddmmyyyy = d => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
const amount = (minor, currency) => minor == null ? '—' : `${escHtml(currency || '')} ${escHtml(fmt(minor, currency || 'MYR'))}`.trim();

export const subjectFor = (jdaName, count, date = new Date()) =>
  `[${jdaName}] Invoice Approval Request – ${count} invoice${count === 1 ? '' : 's'} – ${ddmmyyyy(date)}`;

const FONT = "font-family:'Segoe UI',Arial,sans-serif";
const cell = (extra = '') => `style="${FONT};font-size:13px;color:#1f2a2e;padding:8px 10px;border:1px solid #d9e1e3;vertical-align:top;${extra}"`;

// `items`: [{ invoiceNo, partner, description, amountMinor, currency, proofs: [{ label, url }] }].
// Totals are per currency: mixed currencies are listed, never added together.
export function emailHtml({ jdaName, items, recipient = '', sender = '' }) {
  const totals = new Map();
  for (const i of items) if (i.amountMinor != null) totals.set(i.currency || '', (totals.get(i.currency || '') || 0) + i.amountMinor);
  const links = proofs => proofs.length
    ? proofs.map((p, n) => `<a href="${escHtml(p.url)}" style="color:#00857c;text-decoration:underline">${escHtml(p.label || `Document ${n + 1}`)}</a>`).join('<br>')
    : '<span style="color:#8a5a12">None</span>';
  const head = ['No.', 'Invoice No.', 'Partner', 'Description', 'Amount', 'Supporting Documents']
    .map((h, i) => `<th align="${i === 4 ? 'right' : 'left'}" style="${FONT};font-size:13px;font-weight:bold;color:#ffffff;background-color:#013d39;padding:9px 10px;border:1px solid #013d39">${h}</th>`).join('');
  const rows = items.map((i, n) => {
    const zebra = n % 2 ? 'background-color:#f2f7f7;' : 'background-color:#ffffff;';
    return `<tr><td ${cell(zebra)}>${n + 1}</td><td ${cell(zebra + 'font-weight:bold;')}>${escHtml(i.invoiceNo) || '—'}</td><td ${cell(zebra)}>${escHtml(i.partner) || '—'}</td>
      <td ${cell(zebra)}>${escHtml(i.description) || '—'}</td><td align="right" ${cell(zebra + 'text-align:right;white-space:nowrap;')}>${amount(i.amountMinor, i.currency)}</td><td ${cell(zebra)}>${links(i.proofs || [])}</td></tr>`;
  }).join('\n');
  const total = [...totals].map(([c, m]) => amount(m, c)).join('<br>') || '—';
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escHtml(subjectFor(jdaName, items.length))}</title></head>
<body style="margin:0;padding:0;background-color:#ffffff">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse"><tr><td style="padding:16px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;max-width:900px">
<tr><td style="${FONT};font-size:14px;color:#1f2a2e;padding:0 0 12px">Dear ${escHtml(recipient) || '[Project Lead]'},</td></tr>
<tr><td style="${FONT};font-size:14px;color:#1f2a2e;padding:0 0 16px">Please find below ${items.length} invoice${items.length === 1 ? '' : 's'} for <b>${escHtml(jdaName)}</b> for your review and approval. The supporting documents are linked against each invoice.</td></tr>
<tr><td style="padding:0 0 16px">
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;border:1px solid #d9e1e3">
<tr>${head}</tr>
${rows}
<tr><td colspan="4" align="right" ${cell('background-color:#e7f4f3;font-weight:bold;text-align:right;')}>TOTAL</td><td align="right" ${cell('background-color:#e7f4f3;font-weight:bold;text-align:right;white-space:nowrap;')}>${total}</td><td ${cell('background-color:#e7f4f3;')}></td></tr>
</table></td></tr>
<tr><td style="${FONT};font-size:14px;color:#1f2a2e;padding:0 0 16px">If you have any questions about these invoices, please let me know.</td></tr>
<tr><td style="${FONT};font-size:14px;color:#1f2a2e">Best regards,<br>${escHtml(sender) || '[Your name]'}</td></tr>
</table></td></tr></table>
</body></html>`;
}

// A header value with non-ASCII characters (the subject's dash), as RFC 2047 encoded words.
function utf8B64(s) {
  if (typeof Buffer !== 'undefined') return Buffer.from(s, 'utf8').toString('base64');
  const bytes = new TextEncoder().encode(s); let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); // in parts: a long email would overflow one call
  return btoa(bin);
}
const headerText = s => /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${utf8B64(s)}?=`;
const oneLine = s => String(s ?? '').replace(/[\r\n]+/g, ' ').trim(); // no header injection through a recipient or subject

// The .eml file: an unsent message (X-Unsent: 1), so Outlook opens it as a draft to edit and send.
export function emlFile({ to = '', cc = '', subject, html, date = new Date() }) {
  const body = utf8B64(html).replace(/.{1,76}/g, '$&\r\n');
  return [
    'X-Unsent: 1',
    `To: ${oneLine(to)}`,
    ...(oneLine(cc) ? [`Cc: ${oneLine(cc)}`] : []),
    `Subject: ${headerText(oneLine(subject))}`,
    `Date: ${date.toUTCString()}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    body
  ].join('\r\n');
}

// mailto: with the subject and recipients only. The body never goes in it: it would not be formatted
// and would be cut short; it is pasted from the clipboard instead.
export const mailtoLink = ({ to = '', cc = '', subject }) =>
  `mailto:${encodeURIComponent(oneLine(to)).replace(/%40/g, '@').replace(/%2C/gi, ',')}?${[cc && `cc=${encodeURIComponent(oneLine(cc))}`, `subject=${encodeURIComponent(oneLine(subject))}`].filter(Boolean).join('&')}`;
