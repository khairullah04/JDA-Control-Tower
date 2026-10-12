import { listDriveFiles, analyzeDriveFile } from './ai.js';
import { listJdas, listProjectsByJda, addLog, listProcessedFileIds, markFileProcessed } from './db.js';
import { data, importRecords } from './finance.js';
import { money } from '../finance/money.js';
import { live } from '../finance/core.js';
import { extractedInputs } from '../finance/sheets.js';

// What the AI is shown for each project: its code, its JDA, and what has been sanctioned for it.
async function buildCatalog(sanctioned) {
  const catalog = [];
  for (const j of await listJdas()) {
    for (const p of await listProjectsByJda(j.id)) {
      catalog.push({
        code: p.name, projectId: p.id, jdaId: j.id, jda: j.name,
        scope: sanctioned.filter(s => live(s) && s.projectId === p.id).map(s => ({ id: s.id, description: `${s.partner} ${s.month} ${s.description}`.trim(), amount: money(s.grossMyrMinor), plannedDate: s.month }))
      });
    }
  }
  return catalog;
}

// One shared Drive inbox holds every invoice. A single file can cover more than one project, so each
// file is analysed once and becomes one CJI3 entry per project it bills. Every entry arrives as
// Pending. One that is missing something essential - or whose project the AI could not place, which
// goes to Unsorted - is marked Incomplete and says what it lacks, so nothing is silently dropped.
export async function syncDrive(onProgress = () => {}) {
  const fin = await data();
  const [files, processed, catalog] = await Promise.all([listDriveFiles(), listProcessedFileIds(), buildCatalog(fin.sanctioned)]);
  const todo = files.filter(f => !processed.has(f.id));
  const unsorted = catalog.find(c => c.code === 'UNSORTED');
  const partners = [...new Set([...fin.entries, ...fin.sanctioned].filter(live).map(r => r.partner).filter(Boolean))];
  const target = code => { const c = catalog.find(x => x.code === code) || unsorted || {}; return { jdaId: c.jdaId, jdaName: c.jda, projectId: c.projectId, projectCode: c.code }; };
  const summary = { filesSkipped: files.length - todo.length, filesProcessed: 0, invoicesCreated: 0, unsortedAllocations: 0, redirected: [], failed: [] };

  for (const f of todo) {
    onProgress(f.name);
    try {
      const a = await analyzeDriveFile(f.id, catalog.map(({ code, jda, scope }) => ({ code, jda, scope })));
      const { results } = await importRecords('entry', extractedInputs(a, { target, partners, fileId: f.id, fileName: f.name }));
      const saved = results.filter(r => r.ok);
      for (const { record } of saved) {
        if (record.projectCode === 'UNSORTED') summary.unsortedAllocations++;
        if (record.missing.length) summary.redirected.push(`${f.name}: ${record.missing.join('; ')} — marked Incomplete, use Edit to fill it in`);
        await addLog(record.projectId, 'invoice', `Imported ${record.vendor || 'unknown vendor'} ${record.invoiceNo || '(no #)'} from ${f.name}${record.missing.length ? ' — incomplete, needs editing' : ''}`);
      }
      results.filter(r => !r.ok).forEach(r => summary.failed.push(`${f.name}: ${r.errors.join('; ')}`));
      await markFileProcessed(f.id, f.name, saved.length);
      summary.invoicesCreated += saved.length; summary.filesProcessed++;
    } catch (e) { summary.failed.push(`${f.name}: ${e.message}`); }
  }
  return summary;
}
