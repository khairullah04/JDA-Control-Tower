// What removing the JDAs numbered `from` and above takes out of the main Firebase project: their
// tracker records and every record that hangs off them (scripts/remove-jdas.mjs says why each one,
// and what is left alone). Returns the documents to delete, by collection; deletes nothing itself.
// `db` is a Firestore Admin database, or anything with the same collection(..).get() shape.
export const numberOf = name => Number(/^\s*jda\s*0*(\d+)\s*$/i.exec(name || '')?.[1]);

export async function planRemoval(db, from = 4) {
  const all = async coll => (await db.collection(coll).get()).docs;
  const jdas = (await all('jdas')).filter(d => numberOf(d.get('name')) >= from);
  const jdaIds = new Set(jdas.map(d => d.id));
  const projects = (await all('projects')).filter(d => jdaIds.has(d.get('jdaId')));
  const projectIds = new Set(projects.map(d => d.id));
  const ofThem = d => jdaIds.has(d.get('jdaId')) || projectIds.has(d.get('projectId'));
  const entries = (await all('financeEntries')).filter(ofThem);
  const sanctioned = (await all('financeSanctioned')).filter(ofThem);
  const recordIds = new Set([...entries, ...sanctioned].map(d => d.id));
  // By the record a line is about only: a record moved out of a JDA 4 project keeps its whole history.
  const audit = (await all('financeAudit')).filter(d => recordIds.has(d.get('entityId')));
  // The old tracker's records, still offered once by "Bring over old tracker records".
  const legacyInvoices = (await all('invoices')).filter(ofThem), legacyScope = (await all('scope')).filter(ofThem);
  // A change-log line names the JDA or project it is about in `projectId`.
  const activity = (await all('activity')).filter(d => jdaIds.has(d.get('projectId')) || projectIds.has(d.get('projectId')));
  const reports = [];
  for (const d of (await all('jdaReports')).filter(d => numberOf(d.id.replace(/^jda/i, 'jda ')) >= from)) {
    reports.push(...(await d.ref.collection('versions').get()).docs, d); // its versions, then the document
  }
  // Children before parents, JDAs last: if a run stops part way, running it again still finds what is left through them.
  return { 'jdaReports (with versions)': reports, activity, financeAudit: audit, financeEntries: entries, financeSanctioned: sanctioned,
    'invoices (old tracker)': legacyInvoices, 'scope (old tracker)': legacyScope, projects, jdas };
}
