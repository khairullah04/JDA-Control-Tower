import { digest } from '../web/shared/lib/digest.js';

// Saving a JDA's report document (its Master Page content and its progress). The portal's pages
// used to write to the database themselves; now every save comes here, behind the JDA Control Tower sign-in
// session, and the database accepts no writes from browsers.
//
// A save replaces whole parts of the document (the project list, the task list, the Master Page
// content...). It is a read-modify-write inside one transaction:
//   - each part is only replaced if it is still as the page loaded it (the page sends a fingerprint
//     of what it loaded). If someone else, or the Power Automate feed, changed that part meanwhile,
//     the save is refused with a list of what changed, unless the person chooses to overwrite;
//   - the document as it was before the save is kept as a version, the newest `keep` of them.
export const FIELDS = ['weekLabel', 'overallStatus', 'projects', 'tasks', 'challenges', 'updates', 'scurve', 'overview', 'overviewBackup', 'driveSync'];
const LISTS = ['projects', 'tasks', 'challenges', 'updates'];
const MAX_BYTES = 900_000; // a Firestore document holds 1 MB
const fail = (status, message, extra) => Object.assign(new Error(message), { status, ...extra });

export function createReportSaver(store, { now = () => new Date().toISOString(), keep = 20 } = {}) {
  async function save(source, { patch = {}, remove = [], base = {}, force = false } = {}) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch) || !Array.isArray(remove)) throw fail(400, 'Nothing to save.');
    const fields = [...new Set([...Object.keys(patch), ...remove])];
    if (!fields.length) throw fail(400, 'Nothing to save.');
    const unknown = fields.filter(k => !FIELDS.includes(k));
    if (unknown.length) throw fail(400, `These cannot be saved from the page: ${unknown.join(', ')}.`);
    for (const k of LISTS) if (k in patch && !(Array.isArray(patch[k]) && patch[k].length <= 1000 && patch[k].every(x => x && typeof x === 'object'))) throw fail(400, `${k} must be a list.`);
    for (const k of ['weekLabel', 'overallStatus']) if (k in patch && typeof patch[k] !== 'string') throw fail(400, `${k} must be text.`);
    if (JSON.stringify(patch).length > MAX_BYTES) throw fail(400, 'That is too much to save in one report. Shorten the longest sections and try again.');

    return store.transact(source, current => {
      const changed = force ? [] : fields.filter(k => k in base && base[k] !== digest(current?.[k]));
      if (changed.length) throw fail(409, `Someone else has changed this report since you opened it (${changed.join(', ')}). Reload to see their version, or save again to replace it with yours.`, { changed });
      const next = { ...(current || {}), ...patch };
      for (const k of remove) delete next[k];
      if (JSON.stringify(next).length > MAX_BYTES) throw fail(400, 'That is too much to save in one report. Shorten the longest sections and try again.');
      return { next, version: current ? { savedAt: now(), fields, data: current } : null, keep };
    });
  }
  return { save, read: source => store.read(source) };
}

// The store the tests use, and the shape the Firestore one follows: read, and transact (read, decide, write as one step).
export function memoryReports(docs = {}, versions = {}) {
  const key = s => `${s.project}/${s.collection}/${s.doc}`, copy = v => v == null ? v : JSON.parse(JSON.stringify(v));
  let queue = Promise.resolve();
  return {
    docs, versions,
    read: async source => copy(docs[key(source)] ?? null),
    transact: (source, decide) => (queue = queue.catch(() => {}).then(() => {
      const { next, version, keep } = decide(copy(docs[key(source)] ?? null));
      docs[key(source)] = copy(next);
      if (version) versions[key(source)] = [copy(version), ...(versions[key(source)] || [])].slice(0, keep);
      return copy(next);
    }))
  };
}
