# To do

What is left for the TriCipta AI site and the JDA Control Tower, in the order it is best done.
Last updated 2026-10-27. Tick a box (`[x]`) when it is done.

**Rule (owner, 2026-10-27):** every change, progress step or alteration is listed here: items ticked or
added, and a dated line in the **Change log** at the bottom, in the same commit as the change.

Who does it: **You** (needs your accounts, a decision or real data) or **Claude** (code).

## 1. Get the latest work live (You)

- [ ] Merge **batch 1**: <https://github.com/khairullah04/JDA-Control-Tower/pull/new/fix/batch-1-critical>
- [ ] Then merge **batch 2**: <https://github.com/khairullah04/JDA-Control-Tower/pull/new/fix/batch-2-approval>
- [ ] Wait for the newest Vercel deployment to say **Ready**. Never redeploy an older row: Redeploy rebuilds that row's old code.

## 2. Firebase (You)

Do these in the current project, or in a new one (then send Claude its `firebaseConfig`).

- [ ] **Authentication → Settings:**
  - [ ] Password policy: minimum 10 characters, with a number.
  - [ ] Add `jda-control-tower.vercel.app` to **Authorized domains**.
- [ ] **Firestore → Data:** collection `access`, document `allowlist`, field `emails` (array) with your own account.
- [ ] **Firestore → Rules:** paste `firebase/firestore.rules`, then **Publish**. The JDA reports are publicly readable until this is done.
- [ ] **Project settings → Service accounts → Generate new private key.** Keep the file private and never put it in GitHub.
- [ ] Close JDA 3's own project rules (`jda3-9c0c5`; see `firebase/jda3-rules.txt`).
- [ ] New project only: send Claude its `firebaseConfig` so the code can be switched over.

## 3. Vercel settings (You)

In Settings → Environment Variables (Production):

- [ ] `FIREBASE_SERVICE_ACCOUNT`: the whole key file's contents, ticked **Sensitive**.
- [ ] `FINANCE_STORE` = `firestore`.
- [ ] `SESSION_SECRET`: add it again, ticked **Sensitive** (this clears "Needs Attention").
- [ ] `ALLOWED_EMAILS`: your own account outside @petronas.com.
- [ ] Optional: `ANTHROPIC_API_KEY`, only if Ask AI should work before it moves to another model.
- [ ] One **Redeploy of the newest row**, then test sign-up with a real @petronas.com address. Check the junk folder for the verification email.

## 4. Decisions and information still needed (You)

- [ ] Which functions are **PM-only or Project Lead-only**.
- [ ] Who is in `ROLE_PM`, `ROLE_LEAD` and `ROLE_ACCOUNTANT2` (emails).
- [ ] **Approval email:** To and CC per JDA, and the sign-off name.
- [ ] **WBS → JDA/project list (C3)**, so CJI3 lines land on the right project.
- [ ] **Real files:**
  - [ ] a real CJI3 export
  - [ ] a real Microsoft List export
  - [ ] three past invoices
- [ ] Test **Pull from the List** with your work account (Approvals → Sign in to Microsoft).
- [ ] **Year-end projection:** how it should be worked out (deferred).

## 5. Content and data (You)

- [ ] **Public page:**
  - [ ] Program Lead and Business Champion names
  - [ ] contacts
  - [ ] pictures
  - [ ] remove the "TBC" and "coming soon" placeholders
- [ ] Each JDA's Agreement and BRD links, and press release dates.
- [ ] Fix JDA 1's press picture field, which says "kai".
- [ ] Fix JDA 3's feed, which lists "Project 2b" twice.
- [ ] With the key in place: `cd server && node scripts/remove-jdas.mjs` (a dry run), then again with `--apply` to take JDA 4+ out of the database.

## 6. Code: next batches (Claude, when you say "go")

Finding IDs refer to `reviews/REVIEW.md`.

### Batch 3: money and data

- [ ] Take the paid amount, tax and MYR from the CJI3 lines; book spend in the month it was paid; count part payments (ACC-06, ACC-07, ACC-08, ACC-09, ACC-10).
- [ ] Lock the money fields of Paid invoices; log automatic matches in the audit trail (ACC-11, ACC-14).
- [ ] CJI3 imports and matching all-or-nothing (SWE-05, LOG-09, LOG-10).
- [ ] CJI3 import edge cases:
  - [ ] a blank row cuts off the rest of the sheet (LOG-07)
  - [ ] date order guessed differently per file (LOG-06)
  - [ ] a real repeat payment skipped as a duplicate (LOG-08)
- [ ] Microsoft List invoices:
  - [ ] require a JDA column (JDAL-07)
  - [ ] identify an invoice by JDA + partner + number (JDAM-06)
  - [ ] read "RM 1,234.50" amounts (JDAM-09)
  - [ ] read SharePoint attachments (JDAM-08)
  - [ ] mark Pending Lead only once the email is sent, and allow resend (JDAM-03)

### Batch 4: Vercel and setup

- [ ] Keep pictures and Microsoft sign-ins in Firebase instead of on disk; add `vercel.json` (SWE-08, TL-02).
- [ ] Security headers (SEC-08).
- [ ] One JDA id everywhere; JDAs and projects saved through the server (SWE-09, SWE-10).
- [ ] CI that runs the tests on every pull request (TL-12).
- [ ] Bring the docs and checklists up to date (TL-03, TL-05, TL-07).

### Batch 5: screens

- [ ] Invoice history: the real stage, who holds it and for how long, and why it is "Incomplete" (JDAM-07, JDAL-12, UI-10).
- [ ] Overdue invoices; a warning before a sanctioned amount is exceeded; committed spend shown (UI-04, JDAL-10, JDAL-11).
- [ ] Keyboard and screen-reader fixes; plain labels instead of jargon; the remaining Minor and Nit findings.

## Tech stack overhaul (new repository)

See `FUTURE_PLAN.md` (revised 2026-10-28: Firebase stays, Vercel for testing only, live on Firebase App Hosting). The current code stays as the reference; the new repo starts from it.

- [x] Stack chosen and checked against official docs: Next.js + TypeScript, Firebase (Firestore written only by the server, Auth, Storage, Emulator Suite, App Hosting for live), Vercel previews for testing, adapters for Microsoft and AI.
- [ ] You: download this repository as a zip and create the new repository.
- [ ] You: ask IT and your manager about Firebase Blaze (for going live), Power Automate Premium + Copilot Credits (for AI Builder), the Entra app registration, and whether finance data may live on Google Cloud.
- [ ] Claude: build steps 1–9 of `FUTURE_PLAN.md` in the new repository.

## Later (enhancements)

- [ ] Ask AI on another model.
- [ ] Microsoft sign-in (SSO) instead of separate passwords.

## Done recently

- [x] Review batch 1, the Critical fixes: demo mode off with a banner; fake "migrated" import closed; no double payment on re-match; reversals; List drafts can't be paid while incomplete; CJI3 role check.
- [x] Pending → Approved (by hand) → Paid (only from CJI3), with Approve, Undo approval, Reject and Restore.
- [x] No CJI3 tolerance: paid only on an exact amount.
- [x] @petronas.com sign-up and reset password.
- [x] Invoice history; Payment Tables show paid invoices only.

## Change log

Newest first. Each line: date, what changed, branch (merged into `main` or not yet).

- 2026-10-28: FUTURE_PLAN.md revised: Firebase stays (Firestore server-only writes, Auth with Microsoft sign-in later, Storage, Emulator Suite), Vercel for testing only, live on Firebase App Hosting; costs and sources updated. (`docs/future-plan-firebase`, not merged)

- 2026-10-27: FUTURE_PLAN.md (the tech stack overhaul, checked against official docs) and its TODO section. (`fix/batch-2-approval`, not merged)

- 2026-10-27: TODO.md tracking rule added; Change log started. (`fix/batch-2-approval`, not merged)
- 2026-10-27: TODO.md created. (`fix/batch-2-approval`, not merged)
- 2026-10-27: The 9 reviewer agents and the review reports committed (`.claude/agents/review/`, `reviews/`). (`fix/batch-2-approval`, not merged)
- 2026-10-27: No CJI3 tolerance (paid only on an exact amount); Reject and Restore buttons on Invoice history. (`fix/batch-2-approval`, not merged)
- 2026-10-27: Pending → Approved (by hand, Approve / Undo approval) → Paid (only from CJI3); CJI3 lines for unapproved invoices held until approval. (`fix/batch-2-approval`, not merged)
- 2026-10-27: Review batch 1: demo mode off with a banner; "migrated" import closed; re-match undoes the first match; reversals unpay; incomplete invoices not paid; CJI3 role check; activity lines in own name only. (`fix/batch-1-critical`, not merged)
- 2026-10-27: Review of `main` by 9 persona agents: 178 findings, verdict "Do not ship" (`reviews/REVIEW.md`).
- 2026-10-26: Sign-up for verified @petronas.com addresses and reset password. (merged, PR #4)
- 2026-10-26: Vercel entry point (`server/app.js` default export), Firebase key from a setting. (merged, PR #3)
- 2026-10-26: Invoice approval, CJI3, Microsoft List, Invoice history, paid-only Payment Tables. (merged, PR #2)
- 2026-10-26: Overhaul (TriCipta landing, Control Tower). (merged, PR #1)
