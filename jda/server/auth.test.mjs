// node --test auth.test.mjs
// The sign-in check in front of the API, with Google's token service stubbed out.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { requireUser } from './auth.js';

const realFetch = globalThis.fetch;
let answer, asked;
beforeEach(() => { asked = []; globalThis.fetch = async (url, init) => { asked.push([String(url), JSON.parse(init.body)]); return answer; }; process.env.REQUIRE_AUTH = 'true'; process.env.FIREBASE_API_KEY = 'key-1'; });
afterEach(() => { globalThis.fetch = realFetch; });
const reply = (ok, body) => ({ ok, json: async () => body });
const run = (headers = {}) => new Promise(resolve => {
  const req = { headers }, res = { status(code) { this.code = code; return this; }, json(body) { resolve({ code: this.code, body, req }); } };
  requireUser(req, res, () => resolve({ next: true, req }));
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

test('an expired or made-up token: 401', async () => {
  answer = reply(false, { error: { message: 'INVALID_ID_TOKEN' } });
  const out = await run({ authorization: 'Bearer nope' });
  assert.deepEqual([out.code, out.body.error], [401, 'Session expired. Sign in again.']);
});

test('a wrong server key is reported as a server problem, not as a sign-in problem', async () => {
  answer = reply(false, { error: { message: 'API key not valid. Please pass a valid API key.' } });
  const out = await run({ authorization: 'Bearer tok' });
  assert.equal(out.code, 500);
  assert.match(out.body.error, /FIREBASE_API_KEY/);
});

test('Google unreachable: 500, not a crash', async () => {
  globalThis.fetch = async () => { throw new Error('network down'); };
  assert.equal((await run({ authorization: 'Bearer tok' })).code, 500);
});

test('REQUIRE_AUTH=false skips the check', async () => {
  process.env.REQUIRE_AUTH = 'false';
  assert.deepEqual([(await run()).next, asked.length], [true, 0]);
});
