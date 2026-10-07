// node --experimental-test-module-mocks --test portal-drive.test.mjs
// Checks folder recognition and file reading against a fake Drive tree.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';

const FOLDER = 'application/vnd.google-apps.folder';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const f = (id, name, mimeType = 'text/plain', modifiedTime = '2026-09-01T00:00:00Z') => ({ id, name, mimeType, modifiedTime, size: '10' });
// root > JDA 1 > Master File, PROGRESS > Overall Progress > Weekly Progress   (the nesting from the brief)
const tree = {
  root: [f('j1', 'JDA 1', FOLDER), f('j2', 'jda2', FOLDER), f('loose', 'readme.txt')],
  j1: [f('mf', 'MASTER FILE', FOLDER), f('pr', 'Progress', FOLDER), f('stray', 'notes.txt')],
  mf: [f('m1', 'home.docx')],
  pr: [f('ov', 'Overall progress', FOLDER), f('p1', 'directly-in-progress.txt')],
  ov: [f('o1', 'overall.xlsx', XLSX, '2026-09-05T00:00:00Z'), f('wk', 'weekly progress', FOLDER)],
  wk: [f('w2', 'week2.pdf', 'application/pdf', '2026-09-20T00:00:00Z'), f('w1', 'week1.pdf', 'application/pdf', '2026-09-13T00:00:00Z')],
  j2: []
};

const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet('P2b S Curve');
ws.addRow(['Action Items', 'Weightage', 'Actual Date']);
ws.addRow(['Reality Capture Handover', 20, new Date('2026-09-02T00:00:00Z')]);
const xlsx = Buffer.from(await wb.xlsx.writeBuffer());
const bodies = { o1: xlsx, m1: Buffer.from('zip-not-text'), w1: Buffer.from('%PDF-1.4 fake'), p1: Buffer.from('plain words') };

mock.module('./drive.js', { exports: {
  ALL: {},
  drive: { files: {
    list: async ({ q }) => ({ data: { files: tree[q.match(/'([^']+)' in parents/)[1]] || [] } }),
    get: async ({ fileId }) => ({ data: bodies[fileId] }),
    export: async () => ({ data: Buffer.from('exported') })
  } }
} });
process.env.PORTAL_DRIVE_ROOT_FOLDER_ID = 'root';
const { listJdaFiles, fileBlocks } = await import('./portal-drive.js');

test('sorts files by the folder they sit under, oldest first', async () => {
  const files = await listJdaFiles({ id: 'jda1', name: 'JDA 1' });
  const names = k => files[k].map(x => x.name);
  assert.deepEqual(names('master'), ['home.docx']);
  assert.deepEqual(names('overall'), ['directly-in-progress.txt', 'overall.xlsx']);
  assert.deepEqual(names('weekly'), ['week1.pdf', 'week2.pdf']);
  assert.deepEqual(names('ignored'), ['notes.txt']);
});

test('finds a JDA folder by name or id, and reports a missing one', async () => {
  assert.ok(await listJdaFiles({ id: 'jda2', name: 'JDA 2' }));
  assert.equal(await listJdaFiles({ id: 'jda7', name: 'JDA 7' }), null);
});

test('reads Excel as text, every sheet', async () => {
  const [block] = await fileBlocks(tree.ov[0]);
  assert.match(block.text, /FILE: overall\.xlsx \(last modified 2026-09-05\)/);
  assert.match(block.text, /--- Sheet: P2b S Curve ---/);
  assert.match(block.text, /Reality Capture Handover\t20\t2026-09-02/);
});

test('passes PDFs to Claude as documents and plain text as text', async () => {
  const pdf = await fileBlocks(tree.wk[1]);
  assert.equal(pdf[1].type, 'document');
  assert.equal(pdf[1].source.media_type, 'application/pdf');
  assert.match((await fileBlocks(tree.pr[1]))[0].text, /plain words/);
});

test('refuses what it cannot read instead of guessing', async () => {
  await assert.rejects(fileBlocks(f('z', 'deck.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation')), /unsupported file type/);
  await assert.rejects(fileBlocks({ ...f('big', 'big.pdf', 'application/pdf'), size: String(30 * 1024 * 1024) }), /larger than 20 MB/);
});
