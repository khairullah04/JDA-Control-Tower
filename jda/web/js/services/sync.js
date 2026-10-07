import { listDriveFiles, analyzeDriveFile } from './ai.js';
import { listJdas, listProjectsByJda, listScope, addInvoice, addLog, listProcessedFileIds, markFileProcessed } from './db.js';

// An invoice missing something essential (vendor, invoice number, date, currency, amount) - or a
// charge with no usable project code/amount - is still imported, just routed to Unsorted with
// whatever was extracted, so nothing is silently dropped. The person fixes it with the Edit button.
function invoiceIssues(a) {
  const miss = [];
  if (!a.vendor) miss.push('vendor');
  if (!a.invoiceNo) miss.push('invoice number');
  if (!a.date) miss.push('date');
  if (!a.currency) miss.push('currency');
  if (typeof a.amount !== 'number' || !(a.amount > 0)) miss.push('amount');
  return miss;
}
function allocationIssues(alloc) {
  const miss = [];
  if (!alloc.projectCode) miss.push('project code');
  if (typeof alloc.amount !== 'number' || !(alloc.amount > 0)) miss.push('amount');
  return miss;
}

async function buildCatalog() {
  const jdas = await listJdas();
  const catalog = [];
  for (const j of jdas) {
    const projects = await listProjectsByJda(j.id);
    for (const p of projects) {
      const scope = await listScope(p.id);
      catalog.push({
        code: p.name, projectId: p.id, jda: j.name,
        scope: scope.map(s => ({ id: s.id, description: s.description, amount: s.amount, plannedDate: s.plannedDate }))
      });
    }
  }
  return catalog;
}

// One shared Drive inbox holds every invoice. A single file can cover more than one project, so each
// file is analysed once and its charges are sorted into whichever projects the AI reads off it.
export async function syncDrive(onProgress = () => {}) {
  const [files, processed, catalog] = await Promise.all([listDriveFiles(), listProcessedFileIds(), buildCatalog()]);
  const todo = files.filter(f => !processed.has(f.id));
  const byCode = Object.fromEntries(catalog.map(c => [c.code, c]));
  const unsorted = catalog.find(c => c.code === 'UNSORTED');
  const summary = { filesSkipped: files.length - todo.length, filesProcessed: 0, invoicesCreated: 0, unsortedAllocations: 0, redirected: [], failed: [] };

  for (const f of todo) {
    onProgress(f.name);
    try {
      const a = await analyzeDriveFile(f.id, catalog.map(({ code, jda, scope }) => ({ code, jda, scope })));
      const topIssues = invoiceIssues(a);
      const allocations = (Array.isArray(a.allocations) && a.allocations.length) ? a.allocations
        : [{ projectCode: 'UNSORTED', amount: typeof a.amount === 'number' ? a.amount : null, description: '(no charges could be extracted)', matchedScopeId: null, verdict: 'flagged', reasoning: 'No project allocation could be read from this invoice.' }];

      let created = 0;
      for (const alloc of allocations) {
        const issues = [...new Set([...topIssues, ...allocationIssues(alloc)])];
        const goesUnsorted = issues.length > 0 || !byCode[alloc.projectCode];
        const target = goesUnsorted ? unsorted : byCode[alloc.projectCode];
        if (goesUnsorted) summary.unsortedAllocations++;
        if (issues.length) summary.redirected.push(`${f.name}: missing ${issues.join(', ')} — sent to Unsorted, use Edit to fill it in`);

        const status = alloc.verdict === 'approved' && !issues.length ? 'pending' : 'notpaid';
        await addInvoice({
          projectId: target.projectId, vendor: a.vendor || null, invoiceNo: a.invoiceNo || null,
          date: a.date || null, dueDate: a.dueDate || null,
          currency: a.currency || null, amount: typeof alloc.amount === 'number' ? alloc.amount : null,
          subtotal: a.subtotal ?? null, taxRate: a.taxRate ?? null, taxAmount: a.taxAmount ?? null,
          description: alloc.description || '', lineItems: [], matchedScopeId: alloc.matchedScopeId || null,
          verdict: alloc.verdict || 'flagged', status, aiReasoning: alloc.reasoning || '', missingFields: issues,
          driveFileId: f.id, fileName: f.name, createdAt: new Date().toISOString()
        });
        await addLog(target.projectId, 'invoice', `Imported ${a.vendor || 'unknown vendor'} ${a.invoiceNo || '(no #)'} from ${f.name}${issues.length ? ' — incomplete, needs editing' : ` — ${alloc.verdict}`}`);
        summary.invoicesCreated++; created++;
      }
      await markFileProcessed(f.id, f.name, created);
      summary.filesProcessed++;
    } catch (e) { summary.failed.push(`${f.name}: ${e.message}`); }
  }
  return summary;
}
