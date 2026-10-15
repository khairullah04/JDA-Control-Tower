// node --experimental-test-module-mocks --test report-reader.test.mjs
// Reading a report for the public pages: shared reads, and the last good report kept when a read fails.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mockModule } from './test-mocks.mjs';

let calls = 0, answer = () => ({ exists: true, data: () => ({ projects: [{ name: 'A' }] }) });
mockModule('./firebase-admin.js', { hasKey: () => true, adminDb: async () => ({ collection: () => ({ doc: () => ({ get: async () => { calls++; await new Promise(r => setTimeout(r, 10)); return answer(); } }) }) }) });
const { readReport, forgetReports, forgetReport } = await import('./report-reader.js');
const JDA = { id: 'jda1', name: 'JDA 1' };

test('requests that arrive together share one read, and it is kept for a minute', async () => {
  forgetReports(); calls = 0;
  const [a, b] = await Promise.all([readReport(JDA, 1000), readReport(JDA, 1000)]);
  assert.deepEqual([a, b, calls], [{ projects: [{ name: 'A' }] }, { projects: [{ name: 'A' }] }, 1]);
  await readReport(JDA, 30_000);
  assert.equal(calls, 1);
});

test('a failed read keeps the last good report', async () => {
  forgetReports(); calls = 0;
  await readReport(JDA, 1000);
  answer = () => { throw new Error('timeout'); };
  assert.deepEqual(await readReport(JDA, 70_000), { projects: [{ name: 'A' }] });
  forgetReports();
  assert.equal(await readReport(JDA, 200_000), null);                                    // nothing read before: nothing to keep
});

test('after a save, that JDA is read again at once; the others stay kept', async () => {
  forgetReports(); calls = 0;
  const [j1, j2] = [JDA, { id: 'jda2', name: 'JDA 2' }];
  await readReport(j1); await readReport(j2); assert.equal(calls, 2);
  forgetReport(j1.id);
  await readReport(j1); await readReport(j2); assert.equal(calls, 3);
});
