// node --test firestore-rules.test.mjs
// The database rules (firebase/firestore.rules) are closed by default: only the collections the browser
// really uses are open, and the ones only the server may write never are. (The rules are checked as
// text here; they take effect only once published: docs/server-and-invoices.md, "Setup".)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const rules = fs.readFileSync(new URL('../firebase/firestore.rules', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
const opened = Object.fromEntries([...rules.matchAll(/match \/(\w+)\/\{\w+(?:=\*\*)?\}\s*\{\s*allow ([^:]+):\s*if ([^;]+);/g)].map(m => [m[1], { what: m[2].split(',').map(x => x.trim()).sort(), when: m[3].trim() }]));

test('no catch-all: a collection not named is closed', () => {
  assert.doesNotMatch(rules, /match \/\{\w+\}/, 'a wildcard collection match would open every new collection');
});

test('only these collections are open to browsers, and only to people on the access list', () => {
  assert.deepEqual(Object.keys(opened).sort(), ['activity', 'invoices', 'jdaReports', 'jdas', 'meta', 'processedFiles', 'projects', 'scope']);
  for (const [name, r] of Object.entries(opened)) assert.equal(r.when, 'onAccessList()', name);
  assert.deepEqual([opened.activity.what, opened.processedFiles.what, opened.invoices.what, opened.jdaReports.what], [['create', 'read'], ['create', 'read'], ['read'], ['read']]);
});

test('the server-only collections are never named, so they stay closed', () => {
  for (const name of ['financeEntries', 'financeSanctioned', 'financeAudit', 'financeMeta', 'financeStages', 'cji3Lines', 'cji3Imports', 'access', 'site']) assert.ok(!(name in opened), name);
});

test('a verified @petronas.com address is let in by the rules; an unverified one, or a look-alike domain, is not', () => {
  const fn = rules.slice(rules.indexOf('function onAccessList()'), rules.indexOf('match /jdas/'));
  assert.match(fn, /request\.auth\.token\.email_verified == true/);
  const re = new RegExp(fn.match(/matches\('([^']+)'\)/)[1]);
  assert.deepEqual(['a@petronas.com', 'a@petronas.com.evil.io', 'a@xpetronas.com', 'a@sub.petronas.com'].map(e => re.test(e)), [true, false, false, false]);
});
