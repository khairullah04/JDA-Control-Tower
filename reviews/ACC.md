# ACC: Accountant review (financial correctness)

Scope: whole repo at `main` 89e49bf. Method: read `web/control-tower/invoices/js/finance/*`, `server/routes/finance.js`, `server/forex.js`, `web/control-tower/lib/jda-figures.js`, `js/services/analytics.js`, `server/site-content.js`. I ran read-only scenario scripts from `/tmp/claude-1000/acc/t.mjs` over `createFinance(memoryStore())`; the results are quoted below. `cd server && npm test`: 0 failures. None of the scenarios below has a test.

Money storage: amounts are kept as integers in minor units, and the maths goes through BigInt (`money.js`). This is fine for the register. The exceptions are covered in ACC-13 and ACC-19.

---

### [ACC-01] A CJI3 reversal leaves the invoice Paid and counted as actual
- Category: WRONG
- Severity: Critical
- Confidence: High
- Location: web/control-tower/invoices/js/finance/service.js:L293-L303
- Evidence:
  ```js
  const state = sum === 'equal' ? (paidAlready ? 'linked' : 'paid') : sum === 'less' ? 'part_paid' : 'amount_differs';
  ...
  if (state === 'part_paid') earlier.forEach(x => write(x, 'part_paid', inv, ...));
  if (state === 'paid') await moveStage([invoiceId], 'paid', ...);
  else if (paidAlready) await store.atomic(... paidBy: [...] ...);
  ```
  Scenario: INV-1 RM10,800 is paid by a CJI3 line of +10,800. A later upload brings the reversal line −10,800 (same Reference). Output: `reversal match { part_paid: 2 }`, `after reversal status paid paid`, `actualMinor: 1080000`.
- What's wrong: once the reversal is in, the linked lines net to zero. Both lines are relabelled `part_paid`, but nothing moves the invoice out of Paid. The Payment Table and the cost ring go on counting the full gross as paid. Credit notes are not handled at all either: `build` refuses amounts ≤ 0 (core.js:L82), so a credit note cannot be entered as a negative invoice.
- What it should be: when the linked lines net below the invoice minus tolerance, and the invoice is Paid by CJI3, move it back with `unpaidStage(inv)` (or to a `part_paid` status) and write an audit line:
  ```js
  if (sum === 'less' && paidAlready) await moveStage([invoiceId], unpaidStage(inv), { byCji3: true, paidBy: allIds, note: 'CJI3 lines net below the invoice (reversal)' }, actor);
  ```
  Add a credit-note record type (a negative amount linked to the original invoice).
- Impact: reversed payments are reported as spend, so actual vs sanctioned is overstated with no warning on the invoice.

### [ACC-02] An invoice from the Microsoft List that CJI3 marks Paid drops out of every total
- Category: WRONG
- Severity: Critical
- Confidence: High
- Location: web/control-tower/invoices/js/finance/service.js:L363-L365; workflow.js:L68; core.js:L148
- Evidence:
  ```js
  build('entry', { jdaId, jdaName, invoiceNo: item.invoiceNo, partner: item.partner, ..., taxRate: '0', ..., draft: true, source: 'list' }, null, s);
  // workflow.js: only Sent to PD / To Be Paid are blocked when incomplete
  if (['sent_to_pd', 'to_be_paid'].includes(to) && entry.missing?.length) return ...
  // core.js
  entries.filter(e => live(e) && isMonth(e.month)).forEach(e => rowOf(e).invoices.push(e));
  ```
  Scenario output: `draft paid month "" proj "" tax 0 missing ['Choose a project','Invoice date must be a valid date','Payment month is required, as YYYY-MM']`, then `INV-9 in table? false`.
- What's wrong: a List item becomes a draft with no project, no date and no month. The CJI3 match still moves it to Paid, because the move to Paid does not check `missing`. `paymentTable` then drops it because `month` is empty, so the money is paid in SAP and missing from the Payment Table, the JDA totals and the cost ring.
- What it should be: block the move to Paid for an incomplete invoice and leave the line `needs_completion`. Alternatively, fill in month, project and date from the CJI3 line (posting date, CO Object). Either way, the Payment Table should show an "Unallocated" row instead of dropping records:
  ```js
  if (to === 'paid' && entry.missing?.length) return `Complete this invoice (${entry.missing.join('; ')}) before CJI3 can mark it Paid.`;
  ```
- Impact: paid spend is understated. This is the main route for invoices into the register under the current design (List → email → CJI3).

### [ACC-03] The live Invoice Tracker, and likely the cost ring, show sample figures
- Category: RISK
- Severity: Critical
- Confidence: Medium (I did not confirm in a browser that the Control Tower's `tracker` uses the same switch)
- Location: web/control-tower/invoices/js/config/app-config.json:L2; web/control-tower/invoices/js/services/finance.js:L8; web/control-tower/components/control-tower.js:L64-L67; services/demo/finance.js:L8-L11, L25-L28
- Evidence:
  ```json
  "demoMode": true,
  ```
  ```js
  withBook(config.demoMode ? await import('./demo/finance.js') : await import('./live/finance.js'));
  const f = createFinance(memoryStore()); await seedFinance(f);
  const RATES = { USD: '4.7', SGD: '3.5', EUR: '5.1', JPY: '0.031', GBP: '6' };
  ```
- What's wrong: on `main` (production), every finance figure comes from seeded browser memory, and forex comes from fixed fake rates. A CJI3 upload or a sanctioned entry made in production is lost when the page reloads. `loadCosts()` reads `tracker.finance.data()`, so the Control Tower cost ring very likely shows the sample totals too.
- What it should be: `"demoMode": false` on main, and a visible "DEMO DATA" banner whenever it is true.
- Impact: management sees money figures that are not real, and work entered there disappears.

### [ACC-04] A manual CJI3 match marks any invoice Paid whatever the amount, and anyone may do it
- Category: WRONG
- Severity: Major
- Confidence: High
- Location: web/control-tower/invoices/js/finance/service.js:L325-L327; server/routes/finance.js:L67-L75
- Evidence:
  ```js
  // a person's match is their confirmation, amount included: every line linked to the invoice pays it
  if (stage !== 'paid') await moveStage([inv.id], 'paid', { byCji3: true, paidBy: linked, ... }, actor);
  ```
  ```js
  router.post('/cji3/match', run(req => finance.matchLine(String(req.body?.lineId || ''), String(req.body?.invoiceId || ''), actor(req))));
  ```
  Scenario: a RM1.00 line with Reference `XYZ` was matched by hand to INV-3 (RM540,000). Output: `inv3 after RM1 manual match paid`.
- What's wrong: there is no amount check and no check that the Reference agrees. The `may(req)` role and separation-of-duties guard is not passed to `matchLine`, `importCji3` or `rematch`, even though `roleFor` assigns CJI3 moves to `accountant2`. The same person can enter an invoice, upload CJI3 and mark it Paid.
- What it should be: run `paidAgainst` on the manual match, and require an explicit "accept difference of RM x" note when it is not `equal`. Pass `may(req)` to `moveStage` from every CJI3 route.
- Impact: an invoice can be marked fully paid on a token line. Actual spend is overstated, and the CJI3 approval control can be bypassed.

### [ACC-05] The tolerance has no ceiling, so a large invoice is fully Paid while thousands short
- Category: WRONG
- Severity: Major
- Confidence: High
- Location: web/control-tower/invoices/js/finance/cji3.js:L124-L129
- Evidence:
  ```js
  export const TOLERANCE = minor => Math.max(100, Math.round(Math.abs(minor) * 0.005));
  ```
  Scenario: invoice RM1,080,000 against a CJI3 line of RM1,074,700 (RM5,300 short). Output: `paid`.
- What's wrong: 0.5% with no cap is RM5,400 on RM1.08m. The invoice becomes Paid, and the actual takes the invoice gross (RM1,080,000), not the cash that was paid. The difference is never recorded or written off.
- What it should be: a capped tolerance, e.g. `Math.min(Math.max(100, ...), 5000)` (RM50), with the cap set in settings. Store `differenceMinor` on the invoice, and list differences for review.
- Impact: actual spend is overstated by unpaid balances, with no record of the shortfall.

### [ACC-06] "Actual" is the invoice amount, not the CJI3 paid amount, and nothing reconciles the two
- Category: FUNDAMENTALLY WRONG
- Severity: Major
- Confidence: High
- Location: web/control-tower/invoices/js/finance/core.js:L150; cji3.js:L121
- Evidence:
  ```js
  actualMinor = sum(r.invoices.filter(i => i.status === COUNTS_AS_ACTUAL), 'grossMyrMinor');
  ```
- What's wrong: CJI3 is the payment evidence, but the Payment Table never adds up CJI3 values. Lines that are unmatched (`none` or `ambiguous`) or `amount_differs` add nothing to actual. Shortfalls within tolerance and FX differences are hidden. There is no control total of the CJI3 lines per group/JDA/month against the Payment Table actual, so a total cannot be traced back to the CJI3 rows it came from. It goes back only to invoices, then through `paidBy` to the lines.
- What it should be: actual per row = Σ `lineMyr` of the CJI3 lines linked to that row's invoices. Add a reconciliation panel: CJI3 total for the group = matched + unmatched + differences, shown per period.
- Impact: the figure the owner signs off ("paid") is not the SAP figure, and the gap cannot be audited.

### [ACC-07] A part payment counts as zero actual
- Category: WRONG
- Severity: Major
- Confidence: High
- Location: web/control-tower/invoices/js/finance/service.js:L297-L299; core.js:L9, L150
- Evidence:
  ```js
  const state = ... sum === 'less' ? 'part_paid' : 'amount_differs';
  export const COUNTS_AS_ACTUAL = 'paid';
  ```
- What's wrong: when an invoice has received 90% of its amount through CJI3 lines, it stays pending or approved. The Payment Table counts it as RM0 actual (it appears only in `invoicedMinor`).
- What it should be: actual includes the CJI3 amounts paid against part-paid invoices (follows from ACC-06).
- Impact: actual spend is understated while part payments are outstanding.

### [ACC-08] Payments fall in the invoice-date month, not the month they were paid
- Category: WRONG
- Severity: Major
- Confidence: High
- Location: web/control-tower/invoices/js/finance/core.js:L72, L134, L148
- Evidence:
  ```js
  if (!r.month && isDate(r.documentDate)) r.month = r.documentDate.slice(0, 7); // the invoice's own month
  const rowKey = r => [r.projectId, partnerKey(r.partner), r.month].join('|');
  ```
  Scenario: invoice dated 2026-01-15, paid in CJI3 with posting date 2026-03-10. Output: `inv gross 1080000 month 2026-01`; the actual lands in January.
- What's wrong: the field is labelled "Payment month", but it defaults to the invoice date and is never updated from the CJI3 posting date or SAP fiscal period. Cut-off is wrong: a December invoice paid in January counts in the earlier year, and months can change after they are reported, when a late payment lands in a past month.
- What it should be: put actual in the month of the CJI3 posting date (or `fiscalYear`/`period`) of the paying lines. Keep the invoice month only for "invoiced". Add a period lock so a closed month cannot change.
- Impact: monthly over/under flags and year totals are wrong at every period end.

### [ACC-09] Tax is worked out at a flat setting, not taken from the invoice
- Category: FUNDAMENTALLY WRONG
- Severity: Major
- Confidence: High
- Location: web/control-tower/invoices/js/finance/core.js:L11, L33-L37, L83; service.js:L364
- Evidence:
  ```js
  export const DEFAULT_SETTINGS = { taxRateBps: 800, ... };
  // Tax is charged on the MYR amount.
  const taxMyrMinor = percentage(netMyrMinor, taxRateBps);
  r.taxRateBps = input.taxRate !== undefined ? toBps(input.taxRate) : prev?.taxRateBps ?? settings.taxRateBps;
  taxRate: '0',   // every List draft
  ```
- What's wrong:
  - The tax actually on the invoice is never recorded. It is calculated as 8% of the converted MYR amount and rounded per record. A vendor charges tax on its own currency amount, so this gives sen differences on foreign invoices, and wrong amounts for exempt or 6% lines, or for invoices dated before the March 2024 SST change.
  - New records take today's setting, whatever their invoice date.
  - Foreign vendors get 8% added by default.
  - Every List draft has tax 0. If the List amount is net, its gross is understated and the CJI3 match ends as `amount_differs`. If it is gross, then net and tax are mislabelled.
- What it should be: record the invoice's own tax amount (or tax code), in the invoice currency, with net and gross as stated. Use a rate table with effective dates, chosen by invoice date, for defaults only. Never default foreign vendors to SST.
- Impact: gross, tax and the over/under flag are wrong by the tax difference. Reported tax cannot be agreed to the invoices.

### [ACC-10] Each side uses a different forex date and source, and the CJI3 Forex column is ignored
- Category: WRONG
- Severity: Major
- Confidence: High
- Location: web/control-tower/invoices/js/ui/finance-ui.js:L182; server/forex.js:L8-L19; cji3.js:L18, L121
- Evidence:
  ```js
  const got = await finance.forex(get('currency'), entry ? get('documentDate') : '');   // sanctioned: today's rate
  ```
  ```js
  // forex.js: BNM 5pm middle rate, nearest earlier day, else latest
  if (!found?.rate?.middle_rate) found = await get(currency);
  ```
- What's wrong:
  - Invoices use the BNM middle rate on the document date. Sanctioned amounts use the BNM rate on the day they are typed in. CJI3 carries SAP's own rate (`Forex`, `Val/COArea`), which is stored but never used.
  - The fallback quietly takes the latest rate if the 7-day look-back finds none, so a 2025 invoice can get a 2026 rate. The response says which date, but nothing warns.
  - Differences between these rates show up as over/under variance or `amount_differs`. No realised FX difference is recorded.
- What it should be: for paid invoices, take the MYR from CJI3 (SAP's posted rate) and store the invoice-rate MYR beside it as `fxDiffMinor`. Give sanctioned foreign amounts a stated budget rate and date. Refuse the "latest" fallback for dated requests.
- Impact: variance flags carry FX noise, and figures depend on the day a sanctioned amount was keyed in.

### [ACC-11] Paid invoices can be edited and recalculated, which shifts historical figures
- Category: MISSING
- Severity: Major
- Confidence: High
- Location: web/control-tower/invoices/js/finance/service.js:L41-L58, L150-L165; server/routes/finance.js:L49, L95, L98
- Evidence:
  ```js
  const noHandStatus = input => { const { status, stage, route, archivedAt, paidBy, ...rest } = input || {}; return rest; };
  if (currentTax) next.taxRateBps = taxRateBps;
  ```
  Scenario: `save({ id: inv3.id, amount: '1' })` on a Paid invoice gives `edited paid invoice gross 108 paid`. Then `recalculate([paidId], { currentTax: true })` after the rate changed to 6% gives `recalc changed 1`.
- What's wrong: there is no lock on Paid or Approved records. Amount, currency, rate, project, month and tax rate can all be changed, and the Payment Table history moves with them. An audit line is written, so the change is not silent, but it is unrestricted. Delete (soft) also works on Paid invoices (L96-L106).
- What it should be: refuse any edit, recalculation or delete of an invoice that is Paid or linked to CJI3 lines, except through an unmatch or an adjusting entry. Require a reason note for edits to sanctioned records in closed periods.
- Impact: past reported totals cannot be relied on.

### [ACC-12] The sanctioned-limit check only colours a row: no block, no alert, and committed spend is left out
- Category: MISSING
- Severity: Major
- Confidence: High
- Location: web/control-tower/invoices/js/finance/core.js:L150-L162
- Evidence:
  ```js
  const varianceMinor = actualMinor - withTaxMinor;
  flag: varianceMinor > 0 ? 'over' : varianceMinor < 0 ? 'under' : 'within'
  ```
- What's wrong:
  - The check is per project + partner + month row, on paid invoices only.
  - Pending and approved (committed) invoices are not tested against what is left of the sanctioned amount. `invoicedMinor` is shown but never compared.
  - There is no cumulative check per JDA per period or per year: an over in one month is netted by an under in another in `tableTotals`.
  - A breach does nothing. It does not stop an invoice moving to Pending Lead, it does not appear in the List email, and nobody is notified.
- What it should be: check available = sanctioned − paid − committed (pending + approved) per JDA/project for the period, and per year cumulative. Warn on `sendListToLead`, and require a note to send an invoice that would breach.
- Impact: overspend is seen only after payment.

### [ACC-13] The cost ring's "Paid" can be typed over by hand, as a float, with no field-level audit
- Category: RISK
- Severity: Major
- Confidence: High
- Location: web/control-tower/lib/jda-figures.js:L57-L59; server/site-content.js:L217, L228, L278-L280, L290-L299; web/control-tower/components/control-tower-edit.js:L99-L106
- Evidence:
  ```js
  // Paid can be set by hand; sanctioned always follows the Invoice Tracker's sanctioned amounts
  cost: written.costOverride ? { ...written.costOverride, sanctioned: dataCost ? dataCost.sanctioned : ..., override: true } : dataCost,
  const myr = v => Number.isFinite(v) && v >= 0 ? v : null;
  ```
- What's wrong: whoever can edit the Control Tower can replace the paid figure. It is stored as a float ringgit amount, not minor units. The only record is the page's `updatedBy` and one `previous` copy; there is no financeAudit line and no history beyond one version.
- What it should be: remove the paid override, or make it an audited adjustment in the finance register (minor units, reason, who/when), shown beside the tracker figure and never instead of it.
- Impact: the headline cost % can show a number that matches no transaction.

### [ACC-14] The audit trail has gaps: automatic matches and paidBy changes are not logged
- Category: MISSING
- Severity: Major
- Confidence: High
- Location: web/control-tower/invoices/js/finance/service.js:L284, L301, L305, L317, L328, L369-L371, L251-L254
- Evidence:
  ```js
  for (const part of slices([...lineWrites.values()], 200)) await store.atomic(async () => ({ writes: part }));   // no audit lines
  else if (paidAlready) await store.atomic(... paidBy: [...] ...);   // no audit line
  rec = stamp({ ...rec, proofs: item.proofs, ... }); await store.atomic(async () => ({ writes: [{ coll: COLL.entry, ... }] }));   // no audit line
  ```
  Scenario: the audit actions after the scenarios were `entry:stage, entry:import, entry:recalculate, settings:edit, entry:edit, cji3:edit, entry:create`. There is no `cji3:match` and no `cji3:add`.
- What's wrong:
  - When a line is matched automatically (invoiceId, matchState, amountCheck) or relabelled (`part_paid`), the line record is rewritten with no audit line.
  - Changes to an invoice's `paidBy` (L301, L317, L328) and to its List proof links (L371) are written without audit lines.
  - New CJI3 lines are logged only as counts in `cji3Imports`.
  - `matchCji3` runs outside a single atomic step, so an invoice can be Paid while its line writes fail.
- What it should be: every write to `financeEntries` and `cji3Lines` goes with an audit line in the same atomic step, including an `auto-match` line naming the invoice and the amounts.
- Impact: from the audit log alone, nobody can tell why an invoice is Paid or which lines pay it.

### [ACC-15] One invoice can be counted twice: a List draft plus a later spreadsheet entry
- Category: RISK
- Severity: Major
- Confidence: Medium
- Location: web/control-tower/invoices/js/finance/core.js:L31; service.js:L217, L361
- Evidence:
  ```js
  export const invoiceKey = e => [e.jdaId, str(e.invoiceNo).toUpperCase(), e.projectId].join('|');
  else if (kind === 'entry' && record.invoiceNo && record.projectId && invoices.has(invoiceKey(record))) errors.push(duplicate(record));
  ```
- What's wrong: List drafts have `projectId: ''`. A later spreadsheet import or manual entry of the same invoice number, with its project filled in, produces a different key and is accepted. The register then holds two invoices. Both count in `invoicedMinor` and in the forecast. CJI3 sees two candidates, which come out `ambiguous` or are narrowed to one by CO Object, and the draft stays pending for ever. The partner is also left out of the key on purpose (L27-L30).
- What it should be: in the duplicate check, treat a draft with no project as a match for any project of the same JDA and invoice number, and offer to complete the draft instead of creating a second record.
- Impact: invoiced and forecast totals are overstated, and matching becomes ambiguous.

### [ACC-16] CJI3 de-duplication by position in the file can drop a real payment
- Category: RISK
- Severity: Minor
- Confidence: Medium
- Location: web/control-tower/invoices/js/finance/cji3.js:L20-L23, L88-L90
- Evidence:
  ```js
  // two lines identical in all of them are told apart by their order in the file (the 1st, the 2nd…).
  lines.push({ ...l, ..., occurrence: n, lineKey: `${key}#${n}` });
  ```
- What's wrong: suppose upload A contains one line and upload B (a later, non-overlapping export) contains a real second line identical in all key fields. Both get `#1`, so B's line is skipped as "already in". With no SAP document or line number, nothing tells them apart. Also, `valueTranMinor` is part of the key, so a corrected amount becomes a new line rather than an update, and both lines pay the same invoice.
- What it should be: ask for the SAP document number (CJI3 field `RefDocNo` or `Document Number`) in the export and key on it. Until then, warn when an upload contains a key that is already stored and the files' date ranges do not overlap.
- Impact: payments can be missed or double-counted.

### [ACC-17] An updated CJI3 line's amount is not checked again against its invoice
- Category: WRONG
- Severity: Minor
- Confidence: High
- Location: web/control-tower/invoices/js/finance/service.js:L256-L259, L268; cji3.js:L27
- Evidence:
  ```js
  log.match = await matchCji3(changed.filter(l => !l.invoiceId).map(l => l.id), actor);
  ```
- What's wrong: `valueCoAreaMinor` (the MYR used for matching) can change, and is logged as updatable. But lines already matched are left out of re-matching, so an invoice stays Paid against a changed amount.
- What it should be: re-run `paidAgainst` for every invoice whose linked lines changed MYR value.
- Impact: Paid status can be stale after a re-upload.

### [ACC-18] There is no year-end projection, and the forecast's assumptions are not shown in full
- Category: MISSING
- Severity: Minor
- Confidence: High
- Location: web/control-tower/invoices/js/services/analytics.js:L14, L25-L27
- Evidence:
  ```js
  export const FORECAST_NOTE = 'Invoiced so far (rejected invoices left out) plus the sanctioned amounts, with tax, of the months still to come.';
  const forecast = total(counted.filter(e => !(e.month > month))) + toCome.reduce((t, m) => t + Math.max(of(plan, m), of(counted, m)), 0);
  ```
- What's wrong:
  - Sanctioned but uninvoiced amounts of past months, and of the current month, are assumed to lapse (zero). The note does not say so.
  - Because the forecast uses invoices rather than payments, it inherits ACC-08 and ACC-15.
  - The year-end projection required by feature 6 is absent: there is no fiscal-year boundary or run-rate. The owner deferred it.
- What it should be: show both assumptions in the note, and add a year-end view per JDA with its basis spelled out.
- Impact: the forecast can understate the outturn without saying why.

### [ACC-19] Ringgit is converted to floats for the cost ring and rounded more than once
- Category: RISK
- Severity: Nit
- Confidence: High
- Location: web/control-tower/lib/jda-figures.js:L40, L50
- Evidence:
  ```js
  const dataCost = tracked ? { spent: tracked.spentMinor / 100, sanctioned: tracked.sanctionedMinor / 100 } : null;
  pct: cost.sanctioned > 0 ? Math.round(cost.spent / cost.sanctioned * 100) : ...
  ```
- What's wrong: the figures leave minor units for floats, and `Math.round` there is not the half-away-from-zero rule used in money.js.
- What it should be: keep minor units and compute the percentage with `roundDiv(spentMinor * 100, sanctionedMinor)`.
- Impact: small display differences (±1%) between the cost ring and the tracker.

### [ACC-20] JDAs are matched by name for CJI3 groups and cost totals
- Category: RISK
- Severity: Minor
- Confidence: High
- Location: web/control-tower/invoices/js/finance/cji3.js:L31-L33, L114; web/control-tower/lib/jda-figures.js:L21-L31
- Evidence:
  ```js
  export const inGroup = (group, jdaName) => !!GROUPS[group]?.jdas.includes(jdaKey(jdaName));
  out[key] = was ? { ...was, spentMinor: was.spentMinor + t.actualMinor, ..., twice: true }
  ```
- What's wrong: if a JDA is renamed (e.g. "JDA 1 – Seismic"), its invoices stop matching CJI3 lines at all. Two tracker JDAs with the same name have their money added together.
- What it should be: match by a stable `jdaId`.
- Impact: CJI3 lines silently come out `none`, and JDA totals can be merged.

---

## Report ending

- **Top 3 blockers**
  - ACC-01: a CJI3 reversal leaves the invoice Paid, so spend that was reversed is still reported.
  - ACC-02: invoices from the Microsoft List that CJI3 pays are dropped from the Payment Table and the cost ring.
  - ACC-03: `demoMode: true` on main, so the production tracker shows sample money and fake FX rates, and loses entries on reload.

- **Missing entirely**
  - Credit notes and negative adjustments as records linked to an invoice.
  - A partial-payment balance on the invoice (paid so far, outstanding).
  - A reconciliation of CJI3 control totals against the Payment Table actual, per group, JDA and month.
  - Locking of a period or month close.
  - Locking of Paid or Approved records.
  - A tax rate table with effective dates, the invoice's own tax amount, and a tax code (exempt or foreign).
  - Use of SAP's own forex and MYR for paid amounts, and recording of the realised FX difference.
  - A committed-spend (pending + approved) check against the sanctioned amount, and any action on a breach.
  - Year-end (fiscal year) projection and fiscal-year filtering.
  - Audit lines for automatic CJI3 matches, `paidBy` changes and new CJI3 lines.
  - Tests for reversals, List drafts going to Paid, tolerance on large invoices, and edits to Paid invoices.

- **Out-of-lane flags**
  - There is no per-JDA access control: any signed-in user can edit any JDA's finance records (CONTEXT).
  - When the role lists (`ROLE_*`) are empty, anyone may do anything. Even when they are filled, CJI3 import and match never check roles (server/routes/finance.js:L67-L75).
  - Firestore rules are not yet published to the live project. jdaReports was observed publicly readable (CONTEXT).
  - `matchCji3` and `sendListToLead` read outside the atomic step and write in several steps, so two uploads running at the same time could race (service.js:L277-L306, L359-L381).
