// node --test auth.test.mjs
// The sign-in check in front of the API, with Google's token service stubbed out.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { requireUser, forgetTokens, authRoutes, inDomain, passwordProblem } from './auth.js';

const realFetch = globalThis.fetch;
let answer, asked;
beforeEach(() => { forgetTokens(); asked = []; globalThis.fetch = async (url, init) => { asked.push([String(url), JSON.parse(init.body)]); return answer; }; process.env.REQUIRE_AUTH = 'true'; process.env.FIREBASE_API_KEY = 'key-1'; process.env.ALLOWED_EMAILS = 'aina@jda.app, Badrul@JDA.app'; });
afterEach(() => { globalThis.fetch = realFetch; });
const reply = (ok, body) => ({ ok, json: async () => body });
const run = (headers = {}) => new Promise(resolve => {
  const req = { method: 'GET', headers }, res = { status(code) { this.code = code; return this; }, json(body) { resolve({ code: this.code, body, req }); }, setHeader(k, v) { this.cookie = v; } };
  requireUser(req, res, () => resolve({ next: true, req, cookie: res.cookie }));
});

test('no token: refused before Google is asked', async () => {
  assert.deepEqual([(await run()).code, asked.length], [401, 0]);
});

test('a good token: the request goes on, and carries who it is', async () => {
  answer = reply(true, { users: [{ email: 'aina@jda.app' }] });
  const out = await run({ authorization: 'Bearer tok-1' });
  assert.equal(out.next, true);
  assert.equal(out.req.user.email, 'aina@jda.app');
  assert.equal(out.req.user.name, 'aina');
  assert.deepEqual(asked[0], ['https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=key-1', { idToken: 'tok-1' }]);
});

test('a good token renews the session cookie, so a page whose cookie ran out keeps working', async () => {
  answer = reply(true, { users: [{ email: 'aina@jda.app' }] });
  assert.match((await run({ authorization: 'Bearer tok-r' })).cookie, /^ct_session=[^;]+; Max-Age=28800; Path=\/; HttpOnly; SameSite=Lax$/);
});

test('outside @petronas.com and not on the list of exceptions: refused', async () => {
  answer = reply(true, { users: [{ email: 'stranger@jda.app', emailVerified: true }] });
  const out = await run({ authorization: 'Bearer tok' });
  assert.deepEqual([out.code, out.body.error], [403, 'Only @petronas.com addresses can use the JDA Control Tower.']);
  answer = reply(true, { users: [{ email: 'BADRUL@jda.app' }] });                     // the list is not case-sensitive
  assert.equal((await run({ authorization: 'Bearer tok-2' })).next, true);
});

test('@petronas.com: in once verified, refused (and told to verify) before; look-alike domains refused', async () => {
  process.env.ALLOWED_EMAILS = ' ';
  answer = reply(true, { users: [{ email: 'Siti@Petronas.com', emailVerified: true }] });
  const ok = await run({ authorization: 'Bearer tok-p' });
  assert.deepEqual([ok.next, ok.req.user.email], [true, 'siti@petronas.com']);
  answer = reply(true, { users: [{ email: 'new@petronas.com', emailVerified: false }] });
  const out = await run({ authorization: 'Bearer tok-u' });
  assert.deepEqual([out.code, out.body.verify], [403, true]);
  assert.match(out.body.error, /not verified/);
  for (const email of ['x@petronas.com.evil.io', 'x@evilpetronas.com', 'x@sub.petronas.com', 'x@petronas.co', 'a@b@petronas.com'])
    assert.equal(inDomain(email), false, email);
});

test('an expired or made-up token: 401', async () => {
  answer = reply(false, { error: { message: 'INVALID_ID_TOKEN' } });
  const out = await run({ authorization: 'Bearer nope' });
  assert.deepEqual([out.code, out.body.error], [401, 'Session expired. Sign in again.']);
});

test('a wrong server key is reported as a server problem, not as a sign-in problem', async () => {
  answer = reply(false, { error: { message: 'API key not valid. Please pass a valid API key.' } });
  const out = await run({ authorization: 'Bearer tok' });
  assert.equal(out.code, 500);
  assert.match(out.body.error, /not set up on the server/);
});

test('Google unreachable: 500, not a crash', async () => {
  globalThis.fetch = async () => { throw new Error('network down'); };
  assert.equal((await run({ authorization: 'Bearer tok' })).code, 500);
});

test('REQUIRE_AUTH=false skips the check', async () => {
  process.env.REQUIRE_AUTH = 'false';
  assert.deepEqual([(await run()).next, asked.length], [true, 0]);
});

test('a token that has been checked is not checked again for five minutes; the access list still is', async () => {
  const realNow = Date.now; let clock = 1_800_000_000_000; Date.now = () => clock;
  try {
    answer = reply(true, { users: [{ email: 'aina@jda.app' }] });
    assert.equal((await run({ authorization: 'Bearer tok-a' })).next, true);
    assert.equal((await run({ authorization: 'Bearer tok-a' })).req.user.email, 'aina@jda.app');
    assert.equal(asked.length, 1);                                                    // Google was asked once
    assert.equal((await run({ authorization: 'Bearer tok-b' })).next, true);
    assert.equal(asked.length, 2);                                                    // another token is another question
    process.env.ALLOWED_EMAILS = 'badrul@jda.app';
    assert.equal((await run({ authorization: 'Bearer tok-a' })).code, 403);          // taken off the list: refused at once, cache or not
    process.env.ALLOWED_EMAILS = 'aina@jda.app, badrul@jda.app';
    clock += 5 * 60_000 + 1;
    assert.equal((await run({ authorization: 'Bearer tok-a' })).next, true);
    assert.equal(asked.length, 3);                                                    // five minutes on, it is checked again
    answer = reply(false, { error: { message: 'INVALID_ID_TOKEN' } });
    assert.equal((await run({ authorization: 'Bearer bad' })).code, 401);
    assert.equal((await run({ authorization: 'Bearer bad' })).code, 401);
    assert.equal(asked.length, 5);                                                    // a refusal is never remembered
    // a token about to run out is not kept past its own end
    const expiring = 'h.' + Buffer.from(JSON.stringify({ exp: Math.floor(clock / 1000) + 60 })).toString('base64url') + '.s';
    answer = reply(true, { users: [{ email: 'aina@jda.app' }] });
    await run({ authorization: 'Bearer ' + expiring }); clock += 61_000; await run({ authorization: 'Bearer ' + expiring });
    assert.equal(asked.length, 7);
  } finally { Date.now = realNow; }
});

/* ---------- Sign up and reset password (/api/auth/signup, /api/auth/reset) ---------- */
const call = (path, body, ip = '10.0.0.' + Math.random()) => new Promise(resolve => {
  const req = { method: 'POST', url: path, headers: {}, body, ip }, res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(b) { resolve({ code: this.statusCode, body: b }); }, setHeader() {}, set() { return this; }, end() {} };
  authRoutes.handle(req, res, () => resolve({ code: 404 }));
});

test('passwords: 10 or more characters, letters and a digit', () => {
  assert.deepEqual(['short1', 'longenoughbutnodigit', '1234567890', 'goodpass123'].map(p => !passwordProblem(p)), [false, false, false, true]);
});

test('sign up: @petronas.com only, checked by the server; Firebase makes the account and sends the verification link', async () => {
  answer = reply(true, { idToken: 'new-tok' });
  const outside = await call('/signup', { email: 'me@gmail.com', password: 'goodpass123' });
  assert.deepEqual([outside.code, outside.body.field, asked.length], [400, 'email', 0]);
  const weak = await call('/signup', { email: 'me@petronas.com', password: 'short' });
  assert.deepEqual([weak.code, asked.length], [400, 0]);
  const ok = await call('/signup', { email: ' Me@Petronas.com ', password: 'goodpass123' });
  assert.equal(ok.code, 200);
  assert.deepEqual(asked.map(([u, b]) => [u.replace(/\?.*/, ''), b]), [
    ['https://identitytoolkit.googleapis.com/v1/accounts:signUp', { email: 'me@petronas.com', password: 'goodpass123', returnSecureToken: true }],
    ['https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode', { requestType: 'VERIFY_EMAIL', idToken: 'new-tok' }]]);
  // an address that already has an account gets the same answer, so nobody can find out who has one
  answer = reply(false, { error: { message: 'EMAIL_EXISTS' } });
  const again = await call('/signup', { email: 'me@petronas.com', password: 'goodpass123' });
  assert.deepEqual([again.code, again.body.message], [200, ok.body.message]);
});

test('reset password: a link for @petronas.com (or an exception), the same answer for everyone', async () => {
  process.env.ALLOWED_EMAILS = 'aina@jda.app';
  answer = reply(true, {});
  const a = await call('/reset', { email: 'me@petronas.com' }), b = await call('/reset', { email: 'aina@jda.app' }), c = await call('/reset', { email: 'me@gmail.com' });
  assert.deepEqual([a.code, b.code, c.code], [200, 200, 200]);
  assert.equal(a.body.message, c.body.message);
  assert.deepEqual(asked.map(([, body]) => body), [{ requestType: 'PASSWORD_RESET', email: 'me@petronas.com' }, { requestType: 'PASSWORD_RESET', email: 'aina@jda.app' }]); // none for gmail
  answer = reply(false, { error: { message: 'EMAIL_NOT_FOUND' } });
  assert.equal((await call('/reset', { email: 'nobody@petronas.com' })).body.message, a.body.message);
});

test('sign up and reset are slowed down: 5 tries per 15 minutes from one address', async () => {
  answer = reply(true, { idToken: 't' });
  const codes = [];
  for (let i = 0; i < 6; i++) codes.push((await call('/reset', { email: 'me@petronas.com' }, '10.9.9.9')).code);
  assert.deepEqual(codes, [200, 200, 200, 200, 200, 429]);
});
