// What can be done to the CJI3 register and the sanctioned amounts, over any store that can list,
// get and commit. The server runs it over the database; the tracker's demo mode runs it in memory.
// Every change is committed together with its audit lines (who, when, field, old, new), and
// nothing is ever removed: a delete only marks the record, so it can be restored.
import { build, amounts, changes, refOf, live, invoiceKey, display, DEFAULT_SETTINGS, STATUSES, STATUS_LABEL, BASE } from './core.js';
import { toBps, fromBps, normRate } from './money.js';

const COLL = { entry: 'financeEntries', sanctioned: 'financeSanctioned' };
export class FinanceError extends Error {
  constructor(message, details) { super(message); this.status = 400; this.details = details; }
}

export function createFinance(store, { now = () => new Date().toISOString() } = {}) {
  let count = 0;
  const newId = () => Date.now().toString(36) + (count++ % 46656).toString(36).padStart(3, '0') + Math.random().toString(36).slice(2, 8);
  const settings = async () => ({ ...DEFAULT_SETTINGS, ...(await store.get('financeMeta', 'settings')) });
  const collection = kind => COLL[kind] || (() => { throw new FinanceError('Unknown kind of record.'); })();
  const line = (actor, entity, rec, action, change = {}) => ({
    coll: 'financeAudit', id: newId(),
    data: { at: now(), by: actor || 'unknown', entity, entityId: rec.id, jdaId: rec.jdaId || '', projectId: rec.projectId || '', ref: rec.ref || refOf(entity, rec), action, field: change.field || '', old: change.old || '', new: change.new || '' }
  });
  const stamp = (rec, actor, at) => ({ ...rec, updatedAt: at, updatedBy: actor });
  const created = (kind, r) => `${display('netMinor', r)}${r.currency === BASE ? '' : ` at ${r.rate}`}, ${display('grossMyrMinor', r)} taxed, ${r.month}`;
  const duplicate = r => `Invoice ${r.invoiceNo} is already entered for project ${r.projectCode} in ${r.jdaName || 'this JDA'}`;

  const data = async () => ({ settings: await settings(), entries: await store.list(COLL.entry), sanctioned: await store.list(COLL.sanctioned) });

  // Create (no id) or edit (with id) one record. An edit that changes nothing writes nothing.
  async function save(kind, input, actor) {
    const all = await store.list(collection(kind)), prev = input.id ? all.find(r => r.id === input.id) : null;
    if (input.id && !prev) throw new FinanceError('That record no longer exists.');
    if (prev?.deletedAt) throw new FinanceError('That record has been deleted. Restore it before editing it.');
    const { record, errors } = build(kind, { ...input, draft: false }, prev, await settings());
    if (kind === 'entry' && record.invoiceNo && all.some(e => live(e) && e.id !== prev?.id && invoiceKey(e) === invoiceKey(record))) errors.push(duplicate(record));
    if (errors.length) throw new FinanceError(errors.join('. ') + '.', errors);
    const at = now(), id = prev?.id || newId();
    const next = prev ? stamp({ ...prev, ...record }, actor, at) : stamp({ ...record, id, source: input.source || 'manual', createdAt: at, createdBy: actor, deletedAt: null, deletedBy: null }, actor, at);
    const diff = prev ? changes(kind, prev, next) : [];
    if (prev && !diff.length) return prev;
    await store.commit([{ coll: COLL[kind], id, data: next }, ...(prev ? diff.map(c => line(actor, kind, next, 'edit', c)) : [line(actor, kind, next, 'create', { new: created(kind, next) })])]);
    return next;
  }

  // Several new records in one go (a sanctioned amount spread over months): all of them, or, if any one is not valid, none.
  async function saveAll(kind, inputs, actor) {
    const s = await settings(), at = now(), writes = [], made = [];
    collection(kind);
    if (!inputs.length || inputs.length > 120) throw new FinanceError('Nothing to save, or too many records at once.');
    inputs.forEach((input, i) => {
      const { record, errors } = build(kind, { ...input, id: undefined, draft: false }, null, s);
      if (errors.length) throw new FinanceError(`${inputs.length > 1 ? `Record ${i + 1} (${record.month || 'no month'}): ` : ''}${errors.join('. ')}.`, errors);
      const next = stamp({ ...record, id: newId(), source: input.source || 'manual', createdAt: at, createdBy: actor, deletedAt: null, deletedBy: null }, actor, at);
      made.push(next);
      writes.push({ coll: COLL[kind], id: next.id, data: next }, line(actor, kind, next, 'create', { new: created(kind, next) }));
    });
    await store.commit(writes);
    return made;
  }

  // Delete = mark as deleted; restore = clear the mark. Deleted records count for nothing.
  async function mark(kind, ids, actor, deleted) {
    const all = await store.list(collection(kind)), at = now(), writes = [];
    const taken = new Set(kind === 'entry' ? all.filter(e => live(e) && e.invoiceNo).map(invoiceKey) : []);
    for (const r of all.filter(x => ids.includes(x.id) && !!x.deletedAt !== deleted)) {
      if (!deleted && kind === 'entry' && r.invoiceNo) {
        if (taken.has(invoiceKey(r))) throw new FinanceError(`${refOf(kind, r)} cannot be restored: that invoice number has since been entered again for the same project.`);
        taken.add(invoiceKey(r));
      }
      const next = stamp({ ...r, deletedAt: deleted ? at : null, deletedBy: deleted ? actor : null }, actor, at);
      writes.push({ coll: COLL[kind], id: r.id, data: next }, line(actor, kind, next, deleted ? 'delete' : 'restore'));
    }
    if (writes.length) await store.commit(writes);
    return { changed: writes.length / 2 };
  }

  async function setStatus(ids, status, actor) {
    if (!STATUSES.includes(status)) throw new FinanceError('Unknown status.');
    const all = await store.list(COLL.entry), at = now(), writes = [];
    for (const r of all.filter(x => ids.includes(x.id) && live(x) && x.status !== status)) {
      if (r.missing?.length && ['approved', 'paid'].includes(status)) throw new FinanceError(`${refOf('entry', r)} is incomplete (${r.missing.join('; ')}). Complete it before marking it ${STATUS_LABEL[status]}.`);
      const next = stamp({ ...r, status }, actor, at);
      writes.push({ coll: COLL.entry, id: r.id, data: next }, line(actor, 'entry', next, 'status', { field: 'Status', old: STATUS_LABEL[r.status], new: STATUS_LABEL[status] }));
    }
    if (writes.length) await store.commit(writes);
    return { changed: writes.length / 2 };
  }

  // The one place a stored amount is worked out again after the fact, and only when asked: with a
  // new rate (the chosen records must share a currency), with today's tax rate, or simply afresh.
  async function recalculate(kind, ids, { rate = '', rateDate = '', rateSource = 'manual', currentTax = false } = {}, actor) {
    const all = await store.list(collection(kind)), chosen = all.filter(r => ids.includes(r.id) && live(r)), at = now(), writes = [];
    const newRate = rate === '' || rate == null ? null : normRate(rate), taxRateBps = (await settings()).taxRateBps;
    if (rate && !newRate) throw new FinanceError(`Rate to ${BASE} must be a positive number.`);
    if (newRate && new Set(chosen.filter(r => r.currency !== BASE).map(r => r.currency)).size > 1) throw new FinanceError('The chosen records are in more than one currency. Apply a rate to one currency at a time.');
    for (const r of chosen) {
      const next = stamp({ ...r }, actor, at);
      if (newRate && r.currency !== BASE) Object.assign(next, { rate: newRate, rateDate, rateSource, rateOverridden: rateSource === 'manual' });
      if (currentTax) next.taxRateBps = taxRateBps;
      if (!(next.netMinor > 0) || !next.rate) continue; // an incomplete draft has nothing to work out
      Object.assign(next, amounts(next));
      const diff = changes(kind, r, next);
      if (diff.length) writes.push({ coll: COLL[kind], id: r.id, data: next }, ...diff.map(c => line(actor, kind, next, 'recalculate', c)));
    }
    if (writes.length) await store.commit(writes);
    return { changed: writes.filter(w => w.coll !== 'financeAudit').length };
  }

  // The tax rate lives here only. Changing it touches no existing record: each one keeps the rate it was entered with.
  async function saveSettings(input, actor) {
    const before = await settings(), next = { ...before }, about = { id: 'settings', ref: 'Settings' }, lines = [];
    if (input.taxRate !== undefined) {
      next.taxRateBps = toBps(input.taxRate);
      if (next.taxRateBps === null) throw new FinanceError('Tax rate must be a percentage between 0 and 100.');
      if (next.taxRateBps !== before.taxRateBps) lines.push(line(actor, 'settings', about, 'edit', { field: 'Tax rate', old: fromBps(before.taxRateBps) + '%', new: fromBps(next.taxRateBps) + '%' }));
    }
    if (input.currencies !== undefined) {
      next.currencies = [...new Set([BASE, ...[].concat(input.currencies).map(c => String(c).trim().toUpperCase()).filter(Boolean)])];
      if (!next.currencies.every(c => /^[A-Z]{3}$/.test(c))) throw new FinanceError('Currencies must be 3-letter codes such as USD.');
      if (next.currencies.join() !== before.currencies.join()) lines.push(line(actor, 'settings', about, 'edit', { field: 'Currencies', old: before.currencies.join(', '), new: next.currencies.join(', ') }));
    }
    if (input.migratedAt !== undefined) next.migratedAt = input.migratedAt;
    await store.commit([{ coll: 'financeMeta', id: 'settings', data: next }, ...lines]);
    return next;
  }

  async function audit({ entityId = '', limit = 500 } = {}) {
    const lines = await store.list('financeAudit', entityId ? { where: ['entityId', entityId] } : { latest: limit, by: 'at' });
    return lines.filter(l => !entityId || l.entityId === entityId).sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id)).slice(0, limit);
  }

  // Many records at once: a spreadsheet, the old invoice list, invoices read by the AI. Rows that
  // fail are reported and left out; the rest go in. With `dryRun` nothing is saved, and the answer
  // says row by row what would happen. An invoice already in the register is never entered twice.
  async function importRecords(kind, inputs, actor, { dryRun = false } = {}) {
    const all = await store.list(collection(kind)), s = await settings(), at = now(), writes = [], results = [];
    const taken = new Set(kind === 'entry' ? all.filter(e => live(e) && e.invoiceNo).map(invoiceKey) : []);
    for (const input of inputs) {
      const { record, errors } = build(kind, input, null, s);
      if (kind === 'entry' && record.invoiceNo && record.projectId) {
        if (taken.has(invoiceKey(record))) errors.push(duplicate(record));
        else if (!errors.length) taken.add(invoiceKey(record));
      }
      const next = stamp({ ...record, id: newId(), source: input.source || 'import', createdAt: at, createdBy: actor, deletedAt: null, deletedBy: null }, actor, at);
      results.push({ ok: !errors.length, errors, record: next });
      if (!errors.length) writes.push({ coll: COLL[kind], id: next.id, data: next }, line(actor, kind, next, 'import', { new: created(kind, next) }));
    }
    if (!dryRun && writes.length) await store.commit(writes);
    return { imported: dryRun ? 0 : writes.length / 2, results };
  }

  return { data, save, saveAll, remove: (kind, ids, actor) => mark(kind, ids, actor, true), restore: (kind, ids, actor) => mark(kind, ids, actor, false), setStatus, recalculate, saveSettings, audit, importRecords };
}

// The simplest store: everything in memory. The tracker's demo mode and the tests use it; the server builds its file store on it.
export function memoryStore(seed = {}, onCommit = () => {}) {
  const db = seed, copy = v => JSON.parse(JSON.stringify(v));
  return {
    list: async coll => Object.entries(db[coll] || {}).map(([id, d]) => ({ ...copy(d), id })),
    get: async (coll, id) => db[coll]?.[id] ? { ...copy(db[coll][id]), id } : null,
    commit: async writes => { for (const w of writes) (db[w.coll] ||= {})[w.id] = copy(w.data); await onCommit(db); }
  };
}
