// Microsoft Graph: the company's Microsoft List of invoices before approval, and (when allowed) Outlook
// drafts. Off until server/.env has MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET, MS_SITE_ID and
// MS_LIST_ID (an app registration with Sites.Read.All, admin consent). Without them the page imports an
// export of the List instead, and works the same. Outlook drafts also need Mail.ReadWrite and
// MS_MAIL_SENDER (the mailbox the draft is made in: an app reads no "me", so it names the mailbox).
// The sign-in is the OAuth client-credentials grant (what MSAL does for a server app), over fetch.
import { userError } from './errors.js';

const env = k => String(process.env[k] || '').trim();
export const graphListConfigured = () => ['MS_TENANT_ID', 'MS_CLIENT_ID', 'MS_CLIENT_SECRET', 'MS_SITE_ID', 'MS_LIST_ID'].every(env);
export const graphMailConfigured = () => graphListConfigured() && !!env('MS_MAIL_SENDER');

let token = null; // { value, until }
async function accessToken() {
  if (token && token.until > Date.now() + 60_000) return token.value;
  const res = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(env('MS_TENANT_ID'))}/oauth2/v2.0/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env('MS_CLIENT_ID'), client_secret: env('MS_CLIENT_SECRET'), scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' })
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok || !out.access_token) { console.error('Microsoft sign-in failed:', out.error_description || res.status); throw userError('The server could not sign in to Microsoft. Check the MS_* settings in server/.env (and admin consent).', 502); }
  token = { value: out.access_token, until: Date.now() + (out.expires_in || 3600) * 1000 };
  return token.value;
}
async function graph(path, init = {}) {
  const res = await fetch(path.startsWith('https://') ? path : `https://graph.microsoft.com/v1.0${path}`, { ...init, headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) { console.error('Microsoft Graph:', res.status, out.error?.message); throw userError(res.status === 403 ? 'Microsoft refused: the app registration lacks the permission (Sites.Read.All, or Mail.ReadWrite for drafts).' : 'Microsoft Graph could not be reached just now. Try again.', 502); }
  return out;
}

// The List's rows as { column: value }, by its columns' display names (as an export shows them), every
// page of it. The item's id is added as "ID".
export async function listRows() {
  if (!graphListConfigured()) throw userError('The Microsoft List is not connected (MS_* settings in server/.env). Import an export of the List instead.', 400);
  const base = `/sites/${encodeURIComponent(env('MS_SITE_ID'))}/lists/${encodeURIComponent(env('MS_LIST_ID'))}`;
  const columns = (await graph(`${base}/columns?$select=name,displayName`)).value || [];
  const shown = Object.fromEntries(columns.map(c => [c.name, c.displayName || c.name]));
  const rows = [];
  for (let next = `${base}/items?expand=fields&$top=500`; next && rows.length < 5000;) {
    const page = await graph(next);
    for (const it of page.value || []) rows.push({ ID: String(it.id), ...Object.fromEntries(Object.entries(it.fields || {}).filter(([k]) => !k.startsWith('@') && !k.startsWith('_')).map(([k, v]) => [shown[k] || k, v])) });
    next = page['@odata.nextLink'];
  }
  const headers = [...new Set(rows.flatMap(r => Object.keys(r)))];
  return { headers, rows };
}

// An Outlook draft in the sender's mailbox; its webLink opens it in Outlook on the web.
export async function createDraft({ to = '', cc = '', subject, html }) {
  if (!graphMailConfigured()) throw userError('Outlook drafts are not set up (Mail.ReadWrite and MS_MAIL_SENDER).', 400);
  const people = s => String(s).split(/[,;]/).map(a => a.trim()).filter(Boolean).map(address => ({ emailAddress: { address } }));
  const out = await graph(`/users/${encodeURIComponent(env('MS_MAIL_SENDER'))}/messages`, { method: 'POST',
    body: JSON.stringify({ subject, body: { contentType: 'HTML', content: html }, toRecipients: people(to), ccRecipients: people(cc) }) });
  return { webLink: out.webLink || '' };
}
