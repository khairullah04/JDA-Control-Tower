// What can be done to the CJI3 register and the sanctioned amounts, over any store that can read
// and can do an all-or-nothing step. The server runs it over the database; the tracker's demo mode
// runs it in memory.
//   - Every change is one step: what it depends on is read, checked and written together, with its
//     audit lines (who, when, field, old, new). Two people saving at the same moment cannot both
//     pass the same check, and a record is never saved without its audit lines.
//   - Nothing is ever removed: a delete only marks the record, so it can be restored.
//   - Each change answers with the records as they now are, so a page can update without reloading everything.
import { build, amounts, changes, refOf, live, invoiceKey, partnerKey, display, DEFAULT_SETTINGS, STATUSES, STATUS_LABEL, BASE } from './core.js';
import { toBps, fromBps, normRate } from './money.js';

const COLL = { entry: 'financeEntries', sanctioned: 'financeSanctioned' };
export class FinanceError extends Error {
  constructor(message, details, status = 400) { super(message); this.status = status; this.details = details; }
}
const slices = (list, size) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));
// A sanctioned amount is "the same one again" when project, partner, month, currency and amount all match.
const sanctionedKey = r => [r.jdaId, r.projectId, partnerKey(r.partner), r.month, r.currency, r.netMinor].join('|');

export function createFinance(store, { now = () => new Date().toISOString() } = {}) {
  let count = 0;
  const newId = () => Date.now().toString(36) + (count++ % 46656).toString(36).padStart(3, '0') + Math.random().toString(36).slice(2, 8);
  const settings = async (read = store) => ({ ...DEFAULT_SETTINGS, ...(await read.get('financeMeta', 'settings')) });
  const collection = kind => COLL[kind] || (() => { throw new FinanceError('Unknown kind of record.'); })();
  const line = (actor, entity, rec, action, change = {}) => ({
    coll: 'financeAudit', id: newId(),
    data: { at: now(), by: actor || 'unknown', entity, entityId: rec.id, jdaId: rec.jdaId || '', projectId: rec.projectId || '', ref: rec.ref || refOf(entity, rec), action, field: change.field || '', old: change.old || '', new: change.new || '' }
  });
  const stamp = (rec, actor, at) => ({ ...rec, updatedAt: at, updatedBy: actor });
  const fresh = (record, input, actor, at) => stamp({ ...record, id: newId(), source: input.source || 'manual', createdAt: at, createdBy: actor, deletedAt: null, deletedBy: null }, actor, at);
  const created = r => `${display('netMinor', r)}${r.currency === BASE ? '' : ` at ${r.rate}`}, ${display('grossMyrMinor', r)} taxed, ${r.month}`;
  const duplicate = r => `Invoice ${r.invoiceNo} is already entered for project ${r.projectCode} in ${r.jdaName || 'this JDA'}`;

  const data = async () => ({ settings: await settings(), entries: await store.list(COLL.entry), sanctioned: await store.list(COLL.sanctioned) });

  // Create (no id) or edit (with id) one record. An edit that changes nothing writes nothing.
  // `expectedUpdatedAt` is the record's last-change time as the form loaded it: if someone else has
  // saved it since, this save is refused instead of quietly undoing theirs.
  async function save(kind, input, actor) {
    const coll = collection(kind), s = await settings();
    return store.atomic(async read => {
      const all = await read.list(coll), prev = input.id ? all.find(r => r.id === input.id) : null;
      if (input.id && !prev) throw new FinanceError('That record no longer exists.');
      if (prev?.deletedAt) throw new FinanceError('That record has been deleted. Restore it before editing it.');
      if (prev && input.expectedUpdatedAt && input.expectedUpdatedAt !== prev.updatedAt) {
        throw new FinanceError(`${refOf(kind, prev)} was changed by ${prev.updatedBy || 'someone else'} after you opened it. Close this form, look at the latest version, and make your change again.`, null, 409);
      }
      const { record, errors } = build(kind, { ...input, draft: false }, prev, s);
      if (kind === 'entry' && record.invoiceNo && all.some(e => live(e) && e.id !== prev?.id && invoiceKey(e) === invoiceKey(record))) errors.push(duplicate(record));
      if (errors.length) throw new FinanceError(errors.join('. ') + '.', errors);
      const at = now(), next = prev ? stamp({ ...prev, ...record }, actor, at) : fresh(record, input, actor, at);
      const diff = prev ? changes(kind, prev, next) : [];
      if (prev && !diff.length) return { result: prev };
      return { result: next, writes: [{ coll, id: next.id, data: next }, ...(prev ? diff.map(c => line(actor, kind, next, 'edit', c)) : [line(actor, kind, next, 'create', { new: created(next) })])] };
    });
  }

  // Several new records in one go (a sanctioned amount spread over months): all of them, or, if any one is not valid, none.
  async function saveAll(kind, inputs, actor) {
    const coll = collection(kind), s = await settings(), at = now();
    if (!inputs.length || inputs.length > 120) throw new FinanceError('Nothing to save, or too many records at once.');
    const made = inputs.map((input, i) => {
      const { record, errors } = build(kind, { ...input, id: undefined, draft: false }, null, s);
      if (errors.length) throw new FinanceError(`${inputs.length > 1 ? `Record ${i + 1} (${record.month || 'no month'}): ` : ''}${errors.join('. ')}.`, errors);
      return fresh(record, input, actor, at);
    });
    return store.atomic(async () => ({ result: made, writes: made.flatMap(next => [{ coll, id: next.id, data: next }, line(actor, kind, next, 'create', { new: created(next) })]) }));
  }

  // The same shape for every change to records that already exist: `change(record, all)` gives the
  // new record and its audit lines, or nothing if there is nothing to do. Done in steps of `size`
  // records, each record always in the same step as its own audit lines.
  async function each(kind, ids, size, change) {
    const coll = collection(kind), records = [];
    for (const part of slices([...new Set(ids)], size)) {
      records.push(...await store.atomic(async read => {
        const all = await read.list(coll), writes = [], done = [];
        for (const r of all.filter(x => part.includes(x.id))) {
          const out = change(r, all);
          if (!out) continue;
          writes.push({ coll, id: r.id, data: out.next }, ...out.lines);
          done.push(out.next);
        }
        return { result: done, writes };
      }));
    }
    return { changed: records.length, records };
  }

  // Delete = mark as deleted; restore = clear the mark. Deleted records count for nothing.
  function mark(kind, ids, actor, deleted) {
    const at = now(), restored = new Set();
    return each(kind, ids, 100, (r, all) => {
      if (!!r.deletedAt === deleted) return null;
      if (!deleted && kind === 'entry' && r.invoiceNo) {
        if (restored.has(invoiceKey(r)) || all.some(e => live(e) && invoiceKey(e) === invoiceKey(r))) throw new FinanceError(`${refOf(kind, r)} cannot be restored: that invoice number has since been entered again for the same project.`);
        restored.add(invoiceKey(r));
      }
      const next = stamp({ ...r, deletedAt: deleted ? at : null, deletedBy: deleted ? actor : null }, actor, at);
      return { next, lines: [line(actor, kind, next, deleted ? 'delete' : 'restore')] };
    });
  }

  async function setStatus(ids, status, actor) {
    if (!STATUSES.includes(status)) throw new FinanceError('Unknown status.');
    const at = now();
    return each('entry', ids, 100, r => {
      if (r.deletedAt || r.status === status) return null;
      if (r.missing?.length && ['approved', 'paid'].includes(status)) throw new FinanceError(`${refOf('entry', r)} is incomplete (${r.missing.join('; ')}). Complete it before marking it ${STATUS_LABEL[status]}.`);
      const next = stamp({ ...r, status }, actor, at);
      return { next, lines: [line(actor, 'entry', next, 'status', { field: 'Status', old: STATUS_LABEL[r.status], new: STATUS_LABEL[status] })] };
    });
  }

  // The one place a stored amount is worked out again after the fact, and only when asked: with a
  // new rate (the chosen records must share a currency), with today's tax rate, or simply afresh.
  async function recalculate(kind, ids, { rate = '', rateDate = '', rateSource = 'manual', currentTax = false } = {}, actor) {
    const chosen = (await store.list(collection(kind))).filter(r => ids.includes(r.id) && live(r)), at = now();
    const newRate = rate === '' || rate == null ? null : normRate(rate), taxRateBps = (await settings()).taxRateBps;
    if (rate && !newRate) throw new FinanceError(`Rate to ${BASE} must be a positive number.`);
    if (newRate && new Set(chosen.filter(r => r.currency !== BASE).map(r => r.currency)).size > 1) throw new FinanceError('The chosen records are in more than one currency. Apply a rate to one currency at a time.');
    return each(kind, chosen.map(r => r.id), 40, r => {
      if (r.deletedAt) return null;
      const next = stamp({ ...r }, actor, at);
      if (newRate && r.currency !== BASE) Object.assign(next, { rate: newRate, rateDate, rateSource, rateOverridden: rateSource === 'manual' });
      if (currentTax) next.taxRateBps = taxRateBps;
      if (!(next.netMinor > 0) || !next.rate) return null; // an incomplete draft has nothing to work out
      Object.assign(next, amounts(next));
      const diff = changes(kind, r, next);
      return diff.length ? { next, lines: diff.map(c => line(actor, kind, next, 'recalculate', c)) } : null;
    });
  }

  // The tax rate lives here only. Changing it touches no existing record: each one keeps the rate it was entered with.
  function saveSettings(input, actor) {
    return store.atomic(async read => {
      const before = await settings(read), next = { ...before }, about = { id: 'settings', ref: 'Settings' }, lines = [];
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
      if (input.migratedAt !== undefined) {
        next.migratedAt = String(input.migratedAt).slice(0, 40);
        lines.push(line(actor, 'settings', about, 'edit', { field: 'Old tracker records brought over', old: before.migratedAt || '', new: next.migratedAt }));
      }
      return { result: next, writes: [{ coll: 'financeMeta', id: 'settings', data: next }, ...lines] };
    });
  }

  async function audit({ entityId = '', limit = 500 } = {}) {
    const lines = await store.list('financeAudit', entityId ? { where: ['entityId', entityId] } : { latest: limit, by: 'at' });
    return lines.filter(l => !entityId || l.entityId === entityId).sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id)).slice(0, limit);
  }

  // Many records at once: a spreadsheet, the old invoice list, invoices read by the AI. Rows that
  // fail are reported and left out; the rest go in. With `dryRun` nothing is saved, and the answer
  // says row by row what would happen. Nothing is entered twice:
  //   - an invoice already in the register is refused;
  //   - a record already brought over from the old tracker (same old id) is refused;
  //   - an invoice from a Drive file that an earlier sync already read is refused (an interrupted or
  //     repeated sync cannot add its invoices again, numbered or not);
  //   - a sanctioned amount that matches one already entered is marked `duplicate` and left out,
  //     unless `duplicates: 'add'` says it really is a further amount.
  async function importRecords(kind, inputs, actor, { dryRun = false, duplicates = 'skip' } = {}) {
    const coll = collection(kind), s = await settings(), at = now(), results = [], mine = new Set();
    const decide = (all, part) => {
      const alive = all.filter(live), writes = [];
      const invoices = new Set(kind === 'entry' ? alive.filter(e => e.invoiceNo).map(invoiceKey) : []);
      const sanctioned = new Set(kind === 'sanctioned' ? alive.map(sanctionedKey) : []), old = new Set(all.map(r => r.legacyId).filter(Boolean));
      const filesRead = new Set(alive.filter(r => r.driveFileId && !mine.has(r.id)).map(r => r.driveFileId)); // by an earlier sync, not by this one
      for (const input of part) {
        const { record, errors } = build(kind, input, null, s);
        let again = false;
        if (record.legacyId && old.has(record.legacyId)) errors.push('Already brought over from the old tracker');
        else if (input.source === 'drive' && record.driveFileId && filesRead.has(record.driveFileId)) errors.push('This Drive file has already been read into the register');
        else if (kind === 'entry' && record.invoiceNo && record.projectId && invoices.has(invoiceKey(record))) errors.push(duplicate(record));
        else if (kind === 'sanctioned' && !errors.length) again = sanctioned.has(sanctionedKey(record));
        const next = fresh(record, { ...input, source: input.source || 'import' }, actor, at), add = !errors.length && (!again || duplicates === 'add');
        results.push({ ok: !errors.length, errors, record: next, ...(again && { duplicate: true }), added: add && !dryRun });
        if (!add) continue;
        if (kind === 'entry' && record.invoiceNo) invoices.add(invoiceKey(record));
        if (kind === 'sanctioned') sanctioned.add(sanctionedKey(record));
        if (record.legacyId) old.add(record.legacyId);
        mine.add(next.id);
        writes.push({ coll, id: next.id, data: next }, line(actor, kind, next, 'import', { new: created(next) }));
      }
      return writes;
    };
    if (dryRun) decide(await store.list(coll), inputs);
    else for (const part of slices(inputs, 150)) await store.atomic(async read => ({ writes: decide(await read.list(coll), part) }));
    return { imported: results.filter(r => r.added).length, results };
  }

  return { data, save, saveAll, remove: (kind, ids, actor) => mark(kind, ids, actor, true), restore: (kind, ids, actor) => mark(kind, ids, actor, false), setStatus, recalculate, saveSettings, audit, importRecords };
}

// The simplest store: everything in memory. The tracker's demo mode and the tests use it; the
// server builds its file store on it. `atomic` runs one step at a time, in the order they were
// asked for: each step reads, decides and hands back its writes, which go in together or not at all.
export function memoryStore(seed = {}, onCommit = () => {}) {
  const db = seed, copy = v => JSON.parse(JSON.stringify(v));
  const read = {
    list: async coll => Object.entries(db[coll] || {}).map(([id, d]) => ({ ...copy(d), id })),
    get: async (coll, id) => db[coll]?.[id] ? { ...copy(db[coll][id]), id } : null
  };
  let queue = Promise.resolve();
  return {
    ...read,
    atomic: step => (queue = queue.catch(() => {}).then(async () => {
      const { writes = [], result } = await step(read);
      for (const w of writes) (db[w.coll] ||= {})[w.id] = copy(w.data);
      if (writes.length) await onCommit(db);
      return result;
    }))
  };
}
