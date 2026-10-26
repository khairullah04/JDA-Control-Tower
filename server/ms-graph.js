// Microsoft Graph: the company's Microsoft List of invoices before approval, and Outlook drafts.
//
// Two ways in, the first that is set up wins:
//   1. An app registration (IT): MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET, MS_SITE_ID, MS_LIST_ID in
//      server/.env, with Sites.Read.All (and Mail.ReadWrite + MS_MAIL_SENDER for drafts).
//   2. No IT needed: the person signs in with their own Microsoft account by a device code
//      (microsoft.com/devicelogin), through Microsoft's own public client "Microsoft Graph Command Line
//      Tools" (or MS_CLIENT_ID when set). The List is read with that person's own rights, from its link
//      (the address of the List as it opens in the browser), and drafts go in their own mailbox. A tenant
//      can block this client or device-code sign-in; then the page imports an export of the List instead.
// Sign-ins are kept per person in server/.ms-tokens.json (not in git; delete it to sign everyone out).
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { userError } from './errors.js';

const env = k => String(process.env[k] || '').trim();
export const graphListConfigured = () => ['MS_TENANT_ID', 'MS_CLIENT_ID', 'MS_CLIENT_SECRET', 'MS_SITE_ID', 'MS_LIST_ID'].every(env);
export const graphMailConfigured = () => graphListConfigured() && !!env('MS_MAIL_SENDER');

/* ---------- 1. The app registration (client credentials) ---------- */
let appToken = null; // { value, until }
async function appAccessToken() {
  if (appToken && appToken.until > Date.now() + 60_000) return appToken.value;
  const out = await tokenRequest(env('MS_TENANT_ID'), { client_id: env('MS_CLIENT_ID'), client_secret: env('MS_CLIENT_SECRET'), scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' });
  appToken = { value: out.access_token, until: Date.now() + (out.expires_in || 3600) * 1000 };
  return appToken.value;
}
async function tokenRequest(tenant, body, { quiet = false } = {}) {
  const res = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenant || 'organizations')}/oauth2/v2.0/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) });
  const out = await res.json().catch(() => ({}));
  if (!res.ok || !out.access_token) {
    if (quiet) return out; // device-code polling: "authorization_pending" is the normal answer until the person signs in
    console.error('Microsoft sign-in failed:', out.error, out.error_description || res.status);
    throw userError('The server could not sign in to Microsoft. Sign in again, or ask IT whether this sign-in is allowed.', 502);
  }
  return out;
}

/* ---------- 2. The person's own sign-in (device code) ---------- */
const PUBLIC_CLIENT = () => env('MS_CLIENT_ID') && !env('MS_CLIENT_SECRET') ? env('MS_CLIENT_ID') : '14d82eec-204b-4c2f-b7e8-296a70dab67e'; // Microsoft Graph Command Line Tools
const TENANT = () => env('MS_TENANT_ID') || 'organizations';
const SCOPES = 'offline_access openid profile User.Read Sites.Read.All Mail.ReadWrite';
const TOKENS_FILE = env('MS_TOKENS_FILE') || fileURLToPath(new URL('./.ms-tokens.json', import.meta.url));
const pending = new Map(); // person -> { code, url, message, until }
let saved = null;          // person -> { refresh, access, until, account }
const tokens = () => saved ||= (() => { try { return JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8')); } catch { return {}; } })();
const keep = () => { try { fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens(), null, 1), { mode: 0o600 }); } catch (e) { console.warn('Microsoft sign-ins could not be kept on disk:', e.message); } };

export function signInStatus(person) {
  const t = tokens()[person], p = pending.get(person);
  return { signedIn: !!t?.refresh, account: t?.account || '', pending: p && p.until > Date.now() ? { code: p.code, url: p.url } : null };
}
// Starts a sign-in: the person opens `url` and types `code`. The server waits for it in the background.
export async function startSignIn(person) {
  const res = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(TENANT())}/oauth2/v2.0/devicecode`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: PUBLIC_CLIENT(), scope: SCOPES }) });
  const out = await res.json().catch(() => ({}));
  if (!res.ok || !out.device_code) {
    console.error('Microsoft device sign-in refused:', out.error, out.error_description);
    throw userError('Microsoft would not start the sign-in (the company may block it). Import an export of the List instead.', 502);
  }
  const p = { code: out.user_code, url: out.verification_uri || 'https://microsoft.com/devicelogin', until: Date.now() + (out.expires_in || 900) * 1000 };
  pending.set(person, p);
  (async () => { // poll until signed in, refused or expired
    for (let wait = (out.interval || 5) * 1000; Date.now() < p.until && pending.get(person) === p;) {
      await new Promise(r => setTimeout(r, wait));
      const got = await tokenRequest(TENANT(), { client_id: PUBLIC_CLIENT(), grant_type: 'urn:ietf:params:oauth:grant-type:device_code', device_code: out.device_code }, { quiet: true });
      if (got.access_token) { await store(person, got); pending.delete(person); return; }
      if (got.error === 'slow_down') wait += 5000;
      else if (got.error !== 'authorization_pending') { console.warn('Microsoft sign-in ended:', got.error, got.error_description); pending.delete(person); return; }
    }
  })().catch(e => { console.error(e); pending.delete(person); });
  return { code: p.code, url: p.url };
}
async function store(person, got) {
  let account = '';
  try { const me = await (await fetch('https://graph.microsoft.com/v1.0/me?$select=userPrincipalName,mail', { headers: { Authorization: `Bearer ${got.access_token}` } })).json(); account = me.mail || me.userPrincipalName || ''; } catch { /* the name is only shown */ }
  tokens()[person] = { refresh: got.refresh_token, access: got.access_token, until: Date.now() + (got.expires_in || 3600) * 1000, account };
  keep();
}
export function signOut(person) { pending.delete(person); delete tokens()[person]; keep(); }
async function personToken(person) {
  const t = tokens()[person];
  if (!t?.refresh) throw userError('Sign in to Microsoft first.', 401);
  if (t.access && t.until > Date.now() + 60_000) return t.access;
  const got = await tokenRequest(TENANT(), { client_id: PUBLIC_CLIENT(), grant_type: 'refresh_token', refresh_token: t.refresh, scope: SCOPES }, { quiet: true });
  if (!got.access_token) { signOut(person); throw userError('Your Microsoft sign-in has expired. Sign in again.', 401); }
  Object.assign(t, { refresh: got.refresh_token || t.refresh, access: got.access_token, until: Date.now() + (got.expires_in || 3600) * 1000 });
  keep();
  return t.access;
}

/* ---------- Calls ---------- */
async function graph(path, token, init = {}) {
  const res = await fetch(path.startsWith('https://') ? path : `https://graph.microsoft.com/v1.0${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('Microsoft Graph:', res.status, out.error?.code, out.error?.message);
    throw userError(res.status === 404 ? 'That List could not be found. Check its link (open the List in the browser and copy the address).'
      : res.status === 403 ? 'Microsoft refused: this account cannot read that List (or the permission is not granted).' : 'Microsoft Graph could not be reached just now. Try again.', 502);
  }
  return out;
}
// A List's link -> its site and list ids. Accepts the address the List opens at, such as
// https://contoso.sharepoint.com/sites/Finance/Lists/Invoices/AllItems.aspx (or /teams/...).
export function parseListUrl(link) {
  let u; try { u = new URL(String(link).trim()); } catch { return null; }
  if (u.protocol !== 'https:' || !/\.sharepoint\.com$/i.test(u.hostname)) return null;
  const m = decodeURIComponent(u.pathname).match(/^\/((?:sites|teams)\/[^/]+)\/Lists\/([^/]+)/i);
  return m ? { host: u.hostname, sitePath: m[1], listName: m[2] } : null;
}
async function rowsOf(base, token) {
  const columns = (await graph(`${base}/columns?$select=name,displayName`, token)).value || [];
  const shown = Object.fromEntries(columns.map(c => [c.name, c.displayName || c.name]));
  const rows = [];
  for (let next = `${base}/items?expand=fields&$top=500`; next && rows.length < 5000;) {
    const page = await graph(next, token);
    for (const it of page.value || []) rows.push({ ID: String(it.id), ...Object.fromEntries(Object.entries(it.fields || {}).filter(([k]) => !k.startsWith('@') && !k.startsWith('_') && !['ContentType', 'Edit', 'LinkTitle', 'LinkTitleNoMenu', 'ItemChildCount', 'FolderChildCount', 'AppAuthor', 'AppEditor'].includes(k)).map(([k, v]) => [shown[k] || k, v])) });
    next = page['@odata.nextLink'];
  }
  return { headers: [...new Set(rows.flatMap(r => Object.keys(r)))], rows };
}

// The List's rows as { column: value } (by the columns' display names, as an export shows them).
export async function listRows({ person, listUrl }) {
  if (graphListConfigured()) return rowsOf(`/sites/${encodeURIComponent(env('MS_SITE_ID'))}/lists/${encodeURIComponent(env('MS_LIST_ID'))}`, await appAccessToken());
  const where = parseListUrl(listUrl || env('MS_LIST_URL'));
  if (!where) throw userError('Paste the List\'s link: open the List in the browser and copy its address (https://….sharepoint.com/sites/…/Lists/…).', 400);
  const token = await personToken(person);
  const site = await graph(`/sites/${where.host}:/${where.sitePath}`, token);
  let list;
  try { list = await graph(`/sites/${site.id}/lists/${encodeURIComponent(where.listName)}`, token); }
  catch { // the link's name can differ from the List's title: look it up among the site's lists
    const all = (await graph(`/sites/${site.id}/lists?$select=id,name,displayName,webUrl`, token)).value || [];
    list = all.find(l => decodeURIComponent(l.webUrl || '').toLowerCase().includes(`/lists/${where.listName.toLowerCase()}`) || l.displayName?.toLowerCase() === where.listName.toLowerCase());
    if (!list) throw userError('That List could not be found on its site. Check its link.', 404);
  }
  return rowsOf(`/sites/${site.id}/lists/${list.id}`, token);
}

// An Outlook draft; its webLink opens it in Outlook on the web. In the person's own mailbox when they
// are signed in; otherwise in MS_MAIL_SENDER's, with the app registration.
export async function createDraft({ person, to = '', cc = '', subject, html }) {
  const people = s => String(s).split(/[,;]/).map(a => a.trim()).filter(Boolean).map(address => ({ emailAddress: { address } }));
  const message = JSON.stringify({ subject, body: { contentType: 'HTML', content: html }, toRecipients: people(to), ccRecipients: people(cc) });
  if (tokens()[person]?.refresh) return { webLink: (await graph('/me/messages', await personToken(person), { method: 'POST', body: message })).webLink || '' };
  if (graphMailConfigured()) return { webLink: (await graph(`/users/${encodeURIComponent(env('MS_MAIL_SENDER'))}/messages`, await appAccessToken(), { method: 'POST', body: message })).webLink || '' };
  throw userError('Sign in to Microsoft to make Outlook drafts.', 400);
}
export const draftsPossible = person => !!tokens()[person]?.refresh || graphMailConfigured();
