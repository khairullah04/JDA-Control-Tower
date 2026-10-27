# Review context: TriCipta AI / JDA Control Tower

Scope: the **entire repository** at `main`, commit `89e49bf` ("Merge pull request #4 … petronas-signup"),
2026-10-27. Reviewers read this first and do not re-map the repo.

## Stack

- **Front end**: plain HTML, CSS and ES modules in `web/`. No build step, no framework. Vendored libraries in
  `web/shared/vendor/` (Firebase JS SDK, Chart.js, SortableJS).
- **Server**: Node ≥ 22.3 + Express 4, ES modules, in `server/`. Serves `web/` and the `/api`.
- **Data**: Firebase. Firestore (project `test-invoice-c38a4`; JDA 3's report lives in a second project
  `jda3-9c0c5`) and Firebase Auth (email + password). The server writes Firestore with `firebase-admin` and a
  service-account key. Without the key, finance data goes to a local JSON file (`server/.finance-data.json`)
  or memory (`FINANCE_STORE`).
- **Hosting**: Vercel (production `jda-control-tower.vercel.app`, branch `main`). `server/app.js` default
  export is the Vercel function; `server/server.js` is the local entry. Both use `server/start.js`.
  There is **no PHP, no XAMPP, no SQL database, no PHPMailer**; the "SQLi / XAMPP / PHPMailer" checks in the
  personas resolve to "not applicable" unless remnants are found.
- **Other services**: Anthropic Claude API (Ask AI chat, reading invoice PDFs from a Google Drive inbox),
  Google Drive (invoice inbox, JDA report feed), Microsoft Graph (the Microsoft List of invoices, Outlook
  drafts), Bank Negara Malaysia public forex API.
- **Tests**: `cd server && npm test` (node:test, ~193 tests, all passing at this commit). No browser/E2E suite.

## Folder map and entry points

```
web/public/            public: landing (/), /login (sign in, sign up, reset), /jda/<id>/info (Master Page)
web/control-tower/     private: Control Tower landing (/control-tower/), per-JDA pages
  index.html             Control Tower landing (JDA cards, progress and cost rings)
  jda-report.html        /control-tower/<jda>/overall-progress and /weekly-progress
  documents.html         /control-tower/<jda>/documents (Agreement & BRD)
  site.html              /control-tower/site (Edit public site)
  components/ lib/       Control Tower UI; lib/jda-figures.js = cost %, progress, overrides
  invoices/              the Invoice Tracker SPA (/control-tower/invoices/#/...)
    js/main.js             hash router: #/jda/<id>, #/project/<id>, #/approvals[/<jda>], #/cji3[/<jda>]
                           (Invoice history), #/cji3-lines/<group> (CJI3 payments), #/payments/...
    js/finance/            pure business logic shared by browser and server:
      core.js                money amounts, Payment Table rows (paymentTable, tableTotals), statuses
      money.js               integer minor units, rounding (half away from zero), fmt/toMinor
      workflow.js            stages and allowed moves (state machine)
      service.js             createFinance(store): every finance write, atomic, with audit lines
      cji3.js                CJI3 xlsx reading, dedup key, matching to invoices, amount tolerance
      list-source.js         Microsoft List rows -> items, automatic column detection, proof links
      email.js               Outlook-safe HTML, .eml file, mailto
      sheets.js              CSV/XLSX import/export, legacy migration
      book.js                browser-side cache of the register
    js/services/           live/ (calls /api) vs demo/ (runs createFinance in the browser on sample data)
    js/ui/                 pages: approvals.js (Microsoft List view), list-invoices.js, cji3.js (Invoice
                           history), cji3-lines.js (CJI3 payments), payments.js (Payment Tables), jda.js,
                           project.js, timeline.js, column-filter.js, finance-ui.js, finance-io.js
    js/config/app-config.json  "demoMode": TRUE on main (see assumptions)
web/shared/            public: config/jdas.js (JDA 1-3), config/firebase-config.js, lib/session.js
server/
  start.js app.js server.js   start-up, routes table (top of app.js lists public vs private), entry
  auth.js session.js          sign-in check, session cookie, sign-up/reset routes
  routes/finance.js           /api/finance/* (register, stages, CJI3, List, email draft, sanctioned)
  routes/portal.js site.js    JDA report documents, landing/Master Page content, picture uploads
  routes/chat.js drive.js     Ask AI, Drive invoice inbox
  finance-store.js            firestore | file | memory store
  firebase-admin.js           service-account key (file or FIREBASE_SERVICE_ACCOUNT env)
  ms-graph.js                 Microsoft List read + Outlook drafts (app registration or device-code sign-in)
  errors.js                   userError/publicMessage (hide outside-service errors from the browser)
  rate-limit.js forex.js      in-memory rate limit; Bank Negara rates
  scripts/                    backup, restore, remove-jdas, migrate-tasks, file->firestore
firebase/firestore.rules     browser access rules (closed by default)
docs/                         control-tower.md, server-and-invoices.md
CHECKLIST.md OVERHAUL_CHECKLIST.md BRANCH_DEMO.md   requirement checklists
```

## How auth works

1. `/login` (`web/public/components/login.js`): Firebase `signInWithEmailAndPassword` in the browser, then
   POST `/api/auth/session` with the Firebase ID token. The server checks the token with Google's REST
   `accounts:lookup` (`FIREBASE_API_KEY`), then `refusal(email, {verified})` in `server/auth.js`:
   allowed if the email is in `ALLOWED_EMAILS` (exceptions), or ends in exactly `@petronas.com` **and** is
   verified. It then sets an HMAC-signed session cookie `ct_session` (8 h, HttpOnly, SameSite=Lax;
   `server/session.js`).
2. Sign-up: POST `/api/auth/signup` (domain + password checks on the server, then Firebase REST `signUp`
   and `sendOobCode VERIFY_EMAIL`). Reset: POST `/api/auth/reset`. Both rate-limited 5 / 15 min per IP
   (in-memory, per instance).
3. `requireUser` guards `/api/*` (cookie, or `Authorization: Bearer <Firebase ID token>`), and refuses
   non-JSON writes (CSRF guard). `requirePage` guards `/control-tower/*` (redirect to /login).
4. `REQUIRE_AUTH=false` disables all checks (refused at start when `NODE_ENV=production`).
5. Browsers also read some Firestore collections directly (jdas, projects, meta, activity,
   processedFiles, jdaReports); `firebase/firestore.rules` allow that for verified @petronas.com or the
   `access/allowlist` doc. **These rules are not yet published**: the live project still has old rules
   (jdaReports was observed publicly readable).
6. Roles: `ROLE_PM` (env, emails) limits who may email List invoices to the Lead; empty = anyone.
   Separation of duties: the person who moved an invoice to Pending Lead cannot also approve it.
   There is **no per-JDA access control**: every signed-in user sees and acts on every JDA.

## Data flow

- **Invoices before approval**: Microsoft List (SharePoint). The PM pulls it (Graph, via app registration
  or the person's own device-code sign-in, tokens in `server/.ms-tokens.json`), or imports an export
  (.xlsx/.csv). Columns are mapped automatically (`autoMapping`). The PM ticks invoices and clicks
  Generate Email: preview -> .eml download / copy HTML + mailto / Outlook draft via Graph. Doing so calls
  `sendListToLead`: each item becomes a draft register invoice (`source: 'list'`) and moves
  Received -> With PM -> Pending Lead approval; the email is logged in `listEmails`.
- **Approval** happens outside the system, by email. There are no approve/reject buttons in the UI any more.
- **CJI3** (SAP payment export, xlsx) is uploaded per file group (JDA 1+2, JDA 3) on CJI3 payments.
  Lines are deduplicated by a key, stored in `cji3Lines`, and matched to invoices by Reference (invoice
  number), amount-aware (tolerance max(RM1, 0.5%)): exact -> invoice becomes **Paid** from any open stage
  (CJI3 is the proof of approval and payment); less -> part_paid; more -> amount_differs; several ->
  ambiguous; none -> none. Undoing a match returns the invoice to the stage it was in (`paidFrom`).
- **Payment Tables**: per JDA / project / CJI3 file group, one row per project + partner + month:
  sanctioned amounts (w TAX) vs **paid invoices only**; variance and over/within/under flag. Derived on the
  fly from sanctioned records + invoices (nothing stored).
- **Sanctioned amounts** are the plan ("planned = sanctioned"), entered/imported on the Payment Table.
- **Invoice history** (#/cji3): every invoice whatever its status, filter by JDA, partner, status.
- **Control Tower** cost ring: paid / sanctioned (w TAX) per JDA, from the same Payment Table maths
  (`web/control-tower/lib/jda-figures.js`); progress from the JDA report documents.

## Where the approval workflow and CJI3 import live

- Workflow: `web/control-tower/invoices/js/finance/workflow.js` (STAGES, MOVES, checkMove, applyMove,
  unpaidStage), executed by `service.js` `moveStage`, server route `POST /api/finance/entries/stage`
  (`server/routes/finance.js`, with `may(req)` role + separation-of-duties check).
- List -> Lead: `service.js` `sendListToLead`, UI `js/ui/list-invoices.js` and `js/ui/approvals.js`.
- CJI3: `js/finance/cji3.js` (readCji3, planCji3, candidatesFor, paidAgainst), `service.js`
  `importCji3`, `matchCji3`, `matchLine`; routes `/api/finance/cji3/*`; UI `js/ui/cji3-lines.js`.

## Feature list (as required)

1. JDA 1-3 pages (Control Tower cards, Overall/Weekly progress, Agreement & BRD, Master Page). JDA 4+ removed.
2. Public TriCipta AI landing page and public JDA Info pages; everything else private and @petronas-only.
3. Invoice tracker: Microsoft Lists data, supporting-document links (from the List), Outlook email generation.
4. Approval workflow: originally accountant -> PM -> project lead. **Current design (owner decision
   2026-10-22)**: the List + email replaces in-app approval; CJI3 payment line = approval.
5. Incremental CJI3 xlsx import (tax, forex conversion, payment status) feeding per-JDA monthly payment
   tables checked against sanctioned amounts.
6. End-of-year projections: **deferred by the owner**; only a "forecast at completion" exists
   (`js/services/analytics.js`).

## Assumptions made for this review

- `main` is the release candidate; Vercel production deploys `main`.
- `demoMode: true` in `app-config.json` on main is a known open question (it makes the live Invoice
  Tracker run on browser-only sample data); reviewers should treat it as a finding, not as intended.
- No real data files (real CJI3 export, real List) are in the repo; `drive-test-files/` holds samples.
- "Accountant -> PM -> project lead" is interpreted against the current List/email design above.
- Personas' PHP/XAMPP/SQL/PHPMailer checks are answered "not applicable" unless remnants exist.
- Ignore `node_modules/`, `graphify-out/`, `backups/`, `web/shared/vendor/` (third-party) except for
  dependency-vulnerability checks.
