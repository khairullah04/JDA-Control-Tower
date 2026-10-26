// node --test ms-graph.test.mjs
// Reading the Microsoft List with the person's own sign-in (no IT setup): the List's link, the device-code
// sign-in, the refresh, the rows by display name over pages, Outlook drafts in their own mailbox, sign-out.
// Microsoft is faked: `fetch` answers as Microsoft would.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ms-graph-'));
process.env.MS_TOKENS_FILE = path.join(dir, 'tokens.json');
for (const k of ['MS_TENANT_ID', 'MS_CLIENT_ID', 'MS_CLIENT_SECRET', 'MS_SITE_ID', 'MS_LIST_ID', 'MS_MAIL_SENDER', 'MS_LIST_URL']) delete process.env[k];
const ms = await import('./ms-graph.js');

const calls = [];
let pendingPolls = 2;
const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  const body = init.body instanceof URLSearchParams ? Object.fromEntries(init.body) : init.body;
  calls.push({ url, body, auth: init.headers?.Authorization });
  if (url.endsWith('/oauth2/v2.0/devicecode')) return json({ device_code: 'dev-1', user_code: 'ABCD-EFGH', verification_uri: 'https://microsoft.com/devicelogin', expires_in: 60, interval: 0.01 });
  if (url.endsWith('/oauth2/v2.0/token')) {
    if (body.grant_type === 'refresh_token') return json({ access_token: 'acc-2', refresh_token: 'ref-2', expires_in: 3600 });
    return pendingPolls-- > 0 ? json({ error: 'authorization_pending' }, 400) : json({ access_token: 'acc-1', refresh_token: 'ref-1', expires_in: 1 });
  }
  const g = url.replace('https://graph.microsoft.com/v1.0', '');
  if (g.startsWith('/me?')) return json({ mail: 'farid@company.com' });
  if (g === '/sites/contoso.sharepoint.com:/sites/Finance') return json({ id: 'site-1' });
  if (g === '/sites/site-1/lists/Invoices') return json({ error: { code: 'itemNotFound' } }, 404); // the link's name is not the title
  if (g.startsWith('/sites/site-1/lists?')) return json({ value: [{ id: 'list-9', displayName: 'Invoice approvals', webUrl: 'https://contoso.sharepoint.com/sites/Finance/Lists/Invoices' }] });
  if (g.startsWith('/sites/site-1/lists/list-9/columns')) return json({ value: [{ name: 'Title', displayName: 'Invoice Number' }, { name: 'field_1', displayName: 'Vendor' }, { name: 'Amount0', displayName: 'Invoice Amount' }] });
  if (g === '/sites/site-1/lists/list-9/items?expand=fields&$top=500') return json({ value: [{ id: '1', fields: { Title: 'INV-1', field_1: 'IBM', Amount0: 1000, '@odata.etag': 'x', ContentType: 'Item' } }], '@odata.nextLink': 'https://graph.microsoft.com/v1.0/next-page' });
  if (g === '/next-page') return json({ value: [{ id: '2', fields: { Title: 'INV-2', field_1: 'SAP', Amount0: 50 } }] });
  if (g === '/me/messages') return json({ webLink: 'https://outlook.office.com/draft/1' });
  return json({ error: { code: 'unexpected', message: g } }, 500);
};

test('a List link is read from the address the List opens at; anything else is refused', () => {
  assert.deepEqual(ms.parseListUrl('https://contoso.sharepoint.com/sites/Finance/Lists/Invoices/AllItems.aspx?view=1'), { host: 'contoso.sharepoint.com', sitePath: 'sites/Finance', listName: 'Invoices' });
  assert.deepEqual(ms.parseListUrl('https://contoso.sharepoint.com/teams/JDA%201/Lists/Invoice%20Approvals'), { host: 'contoso.sharepoint.com', sitePath: 'teams/JDA 1', listName: 'Invoice Approvals' });
  for (const bad of ['http://contoso.sharepoint.com/sites/F/Lists/I', 'https://evil.com/sites/F/Lists/I', 'https://contoso.sharepoint.com/sites/F/Shared%20Documents', 'not a link', ''])
    assert.equal(ms.parseListUrl(bad), null, bad);
});

test('not signed in: the List is not read, and the person is told to sign in or paste the link', async () => {
  assert.deepEqual(ms.signInStatus('farid@company.com'), { signedIn: false, account: '', pending: null });
  await assert.rejects(ms.listRows({ person: 'farid@company.com', listUrl: '' }), e => e.status === 400 && /Paste the List's link/.test(e.message));
  await assert.rejects(ms.listRows({ person: 'farid@company.com', listUrl: 'https://contoso.sharepoint.com/sites/Finance/Lists/Invoices' }), e => e.status === 401 && /Sign in to Microsoft/.test(e.message));
  assert.equal(ms.draftsPossible('farid@company.com'), false);
});

test('device-code sign-in, then the List by its link: display names, every page, the token refreshed; drafts in their own mailbox; sign-out', async () => {
  const person = 'farid@company.com';
  assert.deepEqual(await ms.startSignIn(person), { code: 'ABCD-EFGH', url: 'https://microsoft.com/devicelogin' });
  assert.deepEqual(ms.signInStatus(person).pending, { code: 'ABCD-EFGH', url: 'https://microsoft.com/devicelogin' });
  for (let i = 0; i < 200 && !ms.signInStatus(person).signedIn; i++) await new Promise(r => setTimeout(r, 10));
  assert.deepEqual(ms.signInStatus(person), { signedIn: true, account: 'farid@company.com', pending: null });
  const polls = calls.filter(c => c.body?.grant_type === 'urn:ietf:params:oauth:grant-type:device_code');
  assert.equal(polls.length, 3); // twice "pending", then signed in
  assert.equal(polls[0].body.client_id, '14d82eec-204b-4c2f-b7e8-296a70dab67e');
  const file = process.env.MS_TOKENS_FILE;
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8'))[person].refresh, 'ref-1');
  if (process.platform !== 'win32') assert.equal(fs.statSync(file).mode & 0o777, 0o600);

  const { headers, rows } = await ms.listRows({ person, listUrl: 'https://contoso.sharepoint.com/sites/Finance/Lists/Invoices/AllItems.aspx' });
  assert.deepEqual(rows, [{ ID: '1', 'Invoice Number': 'INV-1', Vendor: 'IBM', 'Invoice Amount': 1000 }, { ID: '2', 'Invoice Number': 'INV-2', Vendor: 'SAP', 'Invoice Amount': 50 }]);
  assert.deepEqual(headers, ['ID', 'Invoice Number', 'Vendor', 'Invoice Amount']);
  assert.ok(calls.some(c => c.body?.grant_type === 'refresh_token' && c.body.refresh_token === 'ref-1'), 'the short-lived token was refreshed');
  assert.ok(calls.filter(c => c.url.includes('/sites/')).every(c => c.auth === 'Bearer acc-2'));

  assert.equal(ms.draftsPossible(person), true);
  assert.deepEqual(await ms.createDraft({ person, to: 'lead@company.com; pm@company.com', subject: 'S', html: '<p>x</p>' }), { webLink: 'https://outlook.office.com/draft/1' });
  const draft = JSON.parse(calls.find(c => c.url.endsWith('/me/messages')).body);
  assert.deepEqual([draft.toRecipients.map(r => r.emailAddress.address), draft.body.contentType], [['lead@company.com', 'pm@company.com'], 'HTML']);

  assert.equal(ms.signInStatus('someone.else@company.com').signedIn, false, 'a sign-in is the person\'s own');
  ms.signOut(person);
  assert.equal(ms.signInStatus(person).signedIn, false);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8'))[person], undefined);
});
