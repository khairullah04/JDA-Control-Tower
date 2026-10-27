# SWE review: TriCipta AI / JDA Control Tower, `main` @ 89e49bf

Reviewer: SWE (senior software engineer). Scope: architecture, code quality, error handling, data layer, tests.
`cd server && npm test`: 193 pass, 0 fail. Two defects below (SWE-02, SWE-03) were reproduced with an inline
`node --input-type=module -e` run against `createFinance(memoryStore())`. No files were created for that.

PHP / XAMPP / SQL / PHPMailer: not applicable. No remnants found (`grep -rni "phpmailer|xampp"` finds nothing;
the only `localhost` is the log line at `server/server.js:9`).

---

### [SWE-01] The live Invoice Tracker runs in demo mode on main (data stays in the browser)
- Category: WRONG
- Severity: Critical
- Confidence: High
- Location: web/control-tower/invoices/js/config/app-config.json:2; web/control-tower/invoices/js/services/finance.js:7-8; web/control-tower/invoices/js/services/db.js:2
- Evidence:
  ```json
  "demoMode": true,
  ```
  ```js
  withBook(config.demoMode ? await import('./demo/finance.js') : await import('./live/finance.js'));
  const db = config.demoMode ? await import('./demo/db.js') : await import('./live/db.js');
  ```
- What's wrong: Vercel deploys `main`, and the flag is fixed at build time in a committed file. Production therefore runs `createFinance(memoryStore())` over sample data in each browser. Every invoice, CJI3 upload, sanctioned amount and List send is lost when the page reloads, and none of it reaches `/api/finance`. The Control Tower cost ring reads the server, so the two show different figures. There is no server-side or environment override, and nothing on screen says the tracker is in demo mode.
- What it should be: on main, set `"demoMode": false`. Better, let the server decide: serve the config from `/api/config`, or have the server refuse to serve `demoMode: true` when `NODE_ENV=production`. Add a test that fails if main's app-config has `demoMode: true`.
  ```js
  // server/start.js
  if (env.NODE_ENV === 'production' && appConfig.demoMode) throw new Error('Not starting: demoMode is true in app-config.json.');
  ```
- Impact: the finance feature does not work in production at all, and users lose their work without being told.

### [SWE-02] Matching a CJI3 line to a second invoice leaves the first one Paid too (one payment counted twice)
- Category: WRONG
- Severity: Critical
- Confidence: High (reproduced)
- Location: web/control-tower/invoices/js/finance/service.js:310-331
- Evidence:
  ```js
  async function matchLine(lineIdIn, invoiceId, actor) {
    const l = await store.get('cji3Lines', lineIdIn), inv = invoiceId && await store.get(COLL.entry, invoiceId), at = now();
    ...
    if (!invoiceId) { /* undo path: only here is the old invoice un-paid */ }
    ...
    if (stage !== 'paid') await moveStage([inv.id], 'paid', { byCji3: true, paidBy: linked, ... }, actor);
  ```
  Reproduction: save invoices A and B, import one line, `matchLine(l, A)`, then `matchLine(l, B)`. Result:
  `[['A','paid',['c1v057ok1zdb']], ['B','paid',['c1v057ok1zdb']]]`.
- What's wrong: when the line already has an `invoiceId`, the code does not unlink the old invoice. A keeps `status: 'paid'` and keeps the line in `paidBy`, while the line now points at B. The amount check is skipped on a manual match, so nothing catches it.
- What it should be: if `l.invoiceId` is set and is not `invoiceId`, first run the existing undo branch (unpay A, or take the line out of A's `paidBy`), then match B. Do both inside one `store.atomic`. Add a test for re-matching.
  ```js
  if (l.invoiceId && l.invoiceId !== invoiceId) await matchLine(lineIdIn, '', actor); // then re-read l
  ```
- Impact: wrong money. Paid actuals, the Payment Table variance and the cost ring count one bank payment against two invoices.

### [SWE-03] Any signed-in user can create Paid invoices without CJI3 by marking an import `source: 'migrated'`
- Category: WRONG
- Severity: Critical
- Confidence: High (reproduced at the service layer; the route is plain)
- Location: server/routes/finance.js:172-175; web/control-tower/invoices/js/finance/core.js:69,76
- Evidence:
  ```js
  const imported = req => (...).map(i => kindOf(req) === 'entry' && i?.source !== 'migrated' ? { ...noHandStatus(i), status: 'pending' } : i);
  ```
  ```js
  status: pick('status') || 'pending',   // build() takes the status from the input
  ```
  Reproduction: `importRecords('entry', [{ ...inv('C'), status: 'paid', source: 'migrated' }])` gives `paid 1`.
- What's wrong: the rule is that an invoice becomes Paid only when a CJI3 line is matched. The one-time legacy migration bypasses it, and the bypass is controlled by a field the client sends. Any later POST to `/api/finance/entries/import` with `source: 'migrated'` can set any status. Nothing checks that a migration is in progress or that the caller is an admin.
- What it should be: decide on the server whether the import is a migration. One way is to accept `migrated` only while `settings.migratedAt` is empty, for a named admin role, and only with a `legacyId` that exists in the old `invoices` collection. Otherwise strip status and stage on every import.
- Impact: wrong money and a broken audit control. Paid actuals can be invented without any payment evidence.

### [SWE-04] CJI3 upload, hand-matching and un-matching skip the role check; empty roles let everyone in
- Category: WRONG
- Severity: Major
- Confidence: High
- Location: server/routes/finance.js:140-148, 85-86, 128-134; web/control-tower/invoices/js/finance/service.js:300,316,327
- Evidence:
  ```js
  router.post('/cji3/match', run(req => finance.matchLine(String(req.body?.lineId || ''), String(req.body?.invoiceId || ''), actor(req))));
  // matchLine -> moveStage([...], 'paid', { byCji3: true, paidBy, note }, actor)   // no `may`
  // A role whose list is empty is open to anyone signed in.
  ```
- What's wrong: `roleFor` maps CJI3 moves to `accountant2`, but `importCji3`, `matchCji3` and `matchLine` call `moveStage` without `may`. So `ROLE_ACCOUNTANT2` is never enforced, even when it is set. Any signed-in @petronas.com user can match any line to any invoice in the file group, with no amount check ("a person's match is their confirmation") and so mark it Paid, or un-match lines. Every `ROLE_*` list is also open when empty.
- What it should be: pass `may: may(req)` through `importCji3`, `matchCji3`, `matchLine` and the rematch route, and check `roleFor({by:'cji3'})` before any write. In production, refuse to start while any `ROLE_*` list is empty (as is done for `SESSION_SECRET`).
- Impact: the payment proof can be made or undone by anyone, and the role model is not enforced.

### [SWE-05] Multi-step finance operations are not atomic, and they write stale whole documents
- Category: FUNDAMENTALLY WRONG
- Severity: Major
- Confidence: High
- Location: web/control-tower/invoices/js/finance/service.js:277-307 (matchCji3), 310-331 (matchLine), 353-386 (sendListToLead), 245-270 (importCji3)
- Evidence:
  ```js
  const ids = new Set(lineIds), at = now(), all = await store.list('cji3Lines');      // read outside any transaction
  const invoices = await store.list(COLL.entry);
  ...
  if (state === 'paid') await moveStage([invoiceId], 'paid', ...);                    // transaction 1..n
  ...
  for (const part of slices([...lineWrites.values()], 200)) await store.atomic(async () => ({ writes: part })); // later, blind set of `{ ...l }`
  ```
  ```js
  await store.atomic(async () => ({ writes: [{ coll: COLL.entry, id: rec.id, data: rec }, ...] }));  // create draft
  const out = await moveStage([rec.id], 'with_pm', ...);                                            // move 1
  const out = await moveStage([rec.id], 'pending_lead', ...);                                       // move 2
  ```
- What's wrong: one business operation, such as "a line pays an invoice" or "the PM sends invoices to the Lead", is split across 2 to N separate transactions. Its inputs are read outside them, and it ends with `t.set` of the full document as it was read (`atomic(async () => ...)` reads nothing, so Firestore checks nothing).
  (a) If the process crashes or a request times out (Vercel), the work is left half done: an invoice is Paid but its lines still show `none`; a draft is created but stays in `received`/`with_pm`; or lines are stored with no `cji3Imports` log.
  (b) Two people uploading or matching at the same time overwrite each other's line or invoice fields (the stale `{...l}` / `{...was}`).
  (c) In `sendListToLead`, the duplicate check (`entries.find(...)`) runs outside the create transaction, so two sends at once create two drafts for one List item.
  (d) `matchCji3` ignores the `refused` result of `moveStage` and still writes the line as `paid`.
  The header comment at service.js:4-6 promises the opposite.
- What it should be: one `store.atomic` per invoice and its lines. Read the lines and the invoice through `read.get` inside the step, decide, and return every write together: the invoice, the stage line, the audit line and the CJI3 line(s). Merge with `update` (not a full `set` of a stale copy), or re-read inside the step. Give `sendListToLead` one step per item that checks, creates and makes both moves. If `moveStage` refuses, skip the line write.
- Impact: Payment Table figures and the audit trail can disagree with each other, and concurrent finance work can be silently lost.

### [SWE-06] Counters and result lists are changed inside transaction callbacks that Firestore may retry
- Category: RISK
- Severity: Minor
- Confidence: Medium (Firestore Admin `runTransaction` re-runs the callback on contention)
- Location: web/control-tower/invoices/js/finance/service.js:250,254,259 (importCji3), 220,225 (importRecords), 119 (moveStage `refused.push`); server/finance-store.js:54-61
- Evidence:
  ```js
  counts.added += plan.add.length; counts.skipped += plan.skip.length; counts.updated += plan.update.length;
  ...
  changed.push(rec);
  ```
- What's wrong: closures outside the transaction are changed inside the step. When Firestore retries, the counts double, `results` and `refused` get duplicate rows, and the upload log (`cji3Imports`) records the wrong numbers. `memoryStore` never retries, so the tests cannot show this.
- What it should be: the step returns its counts and rows in `result`, and the caller adds them up after the commit.
- Impact: import summaries and the logged upload history can misstate what was added or updated.

### [SWE-07] The Firestore store, the one production uses, has no tests
- Category: MISSING
- Severity: Major
- Confidence: High
- Location: server/finance-store.js:29-63; server/finance-store.test.mjs:14-40 (only file/env tests); server/report-store.js:7-24
- Evidence: `grep -n "firestoreStore\|runTransaction\|emulator" server/*.test.mjs` finds nothing. Every finance test runs on `memoryStore`, which serialises all steps through one queue.
- What's wrong: none of these is tested: transaction semantics, query reads inside `t.get(query)`, the `code === 9` index fallback, the 500-write commit limit, retry behaviour (SWE-06), `ignoreUndefinedProperties`, or the report-version pruning. The memory store is strictly serial, so it hides every race in SWE-05. There are also no tests for: re-matching a line (SWE-02), the `migrated` bypass (SWE-03), the role checks on CJI3 routes (SWE-04), or the browser flow (no E2E).
- What it should be: an emulator-backed run of the existing finance suites (`FIRESTORE_EMULATOR_HOST`, which `firebase-admin.js` already supports) in CI, plus concurrency tests that run two `atomic` steps over the same records.
- Impact: what gets tested is not what runs in production. Data-layer bugs will first show up in live finance data.

### [SWE-08] Several features depend on a writable local disk or work that continues after the response, which Vercel does not provide
- Category: FUNDAMENTALLY WRONG
- Severity: Major
- Confidence: High (the docs admit some of it: docs/server-and-invoices.md:318-321)
- Location: server/site-content.js:358-363, 366-392; server/portal-sync.js:17,41; server/ms-graph.js:44-48,65-73; server/drive.js:5
- Evidence:
  ```js
  export const UPLOAD_DIR = fileURLToPath(new URL('../web/public/assets/uploads/', import.meta.url));
  const saveCache = () => { cache = pruned(cache); fs.writeFileSync(CACHE_FILE, JSON.stringify(cache)); };   // not caught
  (async () => { for (...) { await new Promise(r => setTimeout(r, wait)); ... } })()                         // polls after the response
  const auth = new google.auth.GoogleAuth({ scopes: [...] });  // key file from GOOGLE_APPLICATION_CREDENTIALS
  ```
- What's wrong:
  - Picture uploads (Edit public site, Master Page logos) write into the deployed bundle, which is read-only on Vercel and not shared between instances.
  - `portal-sync` writes its cache with no try/catch after the Claude call has been paid for, so on a read-only disk every Drive sync fails (EROFS) and pays again on the next try.
  - Device-code sign-in polls in a background loop after the HTTP response. A Vercel function is frozen after it responds, so the sign-in never completes. Tokens go to a per-instance file. Sign-in also uses Microsoft's own "Graph Command Line Tools" public client ID, hardcoded (ms-graph.js:41).
  - The Drive client reads only a key file, but Vercel offers only `FIREBASE_SERVICE_ACCOUNT` JSON.
  - The rate limiter (`rate-limit.js`), the sync lock (`routes/portal.js:11`) and the token cache are in memory, per instance.
- What it should be: keep state in Firestore or Cloud Storage: pictures in a bucket, the extraction cache and MS refresh tokens in Firestore (encrypted). Do device-code polling from the browser (it calls `/list/signin/poll`), or use an app registration. Give Drive the same JSON-env key path as `firebase-admin.js`. Until then, hide these features when `process.env.VERCEL` is set, rather than letting them fail.
- Impact: in production, Edit public site pictures, Drive sync, Microsoft List pull and Outlook drafts are broken or fail at random.

### [SWE-09] Two separate JDA identity systems, joined by display name
- Category: FUNDAMENTALLY WRONG
- Severity: Major
- Confidence: High
- Location: web/shared/config/jdas.js:6-10; web/control-tower/invoices/js/services/live/db.js:12-30; web/control-tower/lib/jda-figures.js:17-30; web/control-tower/invoices/js/finance/cji3.js:112-114,195; web/control-tower/invoices/js/config/app-config.json (`defaultJdas`)
- Evidence:
  ```js
  export const JDAS = [{ id: 'jda1', name: 'JDA 1', ...}, ...];                     // Control Tower: fixed ids
  const jRef = await addDoc(collection(db, 'jdas'), { name: j.name, ... });         // Tracker: Firestore auto-ids
  // How a Control Tower JDA and an Invoice Tracker JDA are matched: by name
  const same = invoices.filter(e => ... inGroup(l.group, e.jdaName) && ...);        // CJI3: by jdaName
  ```
- What's wrong: invoices carry a Firestore auto-id `jdaId`, plus a copied `jdaName`. The Control Tower, the cost ring, `/control-tower/<jda>/invoices` (`#/named/<name>`) and CJI3 file groups all join on the name string. Renaming a tracker JDA (`updateJda` is open to any user, see SWE-10), or a second "JDA 1", quietly moves invoices out of CJI3 matching and off the cost ring (`twice` is flagged but still added up). `jdaName` is also denormalised onto every invoice and never updated. That makes three sources of truth: `jdas.js`, `app-config.json defaultJdas`, and Firestore `jdas`.
- What it should be: one JDA registry keyed by the stable id (`jda1`..`jda3`). Tracker JDAs and invoices store that id, and `GROUPS` lists ids (`['jda1','jda2']`) compared against `e.jdaId`. Add a one-off migration that maps the existing auto-ids.
- Impact: payments can be dropped or attached to the wrong JDA by a rename, and maintenance is fragile.

### [SWE-10] The browser writes JDAs, projects, budgets and the Drive sync state straight to Firestore, with no validation or audit
- Category: FUNDAMENTALLY WRONG
- Severity: Major
- Confidence: High
- Location: firebase/firestore.rules:22-28; web/control-tower/invoices/js/services/live/db.js:13-31,33-34,49-51,80-84; web/control-tower/invoices/js/services/sync.js:26-52
- Evidence:
  ```
  match /jdas/{doc} { allow read, write: if onAccessList(); }
  match /projects/{doc} { allow read, write: if onAccessList(); }
  match /meta/{doc} { allow read, write: if onAccessList(); }
  ```
  ```js
  export const updateProject = (id, p) => updateDoc(doc(db, 'projects', id), ...);   // budgets, no audit line
  // syncDrive: AI extraction -> server importRecords -> browser addLog -> browser markFileProcessed
  ```
- What's wrong: finance writes go through validated, audited server routes, but project budgets (which drive "budget used" and the forecast), JDA names and dates, and the first-time seed are written by any signed-in browser. There is no schema check, no audit line, and delete is allowed (`write` includes delete). The seed is check-then-act in the client, so two first visits can both seed. The Drive sync is a multi-service workflow driven from a browser tab, so closing the tab leaves files part-processed across two stores.
- What it should be: move `jdas`/`projects`/`meta`/`processedFiles`/`activity` writes behind `/api` routes that use the same `build` → `atomic` → audit pattern, close `write` in the rules, and run the Drive sync on the server.
- Impact: budget and JDA data can be changed or deleted with no trace, and the data layer is split in two.

### [SWE-11] Invoices move to Pending Lead approval when the email is generated, not when it is sent; one failure blocks every retry
- Category: WRONG
- Severity: Major
- Confidence: High
- Location: web/control-tower/invoices/js/ui/list-invoices.js:128-131,141-158
- Evidence:
  ```js
  const send = async () => done ||= finance.sendListToLead({ ... });
  $('#pv-eml', d).onclick = async () => { ... a.click(); ...; await finish('The draft is downloaded: ...'); };
  ```
- What's wrong: downloading a `.eml`, copying HTML, or creating an Outlook draft each call `sendListToLead`. That logs `listEmails` and moves the invoices to `pending_lead` before anything has been sent. The audit trail then says "Emailed to the Project Lead" for drafts that were never sent. Also, `done ||= promise` keeps a rejected promise, so after one network failure every button in the dialog fails again until the dialog is reopened.
- What it should be: separate "draft created" from "sent". Add a "Mark as sent" step (or a Graph `send`), and only that moves the stage. Reset `done = null` on rejection.
- Impact: the approval queue and the audit log record events that did not happen.

### [SWE-12] Separation of duties compares display names and is bypassed by the CJI3 path
- Category: WRONG
- Severity: Minor
- Confidence: High
- Location: server/routes/finance.js:94,131; server/auth.js:56
- Evidence:
  ```js
  const userOf = email => ({ email, name: email.split('@')[0] });
  if (move?.from === 'pending_lead' && move.to === 'to_be_paid' && ... record?.stageBy && record.stageBy === actor(req))
  ```
- What's wrong: `stageBy` and `actor` are email local parts. `ali@petronas.com` and an `ALLOWED_EMAILS` `ali@vendor.com` are the same person to this check and to the audit log. The check also covers only `pending_lead → to_be_paid`, a move the current design no longer uses: the PM who sent invoices to the Lead can mark them Paid through `matchLine` (SWE-04). No approver identity is stored anywhere, because approval now happens in email.
- What it should be: store and compare the full lowercase email (`stageByEmail`), apply the rule to every move that leads to `paid`, and record the approver when CJI3 confirms payment.
- Impact: the four-eyes control is weaker than the code comment says.

### [SWE-13] The CJI3 duplicate key treats a real repeat payment in a later incremental file as already imported
- Category: RISK
- Severity: Major
- Confidence: Medium (depends on whether exports are cumulative; the owner has not confirmed with a real file, see CONTEXT "No real data files")
- Location: web/control-tower/invoices/js/finance/cji3.js:101-104,169-171
- Evidence:
  ```js
  // two lines identical in all of them are told apart by their order in the file (the 1st, the 2nd…).
  const key = keyOf(l), n = (seen.get(key) || 0) + 1;
  lines.push({ ...l, ..., lineKey: `${key}#${n}` });
  ```
- What's wrong: the occurrence counter counts only within the uploaded file. Take two genuine instalments with the same WBS, Reference, dates, doc type, cost element, currency and amount. If they arrive in separate exports (an incremental export, or a date-filtered one), both are `#1`, and the second is skipped as "already in". The reverse is also possible: a cumulative file that drops one of two identical lines can never be reconciled. The SAP document number, which would make lines unique, is not in the file.
- What it should be: ask for the SAP Document Number / line item in the export and add it to `KEY_FIELDS`. Until then, flag every skip of an identical line for a person to review, rather than skipping it silently.
- Impact: a missed payment shows an invoice as part paid or not paid, which is wrong money on the Payment Table.

### [SWE-14] Paid invoices can be edited (amount, rate, tax) with no check against their CJI3 lines
- Category: RISK
- Severity: Major
- Confidence: High
- Location: web/control-tower/invoices/js/finance/service.js:41-60,150-165
- Evidence:
  ```js
  async function save(kind, input, actor) {
    ...
    if (prev?.deletedAt) throw ...;      // the only state check: no stage check
    const { record, errors } = build(kind, { ...input, draft: false }, prev, s);
  ```
- What's wrong: once a CJI3 line has matched an invoice within tolerance and it is Paid, `save`, `recalculate` and `remove` still change `grossMyrMinor` or delete it. The Paid status, the `paidBy` lines and the `amountCheck` stored on the line then no longer agree, and the Payment Table "actual" moves with no new payment evidence.
- What it should be: lock the money fields on `stage === 'paid'`, or re-run `paidAgainst` on save and move the invoice to `part_paid`/`amount_differs` (un-pay) when it no longer matches. Refuse to delete a Paid invoice while lines point at it.
- Impact: reported paid actuals can drift from what the bank actually paid.

### [SWE-15] Whole-collection reads inside transactions, and the whole register sent on every page load
- Category: RISK
- Severity: Minor
- Confidence: Medium
- Location: web/control-tower/invoices/js/finance/service.js:36,82,106,230-231,278,281; server/routes/finance.js:102
- Evidence:
  ```js
  else for (const part of slices(inputs, 150)) await store.atomic(async read => ({ writes: decide(await read.list(coll), part) }));
  const data = async () => ({ settings: ..., entries: await store.list(COLL.entry), sanctioned: await store.list(COLL.sanctioned) });
  ```
- What's wrong: every 150-row import slice and every restore reads the whole `financeEntries` collection inside a transaction. In Firestore that locks every document read and is re-read on each retry. `matchCji3` reads all lines and all invoices for every upload. `/data` returns every invoice and sanctioned record, deleted ones included. This is fine at hundreds of records, but cost and contention grow with the register, and a 25 MB body limit is already needed.
- What it should be: check duplicates with `where('projectId','in',…)` or deterministic ids made from `invoiceKey` (as `lineId` already does for CJI3). Filter `/data` by JDA, and page it.
- Impact: slow or failing imports and contention once the register grows.

### [SWE-16] A large CJI3 upload slice can exceed Firestore's per-commit write limit
- Category: RISK
- Severity: Minor
- Confidence: Low (check against the current Firestore limit and a real export with many changed columns)
- Location: web/control-tower/invoices/js/finance/service.js:246-263
- Evidence:
  ```js
  for (const part of slices(read.lines, 150)) {
    ... writes.push({ coll: 'cji3Lines', ... }, ...u.changes.map(c => line(actor, 'cji3', ..., 'import', c)));
  ```
- What's wrong: 150 updated lines, each with up to about 16 changed `UPDATABLE` columns, means one line write plus one audit line per change: well over 500 writes in one transaction. Earlier slices are already committed when a later one fails, and no `cji3Imports` log is written.
- What it should be: limit the slice by the number of writes, not lines, or store each line's changes in one audit document.
- Impact: a re-export with many changed columns fails partway through.

### [SWE-17] Dead code: a status setter the server refuses, which demo mode still allows
- Category: WRONG
- Severity: Minor
- Confidence: High
- Location: web/control-tower/invoices/js/finance/service.js:136-146,392; server/routes/finance.js:121; web/control-tower/invoices/js/services/live/finance.js:14; web/control-tower/invoices/js/services/demo/finance.js:18; web/control-tower/invoices/js/finance/book.js:23
- Evidence:
  ```js
  router.post('/entries/status', (req, res) => res.status(410).json({ error: ... }));
  export const setStatus = (ids, status) => post('/api/finance/entries/status', { ids, status });   // live
  export const setStatus = (ids, status) => f.setStatus(ids, status, who());                         // demo: works, Paid included
  ```
- What's wrong: `setStatus` is exported, wired through `book.js`, and tested ("the old status buttons still work"), but live always gets 410. Demo mode, which is what production runs today (SWE-01), can still set Paid by hand, so demo and live follow different rules. The legacy `MOVES` (`sent_to_pd`, `to_be_paid`, approve, reject) are also kept for a flow the UI no longer offers.
- What it should be: delete `setStatus` from the service, both adapters, `book.js` and its test, and the 410 route once old clients are gone. Mark the legacy moves as migration-only.
- Impact: confusing code, and demo results that do not match live.

### [SWE-18] Outside-service calls without timeouts; the List read is cut at 5,000 rows without warning
- Category: RISK
- Severity: Minor
- Confidence: High
- Location: server/ms-graph.js:29-30,56-57,95-96,117; server/claude.js:9-10
- Evidence:
  ```js
  const res = await fetch(path.startsWith('https://') ? path : `https://graph.microsoft.com/v1.0${path}`, { ...init, headers: {...} });   // no signal
  for (let next = `${base}/items?expand=fields&$top=500`; next && rows.length < 5000;) {
  ```
- What's wrong: Graph, the token endpoint and Anthropic calls have no `AbortSignal.timeout`, unlike `auth.js` and `forex.js`, so a hung upstream holds the function until the platform kills it. `rowsOf` stops at 5,000 rows and returns as if complete, and `saveListPull` then refuses more than 5,000.
- What it should be: add `signal: AbortSignal.timeout(15000)` to every `fetch` (and `timeout` on the Anthropic client). Return `truncated: true` and show it on screen.
- Impact: hung requests, and List items silently missing from the PM's view.

### [SWE-19] The Bank Negara rate quietly falls back to today's rate for an old date
- Category: WRONG
- Severity: Minor
- Confidence: High
- Location: server/forex.js:14-19
- Evidence:
  ```js
  if (date) for (let back = 0, ...; back < 7 && !found?.rate?.middle_rate; back++, ...) { found = await get(...); }
  if (!found?.rate?.middle_rate) found = await get(currency);   // latest rate, whatever `date` was asked
  ```
- What's wrong: if none of the 7 days before the requested date has a rate (an API error, a long holiday, a gap), the latest rate is returned. The UI may store it as that invoice's rate. A transient HTTP error (`r.ok` false) is treated the same as "no rate that day".
- What it should be: when a `date` was asked for, never fall back to the latest rate. Return 404 with a clear message, and tell an HTTP failure apart from no data.
- Impact: MYR amounts converted at the wrong date's rate.

### [SWE-20] Deployment config is not in the repo; hardcoded project IDs; JDA 3's key is missing from the Vercel setup
- Category: MISSING
- Severity: Minor
- Confidence: Medium
- Location: (no vercel.json at repo root); web/shared/config/firebase-config.js:5-17; docs/server-and-invoices.md:308-315; server/report-reader.js:33-36
- Evidence:
  ```js
  projectId: "test-invoice-c38a4",
  ```
  The Vercel env table lists `FINANCE_STORE`, `FIREBASE_SERVICE_ACCOUNT`, `SESSION_SECRET`, `FIREBASE_API_KEY`, `ALLOWED_EMAILS`, and not `JDA3_FIREBASE_SERVICE_ACCOUNT`.
- What's wrong: the Vercel entry, root directory and function settings live only in the dashboard. Production uses a Firebase project named `test-invoice-…`, hardcoded in the front end, with no staging/production split. Without the JDA 3 key, `/api/portal/save` for JDA 3 returns 503, and its report is read with the public REST API key, which works only if JDA 3's rules are publicly readable.
- What it should be: commit `vercel.json`, take Firebase config per environment, and add `JDA3_FIREBASE_SERVICE_ACCOUNT` to the required production settings (refuse to start without it).
- Impact: deployments cannot be reproduced; JDA 3 edits fail, or depend on a public database.

---

## Top 3 blockers
- **SWE-01**: `demoMode: true` on main. The production Invoice Tracker saves nothing.
- **SWE-02**: re-matching a CJI3 line leaves the old invoice Paid, so one payment is counted twice.
- **SWE-03**: an import marked `source: 'migrated'` lets any user create Paid invoices without CJI3.

## Missing entirely
- Tests against the real Firestore store (emulator), and concurrency tests (SWE-07).
- Browser / E2E tests of the critical flows (List → email → Pending Lead → CJI3 → Paid → Payment Table).
- A server-side, audited API for JDAs, projects and budgets (SWE-10).
- A stable JDA id shared by the Control Tower, the tracker and CJI3 groups (SWE-09).
- A record of who approved an invoice (approval is only implied by CJI3) (SWE-12).
- Any lock or re-check on Paid invoices' money fields (SWE-14).
- Schema or migration versioning for Firestore documents. Old shapes are handled ad hoc (`stageOf` from `status`, `budget` vs `budgetMinor`).
- Committed deployment config, and a check at start-up that production settings are complete (SWE-20).
- Durable storage for pictures, the extraction cache and Microsoft tokens on Vercel (SWE-08).

## Out-of-lane flags
- SEC: any cookie or Authorization header, valid or not, gets the 25 MB JSON parser before auth (`server/app.js:46`). This allows a cheap memory-exhaustion DoS.
- SEC: with the app registration, any signed-in user can create an Outlook draft with arbitrary HTML and recipients in the shared `MS_MAIL_SENDER` mailbox (`server/routes/finance.js:165`, `server/ms-graph.js:148`).
- SEC: Microsoft refresh tokens (Mail.ReadWrite, Sites.Read.All) are stored in plain text in `server/.ms-tokens.json` (`server/ms-graph.js:48`).
- SEC: `firebase/firestore.rules` are not yet published, and jdaReports was observed publicly readable (CONTEXT). The JDA 3 report read falls back to unauthenticated REST (`server/report-reader.js:33-34`).
- SEC: there is no per-JDA access control, and sanctioned amounts can be changed by any signed-in user (`server/routes/finance.js:166-171`).
- SEC: sessions cannot be revoked (stateless HMAC cookie, 8 h). Logout only clears the cookie on that browser (`server/session.js`).
- OPS: rate limits are in memory and per instance, which on Vercel makes the sign-up/reset limit of 5 per 15 minutes largely ineffective (`server/rate-limit.js`).
