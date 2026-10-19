import { Router } from 'express';
import { bnmRate } from '../forex.js';
import { readSheets, writeWorkbook } from '../finance-xlsx.js';
import { isDate } from '../../web/control-tower/invoices/js/finance/core.js';

// The CJI3 register, the sanctioned amounts and their audit log. Every route sits behind the JDA
// Control Tower sign-in (app.js), and the signed-in person's name goes into the audit log. The browser never writes this data itself: each change is validated, worked out
// and logged here, by the rules in web/js/finance.
export default function financeRoutes(finance, storage) {
  const router = Router();

  const actor = req => req.user?.name || 'unknown';
  const kindOf = req => ({ entries: 'entry', sanctioned: 'sanctioned' })[req.params.kind];
  const ids = req => Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
  const run = fn => async (req, res) => {
    try { res.json(await fn(req)); }
    catch (e) { if (!e.status) console.error(e); res.status(e.status || 500).json({ error: e.message }); }
  };

  router.get('/data', run(async () => ({ ...(await finance.data()), storage })));
  router.put('/settings', run(req => finance.saveSettings(req.body || {}, actor(req))));
  // ?entityId= one record's history, ?projectId= or ?jdaId= that project's or JDA's, none: everything. Newest first, `limit` lines (500 at most).
  router.get('/audit', run(req => {
    const q = k => String(req.query[k] || ''), limit = Math.min(Math.max(parseInt(q('limit'), 10) || 500, 1), 500);
    return finance.audit({ entityId: q('entityId'), projectId: q('projectId'), jdaId: q('jdaId'), limit });
  }));
  router.get('/forex', run(req => {
    const currency = String(req.query.currency || '').toUpperCase(), date = String(req.query.date || '');
    if (!/^[A-Z]{3}$/.test(currency) || (date && !isDate(date))) throw Object.assign(new Error('Which currency, and for which date?'), { status: 400 });
    return bnmRate(currency, date);
  }));
  router.post('/read', run(async req => ({ sheets: await readSheets(String(req.body?.name), Buffer.from(String(req.body?.fileBase64 || ''), 'base64')) })));
  router.post('/workbook', async (req, res) => {
    try { res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(await writeWorkbook(req.body?.sheets || [])); }
    catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
  });
  router.post('/entries/status', run(req => finance.setStatus(ids(req), String(req.body?.status), actor(req))));
  // The approval process: move invoices to a stage, with a note (a reason when rejecting). Paid is
  // never set here: it comes from matching a CJI3 line.
  router.post('/entries/stage', run(req => finance.moveStage(ids(req), String(req.body?.to || ''), { note: String(req.body?.note || '') }, actor(req))));
  router.get('/stages', run(req => finance.stageHistory(String(req.query.entityId || ''))));

  router.post('/sanctioned/batch', run(req => finance.saveAll('sanctioned', Array.isArray(req.body?.inputs) ? req.body.inputs : [], actor(req))));
  router.post('/:kind', run(req => finance.save(kindOf(req), req.body || {}, actor(req))));
  router.post('/:kind/delete', run(req => finance.remove(kindOf(req), ids(req), actor(req))));
  router.post('/:kind/restore', run(req => finance.restore(kindOf(req), ids(req), actor(req))));
  router.post('/:kind/recalculate', run(req => finance.recalculate(kindOf(req), ids(req), req.body || {}, actor(req))));
  router.post('/:kind/import', run(req => finance.importRecords(kindOf(req), Array.isArray(req.body?.inputs) ? req.body.inputs : [], actor(req), { dryRun: req.body?.dryRun === true, duplicates: req.body?.duplicates === 'add' ? 'add' : 'skip' })));
  return router;
}
