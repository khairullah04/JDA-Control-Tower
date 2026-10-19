// The page's own copy of the register. Reading every invoice and sanctioned amount again after each
// change costs more with every record entered, and it is not needed: each change answers with the
// records it changed. `withBook(api)` gives the same calls as `api`, puts those answers into the
// copy, and serves the copy to the redraw that follows (`data({ cached: true })`). Opening a page
// reads from the server as before. A change refused because the copy is out of date (409: someone
// else has changed or removed the record) throws the copy away, so the next draw shows what is there now.
export function withBook(api) {
  let book = null;
  const put = (kind, records) => {
    if (!book) return;
    const list = kind === 'entry' ? book.entries : book.sanctioned;
    for (const rec of records || []) { const at = list.findIndex(x => x.id === rec.id); if (at < 0) list.push(rec); else list[at] = rec; }
  };
  const stale = e => { if (e?.status === 409) book = null; throw e; };
  const keeping = (kind, call, changed) => call.then(out => { put(kind, changed(out)); return out; }, stale);
  return {
    ...api,
    data: async ({ cached = false } = {}) => (cached && book) || (book = await api.data()),
    save: (kind, input) => keeping(kind, api.save(kind, input), record => [record]),
    saveSanctionedOver: inputs => keeping('sanctioned', api.saveSanctionedOver(inputs), records => records),
    remove: (kind, ids) => keeping(kind, api.remove(kind, ids), out => out.records),
    restore: (kind, ids) => keeping(kind, api.restore(kind, ids), out => out.records),
    setStatus: (ids, status) => keeping('entry', api.setStatus(ids, status), out => out.records),
    moveStage: (ids, to, note) => keeping('entry', api.moveStage(ids, to, note), out => out.records),
    recalculate: (kind, ids, options) => keeping(kind, api.recalculate(kind, ids, options), out => out.records),
    saveSettings: input => api.saveSettings(input).then(settings => { if (book) book.settings = settings; return settings; }, stale),
    // A CJI3 upload or match can make invoices Paid anywhere in the register: the copy is read again after one.
    importCji3: (group, file, options = {}) => api.importCji3(group, file, options).then(out => { if (!options.dryRun) book = null; return out; }),
    matchLine: (lineId, invoiceId) => api.matchLine(lineId, invoiceId).then(out => { book = null; return out; }),
    rematch: group => api.rematch(group).then(out => { book = null; return out; }),
    importRecords: (kind, inputs, options = {}) => keeping(kind, api.importRecords(kind, inputs, options), out => options.dryRun ? [] : out.results.filter(r => r.added).map(r => r.record))
  };
}
