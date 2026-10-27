import { Router } from 'express';
import { publicMessage } from '../errors.js';
import { bnmRate } from '../forex.js';
import { readSheets, writeWorkbook } from '../finance-xlsx.js';
import { isDate } from '../../web/control-tower/invoices/js/finance/core.js';
import { ROLES, roleFor } from '../../web/control-tower/invoices/js/finance/workflow.js';
import { graphListConfigured, listRows, createDraft, draftsPossible, signInStatus, startSignIn, signOut } from '../ms-graph.js';
import { rowsFromSheet } from '../../web/control-tower/invoices/js/finance/list-source.js';

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
    const role = move && roleFor(move), me = String(req.user?.email || '').toLowerCase();
    const list = role === 'approver' ? [...(roles.pm || []), ...(roles.lead || [])] : roles[role] || [];
    if (role && list.length && !list.includes(me)) return `Only the ${role === 'approver' ? 'Project Manager or Project Lead' : ROLES[role]} may do this (${move.action}).`;
    if (move?.from === 'pending_lead' && move.to === 'to_be_paid' && me !== 'local@sign-in-off' && record?.stageBy && record.stageBy === actor(req))
      return 'You validated this invoice, so someone else has to approve it.';
    return '';
  };
  // A role's own work (the role's people, when its list is filled in): CJI3 uploads and matching are
  // Accountant 2's, since a match is what makes an invoice Paid.
  const needRole = (req, role) => {
    const list = roles[role] || [], me = String(req.user?.email || '').toLowerCase();
    if (list.length && !list.includes(me)) throw Object.assign(new Error(`Only the ${ROLES[role]} may do this.`), { status: 403 });
  };
  router.post('/entries/stage', run(req => finance.moveStage(ids(req), String(req.body?.to || ''), { note: String(req.body?.note || ''), may: may(req) }, actor(req))));
  router.get('/stages', run(req => finance.stageHistory(String(req.query.entityId || ''))));

  // CJI3 lines: upload one of the two files (the server reads the .xlsx or .csv), with a preview first
  // (`dryRun`); the lines stored; the log of past uploads.
  router.post('/cji3/import', run(async req => {
    if (req.body?.dryRun !== true) needRole(req, 'accountant2');
    const b = req.body || {}, sheets = b.fileBase64 ? await readSheets(String(b.fileName), Buffer.from(String(b.fileBase64), 'base64')) : b.sheets;
    return finance.importCji3({ group: String(b.group || ''), fileName: String(b.fileName || ''), sheets }, actor(req), { dryRun: b.dryRun === true });
  }));
  router.get('/cji3/lines', run(req => finance.cji3Lines(String(req.query.group || ''))));
  // Match a line to an invoice by hand (`invoiceId`), or undo its match (no `invoiceId`); match again
  // every line of a file not yet matched (after new invoices have come in).
  router.post('/cji3/match', run(req => needRole(req, 'accountant2') ?? finance.matchLine(String(req.body?.lineId || ''), String(req.body?.invoiceId || ''), actor(req))));
  router.post('/cji3/rematch', run(async req => needRole(req, 'accountant2') ?? finance.matchCji3((await finance.cji3Lines(String(req.body?.group || ''))).filter(l => !l.invoiceId || ['not_approved', 'incomplete'].includes(l.matchState)).map(l => l.id), actor(req))));
  router.get('/cji3/imports', run(() => finance.cji3Imports()));
  // The Microsoft List (invoices before approval): what was last pulled and its mapping, and whether the
  // person is signed in to Microsoft; the sign-in (a device code, no IT setup) and sign-out; the rows, read
  // from the List itself (by its link, or the app registration when configured) or from an uploaded export;
  // keeping a pull; emailing chosen invoices to the Project Lead (they move to Pending Lead); an Outlook draft.
  const person = req => String(req.user?.email || 'local').toLowerCase();
  router.get('/list', run(async req => ({ ...(await finance.listState()), graph: graphListConfigured(), ms: signInStatus(person(req)), mail: draftsPossible(person(req)) })));
  router.post('/list/signin', run(req => startSignIn(person(req))));
  router.post('/list/signout', run(req => { signOut(person(req)); return { ok: true }; }));
  router.post('/list/rows', run(async req => {
    const b = req.body || {};
    if (b.fileBase64) return rowsFromSheet(await readSheets(String(b.fileName), Buffer.from(String(b.fileBase64), 'base64')));
    return listRows({ person: person(req), listUrl: String(b.listUrl || '') });
  }));
  router.put('/list', run(req => finance.saveListPull({ ...(req.body || {}), source: req.body?.source === 'graph' ? 'graph' : 'file' }, actor(req))));
  router.post('/list/send', run(req => { const b = req.body || {}; return finance.sendListToLead({ jdaId: String(b.jdaId || ''), jdaName: String(b.jdaName || ''), keys: Array.isArray(b.keys) ? b.keys.map(String) : [], subject: String(b.subject || '') }, actor(req), { may: may(req) }); }));
  router.post('/list/draft', run(req => createDraft({ person: person(req), to: String(req.body?.to || ''), cc: String(req.body?.cc || ''), subject: String(req.body?.subject || ''), html: String(req.body?.html || '') })));
  router.post('/sanctioned/batch', run(req => finance.saveAll('sanctioned', Array.isArray(req.body?.inputs) ? req.body.inputs : [], actor(req))));
  // A new invoice starts at Received (Pending); an edit keeps the status and stage it has.
  router.post('/:kind', run(req => finance.save(kindOf(req), kindOf(req) === 'entry' ? noHandStatus(req.body) : req.body || {}, actor(req))));
  router.post('/:kind/delete', run(req => finance.remove(kindOf(req), ids(req), actor(req))));
  router.post('/:kind/restore', run(req => finance.restore(kindOf(req), ids(req), actor(req))));
  router.post('/:kind/recalculate', run(req => finance.recalculate(kindOf(req), ids(req), req.body || {}, actor(req))));
  // Imported invoices start at Received, whatever the sheet says. Records brought over from the old tracker
  // (source 'migrated') keep their status, but only once (before the bringing-over is marked done), and
  // never Paid: Paid comes from a CJI3 line, so an old paid invoice comes over as approved and waits for it.
  const imported = async req => {
    const inputs = Array.isArray(req.body?.inputs) ? req.body.inputs : [];
    if (kindOf(req) !== 'entry') return inputs;
    const migrating = inputs.some(i => i?.source === 'migrated');
    if (migrating && (await finance.data()).settings?.migratedAt) throw Object.assign(new Error('The old tracker\'s invoices have already been brought over.'), { status: 409 });
    return inputs.map(i => i?.source !== 'migrated' ? { ...noHandStatus(i), status: 'pending' }
      : { ...noHandStatus(i), source: 'migrated', status: ['pending', 'approved', 'rejected'].includes(i.status) ? i.status : i.status === 'paid' ? 'approved' : 'pending' });
  };
  router.post('/:kind/import', run(async req => finance.importRecords(kindOf(req), await imported(req), actor(req), { dryRun: req.body?.dryRun === true, duplicates: req.body?.duplicates === 'add' ? 'add' : 'skip' })));
  return router;
}
