import { Router } from 'express';
import { publicMessage } from '../errors.js';
import { bnmRate } from '../forex.js';
import { readSheets, writeWorkbook } from '../finance-xlsx.js';
import { isDate } from '../../web/control-tower/invoices/js/finance/core.js';
import { ROLES, roleFor } from '../../web/control-tower/invoices/js/finance/workflow.js';

// Who holds each role in the approval process: ROLE_ACCOUNTANT1, ROLE_PM, ROLE_LEAD, ROLE_ACCOUNTANT2 in
// server/.env, comma-separated emails. A role whose list is empty is open to anyone signed in.
export const rolesFromEnv = (env = process.env) => Object.fromEntries(Object.keys(ROLES).map(k =>
  [k, String(env[`ROLE_${k.toUpperCase()}`] || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean)]));

// The CJI3 register, the sanctioned amounts and their audit log. Every route sits behind the JDA
// Control Tower sign-in (app.js), and the signed-in person's name goes into the audit log. The browser never writes this data itself: each change is validated, worked out
// and logged here, by the rules in web/js/finance.
export default function financeRoutes(finance, storage, { roles = rolesFromEnv() } = {}) {
  const router = Router();

  const actor = req => req.user?.name || 'unknown';
  const kindOf = req => ({ entries: 'entry', sanctioned: 'sanctioned' })[req.params.kind];
  const ids = req => Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
  const run = fn => async (req, res) => {
    try { res.json(await fn(req)); }
    catch (e) { res.status(e.status || 500).json({ error: publicMessage(e) }); }
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
    catch (e) { res.status(500).json({ error: publicMessage(e, 'The Excel file could not be written. Try again.') }); }
  });
  // An invoice's status follows its stage (workflow.js): it moves only through Approvals, and Paid only
  // when a CJI3 line is matched. Nothing sets it by hand: the old status menu is gone.
  router.post('/entries/status', (req, res) => res.status(410).json({ error: "An invoice's status changes through Approvals, and it becomes Paid only when a CJI3 line is matched." }));
  const noHandStatus = input => { const { status, stage, route, archivedAt, paidBy, ...rest } = input || {}; return rest; };
  // The approval process: move invoices to a stage, with a note (a reason when rejecting). Paid is
  // never set here: it comes from matching a CJI3 line.
  // Who may make a move: the role's people (when its list is filled in), and never the same person at both
  // ends of the money path: whoever validated an invoice as PM cannot also approve it as Project Lead.
  // (Not checked with sign-in off, on one's own computer, where everyone is the same "local" user.)
  const may = req => (move, record) => {
    const role = move && roleFor(move), list = roles[role] || [], me = String(req.user?.email || '').toLowerCase();
    if (role && list.length && !list.includes(me)) return `Only the ${ROLES[role]} may do this (${move.action}).`;
    if (move?.from === 'pending_lead' && move.to === 'to_be_paid' && me !== 'local@sign-in-off' && record?.stageBy && record.stageBy === actor(req))
      return 'You validated this invoice, so someone else has to approve it.';
    return '';
  };
  router.post('/entries/stage', run(req => finance.moveStage(ids(req), String(req.body?.to || ''), { note: String(req.body?.note || ''), may: may(req) }, actor(req))));
  router.get('/stages', run(req => finance.stageHistory(String(req.query.entityId || ''))));

  // CJI3 lines: upload one of the two files (the server reads the .xlsx or .csv), with a preview first
  // (`dryRun`); the lines stored; the log of past uploads.
  router.post('/cji3/import', run(async req => {
    const b = req.body || {}, sheets = b.fileBase64 ? await readSheets(String(b.fileName), Buffer.from(String(b.fileBase64), 'base64')) : b.sheets;
    return finance.importCji3({ group: String(b.group || ''), fileName: String(b.fileName || ''), sheets }, actor(req), { dryRun: b.dryRun === true });
  }));
  router.get('/cji3/lines', run(req => finance.cji3Lines(String(req.query.group || ''))));
  // Match a line to an invoice by hand (`invoiceId`), or undo its match (no `invoiceId`); match again
  // every line of a file not yet matched (after new invoices have come in).
  router.post('/cji3/match', run(req => finance.matchLine(String(req.body?.lineId || ''), String(req.body?.invoiceId || ''), actor(req))));
  router.post('/cji3/rematch', run(async req => finance.matchCji3((await finance.cji3Lines(String(req.body?.group || ''))).filter(l => !l.invoiceId).map(l => l.id), actor(req))));
  router.get('/cji3/imports', run(() => finance.cji3Imports()));
  router.post('/sanctioned/batch', run(req => finance.saveAll('sanctioned', Array.isArray(req.body?.inputs) ? req.body.inputs : [], actor(req))));
  // A new invoice starts at Received (Pending); an edit keeps the status and stage it has.
  router.post('/:kind', run(req => finance.save(kindOf(req), kindOf(req) === 'entry' ? noHandStatus(req.body) : req.body || {}, actor(req))));
  router.post('/:kind/delete', run(req => finance.remove(kindOf(req), ids(req), actor(req))));
  router.post('/:kind/restore', run(req => finance.restore(kindOf(req), ids(req), actor(req))));
  router.post('/:kind/recalculate', run(req => finance.recalculate(kindOf(req), ids(req), req.body || {}, actor(req))));
  // Imported invoices start at Received, whatever the sheet says; only records brought over once from the
  // old tracker (source 'migrated') keep the status they had there.
  const imported = req => (Array.isArray(req.body?.inputs) ? req.body.inputs : []).map(i => kindOf(req) === 'entry' && i?.source !== 'migrated' ? { ...noHandStatus(i), status: 'pending' } : i);
  router.post('/:kind/import', run(req => finance.importRecords(kindOf(req), imported(req), actor(req), { dryRun: req.body?.dryRun === true, duplicates: req.body?.duplicates === 'add' ? 'add' : 'skip' })));
  return router;
}
