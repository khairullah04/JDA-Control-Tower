# JDAL review: JDA lead view (approvals, spend visibility, limits)

Scope: whole repository at `main`, commit `89e49bf`. Read-only review.

### [JDAL-01] No lead approval is ever recorded: a CJI3 line makes any open invoice Paid, Lead skipped
- Category: FUNDAMENTALLY WRONG
- Severity: Critical
- Confidence: High
- Location: web/control-tower/invoices/js/finance/workflow.js:4-7, 33, 36; web/control-tower/invoices/js/finance/service.js:300
- Evidence:
  ```js
  ...OPEN().map(from => ({ from, to: 'paid', action: 'Paid (CJI3)', by: 'cji3' })),
  function OPEN() { return ['received', 'with_pm', 'pending_lead', 'sent_to_pd', 'to_be_paid']; }
  ```
  `if (state === 'paid') await moveStage([invoiceId], 'paid', { byCji3: true, ... })`
- What's wrong: The system treats "a payment appeared in SAP" as "the Lead approved". An invoice still at `received` (never validated, never emailed to me) goes straight to Paid when a CJI3 line matches. Nothing stores my decision (who approved, when, against which email). I cannot show my accountability for any payment, and I cannot tell a payment I approved from one that bypassed me.
- What it should be: A recorded Lead decision (approve/reject, by whom, when, referencing the `listEmails` request) before Paid. A CJI3 match on an invoice that never reached `pending_lead`/approved should be flagged "Paid without Lead approval", not silently Paid. Minimal fix: `OPEN()` for the CJI3 move limited to `['to_be_paid','sent_to_pd']`, others go to a `paid_unapproved` match state shown to the Lead.
- Impact: No approval trail for audit; payments that skipped the Lead are invisible as exceptions.

### [JDAL-02] Anyone signed in can mark any invoice Paid by hand, at any amount
- Category: WRONG
- Severity: Critical
- Confidence: High
- Location: server/routes/finance.js:74; web/control-tower/invoices/js/finance/service.js:325-327; web/control-tower/invoices/js/ui/cji3-lines.js:72
- Evidence:
  ```js
  router.post('/cji3/match', run(req => finance.matchLine(String(req.body?.lineId || ''), String(req.body?.invoiceId || ''), actor(req))));
  // a person's match is their confirmation, amount included: every line linked to the invoice pays it
  if (stage !== 'paid') await moveStage([inv.id], 'paid', { byCji3: true, ... }, actor);
  ```
- What's wrong: `/cji3/match` and `/cji3/import` pass no `may(req)`, so `ROLE_ACCOUNTANT2` is never enforced and `moveStage` gets the default `may = () => ''`. Manual match ignores the amount ("Confirm invoice Paid" on `amount_differs`). Since Paid = approval (JDAL-01), the PM who emailed the request can also make it "approved and paid".
- What it should be: Pass `may: may(req)` into `matchLine`/`importCji3`/`matchCji3` → `moveStage`; enforce the Accountant 2 role and separation from the person who sent it to the Lead; require a note when confirming a mismatched amount.
- Impact: Spend and "approved" figures can be changed by any user; no separation of duties on the money path.

### [JDAL-03] Paid invoices that came from the Microsoft List do not count as spend
- Category: WRONG
- Severity: Critical
- Confidence: High
- Location: web/control-tower/invoices/js/finance/service.js:362-365; web/control-tower/invoices/js/finance/core.js:229; web/control-tower/invoices/js/ui/timeline.js:47
- Evidence:
  ```js
  build('entry', { jdaId, jdaName, invoiceNo: item.invoiceNo, partner: item.partner, ..., taxRate: '0', ..., draft: true, source: 'list' }, null, s);
  entries.filter(e => live(e) && isMonth(e.month)).forEach(e => rowOf(e).invoices.push(e));
  const inv = entries.filter(e => live(e) && e.status === COUNTS_AS_ACTUAL && isMonth(e.month))
  ```
- What's wrong: The List draft has no project, no document date and so no `month`. When CJI3 later makes it Paid, `paymentTable` and the timeline drop it (`isMonth` false), so it is missing from the Payment Table, the cost ring (`costsByName`), "Paid of sanctioned" and the monthly chart, until someone edits it by hand. The CJI3 line's posting date/WBS is not copied onto the invoice. The List is the main intake path now.
- What it should be: On Paid by CJI3, fill `month` (from posting date) and project (from WBS/CO object) when missing; show "Paid but not on the Payment Table (no project/month)" as a count with a total on the JDA page and the cost ring.
- Impact: Spend is understated: the cost ring can say "within" when it is over.

### [JDAL-04] List drafts are stored with 0% tax (and no rate), so CJI3 amounts do not agree
- Category: WRONG
- Severity: Major
- Confidence: Medium
- Location: web/control-tower/invoices/js/finance/service.js:364; web/control-tower/invoices/js/finance/cji3.js:121-128
- Evidence: `taxRate: '0'` on the draft; `lineMyr = l => l.valueCoAreaMinor ?? ...` ("MYR, tax included"); `paidAgainst(inv.grossMyrMinor, total)`.
- What's wrong: The invoice's "taxed MYR" is the List amount untaxed, while the CJI3 line is tax-included, so an RM100,000 + 8% invoice compares 100,000 vs 108,000 → `amount_differs`, not Paid. A non-MYR List item has no rate → `grossMyrMinor` 0 → every line is "more". Confirm with a real List export: is the List amount before or after tax?
- What it should be: Apply the register's tax rate (or a List tax column) and a forex rate on draft creation; show such drafts as "amount not final" to the Lead.
- Impact: Paid invoices pile up as "check amount", or get confirmed by hand at any amount (JDAL-02).

### [JDAL-05] Live Invoice Tracker runs on browser-only sample data
- Category: RISK
- Severity: Critical
- Confidence: High
- Location: web/control-tower/invoices/js/config/app-config.json:2
- Evidence: `"demoMode": true,`
- What's wrong: In production every figure I see (paid, sanctioned, pending) is sample data in my browser, and anything I or the PM do is not saved to Firebase.
- What it should be: `"demoMode": false` on `main`, with demo only on a preview branch, and a visible "DEMO DATA" banner when true.
- Impact: Decisions made on fake numbers; real requests silently lost.

### [JDAL-06] No per-JDA scope: I see and act on every JDA, and "Lead" is one global list
- Category: MISSING
- Severity: Major
- Confidence: High
- Location: server/routes/finance.js:12-13, 55-61; web/control-tower/invoices/js/ui/approvals.js:180-187
- Evidence:
  ```js
  export const rolesFromEnv = (env = process.env) => Object.fromEntries(Object.keys(ROLES).map(k => [k, String(env[`ROLE_${k.toUpperCase()}`] || '')...
  ```
  `<select id="ap-jda">${options(jdas.map(j => [j.id, j.name]), ...)}`
- What's wrong: Roles are not per JDA. Any signed-in user (or any `ROLE_LEAD` person) can open any JDA's Approvals, Payment Table and history, edit its sanctioned amounts and match its payments. Nothing ties "Lead of JDA 2" to JDA 2.
- What it should be: Role lists keyed by JDA (e.g. `ROLE_LEAD_JDA1`), checked server-side in `may()` and in `/data` filtering, and the JDA selector limited to the user's JDAs (with read-only for others if wanted).
- Impact: I can accidentally act on another JDA's items, and another lead can act on mine.

### [JDAL-07] With no JDA column in the List, every JDA's invoices show under every JDA and can be sent to the wrong Lead
- Category: WRONG
- Severity: Major
- Confidence: High
- Location: web/control-tower/invoices/js/finance/list-source.js:129; web/control-tower/invoices/js/finance/service.js:354
- Evidence:
  ```js
  export const inJda = (item, jdaName, mapping = {}) => !mapping.jda || norm(item.jda) === norm(jdaName);
  const { items } = await listState(), want = new Set(keys), chosen = items.filter(i => want.has(i.key));
  ```
- What's wrong: An unmapped JDA column shows everything everywhere, and `sendListToLead` never checks that a chosen item belongs to `jdaId`. A JDA 3 invoice can be booked into JDA 1's register and emailed to JDA 1's Lead.
- What it should be: Refuse to send when the JDA column is not mapped (or ask for the JDA per item), and on the server filter `chosen` by `inJda(i, jdaName, mapping)`, refusing the rest.
- Impact: Spend lands on the wrong JDA; I get asked to approve another JDA's invoice.

### [JDAL-08] The approval request does not tell me what I am approving against
- Category: MISSING
- Severity: Major
- Confidence: High
- Location: web/control-tower/invoices/js/finance/email.js:188-202
- Evidence: `const head = ['No.', 'Invoice No.', 'Partner', 'Description', 'Amount', 'Supporting Documents']`
- What's wrong: The email has no project, invoice date, payment month, the PM's validation statement (what was checked, by whom), the List gaps the PM overrode with "Proceed anyway" (list-invoices.js:106-112; only "—"/"None" appear), or the budget position: sanctioned, paid to date and remaining for that project/month, and what this request would push it to. It also has no reference/ID tying my reply back to the `listEmails` record.
- What it should be: Per row: project, invoice date, month; a block "Validated by <PM> on <date>; missing: …"; per project/month: sanctioned (w TAX), paid, pending, "after this request: X% of sanctioned" with an over-sanctioned warning; a request ID in the subject.
- Impact: I approve blind on budget, and cannot tell a PM-checked invoice from an unchecked one.

### [JDAL-09] Invoices become "Pending Lead approval" before anything is sent
- Category: WRONG
- Severity: Major
- Confidence: High
- Location: web/control-tower/invoices/js/ui/list-invoices.js:141-153
- Evidence:
  ```js
  document.body.append(a); a.click(); a.remove(); ...
  await finish('The draft is downloaded: open it to edit and send it in Outlook.');
  location.href = mailtoLink({ to: who.to, cc: who.cc, subject }); // subject and recipients only: paste the body
  await finish('The email is copied: ...');
  ```
- What's wrong: Downloading a .eml, copying the HTML or creating a draft moves the invoices to Pending Lead and logs an email that may never be sent. `To` is blank by config (config/email-recipients.js:4-8), so the request may go nowhere. The "waiting for the Lead" clock starts on an email I never received.
- What it should be: Keep them "With PM, request drafted" until the PM confirms "Sent" (or Graph `sendMail` succeeds); fill recipients per JDA; refuse to generate with an empty To.
- Impact: Phantom pending items attributed to me; holding time is wrong.

### [JDAL-10] No warning before a sanctioned amount is breached
- Category: MISSING
- Severity: Major
- Confidence: High
- Location: web/control-tower/invoices/js/ui/finance-ui.js:57-59; web/control-tower/components/control-tower.js:128
- Evidence:
  ```js
  <div class="kpi ${t.actualMinor > t.sanctionedMinor ? 'bad' : 'good'}"><small>Paid (MYR)</small>
  `cost${unsanctioned || (pctCost !== null && pctCost > 100) ? ' over' : ''}`
  ```
- What's wrong: The only signal is red after paid already exceeds sanctioned, and only on lifetime totals. No threshold (e.g. 80/90/100%), no per-month or per-project warning, no email/notification, no check when a request is generated or a CJI3 line would push a row over. No alert/threshold code exists in the repo.
- What it should be: Configurable thresholds per JDA; warn on the Control Tower card, Approvals and the request email when paid + pending for a project/month passes them; optional email to the Lead.
- Impact: I learn about an overrun after the money has left.

### [JDAL-11] Spend views compare paid only; committed exposure is hidden, and "within" almost never shows
- Category: MISSING
- Severity: Major
- Confidence: High
- Location: web/control-tower/invoices/js/finance/core.js:231-236; web/control-tower/invoices/js/ui/payments.js:66
- Evidence:
  ```js
  flag: varianceMinor > 0 ? 'over' : varianceMinor < 0 ? 'under' : 'within'
  ${summaryCells(all, { invoiced: false })}
  ```
- What's wrong: The Payment Table hides the invoiced figure and only counts Paid, so invoices pending my approval or approved-but-unpaid are not shown against the sanctioned amount. "Within sanctioned" requires an exact-to-the-sen match; any normal month in progress reads "Under sanctioned" and any 1 sen over reads "Over".
- What it should be: Columns "Pending" and "Approved, unpaid" and a "Paid + committed vs sanctioned" figure; flag with a tolerance (e.g. within ±1% = within), and "over" counting committed spend as a forecast flag.
- Impact: The monthly view understates exposure and the flags are noise.

### [JDAL-12] I cannot see who is holding an invoice, or for how long
- Category: MISSING
- Severity: Major
- Confidence: High
- Location: web/control-tower/invoices/js/ui/cji3.js:20, 46, 70
- Evidence:
  ```js
  const when = e => e.stageAt || e.updatedAt || e.createdAt || '';
  <select id="h-status" ...>${options(STATUSES.map(s => [s, STATUS_LABEL[s]]), ...
  <td title="${esc(STAGE_LABEL[stageOf(e)])}">${statusBadge(e.status)}</td>
  ```
- What's wrong: The stage (Received / With PM / Pending Lead) is only a tooltip; the filter is by status, which lumps all three as "Pending". There is no "days in stage", no holder column (`stageBy` is stored but never shown outside History), and no ageing list on Approvals or the Control Tower ("N pending" only).
- What it should be: Columns Stage, Holder (role/person), Days in stage; a stage filter; an ageing summary (0-7 / 8-14 / >14 days) per JDA on the card and Approvals.
- Impact: Bottlenecks (including on my own desk) are invisible.

### [JDAL-13] A rejection by email is never recorded; rejected invoices stay "Pending Lead" forever
- Category: MISSING
- Severity: Major
- Confidence: High
- Location: web/control-tower/invoices/js/finance/workflow.js:30-31; web/control-tower/invoices/js/services/live/finance.js:15
- Evidence: `{ from: 'pending_lead', to: 'rejected', action: 'Reject', note: true }` exists, but `moveStage` has no caller under `js/ui/` (grep: only `services/*/finance.js` export it).
- What's wrong: There is no reject or "return to PM" control. When I reject by email, the invoice stays Pending Lead, is counted as waiting, and can still become Paid if a CJI3 line appears.
- What it should be: Reject / Return to PM actions (with a reason) on the Approvals view, for the Lead (or the PM recording my reply), with the email reference.
- Impact: Rejected invoices pollute counts and can be paid without anyone noticing.

### [JDAL-14] Any user can change or delete the sanctioned amounts (my limits)
- Category: RISK
- Severity: Major
- Confidence: High
- Location: server/routes/finance.js:93, 95-96; web/control-tower/invoices/js/ui/payments.js:61-62, 155
- Evidence:
  ```js
  router.post('/sanctioned/batch', run(req => finance.saveAll('sanctioned', ...)));
  router.post('/:kind/delete', run(req => finance.remove(kindOf(req), ids(req), actor(req))));
  ```
- What's wrong: No role check on sanctioned writes. Raising the sanctioned amount makes an overrun disappear from the ring and Payment Table. It is audited, but nobody is told.
- What it should be: Sanctioned create/edit/delete restricted to a finance/lead role per JDA, with a notification to the Lead on change.
- Impact: The limit I am accountable for can be moved under me.

### [JDAL-15] Separation-of-duties check compares display names and guards a move nobody makes
- Category: RISK
- Severity: Minor
- Confidence: High
- Location: server/routes/finance.js:21, 58-59
- Evidence:
  ```js
  const actor = req => req.user?.name || 'unknown';
  if (move?.from === 'pending_lead' && move.to === 'to_be_paid' && ... record.stageBy === actor(req))
  ```
- What's wrong: Two people with the same name are treated as one; and the only guarded move (Approve: To Be Paid) has no UI caller, while the real approval path (CJI3 match, JDAL-02) is unguarded.
- What it should be: Store and compare `stageByEmail`; apply the check to the CJI3 Paid move against whoever sent it to the Lead.
- Impact: The control looks present but does not protect anything today.

### [JDAL-16] Paid figure on the Control Tower can be typed by hand without who/when
- Category: RISK
- Severity: Minor
- Confidence: High
- Location: web/control-tower/lib/jda-figures.js:59; web/control-tower/components/control-tower.js:127
- Evidence: `cost: written.costOverride ? { ...written.costOverride, sanctioned: ..., override: true } : dataCost,` and `<h4>Cost ${f.cost?.override ? tag('Set by hand') : ''}</h4>`
- What's wrong: The cost ring shows a typed "paid" figure instead of the tracker's; the tag does not say who set it, when, or what the real figure is.
- What it should be: Show "Set by hand by X on date; tracker says RM Y", or drop the paid override.
- Impact: The headline spend number can disagree with the Payment Table unnoticed.

### [JDAL-17] Auto-match accepts 0.5% difference as Paid and books the invoice amount, not the paid amount
- Category: RISK
- Severity: Major
- Confidence: High
- Location: web/control-tower/invoices/js/finance/cji3.js:124-128; web/control-tower/invoices/js/finance/core.js:231
- Evidence:
  ```js
  export const TOLERANCE = minor => Math.max(100, Math.round(Math.abs(minor) * 0.005));
  actualMinor = sum(r.invoices.filter(i => i.status === COUNTS_AS_ACTUAL), 'grossMyrMinor')
  ```
- What's wrong: On an RM2,000,000 invoice, RM10,000 short or over is "equal" → Paid with no flag, and the Payment Table reports the invoice amount, not what SAP paid.
- What it should be: Cap the tolerance in ringgit (e.g. max RM50), record the CJI3 total on the invoice (`paidMyrMinor`) and use it for actual spend; show any difference.
- Impact: Paid spend misstated by up to 0.5% per invoice, silently.

### [JDAL-18] JDA 1 + JDA 2 share one CJI3 file: a JDA 1 payment can pay a JDA 2 invoice
- Category: RISK
- Severity: Minor
- Confidence: Medium
- Location: web/control-tower/invoices/js/finance/cji3.js:114-117
- Evidence: `inGroup(l.group, e.jdaName) && refKey(e.invoiceNo) === ref` then narrowed by `coObject` only when several match.
- What's wrong: With one candidate, there is no check that the line's WBS/CO object belongs to that invoice's JDA. A partner reusing an invoice number across JDA 1 and JDA 2 (one only in the register) gets paid on the wrong JDA. Confirm with a real CJI3 file whether WBS identifies the JDA.
- What it should be: Check the line's WBS/CO object against the invoice's JDA/project before auto-Paid; otherwise "check".
- Impact: Spend on the wrong JDA's ring.

### [JDAL-19] No ready-made lead report; exports are per page and manual
- Category: MISSING
- Severity: Minor
- Confidence: High
- Location: web/control-tower/invoices/js/ui/payments.js:98-99; web/control-tower/invoices/js/ui/cji3.js:39
- Evidence: `root.querySelectorAll('[data-export]').forEach(b => b.onclick = () => (... exportSheet(`Payment table ${jda.name}...`
- What's wrong: I can export a Payment Table or the invoice history, but there is no monthly "sanctioned vs paid vs pending by project" report for my JDA, no pending-approval ageing export, and nothing scheduled/emailed. The Control Tower card has no export.
- What it should be: One "Lead monthly report" (xlsx/PDF) per JDA: month × project sanctioned/paid/pending/variance, pending list with holder and days, over-threshold rows; optional monthly email.
- Impact: Monthly reporting stays manual spreadsheet work.

## Top 3 blockers
- JDAL-01: payments are booked as approved with no Lead decision recorded, including invoices that never reached me.
- JDAL-03: Paid invoices from the List (the main intake) are left out of spend, so the cost ring understates.
- JDAL-02: any signed-in user can mark any invoice Paid (= approved) by hand at any amount.
(JDAL-05 demoMode is equally release-blocking: production shows sample data.)

## Missing entirely
- A recorded Lead approve/reject/return action (in-app or captured from the email reply).
- Per-JDA access control and per-JDA roles.
- Budget alerts / thresholds and notifications before breach.
- Committed spend (pending + approved, unpaid) against sanctioned.
- Holder and days-in-stage, ageing views, stage filter.
- Approval email with budget position, PM validation statement and a request ID.
- A Lead monthly report / scheduled export.
- Role restriction on changing sanctioned amounts.

## Out-of-lane flags
- firebase/firestore.rules not published; live `jdaReports` observed publicly readable (CONTEXT.md §5).
- web/control-tower/invoices/js/ui/timeline.js:76-77: `cur[keyOf(...)]` may be undefined for a sanctioned/paid month outside the axis range → TypeError (Low confidence; check range logic).
- Rate limit for sign-up/reset is in-memory per instance on Vercel (server/rate-limit.js), so it barely limits.
