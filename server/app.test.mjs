// node --experimental-test-module-mocks --test app.test.mjs
// The whole server's routing over real HTTP: what anyone may open, and that every private page, file
// and API answers a redirect to /login or 401 to someone who has not signed in.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { memoryStore } from '../web/control-tower/invoices/js/finance/service.js';
import { sessionToken, COOKIE } from './session.js';
import { forgetTokens } from './auth.js';

process.env.REQUIRE_AUTH = 'true';
process.env.ALLOWED_EMAILS = 'aina@jda.app';
process.env.FIREBASE_API_KEY = 'key-1';
const { createApp, CONTROL_TOWER } = await import('./app.js');

let server, base;
before(() => { server = createApp({ finance: memoryStore(), storage: 'memory' }).listen(0); base = `http://localhost:${server.address().port}`; });
after(() => server.close());
const get = (p, headers = {}) => fetch(base + p, { redirect: 'manual', headers });
// A request sent exactly as written: fetch would resolve "..", a browser's address bar would not stop a script.
const rawStatus = p => new Promise((resolve, reject) => {
  const req = http.request({ host: 'localhost', port: server.address().port, path: p, method: 'GET' }, res => { res.resume(); resolve(res.statusCode); });
  req.on('error', reject); req.end();
});
const as = email => ({ cookie: `${COOKIE}=${encodeURIComponent(sessionToken(email))}` });

// Every file under a folder, as the path the server would serve it at.
const filesOf = (dir, at) => fs.readdirSync(dir, { recursive: true, withFileTypes: true })
  .filter(e => e.isFile()).map(e => `${at}/${path.relative(dir, path.join(e.parentPath, e.name)).split(path.sep).join('/')}`);

test('the public pages and their files open without signing in', async () => {
  for (const p of ['/', '/login', '/jda/jda1/info', '/jda/jda3/info', '/public/styles/site.css', '/public/components/login.js', '/shared/lib/esc.js', '/shared/lib/session.js',
    '/shared/styles/report.css', '/shared/assets/photos/press.jpg', '/shared/components/blocks.js']) assert.equal((await get(p)).status, 200, p);
  assert.equal((await get('/jda/jdaz/info')).status, 404);                 // not a JDA
  // nothing private is in web/public or web/shared, and nothing climbs out of them into web/control-tower or the server
  for (const sneaky of ['/shared/../control-tower/config/jda-content.js', '/shared/%2e%2e/control-tower/config/jda-content.js', '/public/../control-tower/index.html',
    '/public/%2e%2e/control-tower/components/report.js', '/shared/..%2fcontrol-tower/config/jda-content.js', '/public/..%2f..%2fserver%2f.env', '/shared/%2e%2e/%2e%2e/server/.env']) {
    assert.notEqual(await rawStatus(sneaky), 200, sneaky);                   // sent exactly as written: fetch would tidy "..", a script would not
  }
  for (const gone of ['/site/portal/js/report.js', '/lib/blocks.js', '/site/css/site.css']) assert.equal((await get(gone)).status, 404, gone);
});

test('every private page and file sends someone not signed in to /login, and back afterwards', async () => {
  const paths = ['/control-tower', '/control-tower/', '/control-tower/invoices/', ...filesOf(CONTROL_TOWER, '/control-tower')];
  assert.ok(paths.length > 40);
  for (const p of paths) {
    const res = await get(p);
    assert.equal(res.status, 302, p);
    assert.equal(res.headers.get('location'), `/login?next=${encodeURIComponent(p)}`, p);
  }
});

test('the old addresses lead into the Control Tower, so they need the sign-in too', async () => {
  for (const [from, to] of [['/tracker/', '/control-tower/invoices/'], ['/control-tower/tracker/#x', '/control-tower/invoices/'], ['/tracker/js/main.js', '/control-tower/invoices/js/main.js'],
    ['/jda-report.html', '/control-tower/jda-report.html'], ['/jda-report.html?jda=jda1', '/control-tower/jda-report.html?jda=jda1'], ['/index.html', '/control-tower/']]) {
    const res = await get(from);
    assert.deepEqual([res.status, res.headers.get('location')], [301, to], from);
    assert.equal((await get(to)).status, 302, to);
  }
});

test('every private API answers 401 without a session', async () => {
  const calls = [['GET', '/api/finance/data'], ['GET', '/api/finance/audit'], ['POST', '/api/finance/entries'], ['POST', '/api/finance/sanctioned/batch'],
    ['PUT', '/api/finance/settings'], ['POST', '/api/finance/workbook'], ['GET', '/api/finance/forex?currency=USD'],
    ['POST', '/api/portal/save'], ['POST', '/api/portal/sync'], ['POST', '/api/portal/master-folder'], ['POST', '/api/chat'],
    ['GET', '/api/drive/files'], ['GET', '/api/site/controlTower'], ['GET', '/api/site/public'], ['PUT', '/api/site/public'], ['PUT', '/api/site/controlTower'], ['POST', '/api/site/roles-image'], ['DELETE', '/api/site/roles-image'], ['POST', '/api/drive/analyze'], ['GET', '/api/anything-else'], ['DELETE', '/api/finance/entries']];
  for (const [method, p] of calls) {
    const res = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json' }, body: method === 'GET' ? undefined : '{}' });
    assert.equal(res.status, 401, `${method} ${p}`);
    assert.equal((await res.json()).signIn, true);
  }
});

test('a change sent as anything but JSON is refused, whoever sends it', async () => {
  const send = (type, cookie) => fetch(`${base}/api/finance/settings`, { method: 'PUT', headers: { 'Content-Type': type, ...cookie }, body: '{"taxRate":"9"}' });
  for (const type of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x']) assert.equal((await send(type, as('aina@jda.app'))).status, 415, type);
  assert.notEqual((await send('application/json', as('aina@jda.app'))).status, 415);
});

test('a made-up, changed or run-out cookie is no session', async () => {
  const good = sessionToken('aina@jda.app'), [body] = good.split('.');
  const forged = Buffer.from(JSON.stringify({ email: 'aina@jda.app', exp: Date.now() + 1e9 })).toString('base64url') + '.c2lnbmF0dXJl';
  const old = sessionToken('aina@jda.app', Date.now() - 9 * 60 * 60 * 1000);
  for (const cookie of [`${COOKIE}=${forged}`, `${COOKIE}=${body}.`, `${COOKIE}=${old}`, `${COOKIE}=garbage`]) {
    assert.equal((await get('/control-tower/', { cookie })).status, 302, cookie);
    assert.equal((await get('/api/finance/data', { cookie })).status, 401, cookie);
  }
});

test('signed in and on the access list: the private pages and API open', async () => {
  assert.equal((await get('/control-tower/', as('aina@jda.app'))).status, 200);
  assert.equal((await get('/control-tower/invoices/', as('aina@jda.app'))).status, 200);
  assert.equal((await get('/control-tower/jda-report.html', as('aina@jda.app'))).status, 200);
  const data = await get('/api/finance/data', as('aina@jda.app'));
  assert.deepEqual([data.status, (await data.json()).storage], [200, 'memory']);
});

test('a session for someone taken off the access list stops working at once', async () => {
  assert.equal((await get('/control-tower/', as('badrul@jda.app'))).status, 302);
  assert.equal((await get('/api/finance/data', as('badrul@jda.app'))).status, 403);
});

test('sign in trades a Firebase token for the cookie; me and sign out', async () => {
  const realFetch = globalThis.fetch;
  forgetTokens();
  globalThis.fetch = async (url, init) => String(url).startsWith('https://identitytoolkit')
    ? { ok: true, json: async () => ({ users: [{ email: JSON.parse(init.body).idToken === 'tok-aina' ? 'aina@jda.app' : 'stranger@jda.app' }] }) }
    : realFetch(url, init);
  try {
    const post = (p, token) => realFetch(base + p, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {} });
    assert.equal((await post('/api/auth/session')).status, 400);
    const stranger = await post('/api/auth/session', 'tok-other');
    assert.equal(stranger.status, 403);
    assert.equal(stranger.headers.get('set-cookie'), null);
    const ok = await post('/api/auth/session', 'tok-aina');
    assert.equal(ok.status, 200);
    const cookie = ok.headers.get('set-cookie');
    assert.match(cookie, /^ct_session=[^;]+; Max-Age=28800; Path=\/; HttpOnly; SameSite=Lax$/);
    const jar = { cookie: cookie.split(';')[0] };
    assert.deepEqual(await (await realFetch(`${base}/api/auth/me`, { headers: jar })).json(), { signedIn: true, email: 'aina@jda.app' });
    assert.deepEqual(await (await realFetch(`${base}/api/auth/me`)).json(), { signedIn: false });
    assert.equal((await get('/control-tower/', jar)).status, 200);
    assert.match((await post('/api/auth/logout')).headers.get('set-cookie'), /^ct_session=; Max-Age=0;/);
  } finally { globalThis.fetch = realFetch; }
});

test('edit mode: a signed-in save is stored under that person, and the public page shows it', async () => {
  const put = (page, body, headers = {}) => fetch(`${base}/api/site/${page}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  assert.equal((await put('public', { content: {} })).status, 401);                               // signed out
  const ok = await put('public', { content: { header: { title: 'TRICIPTA AI', tagline: 'New tagline' } } }, as('aina@jda.app'));
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).updatedBy, 'aina');
  const stale = await put('public', { content: {}, base: '' }, as('aina@jda.app'));
  assert.equal(stale.status, 409);                                                                  // someone saved since this page opened
  const pub = await (await fetch(`${base}/api/public/site`)).json();
  assert.equal(pub.header.tagline, 'New tagline');
  assert.doesNotMatch(JSON.stringify(pub), /"aina"|updatedBy|updatedAt/);
  assert.equal((await put('nonsense', { content: {} }, as('aina@jda.app'))).status, 404);
});
