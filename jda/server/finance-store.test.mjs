// node --test finance-store.test.mjs
// Where invoices and payments are kept, and what the server refuses to start on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openStore, readFinanceFile } from './finance-store.js';
import { createFinance } from '../web/js/finance/service.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jda-')), file = path.join(dir, 'finance.json');
const env = over => ({ FINANCE_FILE: file, ...over });

test('no file yet is a first run; a damaged or unreadable file stops the server', async () => {
  assert.deepEqual(readFinanceFile(file), {});
  const { kind, store } = await openStore(env({ FINANCE_STORE: 'file' }));
  assert.equal(kind, 'file');
  const f = createFinance(store);
  await f.save('entry', { jdaId: 'j1', jdaName: 'JDA 1', projectId: 'p1', projectCode: 'AA', partner: 'IBM', invoiceNo: 'KEEP-1', documentDate: '2026-01-05', currency: 'MYR', amount: '100' }, 'aina');
  assert.equal(Object.keys(readFinanceFile(file).financeEntries).length, 1);                // written to the file, with its audit line
  assert.equal(Object.keys(readFinanceFile(file).financeAudit).length, 1);

  const good = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, good.slice(0, 40));                                                 // cut short, as after a crash or a full disk
  await assert.rejects(openStore(env({ FINANCE_STORE: 'file' })), /is damaged .* will not start on a damaged file/s);
  assert.equal(fs.readFileSync(file, 'utf8'), good.slice(0, 40));                            // and it was not overwritten
  fs.writeFileSync(file, '[]');
  assert.throws(() => readFinanceFile(file), /is damaged/);
  fs.rmSync(file); fs.mkdirSync(file);                                                       // something there that is not a readable file
  assert.throws(() => readFinanceFile(file), /cannot be read/);
  fs.rmdirSync(file); fs.writeFileSync(file, good);
  assert.equal((await createFinance((await openStore(env({ FINANCE_STORE: 'file' }))).store).data()).entries[0].invoiceNo, 'KEEP-1');
});

test('the store must be one that exists, and must be named in production', async () => {
  await assert.rejects(openStore(env({ FINANCE_STORE: 'firestor' })), /FINANCE_STORE is "firestor"\. It must be one of: firestore, file, memory/);
  await assert.rejects(openStore(env({ NODE_ENV: 'production' })), /FINANCE_STORE is not set\. In production/);
  assert.equal((await openStore(env({ NODE_ENV: 'production', FINANCE_STORE: 'memory' }))).kind, 'memory');
  assert.equal((await openStore(env({}))).kind, 'file');                                     // no key here, not production: the local file
});
