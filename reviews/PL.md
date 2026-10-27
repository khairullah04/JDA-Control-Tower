# PL review: scope, release readiness, risk

Reviewer: PL (project lead). Scope: whole repo at `main` 89e49bf. `npm test` in `server/` run: 193/193 pass.

## Feature status (CONTEXT feature list)

| # | Feature | Status | Evidence |
|---|---|---|---|
| 1 | JDA 1-3 pages (cards, Overall/Weekly progress, Agreement & BRD, Master Page); JDA 4+ removed | **Partial** | Code: `web/shared/config/jdas.js:6-10` lists only jda1-3; `git grep` for jda4/JDA 4 hits only the removal script, its test and docs. Database: `OVERHAUL_CHECKLIST.md:76` "Script run against the real database … *Needs the service-account key*" unticked; `CHECKLIST.md:70` unticked. |
| 2 | Public landing + public Info pages; everything else private, @petronas only | **Partial** | Server side done (`server/app.js:23-78`, tests). Database side not: `OVERHAUL_CHECKLIST.md:200` "Until then the report documents stay publicly readable"; `CHECKLIST.md:71`, `:202` unticked. |
| 3 | Invoice tracker: Microsoft List, proof links, Outlook email | **Partial** | Built and tested (`CHECKLIST.md:136-175`), but the live tracker runs on sample data (`app-config.json:2` `"demoMode": true`, PL-01); never tried against a real List; recipients blank (`CHECKLIST.md:131` L3). |
| 4 | Approval workflow (current design: List + email; CJI3 = approval) | **Partial** | `workflow.js:4-10`. No record of the Lead's approval is kept (PL-05); old Approve / Route 1 moves still accepted by the API (PL-09). |
| 5 | Incremental CJI3 import → monthly Payment Tables vs sanctioned | **Partial** | Import, dedup, match, Payment Tables done. WBS mapping C3 missing (`CHECKLIST.md:31`, `:91`, `:114`). Never run on a real CJI3 export (CONTEXT assumptions). |
| 6 | End-of-year projections | **Missing (deferred by owner)** | `CHECKLIST.md:105` "Deferred by the owner." Only forecast-at-completion exists. |

## Overhaul checklist

| Item | Status | Evidence |
|---|---|---|
| JDA 4+ removed everywhere | Partial: code yes, database no | `OVERHAUL_CHECKLIST.md:76` unticked |
| "Portal" → JDA Control Tower everywhere | Done for user-facing text | `git grep "Portal" -- web server/*.js` hits only comments (`server/prompts.js:25`, `web/shared/styles/report.css:1,360`) and the Drive folder name "JDA Portal" (`server/portal-drive.js:25`, `drive-test-files/README.txt:3`), which is a real folder name users must create. |
| Landing page public, nothing else exposed | Partial | Server: yes. Firestore: unpublished rules (PL-02). |
| Invoice tracker reachable from Control Tower landing | Done | `web/control-tower/components/ct-sidebar.js:37-40`; `control-tower.js:132` pending link. |
| Definition of done | Not met | `OVERHAUL_CHECKLIST.md` "Definition of done": all five boxes unticked. |

## Findings

### [PL-01] Production Invoice Tracker and Control Tower cost rings run on browser-only sample data
- Category: WRONG
- Severity: Critical
- Confidence: High
- Location: web/control-tower/invoices/js/config/app-config.json:L2; web/control-tower/invoices/js/services/finance.js:L8; web/control-tower/invoices/js/services/demo/finance.js:L1-L9; web/control-tower/components/control-tower.js:L36-L42
- Evidence:
  - `"demoMode": true,` (flipped from `false` in commit 2fd9c81 "chore: ignore graphify output, update invoice app config")
  - `withBook(config.demoMode ? await import('./demo/finance.js') : await import('./live/finance.js'));`
  - `// Demo: the real register rules, run in this page over sample data. Edits last until the page is refreshed.` / `const f = createFinance(memoryStore()); await seedFinance(f);`
  - The Control Tower landing imports the same `services/finance.js`, so its cost % and pending counts are sample figures too.
- What's wrong: `main` is what Vercel production deploys. Every signed-in user sees made-up invoices, payments and cost rings, and every List pull, email send, CJI3 upload and sanctioned amount they enter is lost on refresh. No banner says it is a demo (`git grep "'demo'" -- web` outside `services/demo` finds nothing). The flip was buried in an unrelated chore commit.
- What it should be: `"demoMode": false` on `main`; demo only by an explicit local setting. Show a "DEMO DATA, nothing is saved" banner whenever `data().storage === 'demo'`.
- Impact: Wrong money figures shown to the Lead/stakeholders; silent loss of finance work; a demo today shows fictional numbers as real.

### [PL-02] Report documents still publicly readable in the live Firestore projects
- Category: MISSING
- Severity: Critical
- Confidence: High (stated in the repo's own checklist; not re-verified live, no network calls allowed)
- Location: OVERHAUL_CHECKLIST.md:L200, L209-L212; CHECKLIST.md:L71, L202; firebase/jda3-rules.txt:L1
- Evidence: "Until then the report documents stay publicly readable (the one outstanding High finding, Phase 2)." / "JDA 3's report document lives in another Firebase project (`jda3-9c0c5`) whose rules this repository does not control."
- What's wrong: The "nothing else exposed" requirement holds only for the Express server. The Firebase web config is public (`web/shared/config/firebase-config.js`), so anyone can read `jdaReports` (weekly tasks, owners, challenges, S-curve) directly from Firestore, bypassing the sign-in.
- What it should be: Release gated on: service-account key in place → access list copied → `cd firebase && npx firebase-tools deploy --only firestore`, plus JDA 3's project rules closed. Add a release checklist step that verifies a signed-out Firestore read is refused.
- Impact: Private programme data leaks; Phase 2 cannot be called done.

### [PL-03] Any verified @petronas.com employee can self-sign-up and gets full write access to finance data and the public site
- Category: RISK
- Severity: Major
- Confidence: High
- Location: server/auth.js:L49-L54; server/routes/finance.js:L10-L13, L74, L93-L102; server/.env.example:L12
- Evidence: `function refusal(email, { verified } = {}) { if (allowedEmails().includes(email)) return ''; if (!inDomain(email)) return ...; if (verified === false) return NOT_VERIFIED; return ''; }`; `// A role whose list is empty is open to anyone signed in.`; `.env.example` sets only `ROLE_PM=`.
- What's wrong: The audience changed from a short ALLOWED_EMAILS list to the whole company (PR #4), but authorisation did not change: no per-JDA access, roles empty by default, and `cji3/import`, `cji3/match`, `sanctioned/batch`, `/:kind`, `/:kind/delete` and `PUT /api/site/public` take no role check at all (`may(req)` is passed only to `entries/stage` and `list/send`).
- What it should be: Before go-live, an explicit editor/finance allowlist (e.g. `ROLE_FINANCE`, `ROLE_EDITOR`) required for every finance and site write; self-sign-up gives read-only access by default.
- Impact: Any staff member can change sanctioned amounts, mark invoices Paid (PL-04) or rewrite the public TriCipta AI page.

### [PL-04] A hand match marks any invoice Paid whatever the amounts, by anyone signed in
- Category: RISK
- Severity: Major
- Confidence: High
- Location: web/control-tower/invoices/js/finance/service.js:L322-L328; server/routes/finance.js:L74
- Evidence: `// a person's match is their confirmation, amount included: every line linked to the invoice pays it` / `if (stage !== 'paid') await moveStage([inv.id], 'paid', { byCji3: true, ... })`; route: `router.post('/cji3/match', run(req => finance.matchLine(String(req.body?.lineId || ''), String(req.body?.invoiceId || ''), actor(req))));` (no `may`).
- What's wrong: A RM 100 CJI3 line can be matched to a RM 1,000,000 invoice and the invoice becomes Paid; the Payment Table and Control Tower cost ring then count the full invoice as paid. No role, no second person, no amount warning on the server.
- What it should be: Refuse (or require a stated reason plus `accountant2` role) when `paidAgainst(...) !== 'equal'`; otherwise leave it `part_paid` / `amount_differs`.
- Impact: Wrong money in paid/sanctioned figures reported to leadership.

### [PL-05] No record of the Project Lead's approval exists anywhere in the system
- Category: MISSING
- Severity: Major
- Confidence: High
- Location: web/control-tower/invoices/js/finance/workflow.js:L4-L10, L33-L34
- Evidence: `// Approval happens outside the system ... the payment line in CJI3 is the proof that they were approved: matching one marks the invoice Paid from whatever open stage it is in.` / `...OPEN().map(from => ({ from, to: 'paid', action: 'Paid (CJI3)', by: 'cji3' }))` (OPEN includes `received`).
- What's wrong: Requirement 4 (accountant → PM → project lead) now has no lead step in the data: an invoice can go Received → Paid with no email sent, and the Lead's email reply is never captured. The audit trail shows who emailed, never who approved.
- What it should be: At least store the approval reference (approver email, date, email/message id) when the Lead replies, or flag "Paid without an approval request" when an invoice is paid from `received`/`with_pm`.
- Impact: Audit cannot show approval for paid invoices; stakeholders asking "who approved this?" get no answer from the system.

### [PL-06] CJI3 amount tolerance of 0.5 % auto-marks large invoices Paid with big differences
- Category: RISK
- Severity: Major
- Confidence: High
- Location: web/control-tower/invoices/js/finance/cji3.js:L122-L128
- Evidence: `export const TOLERANCE = minor => Math.max(100, Math.round(Math.abs(minor) * 0.005));`
- What's wrong: On a RM 5,000,000 invoice a payment RM 25,000 short counts as "equal" and the invoice becomes Paid with no human check. The rule is not among the owner decisions recorded in `CHECKLIST.md`, so it reads as an assumption, not a confirmed finance rule.
- What it should be: A fixed cap confirmed by finance, e.g. `Math.min(Math.max(100, Math.round(Math.abs(minor) * 0.005)), 10_000)` (RM 100), and the difference shown on the line.
- Impact: Under-payments hidden as Paid.

### [PL-07] Vercel production cannot keep pictures, Microsoft sign-ins or file data on disk
- Category: RISK
- Severity: Major
- Confidence: Medium (Vercel functions have a read-only, per-instance filesystem; confirm with a picture upload on production)
- Location: server/site-content.js:L355-L388; server/ms-graph.js:L44-L48; server/finance-store.js:L65-L72; server/portal-sync.js:L17
- Evidence: `export const UPLOAD_DIR = fileURLToPath(new URL('../web/public/assets/uploads/', import.meta.url));` / `writeAtomic(\`${dir}${key}.${ext}\`, bytes);`; `const TOKENS_FILE = ... './.ms-tokens.json'` with `catch (e) { console.warn('Microsoft sign-ins could not be kept on disk:' ...`; `const KINDS = ['firestore', 'file', 'memory'];` (memory accepted in production).
- What's wrong: Edit public site picture uploads, the Roles image, the device-code Microsoft sign-in and the Drive cache all write to the server folder. On Vercel these fail or live in one instance only; the Microsoft sign-in will be "lost" between requests. `FINANCE_STORE=memory` is accepted with `NODE_ENV=production`. There is no `vercel.json` in the repo, so the production setup is not reproducible from it.
- What it should be: Pictures and tokens in Firestore/Storage when running on Vercel; refuse `memory`/`file` when `NODE_ENV=production`; document the Vercel env in the repo.
- Impact: Edit public site and the Microsoft List pull break in production during the demo.

### [PL-08] Large CJI3 / List files will be refused on Vercel
- Category: RISK
- Severity: Minor
- Confidence: Medium (Vercel's 4.5 MB request body limit; confirm with a real CJI3 export's size)
- Location: server/app.js:L45-L46; server/routes/finance.js:L67-L69
- Evidence: `const big = express.json({ limit: '25mb' });` / `sheets = b.fileBase64 ? await readSheets(..., Buffer.from(String(b.fileBase64), 'base64'))`
- What's wrong: The file is sent as base64 inside JSON (+33 %). A CJI3 xlsx over ~3.3 MB exceeds Vercel's request limit before Express sees it; the 25 MB setting gives a false sense of headroom.
- What it should be: Parse in the browser and send rows in chunks, or upload to storage first; state the limit in the UI.
- Impact: Year-to-date CJI3 exports fail to upload with an unclear error.

### [PL-09] The API still accepts the retired in-app approval moves
- Category: WRONG
- Severity: Minor
- Confidence: High
- Location: web/control-tower/invoices/js/finance/workflow.js:L24-L32; server/routes/finance.js:L62
- Evidence: `{ from: 'received', to: 'sent_to_pd', action: 'Route 1: send direct to PD', ... }`, `{ from: 'pending_lead', to: 'to_be_paid', action: 'Approve: To Be Paid' }`, `{ from: 'pending_lead', to: 'rejected', action: 'Reject', note: true }`
- What's wrong: Owner decision 2026-10-22: "Nobody approves inside the system" (`CHECKLIST.md:173-175`). The UI buttons are gone but `POST /api/finance/entries/stage` still performs Approve/Reject/Route 1, with roles empty by default (PL-03).
- What it should be: Keep these moves only for reading old records; refuse new moves into `sent_to_pd` / `to_be_paid` (and Reject unless kept on purpose).
- Impact: A second, hidden approval path that contradicts the agreed process.

### [PL-10] Public landing page ships placeholder people and empty contacts
- Category: MISSING
- Severity: Major
- Confidence: High
- Location: server/site-content.js:L16, L33, L40-L43; OVERHAUL_CHECKLIST.md:L201
- Evidence: `const PERSON = { name: 'Name TBC', title: 'Title TBC' };` / `programLeads: [{ ...PERSON }], businessChampions: [{ ...PERSON }, { ...PERSON }]` / contacts all `''` ("To be announced"); checklist step 7 "Fill in the public page … rewrite the draft copy (A21)" open.
- What's wrong: Unless content was entered on production, the public TriCipta AI page shows "Name TBC" cards for every JDA, "To be announced" contacts and draft copy.
- What it should be: Content filled via Edit page before any public link is shared; ideally hide empty people/contacts sections instead of showing placeholders.
- Impact: Embarrassing in a stakeholder demo; it is the company-facing page.

### [PL-11] WBS mapping (C3) not built: JDA 1 vs JDA 2 split of the combined CJI3 file is unverified
- Category: MISSING
- Severity: Major
- Confidence: Medium
- Location: CHECKLIST.md:L31, L91, L114; web/control-tower/invoices/js/finance/cji3.js:L111-L118
- Evidence: `- [ ] **C3 — WBS → JDA/project list.** *... nothing built for it yet.*`; matching goes by `inGroup(l.group, e.jdaName) && refKey(e.invoiceNo) === ref`, narrowed by `coObject` only when several invoices share a number.
- What's wrong: Lines with no matching invoice Reference (or no Reference) cannot be attributed to a JDA/project at all, and "unmapped WBS kept as Unmapped" is untested. Requirement 5 ("feeding per-JDA monthly payment tables") is only met for lines that match an invoice.
- What it should be: Build C3 (WBS → JDA/project table, Unmapped list, applied on re-import) or record the owner's decision that only matched lines count.
- Impact: Paid-to-date per JDA understated for unmatched payments.

### [PL-12] Nothing has been run against a real CJI3 export, a real Microsoft List or a real sign-in
- Category: MISSING
- Severity: Major
- Confidence: High
- Location: reviews/CONTEXT.md "Assumptions"; OVERHAUL_CHECKLIST.md:L208
- Evidence: "No real data files (real CJI3 export, real List) are in the repo"; "Real Firebase sign-in not tried in this Codespace".
- What's wrong: The three external inputs (SAP CJI3 layout, PETRONAS SharePoint List columns + tenant policy on device-code sign-in and `Sites.Read.All`/`Mail.ReadWrite` consent, Firebase email delivery to petronas.com) are all faked in tests. Fallbacks exist for Graph (file export, `.eml`) but not for a CJI3 header change beyond refusing the file.
- What it should be: One end-to-end dry run on production with a real (redacted) CJI3 export and List export before release; keep a sample in `drive-test-files/` with its expected Payment Table.
- Impact: First real use may fail in front of stakeholders.

### [PL-13] Ask AI sends whole page context (finance figures) to an outside AI service
- Category: RISK
- Severity: Minor
- Confidence: Medium (whether PETRONAS policy allows this data to Anthropic is not recorded in the repo; confirm with the owner/IT)
- Location: server/routes/chat.js:L7, L15, L19-L23; web/control-tower/invoices/js/finance/cji3.js:L10
- Evidence: `MAX_CONTEXT_CHARS = 200_000` / `ask({ system: chatSystem(context), messages, maxTokens: 800 })`; CJI3 heading `"Forex Confidential - For PETRONAS Staff Only…"`.
- What's wrong: Invoice, partner and payment data marked "For PETRONAS Staff Only" can be sent to a third-party API, with no data-handling approval on record and no switch to turn it off besides removing the key.
- What it should be: A documented approval, or a `CHAT_ENABLED` setting off by default in production.
- Impact: Data-handling incident; scope creep beyond the tracker's purpose.

## Scope creep check (company payment system)
- No code writes to SAP or any payment system: CJI3 is read-only input (`server/routes/finance.js:67-69`), email is draft/`.eml`/mailto only (`CHECKLIST.md:156-158`). No finding.
- Extra scope beyond the brief: Ask AI (PL-13), Drive invoice inbox with AI reading of PDFs (`server/routes/drive.js`), Microsoft Calendar card (`web/shared/config/jdas.js:15-18`, placeholder `'YOUR_AZURE_AD_CLIENT_ID'`, hidden).

## Must-fix before release vs can wait
- **Must fix**: PL-01, PL-02, PL-03, PL-04, PL-07, PL-10, PL-12; also run `remove-jdas.mjs --apply` (Feature 1).
- **Should fix soon**: PL-05, PL-06, PL-11.
- **Can wait**: PL-08, PL-09, PL-13; projections (deferred).

## Top 3 blockers
- PL-01: `demoMode: true` on main makes the live Invoice Tracker and Control Tower cost rings show sample data and drop every edit.
- PL-02: Firestore rules unpublished; report documents readable by anyone, bypassing sign-in.
- PL-03: open @petronas.com sign-up with no roles means any employee can change finance data and the public site.

## Missing entirely
- Publishing of `firebase/firestore.rules` and closing JDA 3's project rules.
- JDA 4+ removal run on the real database.
- WBS mapping (C3) and its test.
- Any record of the Lead's approval.
- End-of-year projections (deferred by owner).
- A demo-mode banner.
- Default email recipients / sign-off (L3 left blank).
- A repo-held Vercel configuration and a production smoke test (real CJI3, real List, real sign-in).
- Definition of done: all five boxes unticked.

## Out-of-lane flags
- Rate limits on sign-up/reset are in memory per instance (`server/rate-limit.js`); on Vercel they barely limit anything.
- Sign out does not revoke the session cookie server-side (`OVERHAUL_CHECKLIST.md:213`).
- `REQUIRE_AUTH=false` is only refused when `NODE_ENV=production` (`server/start.js:8`).
- `cors` defaults to `*` when `ALLOWED_ORIGIN` is unset (`server/app.js:42-43`).
