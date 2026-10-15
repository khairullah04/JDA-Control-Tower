// node --experimental-test-module-mocks --test tracker-sync.test.mjs
// The Invoice Tracker's "Sync from Drive": the loop that reads each new file in the inbox once and
// enters what it bills. Drive, the AI and the tracker's own database are stubbed; the register is
// the real one, so what the sync saves is validated and worked out exactly as in use.
import { test, beforeEach } from 'node:test';
import { mockModule } from './test-mocks.mjs';
import assert from 'node:assert/strict';
import { createFinance, memoryStore } from '../web/control-tower/invoices/js/finance/service.js';

let finance, inbox, read, processed, analysed, logged;
const projects = { j1: [{ id: 'p1', name: 'AA' }, { id: 'p2', name: 'AB' }], j9: [{ id: 'u1', name: 'UNSORTED' }] };
mockModule('../web/control-tower/invoices/js/services/ai.js', {
  listDriveFiles: async () => inbox,
  analyzeDriveFile: async (id, catalog) => { analysed.push([id, catalog]); if (read[id] instanceof Error) throw read[id]; return read[id]; }
});
mockModule('../web/control-tower/invoices/js/services/db.js', {
  listJdas: async () => [{ id: 'j1', name: 'JDA 1' }, { id: 'j9', name: 'Unsorted' }], listProjectsByJda: async id => projects[id],
  addLog: async (...line) => { logged.push(line); }, listProcessedFileIds: async () => new Set(processed.map(p => p[0])),
  markFileProcessed: async (...mark) => { processed.push(mark); }
});
mockModule('../web/control-tower/invoices/js/services/finance.js', { data: () => finance.data(), importRecords: (kind, inputs) => finance.importRecords(kind, inputs, 'sync') });
const { syncDrive } = await import('../web/control-tower/invoices/js/services/sync.js');

const file = n => ({ id: `f${n}`, name: `invoice_${n}.pdf` });
const invoice = (no, allocations, over = {}) => ({ vendor: 'IBM Malaysia Sdn Bhd', invoiceNo: no, date: '2026-09-03', currency: 'MYR', amount: allocations.reduce((t, a) => t + a.amount, 0), taxRate: 0.08, allocations, ...over });
beforeEach(async () => {
  finance = createFinance(memoryStore());
  await finance.save('sanctioned', { jdaId: 'j1', jdaName: 'JDA 1', projectId: 'p1', projectCode: 'AA', partner: 'IBM', month: '2026-09', currency: 'MYR', amount: '1000', description: 'Licences' }, 'aina');
  inbox = [file(1), file(2), file(3), file(4)]; processed = [['f2', 'invoice_2.pdf', 1]]; analysed = []; logged = [];
  read = {
    f1: invoice('IN-1', [{ projectCode: 'AA', amount: 108, description: 'Licences', verdict: 'approved' }, { projectCode: 'ZZ', amount: 216, description: 'Unknown work', verdict: 'flagged', reasoning: 'No such project' }]),
    f3: new Error('The AI could not read this file.'),
    f4: invoice('IN-4', [{ projectCode: 'AB', amount: 54 }], { date: '' })
  };
});

test('each new file is read once; every charge becomes a Pending invoice on its project', async () => {
  const seen = [], s = await syncDrive(name => seen.push(name));
  assert.deepEqual(seen, ['invoice_1.pdf', 'invoice_3.pdf', 'invoice_4.pdf']);                       // the file already imported is not read again
  assert.deepEqual([s.filesSkipped, s.filesProcessed, s.invoicesCreated, s.unsortedAllocations], [1, 2, 3, 1]);
  assert.deepEqual(s.failed, ['invoice_3.pdf: The AI could not read this file.']);
  const entries = (await finance.data()).entries.map(e => [e.invoiceNo, e.projectCode, e.partner, e.status, e.grossMyrMinor, e.driveFileId, e.missing.length > 0]);
  assert.deepEqual(entries, [
    ['IN-1', 'AA', 'IBM', 'pending', 10800, 'f1', false],                                             // the vendor is matched to the partner already known as "IBM"
    ['IN-1', 'UNSORTED', 'IBM', 'pending', 21600, 'f1', false],                                       // a project the AI could not place goes to Unsorted, never dropped
    ['IN-4', 'AB', 'IBM', 'pending', 5400, 'f4', true]                                                // no date on the invoice: kept, marked incomplete
  ]);
  assert.equal(s.redirected.length, 1);
  assert.match(s.redirected[0], /^invoice_4\.pdf: .*Invoice date must be a valid date.*marked Incomplete/);
  assert.deepEqual(processed.slice(1), [['f1', 'invoice_1.pdf', 2], ['f4', 'invoice_4.pdf', 1]]);     // the failed file is not marked: it is tried again next time
  assert.deepEqual(logged.map(l => [l[0], l[1]]), [['p1', 'invoice'], ['u1', 'invoice'], ['p2', 'invoice']]);
  assert.match(logged[2][2], /incomplete, needs editing/);
  const catalog = analysed[0][1];                                                                     // what the AI is told about the projects
  assert.deepEqual(catalog.map(c => [c.code, c.jda]), [['AA', 'JDA 1'], ['AB', 'JDA 1'], ['UNSORTED', 'Unsorted']]);
  assert.deepEqual(catalog[0].scope.map(x => [x.description, x.amount, x.plannedDate]), [['IBM 2026-09 Licences', 'MYR 1,080.00', '2026-09']]);
});

test('running it again adds nothing, even if the first run stopped before marking a file done', async () => {
  await syncDrive();
  processed = processed.filter(p => p[0] !== 'f1'); analysed = [];                                    // as if the tab was closed between saving f1's invoices and marking it
  read.f3 = invoice('IN-3', [{ projectCode: 'AA', amount: 108 }]);                                    // and the unreadable file has been replaced
  const s = await syncDrive();
  assert.deepEqual(analysed.map(a => a[0]), ['f3']);                                                  // f1 is not sent to the AI a second time
  assert.deepEqual([s.filesSkipped, s.filesProcessed, s.invoicesCreated, s.failed], [3, 1, 1, []]);
  assert.equal((await finance.data()).entries.length, 4);
});

test('an invoice the register refuses is reported, not lost in silence', async () => {
  await finance.save('entry', { jdaId: 'j1', jdaName: 'JDA 1', projectId: 'p1', projectCode: 'AA', partner: 'IBM', invoiceNo: 'IN-1', documentDate: '2026-09-01', currency: 'MYR', amount: '1' }, 'aina');
  inbox = [file(1)]; processed = [];
  const s = await syncDrive();
  assert.deepEqual([s.invoicesCreated, s.filesProcessed], [1, 1]);                                    // the Unsorted share still goes in
  assert.equal(s.failed.length, 1);
  assert.match(s.failed[0], /^invoice_1\.pdf: Invoice IN-1 is already entered for project AA/);
});
