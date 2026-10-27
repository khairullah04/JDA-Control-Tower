# Consolidated review: TriCipta AI / JDA Control Tower

Scope: the entire repository at `main`, commit `89e49bf`, reviewed 2026-10-27 by 9 persona reviewers
(reports `reviews/SEC.md`, `UI.md`, `SWE.md`, `LOG.md`, `ACC.md`, `TL.md`, `PL.md`, `JDAL.md`, `JDAM.md`;
context in `reviews/CONTEXT.md`). All 9 completed; none missing. 178 findings: 22 Critical, 82 Major,
61 Minor, 13 Nit. `npm test`: 193/193 pass (none of the Critical scenarios has a test).

## Verdict

**Do not ship.** The live Invoice Tracker runs on browser-only sample data (demoMode), and with that off,
the money is still wrong: List invoices paid by CJI3 drop out of every total, reversals and re-matches
leave invoices Paid, and anyone signed in (any @petronas.com employee) can mark any invoice Paid.

## Critical & Major

Sorted by severity, then persona. Duplicates are kept here and merged under "Merged duplicates".

| ID | Persona | Category | Severity | Location | Summary |
|---|---|---|---|---|---|
| SEC-01 | Cybersecurity | WRONG | Critical | `server/routes/finance.js:L101-L102` | Any signed-in user can mark any invoice Paid by sending a fake "migrated" import |
| SEC-02 | Cybersecurity | FUNDAMENTALLY WRONG | Critical | `server/routes/finance.js:L67-L75` | The CJI3 upload and manual match have no role check, so the whole approval chain can be skipped |
| SEC-03 | Cybersecurity | FUNDAMENTALLY WRONG | Critical | `server/auth.js:L46-L51, L99-L113` | Every verified @petronas.com employee can sign themselves up and gets full write access to finance, reports and the public site |
| SEC-06 | Cybersecurity | RISK | Critical | `firebase/firestore.rules:L22-L28, L37-L40` | Firestore rules let any user write jdas/projects/meta directly and forge audit lines (and the rules are not published) |
| UI-01 | Web designer | WRONG | Critical | `web/control-tower/invoices/js/config/app-config.json:2` | The live Invoice Tracker and Control Tower cost ring show sample data, with nothing on screen saying so |
| SWE-01 | Software engineer | WRONG | Critical | `web/control-tower/invoices/js/config/app-config.json:2` | The live Invoice Tracker runs in demo mode on main (data stays in the browser) |
| SWE-02 | Software engineer | WRONG | Critical | `web/control-tower/invoices/js/finance/service.js:310-331` | Matching a CJI3 line to a second invoice leaves the first one Paid too (one payment counted twice) |
| SWE-03 | Software engineer | WRONG | Critical | `server/routes/finance.js:172-175` | Any signed-in user can create Paid invoices without CJI3 by marking an import `source: 'migrated'` |
| LOG-01 | Logic/QA | FUNDAMENTALLY WRONG | Critical | `fin/service.js:L363-L366` | Invoices sent from the Microsoft List and paid by CJI3 never show on the Payment Table or the cost ring |
| LOG-02 | Logic/QA | WRONG | Critical | `fin/service.js:L293-L302` | A reversal (negative) CJI3 line leaves the invoice Paid and its full amount counted as spent |
| LOG-03 | Logic/QA | FUNDAMENTALLY WRONG | Critical | `fin/cji3.js:L124-L129` | Amount tolerance has no cap; "Paid" counts the invoice amount, not what CJI3 paid |
| ACC-01 | Accountant | WRONG | Critical | `web/control-tower/invoices/js/finance/service.js:L293-L303` | A CJI3 reversal leaves the invoice Paid and counted as actual |
| ACC-02 | Accountant | WRONG | Critical | `web/control-tower/invoices/js/finance/service.js:L363-L365` | An invoice from the Microsoft List that CJI3 marks Paid drops out of every total |
| ACC-03 | Accountant | RISK | Critical | `web/control-tower/invoices/js/config/app-config.json:L2` | The live Invoice Tracker, and likely the cost ring, show sample figures |
| TL-01 | Team lead | WRONG | Critical | `web/control-tower/invoices/js/config/app-config.json:L2` | Production `main` ships the Invoice Tracker in demo mode |
| PL-01 | Project lead | WRONG | Critical | `web/control-tower/invoices/js/config/app-config.json:L2` | Production Invoice Tracker and Control Tower cost rings run on browser-only sample data |
| PL-02 | Project lead | MISSING | Critical | `OVERHAUL_CHECKLIST.md:L200, L209-L212` | Report documents still publicly readable in the live Firestore projects |
| JDAL-01 | JDA lead | FUNDAMENTALLY WRONG | Critical | `web/control-tower/invoices/js/finance/workflow.js:4-7, 33, 36` | No lead approval is ever recorded: a CJI3 line makes any open invoice Paid, Lead skipped |
| JDAL-02 | JDA lead | WRONG | Critical | `server/routes/finance.js:74` | Anyone signed in can mark any invoice Paid by hand, at any amount |
| JDAL-03 | JDA lead | WRONG | Critical | `web/control-tower/invoices/js/finance/service.js:362-365` | Paid invoices that came from the Microsoft List do not count as spend |
| JDAL-05 | JDA lead | RISK | Critical | `web/control-tower/invoices/js/config/app-config.json:2` | Live Invoice Tracker runs on browser-only sample data |
| JDAM-01 | JDA member | WRONG | Critical | `web/control-tower/invoices/js/config/app-config.json:L2` | The live Invoice Tracker runs on sample data in the browser, and nothing on screen says so |
| SEC-04 | Cybersecurity | MISSING | Major | `server/routes/finance.js:L28 (`/data`), L31-L34 (`/audit`), L95-L102` | No per-JDA access control (IDOR across JDAs) |
| SEC-05 | Cybersecurity | WRONG | Major | `server/auth.js:L49-L51, L131-L133` | ALLOWED_EMAILS exceptions skip the "verified" check (account pre-claim), and usernames live on an outside domain |
| SEC-07 | Cybersecurity | RISK | Major | `firebase/jda3-rules.txt:L19-L28` | JDA 3's report is intentionally world-readable |
| SEC-08 | Cybersecurity | MISSING | Major | `server/app.js:L48` | No security headers (CSP, HSTS, frame-ancestors, Referrer-Policy) |
| SEC-09 | Cybersecurity | RISK | Major | `server/ms-graph.js:L41-L48, L76-L81` | Microsoft refresh tokens with Mail.ReadWrite and Sites.Read.All are stored in plaintext, through a borrowed first-party client |
| UI-02 | Web designer | WRONG | Major | `web/control-tower/invoices/js/ui/cji3-lines.js:72, 90, 145` | CJI3 payments page: the copy and the "Confirm invoice Paid" button follow the old workflow, not the current CJI3 = approval rule |
| UI-03 | Web designer | FUNDAMENTALLY WRONG | Major | `web/control-tower/index.html:37-38` | "All JDAs at a glance" shows one JDA at a time; nothing on the page compares them |
| UI-04 | Web designer | MISSING | Major | `web/control-tower/invoices/js/ui/finance-ui.js:146` | Overdue invoices are never shown anywhere |
| UI-05 | Web designer | WRONG | Major | `web/control-tower/invoices/js/ui/finance-ui.js:56-60` | The JDA page shows two different "cost %" figures, one against sanctioned and one against budget, without saying which is which |
| UI-06 | Web designer | WRONG | Major | `web/control-tower/invoices/js/ui/list-invoices.js:32, 71-72` | Each tick of an invoice checkbox redraws the whole List section, and keyboard focus is lost |
| UI-07 | Web designer | WRONG | Major | `web/control-tower/invoices/js/ui/list-invoices.js:36` | "Import the List (export)" cannot be reached with the keyboard |
| UI-10 | Web designer | WRONG | Major | `web/control-tower/invoices/js/ui/cji3.js:66, 70` | Invoice history shows a coarse status; the real stage is only in a tooltip, and "Incomplete" looks like "Rejected" |
| UI-13 | Web designer | WRONG | Major | `web/control-tower/invoices/js/ui/timeline.js:66, 98-101, 127-128, 154-155` | The "Sanctioned vs paid" timeline works by mouse only and has no text alternative |
| SWE-04 | Software engineer | WRONG | Major | `server/routes/finance.js:140-148, 85-86, 128-134` | CJI3 upload, hand-matching and un-matching skip the role check; empty roles let everyone in |
| SWE-05 | Software engineer | FUNDAMENTALLY WRONG | Major | `web/control-tower/invoices/js/finance/service.js:277-307 (matchCji3), 310-331 (matchLine), 353-386 (sendListTo` | Multi-step finance operations are not atomic, and they write stale whole documents |
| SWE-07 | Software engineer | MISSING | Major | `server/finance-store.js:29-63` | The Firestore store, the one production uses, has no tests |
| SWE-08 | Software engineer | FUNDAMENTALLY WRONG | Major | `server/site-content.js:358-363, 366-392` | Several features depend on a writable local disk or work that continues after the response, which Vercel does not provide |
| SWE-09 | Software engineer | FUNDAMENTALLY WRONG | Major | `web/shared/config/jdas.js:6-10` | Two separate JDA identity systems, joined by display name |
| SWE-10 | Software engineer | FUNDAMENTALLY WRONG | Major | `firebase/firestore.rules:22-28` | The browser writes JDAs, projects, budgets and the Drive sync state straight to Firestore, with no validation or audit |
| SWE-11 | Software engineer | WRONG | Major | `web/control-tower/invoices/js/ui/list-invoices.js:128-131,141-158` | Invoices move to Pending Lead approval when the email is generated, not when it is sent; one failure blocks every retry |
| SWE-13 | Software engineer | RISK | Major | `web/control-tower/invoices/js/finance/cji3.js:101-104,169-171` | The CJI3 duplicate key treats a real repeat payment in a later incremental file as already imported |
| SWE-14 | Software engineer | RISK | Major | `web/control-tower/invoices/js/finance/service.js:41-60,150-165` | Paid invoices can be edited (amount, rate, tax) with no check against their CJI3 lines |
| LOG-04 | Logic/QA | WRONG | Major | `fin/service.js:L310-L331` | Re-matching an already matched line pays a second invoice and leaves the first one Paid |
| LOG-05 | Logic/QA | MISSING | Major | `server/routes/finance.js:L67-L75` | Anyone signed in can mark any invoice Paid by hand, from any stage, at any amount; roles and separation of duties do not apply |
| LOG-06 | Logic/QA | WRONG | Major | `fin/cji3.js:L72, L77, L23` | CJI3 date order is guessed per file, so the same line gets a different key in another file and is stored twice |
| LOG-07 | Logic/QA | WRONG | Major | `fin/sheets.js:L43-L53` | A blank row in the CJI3 sheet silently drops every line below it |
| LOG-08 | Logic/QA | RISK | Major | `fin/cji3.js:L20-L23, L88-L90` | Two identical payments in separate incremental files: the second is skipped as a duplicate |
| LOG-09 | Logic/QA | WRONG | Major | `fin/service.js:L97-L103 (`restored`), L116-L119 (`refused`), L245-L254 (`counts`, `changed`), L206-L226 (`resu` | Firestore transaction retries double the side effects kept outside the step |
| LOG-10 | Logic/QA | RISK | Major | `fin/service.js:L246-L270` | CJI3 import is not all-or-nothing: a failure mid-file leaves earlier slices stored, unmatched and unlogged forever |
| LOG-11 | Logic/QA | WRONG | Major | `fin/service.js:L359-L368` | Two PMs sending the same List items at once create duplicate invoices |
| LOG-12 | Logic/QA | MISSING | Major | `fin/workflow.js:L26-L32` | No way in the UI to record a Lead's rejection or return; such invoices stay Pending Lead forever |
| ACC-04 | Accountant | WRONG | Major | `web/control-tower/invoices/js/finance/service.js:L325-L327` | A manual CJI3 match marks any invoice Paid whatever the amount, and anyone may do it |
| ACC-05 | Accountant | WRONG | Major | `web/control-tower/invoices/js/finance/cji3.js:L124-L129` | The tolerance has no ceiling, so a large invoice is fully Paid while thousands short |
| ACC-06 | Accountant | FUNDAMENTALLY WRONG | Major | `web/control-tower/invoices/js/finance/core.js:L150` | "Actual" is the invoice amount, not the CJI3 paid amount, and nothing reconciles the two |
| ACC-07 | Accountant | WRONG | Major | `web/control-tower/invoices/js/finance/service.js:L297-L299` | A part payment counts as zero actual |
| ACC-08 | Accountant | WRONG | Major | `web/control-tower/invoices/js/finance/core.js:L72, L134, L148` | Payments fall in the invoice-date month, not the month they were paid |
| ACC-09 | Accountant | FUNDAMENTALLY WRONG | Major | `web/control-tower/invoices/js/finance/core.js:L11, L33-L37, L83` | Tax is worked out at a flat setting, not taken from the invoice |
| ACC-10 | Accountant | WRONG | Major | `web/control-tower/invoices/js/ui/finance-ui.js:L182` | Each side uses a different forex date and source, and the CJI3 Forex column is ignored |
| ACC-11 | Accountant | MISSING | Major | `web/control-tower/invoices/js/finance/service.js:L41-L58, L150-L165` | Paid invoices can be edited and recalculated, which shifts historical figures |
| ACC-12 | Accountant | MISSING | Major | `web/control-tower/invoices/js/finance/core.js:L150-L162` | The sanctioned-limit check only colours a row: no block, no alert, and committed spend is left out |
| ACC-13 | Accountant | RISK | Major | `web/control-tower/lib/jda-figures.js:L57-L59` | The cost ring's "Paid" can be typed over by hand, as a float, with no field-level audit |
| ACC-14 | Accountant | MISSING | Major | `web/control-tower/invoices/js/finance/service.js:L284, L301, L305, L317, L328, L369-L371, L251-L254` | The audit trail has gaps: automatic matches and paidBy changes are not logged |
| ACC-15 | Accountant | RISK | Major | `web/control-tower/invoices/js/finance/core.js:L31` | One invoice can be counted twice: a List draft plus a later spreadsheet entry |
| TL-02 | Team lead | MISSING | Major | `server/app.js:L93-L108 (repo root has no `vercel.json`)` | Vercel deployment config exists only in the Vercel dashboard |
| TL-03 | Team lead | MISSING | Major | `docs/server-and-invoices.md:L309-L315` | The Vercel environment table leaves out settings the features need |
| TL-04 | Team lead | RISK | Major | `docs/server-and-invoices.md:L295-L296` | Docs say "one process only", but production runs on serverless |
| TL-05 | Team lead | WRONG | Major | `docs/server-and-invoices.md:L230-L231 (against L32-L39 of the same file)` | Setup steps contradict the sign-up flow |
| TL-06 | Team lead | MISSING | Major | `firebase/jda3-rules.txt:L17-L29` | Database rules are not published, and JDA 3's rules are a text file to paste by hand |
| TL-07 | Team lead | WRONG | Major | `CHECKLIST.md:L3, L10` | Requirement and branch docs at the root are stale and contradict the current design |
| TL-08 | Team lead | FUNDAMENTALLY WRONG | Major | `web/control-tower/invoices/js/finance/workflow.js:L24-L36` | The old approval state machine and its endpoint are still live, with no UI calling them |
| TL-09 | Team lead | RISK | Major | `web/control-tower/invoices/js/services/live/db.js:L13-L27` | First use seeds made-up projects, RM 2,000,000 budgets and hard-coded 2026 dates into the real Firestore |
| TL-10 | Team lead | RISK | Major | `web/shared/config/jdas.js:L6-L10` | JDA identity is defined in four places with different keys |
| TL-11 | Team lead | MISSING | Major | `web/control-tower/invoices/js/config/email-recipients.js:L1-L9` | Approval email recipients are blank and kept in front-end source |
| TL-12 | Team lead | MISSING | Major | `OVERHAUL_CHECKLIST.md:L171` | No CI, lint or format gate, and Vercel deploys `main` without running tests |
| PL-03 | Project lead | RISK | Major | `server/auth.js:L49-L54` | Any verified @petronas.com employee can self-sign-up and gets full write access to finance data and the public site |
| PL-04 | Project lead | RISK | Major | `web/control-tower/invoices/js/finance/service.js:L322-L328` | A hand match marks any invoice Paid whatever the amounts, by anyone signed in |
| PL-05 | Project lead | MISSING | Major | `web/control-tower/invoices/js/finance/workflow.js:L4-L10, L33-L34` | No record of the Project Lead's approval exists anywhere in the system |
| PL-06 | Project lead | RISK | Major | `web/control-tower/invoices/js/finance/cji3.js:L122-L128` | CJI3 amount tolerance of 0.5 % auto-marks large invoices Paid with big differences |
| PL-07 | Project lead | RISK | Major | `server/site-content.js:L355-L388` | Vercel production cannot keep pictures, Microsoft sign-ins or file data on disk |
| PL-10 | Project lead | MISSING | Major | `server/site-content.js:L16, L33, L40-L43` | Public landing page ships placeholder people and empty contacts |
| PL-11 | Project lead | MISSING | Major | `CHECKLIST.md:L31, L91, L114` | WBS mapping (C3) not built: JDA 1 vs JDA 2 split of the combined CJI3 file is unverified |
| PL-12 | Project lead | MISSING | Major | `reviews/CONTEXT.md "Assumptions"` | Nothing has been run against a real CJI3 export, a real Microsoft List or a real sign-in |
| JDAL-04 | JDA lead | WRONG | Major | `web/control-tower/invoices/js/finance/service.js:364` | List drafts are stored with 0% tax (and no rate), so CJI3 amounts do not agree |
| JDAL-06 | JDA lead | MISSING | Major | `server/routes/finance.js:12-13, 55-61` | No per-JDA scope: I see and act on every JDA, and "Lead" is one global list |
| JDAL-07 | JDA lead | WRONG | Major | `web/control-tower/invoices/js/finance/list-source.js:129` | With no JDA column in the List, every JDA's invoices show under every JDA and can be sent to the wrong Lead |
| JDAL-08 | JDA lead | MISSING | Major | `web/control-tower/invoices/js/finance/email.js:188-202` | The approval request does not tell me what I am approving against |
| JDAL-09 | JDA lead | WRONG | Major | `web/control-tower/invoices/js/ui/list-invoices.js:141-153` | Invoices become "Pending Lead approval" before anything is sent |
| JDAL-10 | JDA lead | MISSING | Major | `web/control-tower/invoices/js/ui/finance-ui.js:57-59` | No warning before a sanctioned amount is breached |
| JDAL-11 | JDA lead | MISSING | Major | `web/control-tower/invoices/js/finance/core.js:231-236` | Spend views compare paid only; committed exposure is hidden, and "within" almost never shows |
| JDAL-12 | JDA lead | MISSING | Major | `web/control-tower/invoices/js/ui/cji3.js:20, 46, 70` | I cannot see who is holding an invoice, or for how long |
| JDAL-13 | JDA lead | MISSING | Major | `web/control-tower/invoices/js/finance/workflow.js:30-31` | A rejection by email is never recorded; rejected invoices stay "Pending Lead" forever |
| JDAL-14 | JDA lead | RISK | Major | `server/routes/finance.js:93, 95-96` | Any user can change or delete the sanctioned amounts (my limits) |
| JDAL-17 | JDA lead | RISK | Major | `web/control-tower/invoices/js/finance/cji3.js:124-128` | Auto-match accepts 0.5% difference as Paid and books the invoice amount, not the paid amount |
| JDAM-02 | JDA member | MISSING | Major | `web/control-tower/invoices/js/config/email-recipients.js:L4-10` | The approval email never comes out ready to send: To, greeting and sign-off are always placeholders |
| JDAM-03 | JDA member | FUNDAMENTALLY WRONG | Major | `web/control-tower/invoices/js/ui/list-invoices.js:L121, L129-148` | Downloading or copying the email marks the invoices "Pending Lead approval" even if it is never sent, and there is no undo or resend |
| JDAM-04 | JDA member | WRONG | Major | `web/control-tower/invoices/js/ui/list-invoices.js:L141-159` | The email is produced before the register is updated: if the update fails, the email goes out but nothing is recorded, and the error is mislabelled |
| JDAM-05 | JDA member | MISSING | Major | `web/control-tower/invoices/js/finance/workflow.js:L29-31` | The app has no way to record that the Lead rejected or returned an invoice, so it stays "Pending Lead approval" forever |
| JDAM-06 | JDA member | WRONG | Major | `web/control-tower/invoices/js/finance/service.js:L361, L374` | Two partners with the same invoice number are treated as one invoice |
| JDAM-07 | JDA member | WRONG | Major | `web/control-tower/invoices/js/ui/cji3.js:L46, L54, L70` | Invoice history shows "Pending" for every open stage, so a member cannot see where an invoice is or what it needs |
| JDAM-08 | JDA member | RISK | Major | `server/ms-graph.js:L117-119` | Supporting documents attached to the SharePoint List item itself are not read, so the email says "None" |
| JDAM-09 | JDA member | WRONG | Major | `web/control-tower/invoices/js/finance/list-source.js:L101-102` | Amounts written "RM 1,234.50" are rejected as "not a number" |
| JDAM-10 | JDA member | RISK | Major | `web/control-tower/invoices/js/finance/list-source.js:L127-129` | Without a JDA column, every List invoice appears under every JDA and can be sent under the wrong JDA |

## Fundamentally wrong

Design-level problems, grouped by root cause, each with a recommended rework.

**1. Approval is implied, never recorded; "Paid" can be reached without it.**
JDAL-01, PL-05, LOG-12, JDAL-13, JDAM-05, JDAM-03, SWE-11, TL-08.
The List + email design (owner decision, 2026-10-22) moves invoices to Pending Lead when an email is
*generated*, and treats any CJI3 line as approval. As a result:
- nobody records the Lead's decision;
- a rejection cannot be entered;
- an invoice still at Received can go straight to Paid;
- the old approve/reject endpoint is still live with no UI calling it.

*Rework:*
- Record the Lead's decision as data: an Approve / Reject / Return action for the Lead in the app, or a
  "reply recorded" step with the reply attached.
- Move invoices to Pending Lead only when the person confirms "sent".
- Allow resend and undo.
- Restrict CJI3 auto-Paid to invoices that are Approved, or Pending Lead with a recorded approval, and send
  everything else to a review queue.
- Either delete the unused MOVES and `/entries/stage`, or make them the Lead's action.

**2. No authorisation model: authentication is the only gate.**
SEC-02, SEC-03, SEC-04, PL-03, SWE-04, LOG-05, JDAL-02, JDAL-06, JDAL-14, PL-04, ACC-04.
Self sign-up gives every PETRONAS employee write access to everything:
- finance data, sanctioned limits, settings and deletes;
- the public site and the reports;
- CJI3 upload and hand-matching.

Every role list defaults to "empty = anyone", and there is no JDA membership.

*Rework:*
- Store users, roles and JDA membership server-side (Firestore, written only by the server). Sign-up
  gives a "viewer" role.
- Deny by default.
- Run one `authorize(req, action, jdaId)` check on every write route, plus per-JDA filtering on reads.
- Add tests for every route as a non-role user.

**3. Spend is measured on the wrong amount and in the wrong place.**
LOG-03, ACC-05, ACC-06, ACC-07, ACC-08, JDAL-17, PL-06, ACC-09, JDAL-04.
- "Actual" is the invoice's gross amount, not what CJI3 paid.
- The tolerance has no cap (0.5% of RM 1M is RM 5,000).
- A part payment counts as zero.
- Spend falls in the invoice-date month, not the month it was paid.
- Tax is a flat setting, and List drafts carry 0%.

*Rework:*
- Store `paidMinor` per invoice, as the sum of matched CJI3 MYR amounts, and its payment month.
- Make Payment Table "actual" sum the CJI3 amounts by payment month.
- Cap the tolerance (e.g. min(RM 1 + 0.1%, RM 50)).
- Keep the invoice's own tax amount, and use SAP's MYR and forex for paid figures.

**4. List-origin invoices are second-class records.**
LOG-01, ACC-02, JDAL-03, ACC-15, JDAM-06, LOG-11, JDAL-07, JDAM-10.
Drafts are created without a project, month or date. CJI3 still pays them, and then every total drops
them. Invoices are matched by number only, so two partners with the same invoice number collide. Two PMs
sending at once create duplicates. With no JDA column in the List, every row shows under every JDA.

*Rework:*
- Require project and month before an invoice can be sent; take them from the List, or ask in the
  preview dialog.
- Make the identity JDA + partner + invoice number, under a transaction with a unique key.
- Refuse to show List rows without a JDA (or ask once which JDA the List belongs to).

**5. Multi-step finance writes are not atomic.**
SWE-05, LOG-09, LOG-10, SWE-02, LOG-04.
- `matchCji3`, `matchLine`, `sendListToLead` and `importCji3` run as several transactions, each writing a
  stale whole document.
- Transaction retries repeat side effects.
- A failed import leaves stored, unlogged lines behind.
- Re-matching a line leaves the first invoice Paid.

*Rework:*
- One transaction (or a batched write with preconditions) per logical operation, with all side effects
  computed inside it.
- Field-level updates instead of whole documents.
- An import record created first and finalised last (status pending, done or failed).
- Unmatch the old invoice inside the same transaction as the new match.

**6. Production platform mismatch.**
SWE-08, PL-07, TL-02, TL-04, SEC-09.
Vercel is serverless, but several things assume a single long-running server with a writable disk:
- pictures, Microsoft tokens and the file store are kept on disk;
- rate limiting is in memory;
- background work continues after the response.

Deployment config lives only in the dashboard.

*Rework:* either move every piece of state to Firestore or Firebase Storage and commit a `vercel.json`, or
host on an always-on Node service (Railway or Azure App Service).

**7. JDA identity is split.**
SWE-09, TL-10, SWE-10, TL-09.
JDAs are defined in four places and joined by display name. The browser seeds and writes JDAs, projects
and budgets straight to Firestore, with no audit.

*Rework:*
- One `jdas` collection with stable ids (`jda1`..`jda3`), written by the server only.
- Projects and budgets go through the audited finance API.
- Remove the browser seeding.

## Missing entirely

Merged across reviewers.

**Access and security**
- An authorisation model: roles, JDA membership, deny by default, and tests per route as a non-role user.
- Published Firestore rules, plus a deployable JDA 3 rules file and a `.firebaserc`.
- Security headers (CSP, HSTS, frame-ancestors, Referrer-Policy).
- Session revocation and an admin view of users.
- A shared rate-limit store; Firebase App Check and API key restrictions.
- Security event logging and alerting.
- Limits on xlsx size, rows and decompression; refusing `.xlsm` files renamed to `.xlsx`.
- An online dependency audit in CI.

**Approval**
- A recorded Lead approve / reject / return.
- Resending or regenerating the approval email.
- Real recipients per JDA, and the signed-in person's name as the sign-off.

**Finance**
- A per-invoice paid amount and outstanding balance.
- Credit notes and negative adjustments.
- Handling CJI3 lines deleted upstream.
- Reconciling CJI3 control totals against the Payment Table.
- Locking Paid records and closing a period.
- A tax rate table with effective dates and tax codes.
- Using SAP's forex and MYR, and recording the realised FX difference.
- Committed spend (pending + approved) against sanctioned, with alerts before a breach.
- Year-end projection and fiscal-year filtering (deferred by the owner).
- Audit lines for automatic matches, `paidBy` changes and new CJI3 lines.

**Visibility**
- A demo / sample-data banner.
- Overdue indicators.
- Who holds an invoice, days in stage, and ageing views.
- The visible stage in Invoice history; a "my invoices" filter.
- A cross-JDA comparison on the Control Tower.
- A no-permission (403) state.
- A text alternative for the timeline chart.
- Budget position, the PM's validation, the invoice date, the project and a request ID in the approval
  email.
- A scheduled monthly Lead report.

**Data**
- The WBS → JDA/project mapping (C3).
- Reading SharePoint List item attachments as supporting documents.
- Parsing amounts written as "RM 1,234.50".
- Stable JDA ids.
- Firestore schema and migration versioning.

**Engineering**
- CI that runs the tests on pull requests, plus branch protection and lint.
- Tests against the Firestore emulator.
- E2E and accessibility tests.
- Tests for reversals, tolerance at scale, re-matching, blank-row truncation, date-order flips,
  concurrent sends and transaction retries.
- Committed deployment config, and a check at start-up that production settings are complete.

**Handover**
- A release checklist.
- A decision log.
- A runbook: who owns which Firebase, Vercel, Azure, Drive and Anthropic account, and how to rotate each
  secret.
- A real seed of projects and partners.
- Real CJI3 and List samples.
- A production smoke test with a real CJI3 file, a real List and a real sign-in.

## Cross-persona conflicts

| Tension | Side A | Side B | Recommendation |
|---|---|---|---|
| Sign-up openness | SEC-03 / PL-03: self sign-up for any @petronas.com employee is too broad | Owner decision: staff get in straight away; JDAM wants no admin step | Keep instant sign-up, but give **read-only viewer** access by default. An admin grants PM / Lead / Accountant roles per JDA. Members still get in at once. |
| Approval effort | JDAL-01 / PL-05 want an explicit, recorded Lead approval | JDAM / the owner want email-only approval with no extra clicks | Keep the email, and add one **Approve / Reject** link in it that opens the app (one click for the Lead). Record the decision; do not auto-pay unapproved invoices. |
| Tolerance | ACC / LOG: cap it tightly, book the CJI3 amount | Accountant workload: fewer manual confirms | Cap it at min(RM 1 + 0.1%, RM 50) and book the CJI3 amount. Above the cap, the invoice goes to a one-click review list. |
| Editing Paid invoices | ACC-11 / SWE-14: lock them | PMs need to complete List drafts (project, dates) | Lock the money fields once Paid; leave descriptive fields (project, dates, remarks) editable, with an audit line. |
| Per-JDA scoping | SEC-04 / JDAL-06: users see only their own JDA | PL / Control Tower: leadership compares all JDAs | Scope writes per JDA. Reads stay cross-JDA for a "programme" role, and are scoped for everyone else. |
| Hosting | PL-07 / SWE-08: Vercel cannot keep disk state | The owner wants Vercel (fast and free) | Short term: move state to Firestore / Storage and keep Vercel. If uploads and Microsoft tokens matter now, use an always-on host. |

## Merged duplicates

The strongest write-up is listed first.

| Root cause | IDs | Keep |
|---|---|---|
| demoMode true on main | SWE-01, UI-01, ACC-03, TL-01, PL-01, JDAL-05, JDAM-01 | UI-01 |
| A fake "migrated" import sets Paid | SEC-01, SWE-03 | SEC-01 |
| No role or SoD check on CJI3 import / match; anyone can hand-pay | SEC-02, SWE-04, LOG-05, JDAL-02, ACC-04, PL-04 | SEC-02 |
| Self sign-up gives full write access | SEC-03, PL-03 | SEC-03 |
| No per-JDA access | SEC-04, JDAL-06 | SEC-04 |
| List invoices drop out of totals once paid | LOG-01, ACC-02, JDAL-03 | LOG-01 |
| A reversal line leaves the invoice Paid | LOG-02, ACC-01 | ACC-01 |
| Tolerance uncapped; actual = invoice amount | LOG-03, ACC-05, ACC-06, JDAL-17, PL-06 | ACC-06 |
| Re-matching leaves the first invoice Paid | SWE-02, LOG-04 | SWE-02 |
| No recorded Lead approval / rejection | JDAL-01, PL-05, LOG-12, JDAL-13, JDAM-05, TL-08 | JDAL-01 |
| Pending Lead set on generate, not send; no resend | JDAM-03, SWE-11, JDAL-09, JDAM-04 | JDAM-03 |
| No JDA column means rows show under every JDA | JDAL-07, JDAM-10 | JDAL-07 |
| Rules unpublished; reports publicly readable | PL-02, SEC-06, TL-06, SEC-07 | SEC-06 |
| Vercel has no writable disk | SWE-08, PL-07, TL-04 | SWE-08 |
| JDA identity split | SWE-09, TL-10 | SWE-09 |
| Paid invoices editable | ACC-11, SWE-14 | ACC-11 |
| Email recipients blank | JDAM-02, TL-11 | JDAM-02 |
| No sanctioned-limit warning; committed spend hidden | ACC-12, JDAL-10, JDAL-11 | ACC-12 |
| Invoice history hides the stage | UI-10, JDAM-07, JDAL-12 | JDAM-07 |
| CJI3 repeat payments treated as duplicates | SWE-13, LOG-08 | LOG-08 |

## Fix plan

**Fix now (Critical; release blockers)**
1. Turn demoMode off on `main`, and add a banner whenever it is on. *(UI-01 and duplicates)*
2. Publish the Firestore rules. Close JDA 3's rules, and tighten `jdas` / `projects` / `meta` / `activity`
   writes. *(SEC-06, PL-02)*
3. Refuse `source: 'migrated'` imports from the API, or allow them only to an admin role. *(SEC-01)*
4. Add role checks to CJI3 import / match / unmatch, sanctioned amounts, settings, deletes and site edits.
   Give self sign-up a viewer role by default. *(SEC-02, SEC-03)*
5. Require project and month on List invoices before sending; refuse CJI3 auto-Paid for invoices without
   them. *(LOG-01)*
6. Handle reversal lines: net amounts per invoice, and send the invoice back to unpaid when the net is
   zero. *(ACC-01)*
7. Unmatch the previous invoice when a line is re-matched. *(SWE-02)*
8. Cap the tolerance and book the CJI3 amount as actual. *(ACC-06, LOG-03)*
9. Restrict CJI3 auto-Paid to approved invoices, and give the Lead a recorded approve/reject.
   *(JDAL-01; owner decision needed, see conflicts)*

**Before release (Major)**
- **Atomic operations:** atomic finance operations and an import record. *(SWE-05, LOG-09, LOG-10)*
- **Sending the email:** move to Pending Lead on confirmed send, and add resend. *(JDAM-03)*
- **Email content:** real recipients and sign-off. *(JDAM-02)*
- **JDA column:** require a JDA column, or a JDA for the List. *(JDAL-07)*
- **Invoice identity:** use JDA + partner + number. *(JDAM-06)*
- **Paid invoices:** lock their money fields. *(ACC-11)*
- **Tax and forex:**
  - store the invoice's own tax amount (ACC-09, JDAL-04);
  - use SAP forex (ACC-10);
  - book spend in the payment month (ACC-08);
  - track part-paid balances (ACC-07).
- **Committed spend:** show it, and warn before a breach. *(ACC-12, JDAL-10, JDAL-11)*
- **Audit:** log automatic matches. *(ACC-14)*
- **Per-JDA access.** *(SEC-04)*
- **Security headers.** *(SEC-08)*
- **Microsoft tokens:** store them encrypted, or drop the device-code flow. *(SEC-09)*
- **Vercel state:** move to Firestore / Storage and commit `vercel.json`. *(SWE-08, TL-02)*
- **Stable JDA ids** and server-only JDA / project writes. *(SWE-09, SWE-10, TL-09)*
- **CJI3 import:** date-order consistency, blank-row truncation, repeat-payment keys.
  *(LOG-06, LOG-07, LOG-08, SWE-13)*
- **List reading:**
  - SharePoint attachments (JDAM-08);
  - "RM 1,234.50" amounts (JDAM-09).
- **Invoice history:** show the stage, who holds the invoice, and days in stage.
  *(JDAM-07, JDAL-12, UI-10)*
- **Overdue and accessibility:** overdue display (UI-04), keyboard access on the List (UI-06, UI-07), and
  CJI3 payments copy (UI-02).
- **Cost % label:** one clearly labelled figure. *(UI-05)*
- **Docs, CI and samples:**
  - Vercel env table and docs (TL-03, TL-05, TL-07);
  - CI running tests on pull requests (TL-12);
  - Firestore emulator tests (SWE-07);
  - placeholder content (PL-10);
  - WBS mapping (PL-11);
  - real-data smoke test (PL-12).

**Backlog (Minor, Nit)**

- SEC-10 (Minor): Any user can write drafts into the shared MS_MAIL_SENDER mailbox with any recipients and HTML
- SEC-11 (Minor): Unauthenticated requests get the 25 MB body parser just by sending any Cookie header
- SEC-12 (Minor): Rate limits are per instance, and the server-side sign-up/reset policy can be bypassed through the public Firebase API
- SEC-13 (Minor): Sessions cannot be revoked; sign-out only clears the browser's copy
- SEC-14 (Minor): CSV export formula guard misses known payloads
- SEC-15 (Minor): Separation of duties and the audit trail identify people by the part of the email before the @
- SEC-16 (Minor): CORS defaults to `*` when ALLOWED_ORIGIN is not set (it is not in the Vercel settings table)
- SEC-17 (Minor): Finance and page data are sent to the Anthropic API with no data-handling control
- UI-08 (Minor): Headline money is truncated instead of rounded, and written as "MYR" here but "RM" elsewhere
- UI-09 (Minor): Dates appear in five formats and two time zones
- UI-11 (Minor): Invoice history total row sums every status, rejected included, as one bold "Taxed MYR" figure
- UI-12 (Minor): The tax-rate dialog tells users to use a Recalculate action that has no UI
- UI-14 (Minor): Progress messages appear in red error style, and errors are not announced or tied to their fields
- UI-15 (Minor): Finance tables lack table semantics: no thead or scope, repeated header names, no aria-sort, and an expandable row with no aria-expanded
- UI-16 (Minor): Low-contrast "—"/"several" text and tiny labels in the Payment Table
- UI-17 (Minor): The Invoice Tracker uses a different header from every other private page
- UI-18 (Minor): The "Unsorted" placeholder JDA shows as a real JDA in tabs and filters
- UI-19 (Minor): The public landing page ships with "coming soon" placeholders
- UI-20 (Minor): Page load failure is a dead end, and the loading text is not announced
- UI-21 (Minor): The email preview leaves the page stale when closed with Esc, and downloads the .eml before the send is recorded
- SWE-06 (Minor): Counters and result lists are changed inside transaction callbacks that Firestore may retry
- SWE-12 (Minor): Separation of duties compares display names and is bypassed by the CJI3 path
- SWE-15 (Minor): Whole-collection reads inside transactions, and the whole register sent on every page load
- SWE-16 (Minor): A large CJI3 upload slice can exceed Firestore's per-commit write limit
- SWE-17 (Minor): Dead code: a status setter the server refuses, which demo mode still allows
- SWE-18 (Minor): Outside-service calls without timeouts; the List read is cut at 5,000 rows without warning
- SWE-19 (Minor): The Bank Negara rate quietly falls back to today's rate for an old date
- SWE-20 (Minor): Deployment config is not in the repo; hardcoded project IDs; JDA 3's key is missing from the Vercel setup
- LOG-13 (Minor): "Generate email" moves invoices to Pending Lead before any email is sent, and the email lists invoices the server refused
- LOG-14 (Minor): "Within sanctioned" only when paid equals sanctioned to the sen; inconsistent with the CJI3 tolerance
- LOG-15 (Minor): Payment Table "Payment month" is the invoice date's month, never the payment's
- LOG-16 (Minor): Invoices at Pending Lead cannot be confirmed Paid after a part payment; UI texts describe the old rules
- LOG-17 (Minor): Undoing one of several lines leaves the invoice Paid even when the rest no longer cover it; stale write
- LOG-18 (Minor): A matched line's MYR amount can change on re-import without the match being re-checked
- LOG-19 (Minor): sendListToLead attaches a List item to an existing invoice by number alone, ignoring partner, project and the item's own JDA
- LOG-20 (Minor): Actor identity is the email's local part: two people can be the same "actor"
- LOG-22 (Minor): matchCji3 ignores moveStage refusals: a line can say "paid" while its invoice is not
- LOG-23 (Minor): Sanctioned "to date" vs whole plan: two different denominators for the same JDA
- ACC-16 (Minor): CJI3 de-duplication by position in the file can drop a real payment
- ACC-17 (Minor): An updated CJI3 line's amount is not checked again against its invoice
- ACC-18 (Minor): There is no year-end projection, and the forecast's assumptions are not shown in full
- ACC-20 (Minor): JDAs are matched by name for CJI3 groups and cost totals
- TL-13 (Minor): The server-and-invoices folder map is out of date
- TL-14 (Minor): README is behind the code
- TL-15 (Minor): Names in the code don't match what screens and routes are called
- TL-16 (Minor): Server business logic lives inside a private front-end page folder
- TL-17 (Minor): Old passkey file remains in git history
- PL-08 (Minor): Large CJI3 / List files will be refused on Vercel
- PL-09 (Minor): The API still accepts the retired in-app approval moves
- PL-13 (Minor): Ask AI sends whole page context (finance figures) to an outside AI service
- JDAL-15 (Minor): Separation-of-duties check compares display names and guards a move nobody makes
- JDAL-16 (Minor): Paid figure on the Control Tower can be typed by hand without who/when
- JDAL-18 (Minor): JDA 1 + JDA 2 share one CJI3 file: a JDA 1 payment can pay a JDA 2 invoice
- JDAL-19 (Minor): No ready-made lead report; exports are per page and manual
- JDAM-11 (Minor): With no currency column, the email shows bare numbers and every invoice raises "information is missing"
- JDAM-12 (Minor): The .eml "opens as a draft" only in classic Outlook for Windows
- JDAM-13 (Minor): Invoice history links only one document, labelled "file", and hides the rest of the List's supporting documents
- JDAM-14 (Minor): Jargon members would not know: CJI3, w TAX, Taxed MYR, sanctioned, PD, routes, "Is it running?"
- JDAM-15 (Minor): Nowhere to submit an invoice, and no link to the Microsoft List
- JDAM-16 (Minor): The Outlook draft can land in a shared mailbox the member cannot open
- JDAM-17 (Minor): Why an invoice is "Incomplete" is shown only on mouse hover
- SEC-18 (Nit): Weak passkeys and an admin passkey remain in git history
- UI-22 (Nit): Table action buttons are too small to tap
- UI-23 (Nit): Navigation does not always show where you are
- UI-24 (Nit): Project banner says "RM 0 under", and a link has an inline style
- UI-25 (Nit): "Portal" naming is left in code and stylesheet comments
- LOG-21 (Nit): Match counts include earlier lines rewritten, so "N line(s) made their invoice Paid" over-reports
- LOG-24 (Nit): A spread "no more than 60 months apart" accepts 61 months
- ACC-19 (Nit): Ringgit is converted to floats for the cost ring and rounded more than once
- TL-18 (Nit): Merged branches never deleted
- TL-19 (Nit): Leftover repo tooling files
- TL-20 (Nit): Placeholder Microsoft Calendar client id kept in the JDA registry file
- JDAM-18 (Nit): "Copy formatted email" puts only the subject on the plain-text clipboard
- JDAM-19 (Nit): A session that expires during the email preview throws the member to /login and loses the selection

## Stats

Findings by persona × severity and category.

| Persona | Critical | Major | Minor | Nit | Fundamentally Wrong | Wrong | Missing | Risk | Total |
|---|---|---|---|---|---|---|---|---|---|
| Cybersecurity (SEC) | 4 | 5 | 8 | 1 | 2 | 5 | 3 | 8 | 18 |
| Web designer (UI) | 1 | 8 | 12 | 4 | 1 | 18 | 4 | 2 | 25 |
| Software engineer (SWE) | 3 | 9 | 8 | 0 | 4 | 8 | 2 | 6 | 20 |
| Logic/QA (LOG) | 3 | 9 | 10 | 2 | 2 | 11 | 2 | 9 | 24 |
| Accountant (ACC) | 3 | 12 | 4 | 1 | 2 | 8 | 4 | 6 | 20 |
| Team lead (TL) | 1 | 11 | 5 | 3 | 1 | 5 | 5 | 9 | 20 |
| Project lead (PL) | 2 | 8 | 3 | 0 | 0 | 2 | 5 | 6 | 13 |
| JDA lead (JDAL) | 4 | 11 | 4 | 0 | 1 | 5 | 7 | 6 | 19 |
| JDA member (JDAM) | 1 | 9 | 7 | 2 | 1 | 9 | 4 | 5 | 19 |
| **All** | 22 | 82 | 61 | 13 | 14 | 71 | 36 | 57 | 178 |
