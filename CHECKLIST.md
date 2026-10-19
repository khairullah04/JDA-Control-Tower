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

- [ ] **C1 — Dedup key for CJI3 lines.** The export has no SAP document number or line item (22 columns,
  see `cji3 parame.xlsx`). Proposed key, from the columns it does have:
  `WBS Element + Reference + Posting Date + Document Date + Document Type + Cost Element + Transaction Currency + Value TranCurr`.
  Two genuinely identical lines in one file are kept apart by their order among identical lines
  (1st, 2nd…): re-importing a file that holds the same line twice adds nothing; a later file holding it
  three times adds one. A line whose key matches but whose Remarks, Forex, Val/COArea Crcy, Value in
  Obj. Crcy or Document Header Text differ is **updated** (and logged), not duplicated.
- [ ] **C2 — Route 1 after "Sent to PD".** Proposed: it joins Accountant 2's **To Be Paid** queue (it is
  waiting for payment like an approved invoice) and becomes Paid when CJI3 shows it.
- [ ] **C3 — WBS → JDA/project list.** Proposed: a **WBS mapping** table in the app (Settings). A CJI3 line
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

- [ ] "Portal" wording left in docs, comments and the AI prompts → "JDA Control Tower" (file names,
  `/api/portal` and `PORTAL_DRIVE_ROOT_FOLDER_ID` kept: renaming them would break saved settings).
- [ ] Owner, with the database key: run `remove-jdas.mjs --apply` (JDA 4+ out of the database).
- [ ] Owner, with the key: publish the Firestore rules (the rest of the system private in the database too).

## Approval workflow

- [x] Stage graph and stage → status mapping as pure functions (`finance/workflow.js`), shared by browser and server.
- [ ] Server: `POST /api/finance/entries/stage` — move invoices along the graph (refuses moves not on it), with note; writes `financeStages` lines; archive on Reject, restore from archive.
- [ ] Existing invoices get a stage from their status on first read (pending → received, approved → to_be_paid, paid → paid, rejected → rejected); nothing rewritten until moved.
- [ ] Intake queue (Accountant 1): Received invoices, choose Route 1 or Route 2.
- [ ] PM queue: Route 2 invoices to validate (supporting documents: links on the invoice).
- [ ] Project Lead queue: Pending Lead approval — Approve or Reject (reason required).
- [ ] To Be Paid queue (Accountant 2): Approved and Sent to PD invoices, oldest due date first.
- [ ] Archive view: rejected invoices, with Restore.
- [ ] Every move: a confirmation step with an optional note (a reason when rejecting); the history shown on the invoice.
- [ ] Roles hook for later: `ROLE_*` lists in `server/.env`; empty means anyone signed in (today's case).

## CJI3 import

- [ ] Read the two files: the user says which one (JDA 3 / JDA 1 + 2); a line whose WBS points to the other file's JDA is flagged.
- [ ] Column reading copes with the real headers, including `Forex Confidential - For PETRONAS Staff Only…` and `Val/COArea Crcy` with or without its suffix.
- [ ] Dedup key and occurrence (C1); add, skip, update.
- [ ] WBS mapping (C3): Unmapped lines listed and assignable; remembered.
- [ ] Malformed rows (no amount, bad date, no WBS) reported by line number, not imported; missing required columns refuse the file with the list of what is missing.
- [ ] Import log (`cji3Imports`) with added / skipped / updated / unmapped / malformed, and a page listing past imports.
- [ ] Preview before saving (dry run), as the current import does.

## Payment tables

- [ ] Match CJI3 lines to invoices: same JDA and project, and Reference = invoice number (ignoring case and spaces); one clear match marks the invoice Paid (`stage: paid`, logged). Several or none: listed for a person to match by hand.
- [ ] "Paid in CJI3, no invoice" list (lines that match nothing).
- [ ] Two views and two .xlsx exports: **JDA 1 + JDA 2** together, and **JDA 3**.
- [ ] Payment tables per JDA and per project from these, with the existing parameters (tax, forex, status, sanctioned checks) unchanged.

## Projections

- [ ] Deferred by the owner. (Proposal on record: paid to date + approved / To Be Paid not yet paid + 3-month run-rate × months left, capped at sanctioned.)

## Testing

- [ ] CJI3 importer: duplicate re-upload adds nothing.
- [ ] CJI3 importer: overlapping files add only the new lines; changed non-key fields update.
- [ ] CJI3 importer: identical lines within one file are kept as separate lines.
- [ ] CJI3 importer: malformed rows reported and skipped.
- [ ] CJI3 importer: missing columns refuse the file.
- [ ] CJI3 importer: unmapped WBS kept as Unmapped; mapping applied on the next import.
- [ ] Matching: one match → Paid; none / several → manual list.
- [x] State machine: every allowed move; every refused move; Reject archives and Restore returns; stage → status keeps the Payment Table figures as before. (`server/workflow.test.mjs`)
- [ ] Existing tests still pass.

## Docs

- [ ] `docs/server-and-invoices.md`: the approval process, the queues, CJI3 import and the dedup rule, matching.
- [ ] `BRANCH_DEMO.md`: run `main` and this branch side by side (git worktree, two ports, separate data).
