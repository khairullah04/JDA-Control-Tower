// node --test passkeys.test.mjs
// Which passkeys the server will run with, and how guessing one from many addresses is slowed down.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { passkeyProblems, passkeyFor, unlock, validToken } from './passkeys.js';

process.env.PASSKEYS_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'jda-')), 'passkeys.json');
const write = keys => fs.writeFileSync(process.env.PASSKEYS_FILE, typeof keys === 'string' ? keys : JSON.stringify(keys));
const good = { jda1: 'long-enough-1', admin: 'tracker-passkey' };

test('the server only starts on passkeys of at least 8 characters that are not the example ones', () => {
  write(good);
  assert.deepEqual(passkeyProblems(), []);
  write({ jda1: '1001', jda2: 'change-me-jda2', admin: '12345' });                    // the values the repository used to ship, and an example
  assert.deepEqual(passkeyProblems(), ['"jda1" must be at least 8 characters', '"jda2" is still the example value', '"admin" must be at least 8 characters']);
  write({ jda1: 'long-enough-1' });
  assert.deepEqual(passkeyProblems(), ['"admin" (the Invoice Tracker\'s passkey) is missing']);
  write('{ not json');
  assert.match(passkeyProblems()[0], /no readable passkey file/);
  fs.rmSync(process.env.PASSKEYS_FILE);
  assert.match(passkeyProblems()[0], /Copy server\/portal-passkeys\.example\.json/);
});

test('a weak passkey put in while the server runs is treated as not set', () => {
  write({ ...good, jda2: 'short' });
  assert.equal(passkeyFor('jda1'), 'long-enough-1');
  assert.equal(passkeyFor('jda2'), null);
  assert.equal(passkeyFor('jdaz'), null);
});

let server, base;
before(() => { const app = express(); app.set('trust proxy', 1); app.use(express.json()); app.post('/unlock', unlock); server = app.listen(0); base = `http://localhost:${server.address().port}`; });
after(() => server.close());
const tryFrom = async (address, jdaId, passkey) => {
  const res = await fetch(`${base}/unlock`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': address }, body: JSON.stringify({ jdaId, passkey }) });
  return { status: res.status, body: await res.json() };
};

test('behind the proxy each caller is counted by their own address', async () => {
  write(good);
  for (let i = 0; i < 5; i++) assert.equal((await tryFrom('10.0.0.1', 'jda1', 'wrong')).status, 401);
  assert.equal((await tryFrom('10.0.0.1', 'jda1', good.jda1)).status, 429);           // this address is locked out for a minute...
  const other = await tryFrom('10.0.0.2', 'jda1', good.jda1);                         // ...and nobody else is
  assert.equal(other.status, 200);
  assert.equal(validToken(other.body.token, 'jda1'), true);
});

test('many addresses guessing one passkey are slowed down together; a correct passkey clears it', async () => {
  write(good);
  for (let i = 0; i < 10; i++) assert.equal((await tryFrom(`10.1.0.${i}`, 'admin', 'guess')).status, 401);
  assert.equal((await tryFrom('10.1.0.50', 'admin', 'guess')).status, 401);            // the eleventh starts the wait (one second)
  const held = await tryFrom('10.1.0.51', 'admin', good.admin);
  assert.equal(held.status, 429);
  assert.match(held.body.error, /Too many wrong passkeys have been tried for this\. Try again in 1 seconds?\./);
  await new Promise(r => setTimeout(r, 1100));
  assert.equal((await tryFrom('10.1.0.52', 'admin', good.admin)).status, 200);
  assert.equal((await tryFrom('10.1.0.53', 'admin', 'guess')).status, 401);            // counting starts again from nothing
  assert.equal((await tryFrom('10.1.0.54', 'admin', good.admin)).status, 200);
});
