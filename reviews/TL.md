# TL review: maintainability, conventions, docs, handover

Scope: whole repository at `main` @ `89e49bf`, plus git history and branches (read-only). `npm test` run in
`server/`: 193 pass, 0 fail, no files left behind.

### [TL-01] Production `main` ships the Invoice Tracker in demo mode
- Category: WRONG
- Severity: Critical
- Confidence: High
- Location: web/control-tower/invoices/js/config/app-config.json:L2; README.md:L55-L58
- Evidence: `"demoMode": true,` and the README says to set it true *"on your own computer only"*: `set "demoMode": true in .../app-config.json and REQUIRE_AUTH=false ... (which opens every private page, so never on a network)`.
- What's wrong: Vercel production deploys `main`, so the live Invoice Tracker uses browser-only sample data. Invoices, CJI3 matches and Payment Tables entered there are not saved to the server. Nothing in the repo stops a local demo setting from being committed, and no test checks it.
- What it should be: `"demoMode": false` on `main`. Add a test that fails when `main`'s committed config has `demoMode: true`. Better still, let the server decide demo mode (for example, demo only when `REQUIRE_AUTH=false`), so it is not a committed file flag:
  ```json
  { "demoMode": false, ... }
  ```
- Impact: People see made-up money figures in production and lose the work they enter. This blocks the release.

### [TL-02] Vercel deployment config exists only in the Vercel dashboard
- Category: MISSING
- Severity: Major
- Confidence: High
- Location: server/app.js:L93-L108 (repo root has no `vercel.json`)
- Evidence: `git ls-files | grep -i vercel` returns nothing. app.js: `// Vercel runs this file as a function ... export default async function vercel(req, res)`.
- What's wrong: Several settings are not written down anywhere in the repo: how all paths reach `server/app.js` (the rewrites), the project's Root Directory, the Node version (`engines` is only in `server/package.json`), which files are bundled (`web/` is reached through literal `../web/...` URLs), and the function's timeout. They live only in the owner's Vercel project. The docs list environment variables but not the project settings.
- What it should be: Commit a `vercel.json` with the rewrites to the function, the Node runtime, `includeFiles: "web/**"` and `maxDuration`. Document the Root Directory in docs/server-and-invoices.md "Running on Vercel".
- Impact: A new owner cannot recreate or fix production from the repo. A dashboard change by one person silently changes routing or bundling.

### [TL-03] The Vercel environment table leaves out settings the features need
- Category: MISSING
- Severity: Major
- Confidence: High
- Location: docs/server-and-invoices.md:L309-L315
- Evidence: The table lists only `FINANCE_STORE`, `FIREBASE_SERVICE_ACCOUNT`, `SESSION_SECRET`, `FIREBASE_API_KEY`, `ALLOWED_EMAILS`. `.env.example` also has `ANTHROPIC_API_KEY`, `DRIVE_ROOT_FOLDER_ID`, `ROLE_PM`, `MS_TENANT_ID`…`MS_LIST_URL`, `CLAUDE_MODEL`, `PORTAL_DRIVE_ROOT_FOLDER_ID`, `JDA3_GOOGLE_APPLICATION_CREDENTIALS`.
- What's wrong: Someone who follows the doc gets a production site where Ask AI, Drive sync, the role limit on emailing the Lead (`ROLE_PM` empty means anyone) and the List pull fail or are wide open. Nothing warns them. There is also no Vercel equivalent for `JDA3_GOOGLE_APPLICATION_CREDENTIALS`, which is a file path and so cannot be used where there is no disk.
- What it should be: One table with every variable, marked required, optional, or not supported on Vercel, and a JSON or base64 way to pass the JDA 3 key (like `FIREBASE_SERVICE_ACCOUNT`).
- Impact: Production is half-configured, and `ROLE_PM` is left open without anyone knowing.

### [TL-04] Docs say "one process only", but production runs on serverless
- Category: RISK
- Severity: Major
- Confidence: High
- Location: docs/server-and-invoices.md:L295-L296; server/rate-limit.js:L1-L5
- Evidence: Docs: `**One process only.** The rate limits and the "one sync at a time" rule are kept in the process's memory. Do not run two copies behind a load balancer.` rate-limit.js: `Enough for one server process ... several processes would each keep their own count.`
- What's wrong: Vercel starts as many instances as it needs. The sign-up and reset limit (5 per 15 minutes), the chat limit and the one-sync-at-a-time lock therefore apply per instance, and reset on every cold start. The docs state a rule that the chosen host breaks, and record no decision about it.
- What it should be: Either keep these counters and the lock in Firestore (or another shared store), or state in the docs that on Vercel the limits are best-effort per instance and that the rule is accepted for now.
- Impact: The abuse limits on sign-up, reset and AI spend do not hold, and two Drive syncs can run at the same time.

### [TL-05] Setup steps contradict the sign-up flow
- Category: WRONG
- Severity: Major
- Confidence: High
- Location: docs/server-and-invoices.md:L230-L231 (against L32-L39 of the same file)
- Evidence: `4. Authentication > Users > Add user, once for each person. A username aina is the address aina@jda.app. There is no "create account" on the site.` The same file's Sign-in section says: `**Create an account** takes an @petronas.com address`.
- What's wrong: The Setup steps predate the change to sign-up (f7dc100) and were never updated. They also don't say to enable Email/Password sign-in, set the password policy, or turn on email enumeration protection. Those appear only as unticked items at CHECKLIST.md:L201.
- What it should be: Step 4 should read: "Authentication > Sign-in method: enable Email/Password. Settings: password policy of 10+ characters with letters and numbers, email enumeration protection on. Add users by hand only for `ALLOWED_EMAILS` exceptions."
- Impact: A new admin creates accounts by hand or skips the hardening steps.

### [TL-06] Database rules are not published, and JDA 3's rules are a text file to paste by hand
- Category: MISSING
- Severity: Major
- Confidence: High
- Location: firebase/jda3-rules.txt:L17-L29; firebase/firebase.json:L2; CHECKLIST.md:L71, L202
- Evidence: jda3-rules.txt: `In that project's console ... replace the report block with: match /report/{doc} { allow read: if true; ...}`. CHECKLIST: `- [ ] Owner, with the key: publish the Firestore rules`, `- [ ] Owner: publish the updated firestore.rules (needs the key).` firebase.json covers only one project.
- What's wrong: The rules that close the database to the public exist only in git. No deploy target, `.firebaserc` or script covers either project. JDA 3's rules are prose to copy and paste, so nothing records what is live there.
- What it should be: Add a `.firebaserc` with both projects as aliases, and a real `firestore.jda3.rules` deployable with `firebase deploy --only firestore:rules --project jda3`. Make publishing a numbered release step with a check, for example the existing `firestore-rules.test.mjs` run against the emulator before each release.
- Impact: The live data stays readable under the old rules (CONTEXT: `jdaReports` was observed publicly readable). There is no record of what is deployed.

### [TL-07] Requirement and branch docs at the root are stale and contradict the current design
- Category: WRONG
- Severity: Major
- Confidence: High
- Location: CHECKLIST.md:L3, L10; BRANCH_DEMO.md:L1-L3; OVERHAUL_CHECKLIST.md:L88, L94, L98
- Evidence: CHECKLIST.md: `Branch feature/invoice-approval-cji3 ... Not merged, not for main until the owner says so.` and `**Approvals happen on dashboards in the app**, not by email`. BRANCH_DEMO.md: `Demo: main and feature/invoice-approval-cji3 side by side` (that branch was merged in #2). OVERHAUL_CHECKLIST refers to `jda/firestore.rules`, `site/public/roles.jpg` and `jda/server/site-content.js`, paths removed by 4099eaf.
- What's wrong: Three root-level documents describe a repo and a decision that no longer exist. The owner decision of 2026-10-22 (the List and email replace in-app approval) is the reverse of CHECKLIST.md:L10.
- What it should be: Move the checklists into `docs/history/` or delete BRANCH_DEMO.md. Add one current `docs/decisions.md` (date, decision, who decided) that replaces the "Decided" blocks. Fix or drop the stale paths.
- Impact: The next maintainer builds against an approval design the owner has already rejected.

### [TL-08] The old approval state machine and its endpoint are still live, with no UI calling them
- Category: FUNDAMENTALLY WRONG
- Severity: Major
- Confidence: High
- Location: web/control-tower/invoices/js/finance/workflow.js:L24-L36; server/routes/finance.js:L46-L62
- Evidence: workflow.js: `{ from: 'pending_lead', to: 'to_be_paid', action: 'Approve: To Be Paid' }`, `{ from: 'pending_lead', to: 'rejected', action: 'Reject', note: true }`. finance.js:L62: `router.post('/entries/stage', run(req => finance.moveStage(...)))`. finance.js:L48: `"An invoice's status changes through Approvals..."`. `grep moveStage js/ui main.js` finds nothing.
- What's wrong: The design says approval happens by email and a CJI3 line is the proof. The code still keeps Route 1, Sent to PD, To Be Paid, Reject and Restore as moves anyone can make through the API, and only `services/*` reference them. The error text sends users to an "Approvals" page that no longer exists as a queue. Two approval models live side by side, and only one is documented.
- What it should be: Reduce MOVES to the moves the current design uses (`received→with_pm→pending_lead` through `sendListToLead`, plus `*→paid` and undo through CJI3). Keep the old stages read-only for legacy records. Remove `/entries/stage`, or limit it to an explicit admin role. Fix the 410 message to say the List and CJI3 payments change an invoice's status.
- Impact: Dead code that changes money statuses can be called, and its behaviour is undocumented. Every future change to stages has to keep both models working.

### [TL-09] First use seeds made-up projects, RM 2,000,000 budgets and hard-coded 2026 dates into the real Firestore
- Category: RISK
- Severity: Major
- Confidence: High
- Location: web/control-tower/invoices/js/services/live/db.js:L13-L27; web/control-tower/invoices/js/config/app-config.json:L6-L14
- Evidence: `for (const j of config.defaultJdas) { ... addDoc(collection(db, 'projects'), { jdaId: jRef.id, name: code, budgetMinor: toMinor(config.defaultSubProjectBudget), startDate: '2026-01-01', endDate: '2026-12-31' })`. Config: `"subProjects": ["AA", "AB", "AC"] ... "Unsorted" ... "defaultSubProjectBudget": 2000000`.
- What's wrong: The live (non-demo) code path writes placeholder project codes, a magic budget and literal dates into the production database. It does this from the browser of whoever opens the tracker first. The real project list per JDA is not documented, and there is no seed script that an operator runs on purpose.
- What it should be: Remove seeding from the browser. Add a `server/scripts/seed.mjs` with a dry run and `--apply` (like the other scripts), reading a reviewed data file of real JDA projects. Move dates and budgets into that file, not code.
- Impact: Fake projects and budgets turn up in the real register and its exports, and they are hard to tell from real ones.

### [TL-10] JDA identity is defined in four places with different keys
- Category: RISK
- Severity: Major
- Confidence: High
- Location: web/shared/config/jdas.js:L6-L10; web/control-tower/invoices/js/config/app-config.json:L6-L11; web/control-tower/invoices/js/config/email-recipients.js:L4-L8; web/control-tower/invoices/js/finance/cji3.js:L31-L33
- Evidence: jdas.js `{ id: 'jda1', name: 'JDA 1' }`; app-config `{ "name": "JDA 1", ... }, { "name": "Unsorted" }`; email-recipients `'JDA 1': { to: '' ... }`; cji3.js `GROUPS = { jda12: { jdas: ['jda1','jda2'] } }`, `jdaKey = name => String(name).toLowerCase().replace(/\s+/g,'')`.
- What's wrong: The tracker's Firestore JDAs have auto ids and are joined to everything else by display name. CJI3 groups turn the name into an id. Email recipients are keyed by name. Renaming "JDA 1" (it can be edited in the tracker) quietly takes it out of its CJI3 group, its Payment Table and its email recipients. Adding a JDA means editing four files, but jdas.js:L5 claims "Adding a JDA here adds it everywhere".
- What it should be: One registry, `web/shared/config/jdas.js`, holding the `id`, the CJI3 group and the recipients. Firestore JDA docs store that `id` (`jdaKey`), and every join uses the id, never the name.
- Impact: A rename leaves paid invoices off the Payment Table and the cost ring, with no error.

### [TL-11] Approval email recipients are blank and kept in front-end source
- Category: MISSING
- Severity: Major
- Confidence: High
- Location: web/control-tower/invoices/js/config/email-recipients.js:L1-L9
- Evidence: `'JDA 1': { to: '', cc: '', greeting: '' }, ... export const SIGN_OFF = '';`, and the comment says `Left blank for now ... "[Project Lead]" / "[Your name]" in the text, to fill in there.`
- What's wrong: Who approves each JDA's invoices is a core business rule. It is not set, it has no owner, and changing it means a code change and a redeploy. The README and docs never say who must fill it in.
- What it should be: Store the recipients per JDA in Firestore (editable by an admin in the app) or in the single JDA registry (TL-10). Add a handover item: "Owner supplies the Project Lead and CC per JDA."
- Impact: Every approval email goes out unaddressed and relies on the PM typing the right Lead each time. The approval path has no audit of who it was sent to.

### [TL-12] No CI, lint or format gate, and Vercel deploys `main` without running tests
- Category: MISSING
- Severity: Major
- Confidence: High
- Location: OVERHAUL_CHECKLIST.md:L171; repo root (no `.github/`, no lint config)
- Evidence: `A9 | There is no build, lint or type-check in this repository; npm test plus node --check stand in for it.` 333 lines over 200 characters in tracked JS (e.g. 27 in web/control-tower/config/jda-content.js, 22 in js/ui/cji3-lines.js, 18 in js/finance/service.js).
- What's wrong: The 193 tests run only when someone remembers to. Merges #1–#4 went straight to production. The very long one-line functions in the money logic are hard to review and to diff.
- What it should be: A GitHub Actions workflow running `cd server && npm ci && npm test` on every PR, with branch protection on `main`. Add Prettier or ESLint with a line-length rule, applied to `js/finance/` first.
- Impact: A regression in the money rules reaches production the moment it is merged.

### [TL-13] The server-and-invoices folder map is out of date
- Category: WRONG
- Severity: Minor
- Confidence: High
- Location: docs/server-and-invoices.md:L3-L15
- Evidence: `web/ ... css/ base · layout ...`, `js/finance money · core · sheets · service · book`, `js/ui jda · project · cji3 · payments · ...`, `firestore.rules · firestore.indexes.json · firebase.json` listed at top level.
- What's wrong: It leaves out `finance/workflow.js`, `cji3.js`, `list-source.js` and `email.js`, and `ui/approvals.js`, `list-invoices.js`, `cji3-lines.js` and `column-filter.js`, which are the files with the core current features. The rules files are in `firebase/`, not here.
- What it should be: Regenerate the map from `ls` (CONTEXT.md's map is accurate and can be copied).
- Impact: A maintainer cannot find the List or CJI3 code from the docs.

### [TL-14] README is behind the code
- Category: WRONG
- Severity: Minor
- Confidence: High
- Location: README.md:L33, L82-L84
- Evidence: `About a hundred tests` (there are 193). The map lists only `OVERHAUL_CHECKLIST.md`. There is no mention of Vercel, sign-up, the Microsoft List, CJI3 or `drive-test-files/`.
- What's wrong: The README is the entry point, but it describes the system as it was before the List, CJI3 and sign-up work and before Vercel. It does not point to where production runs or how to deploy.
- What it should be: Add a "Where it runs" section (Vercel, `main`, link to "Running on Vercel"), list all root docs, the real test count, and the sample data in `drive-test-files/`.
- Impact: Onboarding takes longer, and people may deploy to the wrong host.

### [TL-15] Names in the code don't match what screens and routes are called
- Category: RISK
- Severity: Minor
- Confidence: High
- Location: web/control-tower/invoices/js/ui/cji3.js, ui/cji3-lines.js; CONTEXT routing `#/cji3` = Invoice history, `#/cji3-lines` = CJI3 payments; OVERHAUL_CHECKLIST.md:L89
- Evidence: Commit 6c0b9a3 `feat(history): the CJI3 register becomes Invoice history`, but the file and route are still `cji3`. OVERHAUL_CHECKLIST: `Left: internal names (portal/ folder, /api/portal, portalApi)`.
- What's wrong: The screen called "Invoice history" lives in `cji3.js` at `#/cji3`, and "CJI3 payments" is `cji3-lines.js`. "portal" still names the API. A newcomer will edit the wrong file.
- What it should be: Rename to `ui/history.js` and `#/history` (keep `#/cji3` as a redirect), and `ui/cji3-lines.js` to `ui/cji3-payments.js`.
- Impact: Ongoing confusion that makes every change slower.

### [TL-16] Server business logic lives inside a private front-end page folder
- Category: RISK
- Severity: Minor
- Confidence: High
- Location: server/app.js:L13
- Evidence: `import { createFinance } from '../web/control-tower/invoices/js/finance/service.js';`
- What's wrong: The server's money rules (service, workflow, cji3, money) live under one SPA's UI folder. Moving or renaming the Invoice Tracker page breaks the server. The folder is also served as static files under `/control-tower/invoices/js/finance/`, which the browser needs, but it hides that the code is shared.
- What it should be: Move it to `web/shared/finance/` (private if needed) or a top-level `finance/` package imported by both, and document it as shared code.
- Impact: Refactoring the front end can break the server's money logic.

### [TL-17] Old passkey file remains in git history
- Category: RISK
- Severity: Minor
- Confidence: High
- Location: `git show b020108:jda/server/portal-passkeys.json` (deleted in d701a2d)
- Evidence: `{ "jda1": "1001", "jda2": "2002", "jda3": "3003", "jda4": "4004" }`
- What's wrong: Real-looking access codes were committed and then deleted, but they stay in history on GitHub. Passkeys are superseded now. If any of these codes were reused anywhere, they are public.
- What it should be: Confirm they are not reused anywhere. If they are, rotate them. Rewriting history is optional.
- Impact: Low now. Shown here as the one case of a file that should never have been committed.

### [TL-18] Merged branches never deleted
- Category: RISK
- Severity: Nit
- Confidence: High
- Location: `git branch -a`
- Evidence: `feature/invoice-approval-cji3 7 0`, `feature/petronas-signup 1 0`, `fix/software-review 77 0`, `fix/vercel-entry 3 0`, `overhaul/tricipta-landing 43 0` (main ahead / branch ahead), locally and on `origin`.
- What's wrong: All five branches are fully merged but still exist. BRANCH_DEMO.md still points people at one of them.
- What it should be: Delete them locally and on `origin`, and turn on "automatically delete head branches" in GitHub.
- Impact: Clutter, and people check out stale code.

### [TL-19] Leftover repo tooling files
- Category: RISK
- Severity: Nit
- Confidence: High
- Location: .gitattributes:L1; .gitignore (graphify-out/); .claude/agents/*.md
- Evidence: `.gitattributes`: `graphify-out/graph.json merge=graphify`, while `.gitignore` has `graphify-out/`. Nine persona files are tracked under `.claude/agents/`.
- What's wrong: There is a merge driver for a path that is ignored. The AI reviewer personas are shipped in the product repo, and Vercel bundles them.
- What it should be: Drop the `.gitattributes` line, and decide whether `.claude/` belongs in the product repo (if it does, add it to `.vercelignore`).
- Impact: Noise.

### [TL-20] Placeholder Microsoft Calendar client id kept in the JDA registry file
- Category: RISK
- Severity: Nit
- Confidence: High
- Location: web/shared/config/jdas.js:L15-L19
- Evidence: `export const MS_CLIENT_ID = 'YOUR_AZURE_AD_CLIENT_ID';` (report.js:L586 hides the feature while it starts with `YOUR_`).
- What's wrong: An unrelated integration setting sits in the JDA list. The value is a placeholder that a sentinel check reads, and it changes only by editing code.
- What it should be: Move it to `web/shared/config/integrations.js`, or have the server provide it at runtime.
- Impact: Small. It makes the "one JDA registry" harder to keep clean.

## Report ending

**Top 3 blockers**
- TL-01: production `main` runs the Invoice Tracker on browser-only sample data (`demoMode: true`).
- TL-06: the database rules are not published, and JDA 3's rules are text to paste by hand. The live data is still under the old, open rules.
- TL-08: an undocumented second approval path (Approve/Reject/To Be Paid through `/entries/stage`) contradicts the email-plus-CJI3 design.

**Missing entirely**
- `vercel.json` / committed deployment config, `.firebaserc`, and a deployable JDA 3 rules file.
- CI (tests on PR), branch protection, a linter or formatter.
- A release checklist (demoMode off, rules published, environment variables complete, backup taken).
- A decision log separate from the checklists (who decided what, when).
- A real seed or reference file of JDA projects and partners, and an owner for Project Lead email recipients.
- A runbook for the person taking over: who owns the Firebase projects, the Vercel project, the Azure app, the Drive folders and the Anthropic key, and how to rotate each secret.
- A Vercel note on how the JDA 3 service-account key is supplied there.
- The real CJI3 and List samples (only synthetic Drive samples exist).

**Out-of-lane flags**
- Security: `/api/finance/entries/stage` lets any signed-in user approve or reject through the API when `ROLE_PM` is empty, which bypasses the email approval (server/routes/finance.js:L50-L62).
- Security: JDA 3's `report` collection is `allow read: if true` (firebase/jda3-rules.txt:L21-L24).
- Security: there is no per-JDA access control; every signed-in @petronas.com user can see and act on all finance data.
- Security/ops: sign-up and reset rate limits are in-memory per Vercel instance (server/rate-limit.js:L1-L3).
- Ops: uploaded pictures and Microsoft device-code tokens are stored on local disk and don't work on Vercel (docs/server-and-invoices.md:L318-L320).
