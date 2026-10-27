# LOG review: business logic, workflow state, edge cases

Reviewer: LOG · Scope: whole repo at `main` 89e49bf · Method: code reading plus read-only node probes against
`web/control-tower/invoices/js/finance/*` over `memoryStore` (scripts in `/tmp/claude-1000/logprobe/`, nothing
written in the repo). `cd server && npm test`: 193/193 pass. None of the cases below is covered by a test.

Short paths: `fin/` = `web/control-tower/invoices/js/finance/`, `ui/` = `web/control-tower/invoices/js/ui/`.

## Workflow state machine (as built)

```
received ──► with_pm ──► pending_lead ──► to_be_paid ─┐      (approve / reject / return: API only, no UI caller)
   │            ▲  │          │  ▲                     │
   └► sent_to_pd│  └► received│  └── rejected ◄────────┘(reject)
                └─────────────┘(return to PM)
any open stage ──(CJI3 match: auto or by hand)──► paid ──(undo match)──► paidFrom
```
Facts: no UI page calls `moveStage` (grep shows callers only in `services/` and `book.js`); the only state changes
a user can make in the UI are List → Pending Lead (`sendListToLead`) and CJI3 match/unmatch. Approval = a CJI3 line.

---

### [LOG-01] Invoices sent from the Microsoft List and paid by CJI3 never show on the Payment Table or the cost ring
- Category: FUNDAMENTALLY WRONG
- Severity: Critical
- Confidence: High
- Location: fin/service.js:L363-L366; fin/workflow.js:L68; fin/core.js:L148; web/control-tower/lib/jda-figures.js:L131
- Evidence:
  ```js
  // service.js 363: the draft has no month, project or document date
  build('entry', { jdaId, jdaName, invoiceNo: item.invoiceNo, partner: item.partner, ... taxRate: '0', ... draft: true, source: 'list' }, null, s);
  // workflow.js 68: only Sent to PD / To Be Paid are blocked for an incomplete invoice; Paid is not
  if (['sent_to_pd', 'to_be_paid'].includes(to) && entry.missing?.length) return ...
  // core.js 148: the Payment Table drops every invoice without a valid month
  entries.filter(e => live(e) && isMonth(e.month)).forEach(e => rowOf(e).invoices.push(e));
  ```
  Probe: List item LI-1 (RM 1,080) → `sendListToLead` → CJI3 line 1,080 → invoice `stage: paid, status: paid,
  missing: ['Choose a project','Invoice date…','Payment month…']`; `tableTotals` → `actualMinor: 0`;
  `costsByName` → `spentMinor: 0`.
- What's wrong: the current main flow (List → email → CJI3) produces invoices with no month and no project.
  CJI3 is allowed to mark them Paid while incomplete, and the Payment Table, `tableTotals` and the Control Tower cost
  ring silently exclude them. A foreign-currency List item also gets `grossMyrMinor: 0` (no rate), so its CJI3 line
  can never match within tolerance. The tax is forced to 0% for every List draft.
- What it should be: an invoice cannot reach Paid (auto or by hand) while `missing` is non-empty, or the CJI3 line
  fills what is missing (month = posting month, project = CO Object). At minimum, `checkMove` should refuse the move
  and the line should stay `none` with a reason:
  ```js
  if ((['sent_to_pd', 'to_be_paid'].includes(to) || to === 'paid') && entry.missing?.length) return `This invoice is incomplete (...)`;
  ```
  and `paymentTable` should surface paid invoices without a month (an "unassigned" row) instead of dropping them.
- Impact: the cost ring and Payment Tables under-report paid spend by every invoice that came through the List,
  which is the only intake path now. Wrong money on the headline dashboard.

### [LOG-02] A reversal (negative) CJI3 line leaves the invoice Paid and its full amount counted as spent
- Category: WRONG
- Severity: Critical
- Confidence: High
- Location: fin/service.js:L293-L302
- Evidence:
  ```js
  const state = sum === 'equal' ? (paidAlready ? 'linked' : 'paid') : sum === 'less' ? 'part_paid' : 'amount_differs';
  ...
  if (state === 'paid') await moveStage(...);
  else if (paidAlready) await store.atomic(... paidBy: [...cur.paidBy, ...allIds] ...);
  ```
  Probe: INV1 Paid by +1,000; next file adds −1,000 (SAP reversal) → both lines become `part_paid`, invoice stays
  `stage: paid, status: paid`, the reversal is appended to `paidBy`, Payment Table `actualMinor` still includes 1,000.
- What's wrong: `amountOf` (cji3.js:L42-L49) reads SAP negatives on purpose, but no path takes an invoice out of
  Paid when its lines net to less than the invoice. The line state ("part paid") and the invoice state ("Paid")
  contradict each other.
- What it should be: when `paidAlready && sum !== 'equal'`, move the invoice back with `unpaidStage(inv)` (byCji3) or
  flag it for review and exclude it from actual spend:
  ```js
  if (paidAlready && sum === 'less') await moveStage([invoiceId], unpaidStage(inv), { byCji3: true, paidBy: [], note: 'CJI3 lines no longer cover the invoice' }, actor);
  ```
- Impact: reversed/cancelled payments still count as paid; spend and variance are overstated.

### [LOG-03] Amount tolerance has no cap; "Paid" counts the invoice amount, not what CJI3 paid
- Category: FUNDAMENTALLY WRONG
- Severity: Critical
- Confidence: High
- Location: fin/cji3.js:L124-L129; fin/core.js:L150
- Evidence:
  ```js
  export const TOLERANCE = minor => Math.max(100, Math.round(Math.abs(minor) * 0.005));
  return Math.abs(d) <= TOLERANCE(invoiceMinor) ? 'equal' : ...
  // core.js 150
  actualMinor = sum(r.invoices.filter(i => i.status === COUNTS_AS_ACTUAL), 'grossMyrMinor')
  ```
  Probe: invoice BIG RM 1,000,000.00, one CJI3 line RM 995,000.00 → `paid: 1`, invoice Paid, Payment Table actual
  = 1,000,000.00.
- What's wrong: 0.5% is uncapped (RM 5,000 on RM 1 M; RM 50,000 on RM 10 M) and is inclusive (`<=`). Once inside it,
  the invoice is "fully paid" and "actual spend" becomes the invoice's figure, so the money really paid (the CJI3
  sum) is never what the Payment Table, the cost ring or `analytics.js` show. The same "paid" is calculated two ways:
  CJI3 payments page shows line sums; Payment Table shows invoice gross.
- What it should be: cap the tolerance (e.g. `Math.min(Math.max(100, round(0.005·x)), 5000)` = RM 50, or a setting
  the owner agrees), and either store the CJI3 sum as `paidMyrMinor` on the invoice and use it for `actualMinor`, or
  show the difference as a variance line.
- Impact: material under-payments are silently treated as paid in full; dashboard "paid" ≠ bank/SAP paid.

### [LOG-04] Re-matching an already matched line pays a second invoice and leaves the first one Paid
- Category: WRONG
- Severity: Major
- Confidence: High
- Location: fin/service.js:L310-L331
- Evidence:
  ```js
  async function matchLine(lineIdIn, invoiceId, actor) {
    const l = await store.get('cji3Lines', lineIdIn), inv = ...
    if (!invoiceId) { ...unlink... }
    // no check of l.invoiceId here: the old invoice is never unlinked
    if (stage !== 'paid') await moveStage([inv.id], 'paid', { byCji3: true, paidBy: linked, ... });
  ```
  Probe: line L1 paid INV1; `matchLine(L1, INV2)` → INV1 `paid, paidBy [L1, …]`, INV2 `paid, paidBy [L1]`.
- What's wrong: one payment line now pays two invoices. The UI hides "Match…" on matched lines, but
  `POST /api/finance/cji3/match` (server/routes/finance.js:L74) accepts it from any signed-in user.
- What it should be: refuse when `l.invoiceId && l.invoiceId !== invoiceId` ("Undo the match first"), or run the
  unmatch branch first in the same step.
- Impact: double-counted payments; an invoice shown Paid with no payment of its own.

### [LOG-05] Anyone signed in can mark any invoice Paid by hand, from any stage, at any amount; roles and separation of duties do not apply
- Category: MISSING
- Severity: Major
- Confidence: High
- Location: server/routes/finance.js:L67-L75; fin/service.js:L300, L316, L327; fin/workflow.js:L33, L43
- Evidence:
  ```js
  router.post('/cji3/match', run(req => finance.matchLine(String(req.body?.lineId || ''), String(req.body?.invoiceId || ''), actor(req))));
  // service.js 327: no `may`
  if (stage !== 'paid') await moveStage([inv.id], 'paid', { byCji3: true, paidBy: linked, note: `..., confirmed by hand` }, actor);
  // workflow.js 43: the role exists but nothing checks it
  export const roleFor = move => move.by === 'cji3' ? 'accountant2' : ...
  ```
  `grep ROLE_ACCOUNTANT2` finds only a comment.
- What's wrong: CJI3 is "the approval", yet uploading a CJI3 file, `/cji3/rematch` and a manual match pass no `may`
  check. A manual match pays "amount included" whatever the line says (`// a person's match is their confirmation`),
  and may pick any invoice of the file's JDAs ("Other invoices" list, ui/cji3-lines.js:L141). An invoice still at
  Received, never emailed to the Lead, becomes Paid. The PM who sent it can do so themselves.
- What it should be: pass `may(req)` into `importCji3`/`matchCji3`/`matchLine` and enforce `accountant2`; refuse a
  manual match whose line reference ≠ invoice number unless a reason note is given; refuse when actor ===
  `stageBy` of the move to Pending Lead.
- Impact: the only approval control left can be bypassed by any user; audit shows "confirmed by hand" only.

### [LOG-06] CJI3 date order is guessed per file, so the same line gets a different key in another file and is stored twice
- Category: WRONG
- Severity: Major
- Confidence: Medium (only for text/CSV dates; real Excel date cells become ISO via server/cells.js:L4)
- Location: fin/cji3.js:L72, L77, L23; fin/sheets.js:L79, L85-L89
- Evidence:
  ```js
  const order = dateOrder(rows.flatMap(r => [cell(r, 'postingdate'), cell(r, 'documentdate')])).order;
  l.postingDate = toIsoDate(l.postingDate, order);
  // sheets.js: dayFirst only if some first number > 12; otherwise 'mdy'
  ```
  Probe: file 1 has `03/04/2026` and `13/04/2026` (→ dmy, 2026-04-03, Paid INV4). File 2 has only `03/04/2026`
  (→ mdy, 2026-03-04): `added: 1`, a second line for INV4 stored, state `amount_differs`.
- What's wrong: `postingDate`/`documentDate` are key fields; `dateOrder(...).sure` is ignored by `readCji3`, so an
  ambiguous file is keyed by a guess that can flip between uploads. "The same or an overlapping file never doubles
  anything" (ui/cji3-lines.js:L36) is then false.
- What it should be: fix the CJI3 order to the SAP layout (one constant), or refuse an ambiguous file unless the
  person states the order (as `entryInputs` already allows), and key on the raw cell text too.
- Impact: duplicated payment lines, invoices flagged "amount differs" or double-counted in CJI3 sums.

### [LOG-07] A blank row in the CJI3 sheet silently drops every line below it
- Category: WRONG
- Severity: Major
- Confidence: High
- Location: fin/sheets.js:L43-L53; fin/cji3.js:L65-L67; fin/service.js:L265
- Evidence:
  ```js
  for (; i < rows.length && filled(rows[i]); i++) { out.push(...) }   // stops at the first blank row
  ...
  export const tableEnd = rows => ends.get(rows) || { blankLine: 0, after: 0 };  // never called by readCji3
  ```
  Probe: header, Q1, blank, Q2 → dry run `rows: 1, added: 1, malformed: []`; Q2 not mentioned anywhere.
- What's wrong: SAP/Excel exports with a blank separator row, or a person who pasted two exports together, lose the
  rest of the file. The preview and the import log report only what was read.
- What it should be: in `readCji3`, read `tableEnd(rows)`; if `after > 0`, either continue past blank rows or refuse
  with "N rows below line X were not read".
- Impact: payments missing from the register with no warning; their invoices stay unpaid.

### [LOG-08] Two identical payments in separate incremental files: the second is skipped as a duplicate
- Category: RISK
- Severity: Major
- Confidence: Medium (depends on whether the company sends cumulative or incremental exports; UI says "as often as payments are made")
- Location: fin/cji3.js:L20-L23, L88-L90
- Evidence:
  ```js
  // two lines identical in all of them are told apart by their order in the file (the 1st, the 2nd…)
  const key = keyOf(l), n = (seen.get(key) || 0) + 1; ... lineKey: `${key}#${n}`
  ```
  Probe: INV3 (2,000) gets a 1,000 line in file A; file B (next payment, same day/ref/amount) → `added 0, skipped 1`;
  INV3 never reaches Paid.
- What's wrong: occurrence numbering is per file, so it only works for cumulative exports. An incremental file
  restarts at `#1` and collides with an earlier, different payment.
- What it should be: decide with the owner whether files are cumulative; if not, include a field that differs per
  payment (SAP document number / Created on / User Name) in `KEY_FIELDS`, or warn on a skip whose `importId` differs.
- Impact: real payments lost; invoices stuck at part paid.

### [LOG-09] Firestore transaction retries double the side effects kept outside the step
- Category: WRONG
- Severity: Major
- Confidence: Medium (needs write contention; Firestore `runTransaction` re-runs the step on ABORTED)
- Location: fin/service.js:L97-L103 (`restored`), L116-L119 (`refused`), L245-L254 (`counts`, `changed`), L206-L226 (`results`, `mine`); server/finance-store.js:L54-L61
- Evidence:
  ```js
  const at = now(), restored = new Set();      // outside the step
  if (restored.has(invoiceKey(r)) || ...) throw new FinanceError(`... cannot be restored ...`);
  ...
  counts.added += plan.add.length; ... changed.push(rec);   // inside a step that may run again
  ```
  Probe with a store that runs each step twice (as a retry does): `restore` throws "cannot be restored: that invoice
  number has since been entered again"; `importCji3` reports `added 4` for 2 lines; `importRecords` reports
  `imported 2` for 1 record. `moveStage` would list an invoice as both moved and refused, and `sendListToLead`
  (L377, L380) treats any `refused` as skipped.
- What's wrong: accumulators are mutated inside `store.atomic` steps; a retried step adds to them again.
- What it should be: build accumulators inside the step and return them in `result`; merge after `atomic` resolves.
- Impact: wrong counts in import logs and messages, false refusals of restore, invoices reported "not moved" that did move.

### [LOG-10] CJI3 import is not all-or-nothing: a failure mid-file leaves earlier slices stored, unmatched and unlogged forever
- Category: RISK
- Severity: Major
- Confidence: High
- Location: fin/service.js:L246-L270
- Evidence:
  ```js
  for (const part of slices(read.lines, 150)) { ... await store.atomic(step); }
  ...
  log.match = await matchCji3(changed.filter(l => !l.invoiceId).map(l => l.id), actor);
  await store.atomic(async () => ({ writes: [{ coll: 'cji3Imports', id: importId, data: log }] }));
  ```
- What's wrong: if slice 3 throws, slices 1–2 are committed, no `cji3Imports` record is written and `matchCji3` never
  runs. Re-uploading the file skips those lines (`skip`), so they are never in `changed` and never auto-matched; only
  a manual "Match again" picks them up. The same applies if `matchCji3` itself throws after all slices.
- What it should be: write the import log first with `status: 'running'`, update it per slice, and on re-upload match
  every stored line with `!invoiceId` (not only `changed`), i.e. call the rematch selection after every import.
- Impact: payments stored but invoices silently left unpaid; no record of the failed upload.

### [LOG-11] Two PMs sending the same List items at once create duplicate invoices
- Category: WRONG
- Severity: Major
- Confidence: High
- Location: fin/service.js:L359-L368
- Evidence:
  ```js
  const entries = await store.list(COLL.entry, { where: ['jdaId', jdaId] });   // read outside any atomic step
  let rec = entries.find(...);
  if (!rec) { ...; await store.atomic(async () => ({ writes: [{ coll: COLL.entry, id: rec.id, data: rec }, ...] })); }
  ```
  Probe: two concurrent `sendListToLead` for L1, L2 → `created 2` and `created 2`, 4 register entries.
- What's wrong: check-then-create is split across steps, and the draft has no `projectId`, so the invoice-number
  uniqueness check in `save`/`importRecords` never applies. A double-click on two buttons (Copy + .eml) is guarded by
  `done ||=` only within one dialog.
- What it should be: make the record id deterministic from the List key (`'list-' + lineId(item.key)`) and create it
  inside one atomic step that re-reads it.
- Impact: duplicates make later CJI3 lines `ambiguous` (never auto-paid) and double the "pending" counts.

### [LOG-12] No way in the UI to record a Lead's rejection or return; such invoices stay Pending Lead forever
- Category: MISSING
- Severity: Major
- Confidence: High
- Location: fin/workflow.js:L26-L32; ui/ (no caller of `moveStage`); fin/service.js:L374
- Evidence:
  ```js
  { from: 'pending_lead', to: 'rejected', action: 'Reject', note: true },
  { from: 'pending_lead', to: 'with_pm', action: 'Return to PM', note: true },
  // service.js 374: re-sending a rejected one is refused
  if (!['received', 'with_pm'].includes(stage)) { skipped.push({ invoiceNo: ref, why: `already ${STAGE_LABEL[stage]}` }); continue; }
  ```
  `grep -rn moveStage web/control-tower/invoices/js/ui` → no matches.
- What's wrong: approval moved to email, but its negative outcomes have no place in the system. An invoice the Lead
  rejects by email is counted as pending in `costsByName` (`pending`) and stays a CJI3 candidate. A corrected invoice
  with the same number cannot be re-sent (stage `pending_lead` → "already Pending Lead approval"). Dead end.
- What it should be: a "Rejected / returned by the Lead" action (with note) on the List/Approvals page calling the
  existing moves, and `sendListToLead` accepting a `with_pm`-returned invoice (already does) and a restored one.
- Impact: stale pending counts; rejected invoices can still be auto-paid by a mistyped CJI3 reference.

### [LOG-13] "Generate email" moves invoices to Pending Lead before any email is sent, and the email lists invoices the server refused
- Category: RISK
- Severity: Minor
- Confidence: High
- Location: ui/list-invoices.js:L116-L141; fin/service.js:L374-L381
- Evidence:
  ```js
  const html = emailHtml({ jdaName: jda.name, items: chosen, ... });   // built from all chosen items
  ...
  a.click(); ...; await finish('The draft is downloaded...');           // finish() calls sendListToLead
  ```
- What's wrong: downloading the .eml (or copying the HTML) is recorded as "Emailed to the Project Lead" whether or
  not it is sent. Items skipped (`already Paid`, role refusal) are still in the email the Lead approves.
- What it should be: call `sendListToLead` first, then build the email from `out.sent` only; record "draft
  generated" vs "sent" separately (Graph draft can confirm).
- Impact: Lead approves invoices the system says are already paid/rejected; audit says "emailed" when it was not.

### [LOG-14] "Within sanctioned" only when paid equals sanctioned to the sen; inconsistent with the CJI3 tolerance
- Category: WRONG
- Severity: Minor
- Confidence: High
- Location: fin/core.js:L151-L155; ui/payments.js:L64
- Evidence:
  ```js
  flag: varianceMinor > 0 ? 'over' : varianceMinor < 0 ? 'under' : 'within'
  ```
  Probe: sanctioned 1,000.00, paid 999.99 → `under`; a row with nothing paid yet → `under`; 1,000.01 → `over`.
- What's wrong: "within" is effectively unreachable; any payment below the limit is labelled "Under sanctioned",
  which is the normal, good state; RM 0.01 over is "Over". CJI3 treats ±max(RM1, 0.5%) as equal.
- What it should be: `over` when `actual > withTax + tol`, otherwise `within` (with `under` reserved for a closed
  month), using one tolerance shared with cji3.js.
- Impact: misleading flags; PMs learn to ignore them.

### [LOG-15] Payment Table "Payment month" is the invoice date's month, never the payment's
- Category: RISK
- Severity: Minor
- Confidence: Medium (owner intent not documented)
- Location: fin/core.js:L72, L79; fin/service.js:L120 (Paid does not touch `month`)
- Evidence:
  ```js
  if (!r.month && isDate(r.documentDate)) r.month = r.documentDate.slice(0, 7); // the invoice's own month
  need(isMonth(r.month), `${entry ? 'Payment month' : 'Month'} is required, as YYYY-MM`);
  ```
- What's wrong: an invoice dated 30 Dec paid (CJI3 posting) in January counts in December's row; across a year end
  it moves spend into the wrong fiscal year. The CJI3 `postingDate`/`fiscalYear`/`period` are not used.
- What it should be: on CJI3 Paid set `paidMonth` from the latest line's posting date and key the "actual" side of the
  row by it (or confirm with the owner and rename the field "Invoice month").
- Impact: month/year-boundary variances (over in one month, under in the next).

### [LOG-16] Invoices at Pending Lead cannot be confirmed Paid after a part payment; UI texts describe the old rules
- Category: WRONG
- Severity: Minor
- Confidence: High
- Location: ui/cji3-lines.js:L72, L90, L145
- Evidence:
  ```js
  ['part_paid','amount_differs'].includes(l.matchState) && inv && ['to_be_paid','sent_to_pd'].includes(stageOf(inv)) ? `...Confirm invoice Paid...` : ''
  confirm('... the invoice goes back to the To Be Paid queue.')
  <p class="legend">... One not yet approved is linked, not moved.</p>
  ```
- What's wrong: List invoices sit at `pending_lead`, so the Confirm button never shows for them. The undo text is
  wrong (it returns to `paidFrom`), and the match legend is wrong (service.js:L327 moves any open stage to Paid).
- What it should be: show Confirm for every open stage; reword the two texts to the current behaviour.
- Impact: users cannot close part-paid List invoices without undo + re-match; they are told the wrong outcome.

### [LOG-17] Undoing one of several lines leaves the invoice Paid even when the rest no longer cover it; stale write
- Category: WRONG
- Severity: Minor
- Confidence: High
- Location: fin/service.js:L315-L317
- Evidence:
  ```js
  const was = await store.get(COLL.entry, l.invoiceId), rest = (was?.paidBy || []).filter(id => id !== l.id);
  if (was && stageOf(was) === 'paid' && !rest.length) await moveStage(...);
  else if (was) await store.atomic(async () => ({ writes: [{ ..., data: stamp({ ...was, paidBy: rest }, actor, at) }] }));
  ```
- What's wrong: no amount re-check on the remaining lines; and the else-branch writes `was`, read outside the step,
  overwriting any change made in between (lost update).
- What it should be: re-read inside the step and re-run `paidAgainst` on the remaining lines; unpay if not `equal`.
- Impact: invoice Paid on half its payment after a correction.

### [LOG-18] A matched line's MYR amount can change on re-import without the match being re-checked
- Category: RISK
- Severity: Minor
- Confidence: High
- Location: fin/cji3.js:L27; fin/service.js:L256-L268
- Evidence:
  ```js
  export const UPDATABLE = ...concat(['valueObjMinor', 'valueCoAreaMinor'])...
  log.match = await matchCji3(changed.filter(l => !l.invoiceId).map(l => l.id), actor);
  ```
- What's wrong: `valueCoAreaMinor` (the amount compared to the invoice) is updatable, not a key; an updated matched
  line is excluded from re-matching, so its invoice's Paid/part-paid state is from the old amount.
- What it should be: re-run the amount check for invoices whose linked lines changed amount.
- Impact: stale Paid/part-paid states after SAP corrections.

### [LOG-19] sendListToLead attaches a List item to an existing invoice by number alone, ignoring partner, project and the item's own JDA
- Category: RISK
- Severity: Minor
- Confidence: High
- Location: fin/service.js:L354, L361
- Evidence:
  ```js
  let rec = entries.find(e => !e.deletedAt && (e.listItemId === item.key || (item.invoiceNo && key(e.invoiceNo) === key(item.invoiceNo))));
  ```
- What's wrong: `invoiceKey` allows the same number in two projects; two vendors' "INV-001" in one JDA collide; the
  server never checks `item.jda` against `jdaId` (only the UI filters, ui/list-invoices.js:L22).
- What it should be: match by `listItemId` first; fall back to number only when partner also matches; refuse items
  whose `jda` is a different JDA.
- Impact: the wrong invoice moved to Pending Lead; the right one skipped as "already Pending Lead".

### [LOG-20] Actor identity is the email's local part: two people can be the same "actor"
- Category: RISK
- Severity: Minor
- Confidence: High
- Location: server/auth.js:L56; server/routes/finance.js:L21, L58
- Evidence:
  ```js
  const userOf = email => ({ email, name: email.split('@')[0] });
  if (... record?.stageBy && record.stageBy === actor(req)) return 'You validated this invoice, ...';
  ```
- What's wrong: `ali@petronas.com` and an ALLOWED_EMAILS exception `ali@vendor.com` share the actor "ali": the
  separation-of-duties check refuses or allows the wrong person and the audit log cannot tell them apart.
- What it should be: store and compare the full email (`stageByEmail`), display the name.
- Impact: wrong audit attribution; SoD check by name.

### [LOG-21] Match counts include earlier lines rewritten, so "N line(s) made their invoice Paid" over-reports
- Category: WRONG
- Severity: Nit
- Confidence: High
- Location: fin/service.js:L299, L302, L304
- Evidence: `for (const w of lineWrites.values()) counts[w.data.matchState]++;` — earlier lines are added to
  `lineWrites` (L299/L302). Probe: one reversal line → `part_paid: 2`.
- What it should be: count only lines in `lines`.
- Impact: misleading import summary.

### [LOG-22] matchCji3 ignores moveStage refusals: a line can say "paid" while its invoice is not
- Category: RISK
- Severity: Minor
- Confidence: Medium (race: invoice deleted/rejected between the read at L281 and the move)
- Location: fin/service.js:L281, L300, L305
- Evidence: `if (state === 'paid') await moveStage([invoiceId], 'paid', {...}, actor);` — return value unused; line
  writes with `matchState: 'paid'` follow regardless.
- What it should be: if `out.refused.length`, write the line as `none`/`ambiguous` with the reason.
- Impact: inconsistent line vs invoice state.

### [LOG-23] Sanctioned "to date" vs whole plan: two different denominators for the same JDA
- Category: RISK
- Severity: Minor
- Confidence: High
- Location: web/control-tower/invoices/js/services/analytics.js:L20; web/control-tower/lib/jda-figures.js:L131, L140-L144
- Evidence:
  ```js
  sanctionedToDate = total(plan.filter(s => s.month <= month));      // project page
  tableTotals(paymentTable(fin.sanctioned.filter(mine), ...))        // cost ring: every month, past and future
  ```
- What's wrong: "paid / sanctioned" on the Control Tower is against the whole plan, while the project page's
  variance is against sanctioned to date; `analytics.actual` also counts paid invoices without a month that the
  Payment Table drops (LOG-01). Same words, different numbers.
- What it should be: one definition, labelled ("of total sanctioned" vs "of sanctioned to date").
- Impact: dashboard and project page disagree.

### [LOG-24] A spread "no more than 60 months apart" accepts 61 months
- Category: WRONG
- Severity: Nit
- Confidence: High
- Location: fin/core.js:L200-L210
- Evidence: `for (...; out.length <= MAX_SPAN; ...) out.push(month)` → `monthsBetween('2026-01','2031-01').length === 61`.
- What it should be: `out.length < MAX_SPAN`.
- Impact: negligible.

---

## Top 3 blockers
- **LOG-01**: the only intake path (List → CJI3) produces Paid invoices that the Payment Table and cost ring drop: paid spend under-reported.
- **LOG-03**: uncapped 0.5% tolerance treats large under-payments as paid in full, and "actual" uses the invoice figure, not the CJI3 sum.
- **LOG-02**: SAP reversal lines never un-pay an invoice; reversed payments stay counted as spend.

## Missing entirely
- Handling of lines deleted upstream (a line in an earlier cumulative CJI3 file but absent from the latest one is never flagged).
- Any role check on CJI3 import / match / unmatch (`accountant2` defined, never enforced).
- A way to record a Lead's rejection or return in the UI (moves exist only in the API).
- Credit notes / negative invoices (`build` requires amount > 0; a CJI3 credit has nothing to match).
- A per-invoice "paid amount" (CJI3 sum) distinct from the invoice gross.
- Import status record for a failed/partial CJI3 upload; a rematch of all unmatched lines after every upload.
- Tests for reversal, tolerance at scale, re-matching a matched line, blank-row truncation, date-order flip, concurrent List send, transaction retry.
- Per-JDA access control (any user can act on any JDA's invoices and payments).

## Out-of-lane flags
- `demoMode: true` in `web/control-tower/invoices/js/config/app-config.json` on main: the live Invoice Tracker writes to browser memory only, so every flow above is non-persistent in production until switched.
- `firebase/firestore.rules` not yet published (CONTEXT: `jdaReports` observed publicly readable).
- Finance write routes (`/cji3/match`, `/entries/stage`, `/list/send`) have no per-JDA authorisation and no role defaults (empty role lists = anyone).
- Rate limiting is in-memory per Vercel instance (sign-up/reset).
