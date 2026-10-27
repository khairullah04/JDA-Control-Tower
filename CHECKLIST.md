# Invoice approval and CJI3 — checklist

Branch `feature/invoice-approval-cji3` (from `main` at `2fd9c81`). Not merged, not for `main` until
the owner says so. Scope: JDA 1, 2 and 3. The company's payment system is out of scope: the only
payment evidence is the CJI3 export.

## Decided (owner, 2026-10-19)

- **PD system**: no data is passed to it. Route 1 only records "Sent to PD".
- **Approvals happen on dashboards in the app**, not by email (emails were the old way).
- **WBS Element** decides which JDA and project a CJI3 line belongs to.
- **CJI3 arrives as two files**: one for **JDA 3**, one for **JDA 1 + JDA 2** together (the app tells
  JDA 1 from JDA 2 by WBS Element).
- **Rejected invoices are soft-archived**: kept with who, when and why, out of the active queues, restorable.
- **End-of-year projection: not now** (left alone until the owner returns to it).
- **Users and roles**: no emails yet. Until there are, anyone signed in may move an invoice, and **every
  move asks for confirmation** (with a note) before it happens.
- **CJI3 lines are stored apart from invoices** (`cji3Lines`); a matched line marks its invoice Paid.

## To confirm before building the part concerned

- [x] **C1 — Dedup key for CJI3 lines.** *Confirmed 2026-10-19; built in `finance/cji3.js`.* The export has no SAP document number or line item (22 columns,
  see `cji3 parame.xlsx`). Proposed key, from the columns it does have:
  `WBS Element + Reference + Posting Date + Document Date + Document Type + Cost Element + Transaction Currency + Value TranCurr`.
  Two genuinely identical lines in one file are kept apart by their order among identical lines
  (1st, 2nd…): re-importing a file that holds the same line twice adds nothing; a later file holding it
  three times adds one. A line whose key matches but whose Remarks, Forex, Val/COArea Crcy, Value in
  Obj. Crcy or Document Header Text differ is **updated** (and logged), not duplicated.
- [x] **C2 — Route 1 after "Sent to PD".** *Confirmed 2026-10-19; built (`QUEUES.pay` in `finance/workflow.js`).* Proposed: it joins Accountant 2's **To Be Paid** queue (it is
  waiting for payment like an approved invoice) and becomes Paid when CJI3 shows it.
- [ ] **C3 — WBS → JDA/project list.** *The owner is thinking about it (2026-10-19); nothing built for it yet.* Proposed: a **WBS mapping** table in the app (Settings). A CJI3 line
  whose WBS is not in it is kept as **Unmapped** and listed for someone to assign once; the assignment is
  remembered for every later file. An initial list from the owner, if one exists, can be imported.

## Data model changes (summary)

| Where | Change |
|---|---|
| `financeEntries` (invoices) | New `stage` (workflow state) and `route` (`direct` / `validation`), `archivedAt`, `paidBy` (the CJI3 line(s) that paid it). The existing `status` (pending / approved / paid / rejected) is **kept and derived from `stage`**, so the Payment Table logic (tax, forex, flags, "only paid counts as actual") is untouched. |
| `financeStages` (new) | One line per stage move: invoice, from, to, who, when, note. (Edits keep going to `financeAudit` as today.) |
| `cji3Lines` (new) | One per CJI3 line: the 22 columns, its dedup key and occurrence, JDA and project (from WBS), the file it came from, the invoice it matched (if any). |
| `cji3Imports` (new) | One per uploaded file: file name, which file (JDA 3 / JDA 1 + 2), who, when, rows added, skipped, updated, unmapped, malformed. |
| `wbsMap` (new) | WBS Element → JDA and project. |

Stage → status (what the Payment Table sees):

```
received, routed_validation, pm_validated, pending_lead  -> pending
sent_to_pd, to_be_paid                                   -> approved
paid                                                     -> paid
rejected (soft-archived)                                 -> rejected
```

State machine:

```
Received ─┬─ Route 1: Direct ──────────► Sent to PD ─────────────────┐
          └─ Route 2: Validation ─► PM validated ─► Pending Lead ─┬─► Approved / To Be Paid ─┤
                                                                   └─► Rejected (archived)    │
                                                     Paid (confirmed by a CJI3 line) ◄────────┘
```

Every move is checked against this graph on the server, asks for confirmation in the page, and is
logged (who, when, note).

## Leftover overhaul items

- [x] "Portal" wording left in docs, comments and the AI prompts → "JDA Control Tower" (file names,
  `/api/portal` and `PORTAL_DRIVE_ROOT_FOLDER_ID` kept: renaming them would break saved settings). *Also kept: the Drive folder name "JDA Portal" that the server looks for (`server/portal-drive.js`), which is a real folder name, not wording.*
- [ ] Owner, with the database key: run `remove-jdas.mjs --apply` (JDA 4+ out of the database).
- [ ] Owner, with the key: publish the Firestore rules (the rest of the system private in the database too).

## Approval workflow

- [x] Stage graph and stage → status mapping as pure functions (`finance/workflow.js`), shared by browser and server.
- [x] Server: `POST /api/finance/entries/stage` — move invoices along the graph (refuses moves not on it), with note; writes `financeStages` lines; archive on Reject, restore from archive.
- [x] Existing invoices get a stage from their status on first read (pending → received, approved → to_be_paid, paid → paid, rejected → rejected); nothing rewritten until moved.
- [x] Intake queue (Accountant 1): Received invoices, choose Route 1 or Route 2.
- [x] PM queue: Route 2 invoices to validate (supporting documents: the invoice's file link for now; a list of extra document links is not built yet).
- [x] Project Lead queue: Pending Lead approval — Approve or Reject (reason required).
- [x] To Be Paid queue (Accountant 2): Approved and Sent to PD invoices, oldest due date first.
- [x] Archive view: rejected invoices, with Restore.
- [x] Every move: a confirmation step with an optional note (a reason when rejecting); the history shown on the invoice.
- [x] Roles hook for later: `ROLE_*` lists in `server/.env`; empty means anyone signed in (today's case).

## CJI3 import

- [x] Read the two files: the user says which one (JDA 1 + 2 / JDA 3), by the tab they upload in. *(Flagging a line whose WBS belongs to the other file waits for C3, the WBS list.)*
- [x] Column reading copes with the real headers, including `Forex Confidential - For PETRONAS Staff Only…` and `Val/COArea Crcy` with or without its suffix.
- [x] Dedup key and occurrence (C1); add, skip, update.
- [ ] WBS mapping (C3): Unmapped lines listed and assignable; remembered.
- [x] Malformed rows (no amount, bad date, no WBS) reported by line number, not imported; missing required columns refuse the file with the list of what is missing.
- [x] Import log (`cji3Imports`) with added / skipped / updated / unmapped / malformed, and a page listing past imports. *CJI3 payments page (`#/cji3-lines`), Uploads table.*
- [x] Preview before saving (dry run), as the current import does. *Preview, then Import.*

## Payment tables

- [x] Match CJI3 lines to invoices: same JDA and project, and Reference = invoice number (ignoring case and spaces); one clear match marks the invoice Paid (`stage: paid`, logged). Several or none: listed for a person to match by hand. *Server side done (`matchCji3`, `matchLine`, `/api/finance/cji3/match`, `/rematch`); a line matching an invoice not yet approved is linked and flagged, not moved. Lines page: Match… / Undo match / Match again.*
- [x] "Paid in CJI3, no invoice" list (lines that match nothing). *Filter "Not matched" on the CJI3 payments page.*
- [x] Two views and two .xlsx exports: **JDA 1 + JDA 2** together, and **JDA 3**. *Payment Tables tabs "JDA 1 + JDA 2 (CJI3 file)" and "JDA 3 (CJI3 file)"; Export Excel writes the combined table, then a sheet per JDA and per project. CJI3 lines export per file on CJI3 payments.*
- [x] Payment tables per JDA and per project from these, with the existing parameters (tax, forex, status, sanctioned checks) unchanged.

## Projections

- [ ] Deferred by the owner. (Proposal on record: paid to date + approved / To Be Paid not yet paid + 3-month run-rate × months left, capped at sanctioned.)

## Testing

- [x] CJI3 importer: duplicate re-upload adds nothing.
- [x] CJI3 importer: overlapping files add only the new lines; changed non-key fields update.
- [x] CJI3 importer: identical lines within one file are kept as separate lines.
- [x] CJI3 importer: malformed rows reported and skipped.
- [x] CJI3 importer: missing columns refuse the file.
- [ ] CJI3 importer: unmapped WBS kept as Unmapped; mapping applied on the next import.
- [x] Matching: one match → Paid; none / several → manual list.
- [x] State machine: every allowed move; every refused move; Reject archives and Restore returns; stage → status keeps the Payment Table figures as before. (`server/workflow.test.mjs`)
- [x] Existing tests still pass. *(170 of 170.)*

## Docs

- [x] `docs/server-and-invoices.md`: the approval process, the queues, CJI3 import and the dedup rule, matching.
- [x] `BRANCH_DEMO.md`: run `main` and this branch side by side (git worktree, two ports, separate data). *Steps run once in a scratch folder (ports 8091/8092): both copies start, only the branch has Approvals, the branch's data stays in its own folder.*

# Invoice list from Microsoft Lists, proof links, Outlook email (brief of 2026-10-22)

## To confirm before building (asked 2026-10-22)

- [x] **L1 — The List's column names**, and whether a Graph app registration is possible. *Settled 2026-10-22 (owner): columns are detected automatically, never mapped by hand; the List is read without IT, by the person's own Microsoft sign-in (device code). An app registration stays optional.*
- [x] **L2 — Where proof links are stored**: written back to the List (needs write permission), or in our own database keyed by invoice number (the default when Graph is not available). *Answered 2026-10-22: in the Microsoft List itself; the page only reads and shows them (no adding links in the app).*
- [x] **L3 — Recipients**: default To / CC per JDA (Project Lead), and the sign-off name. *Answered: blank for now (`invoices/js/config/email-recipients.js`).*
- [x] **L4 — Currency**: one currency (MYR), or mixed currencies with the forex conversion shown. *Answered: mixed, each invoice in its own currency, totals per currency, no conversion.*
- [x] **L5 — List invoices vs the register**: do the List's invoices become the register's invoices (imported into Approvals, one record each), or a separate list on the JDA page only? *Answered: the List is before approval, CJI3 after payment. A List invoice becomes a register invoice (a draft) when it is emailed, so Approvals, CJI3 matching and the Payment Tables carry on from there.*
- [x] **L6 — The PM step**: the email sends invoices to Pending Lead Approval. From Received that skips "With PM" in today's process. Is the email the PM's validation (Received/With PM → Pending Lead), or only allowed from With PM? *Answered: the PM pulls the List, ticks invoices, generates the email: they move Received → With PM → Pending Lead. Missing data is listed invoice by invoice first, with "Proceed anyway".*

## Data source
- [x] Source adapter interface (`listInvoices()`, `writeProof()` where supported), one shape for both.
- [x] `GraphListSource`: MSAL client credentials, `GET /sites/{site-id}/lists/{list-id}/items?expand=fields` with paging; settings `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_SITE_ID`, `MS_LIST_ID` in `server/.env`.
- [x] `FileListSource`: a CSV / XLSX export of the List, uploaded on the page.
- [x] Fallback to the file source when Graph is not configured; the page works the same with either.
- [x] ~~Column-mapping config~~ → automatic column detection (owner, 2026-10-22): by name, then by content; the page shows which column was used and what was not found.
- [x] Without IT: device-code sign-in per person (Microsoft's public client, delegated `Sites.Read.All`, `Mail.ReadWrite`), the List read from its pasted link, tokens refreshed and kept in `server/.ms-tokens.json` (gitignored, mode 600); sign out.
- [x] `server/.env.example` placeholders; no secrets committed.

## Per-JDA invoice list
- [x] On each JDA's tracker page, below the existing graphs, filtered to that JDA (by the List's JDA column; with none mapped, every row).
- [x] Columns: checkbox (select all) · Invoice No. · Partner · Amount (right-aligned, with currency) · Description · Add Proof.
- [x] ~~Add Proof~~: dropped (owner, 2026-10-22): links come from the List and show as chips. One or more links per invoice with an optional label; http(s) only; remove; shown as clickable chips.
- [x] Proof links stored per L2 (in the List).
- [x] Above the table: selected count, total of the selected amounts, Generate Email (off when nothing is selected).

## Email
- [x] Outlook-safe HTML builder: tables, inline CSS only, no flex/grid, Segoe UI / Arial.
- [x] Content: greeting, intro (JDA and purpose), invoice table (dark header, zebra rows, amount right-aligned, TOTAL row; No. | Invoice No. | Partner | Description | Amount | Supporting Documents), proof links by label or "Document n" (never a raw URL), closing line, sign-off.
- [x] Subject: `[JDA X] Invoice Approval Request – N invoices – DD/MM/YYYY`.
- [x] Preview modal before generating.
- [x] Delivery a) `.eml` download: `X-Unsent: 1`, `Content-Type: text/html; charset=utf-8`, To/CC from config.
- [x] Delivery b) with Graph `Mail.ReadWrite`: `POST /me/messages` draft (the signed-in person's mailbox), open its `webLink`.
- [x] Delivery c) "Copy formatted email" (clipboard `text/html`) + `mailto:` with subject and recipients only (never the body).

## Approval workflow
- [x] Generating the email moves the selected invoices to Pending Lead Approval (per L6) and logs who, when and which invoices.

## Tests
- [x] Automatic column detection.
- [x] Sign-in and List link (Microsoft faked): device code, refresh, paging, display names, drafts, sign-out.
- [x] URL validation.
- [x] Email HTML builder: escapes user text, correct totals, hyperlinks by label / "Document n".
- [x] `.eml` headers.
- [x] Selection logic (count, total, select all).

# The Microsoft List replaces Approvals (owner, 2026-10-22)

The List and its approval-request email are the approval process; the Approvals queue page goes. Nobody
approves inside the system: emailed invoices wait as Pending Lead approval, and a CJI3 payment line is the
proof of approval and marks them Paid.

- [x] Sidebar "Approvals" opens the List view (pull, tick, Generate Email), with a JDA picker.
- [x] The List stays under the graphs on each JDA's tracker page too.
- [x] Remove the queue page (Intake, PM validation, Lead approval, To Be Paid, Paid, archive) and the links to it.
- [x] CJI3 marks an invoice Paid from any open stage (no "not approved yet" hold); undoing the match returns it to the stage it was in. Lines held as "not approved" by the old rule are matched again by Match again.
- [x] Tests and docs updated.

# Payment Tables: paid invoices only (owner, 2026-10-22)

- [x] The Payment Tables (per JDA, per project, per CJI3 file) and their exports list only Paid invoices, i.e. those a CJI3 payment line was matched to. No pending, approved or status badges.
- [x] "Total invoiced amount" card and "+ Add invoice to this row" removed from the Payment Table (an added invoice would be pending, so it would not show).

# Planned = sanctioned, and the CJI3 register becomes Invoice history (owner, 2026-10-22)

- [x] One figure: "planned" is the sanctioned amount. Code renamed (`sanctionedToDate`, `overSanctioned`; timeline bars); every view works it out from the sanctioned records.
- [x] Control Tower edit mode: only Paid can be set by hand; Sanctioned always follows the Invoice Tracker.
- [x] Test: one edit to a sanctioned amount moves the Payment Table, project report and Control Tower ring together.
- [x] CJI3 register → **Invoice history**: every invoice (paid, pending, approved, rejected), read-only, newest first, filter by JDA and by partner (and status), with each invoice's history.
- [x] Links and labels that say "CJI3 register" updated (sidebar, Payment Table, JDA totals, Drive sync, docs).

# Sign-up for @petronas.com and reset password (owner, 2026-10-26)

- [x] /login: Create an account (@petronas.com only, password 10+ with letters and a digit), Forgot password?, resend verification.
- [x] Server checks the domain (/api/auth/signup, /api/auth/reset); Firebase sends the verification and reset emails; same answer whether an account exists; 5 tries per 15 minutes.
- [x] Access only once verified, on the server and in firestore.rules; ALLOWED_EMAILS kept for exceptions only.
- [ ] Owner, Firebase console: Password policy and Email enumeration protection on; edit the email templates' sender name if wanted.
- [ ] Owner: publish the updated firestore.rules (needs the key).

# Review batch 1: Critical fixes (reviews/REVIEW.md, 2026-10-27)

- [x] Demo mode off on main, a banner whenever it is on, and a test that main ships it off (UI-01, SWE-01, ACC-03, TL-01, PL-01, JDAL-05, JDAM-01).
- [x] "migrated" imports: once only, and never Paid (SEC-01, SWE-03).
- [x] CJI3 upload, match, undo and Match again limited to ROLE_ACCOUNTANT2 when set (SEC-02 in part; who gets which role waits on the access decision, SEC-03).
- [x] Re-matching a line undoes its first match (SWE-02, LOG-04).
- [x] Reversals take a Paid invoice back to unpaid (ACC-01, LOG-02).
- [x] Invoices with no project or payment month are linked, not paid, until completed (LOG-01, ACC-02, JDAL-03).
- [x] Activity lines only in the signer's own name (SEC-06 in part; the rules still need publishing).
- [x] CJI3 payments: Confirm invoice Paid shown for any unpaid, complete invoice (UI-02 in part).
- [x] ~~Waiting on owner decisions~~: answered 2026-10-27, see below.
- [ ] Owner: publish firebase/firestore.rules (PL-02).

# Review decisions (owner, 2026-10-27) and batch 2

- **Lead approval (JDAL-01, PL-05, LOG-12, JDAL-13, JDAM-05, TL-08):** three steps, Pending (uploaded) → Approved (by hand) → Paid (only from a CJI3 line).
  - [x] Approve on Invoice history (from any pending stage), Undo approval with a reason; both in the invoice's history.
  - [x] CJI3 pays only approved invoices; a line for an unapproved one is held and pays it when it is approved.
  - [x] A hand match ("Match…", "Confirm invoice Paid") is refused for an unapproved invoice.
  - [x] Approving limited to ROLE_PM + ROLE_LEAD when set.
  - [ ] Reject: kept in the rules, no button yet (owner to say whether wanted).
- **Who can do what (SEC-03, PL-03):** everyone signed in may do everything; some functions will be PM / Project Lead only (to be discussed). Self sign-up stays.
- **Per-JDA access (SEC-04, JDAL-06):** not wanted. Closed.
- **Tax and forex (ACC-09, ACC-10, ACC-06):** taken from the CJI3 extraction. [ ] To build: paid amount, tax and MYR from the CJI3 lines.
- **Hosting (SWE-08, PL-07, TL-02, TL-04):** stay on Vercel. [ ] To build: pictures and Microsoft sign-ins kept in Firebase, not on disk; vercel.json.
- **Ask AI (SEC-17, PL-13):** will move to another model: **enhancement, later.**
- [ ] Still open: the CJI3 amount tolerance cap (LOG-03, ACC-05, PL-06).
