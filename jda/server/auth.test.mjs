// node --test auth.test.mjs
// The sign-in check in front of the API, with Google's token service stubbed out.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { requireUser, forgetTokens } from './auth.js';

const realFetch = globalThis.fetch;
let answer, asked;
beforeEach(() => { forgetTokens(); asked = []; globalThis.fetch = async (url, init) => { asked.push([String(url), JSON.parse(init.body)]); return answer; }; process.env.REQUIRE_AUTH = 'true'; process.env.FIREBASE_API_KEY = 'key-1'; process.env.ALLOWED_EMAILS = 'aina@jda.app, Badrul@JDA.app'; });
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

test('signed in but not on the access list: refused, by name', async () => {
  answer = reply(true, { users: [{ email: 'stranger@jda.app' }] });
  const out = await run({ authorization: 'Bearer tok' });
  assert.deepEqual([out.code, out.body.error], [403, 'stranger@jda.app is not on the access list. Ask the administrator to add it.']);
  answer = reply(true, { users: [{ email: 'BADRUL@jda.app' }] });                     // the list is not case-sensitive
  assert.equal((await run({ authorization: 'Bearer tok-2' })).next, true);
});

test('an empty access list lets nobody in, and says what to set', async () => {
  process.env.ALLOWED_EMAILS = ' ';
  answer = reply(true, { users: [{ email: 'aina@jda.app' }] });
  const out = await run({ authorization: 'Bearer tok' });
  assert.equal(out.code, 403);
  assert.match(out.body.error, /ALLOWED_EMAILS/);
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
