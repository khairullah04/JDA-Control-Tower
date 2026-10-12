import { Router } from 'express';
import { ADMIN, validToken } from '../passkeys.js';
import { bnmRate } from '../forex.js';
import { readSheets, writeWorkbook } from '../finance-xlsx.js';
import { isDate } from '../../web/js/finance/core.js';

// The CJI3 register, the sanctioned amounts and their audit log. Every route needs the Invoice
// Tracker's passkey session (and, unless REQUIRE_AUTH=false, a signed-in user, whose name goes into
// the audit log). The browser never writes this data itself: each change is validated, worked out
// and logged here, by the rules in web/js/finance.
export default function financeRoutes(finance, storage) {
  const router = Router();
  router.use((req, res, next) => validToken(req.headers['x-finance-token'], ADMIN) ? next()
    : res.status(401).json({ error: 'Enter the Invoice Tracker passkey to continue.', passkey: true }));

  const actor = req => req.user?.name || 'passkey holder';
  const kindOf = req => ({ entries: 'entry', sanctioned: 'sanctioned' })[req.params.kind];
  const ids = req => Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
  const run = fn => async (req, res) => {
    try { res.json(await fn(req)); }
    catch (e) { if (!e.status) console.error(e); res.status(e.status || 500).json({ error: e.message }); }
  };

  router.get('/session', run(async () => ({ ok: true })));
  router.get('/data', run(async () => ({ ...(await finance.data()), storage })));
  router.put('/settings', run(req => finance.saveSettings(req.body || {}, actor(req))));
  router.get('/audit', run(req => finance.audit({ entityId: String(req.query.entityId || '') })));
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

  router.post('/sanctioned/batch', run(req => finance.saveAll('sanctioned', Array.isArray(req.body?.inputs) ? req.body.inputs : [], actor(req))));
  router.post('/:kind', run(req => finance.save(kindOf(req), req.body || {}, actor(req))));
  router.post('/:kind/delete', run(req => finance.remove(kindOf(req), ids(req), actor(req))));
  router.post('/:kind/restore', run(req => finance.restore(kindOf(req), ids(req), actor(req))));
  router.post('/:kind/recalculate', run(req => finance.recalculate(kindOf(req), ids(req), req.body || {}, actor(req))));
  router.post('/:kind/import', run(req => finance.importRecords(kindOf(req), Array.isArray(req.body?.inputs) ? req.body.inputs : [], actor(req), { dryRun: req.body?.dryRun === true })));
  return router;
}
