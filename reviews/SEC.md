# SEC review: cybersecurity (main @ 89e49bf)

Scope: whole repo at `main`. Checks run: `cd server && npm test` (193/193 pass), `npm audit --offline` ("0 vulnerabilities",
but offline mode has no advisory data, so this proves nothing), git history grep for secrets.
Not applicable (no remnants found): SQL injection, XAMPP default credentials, PHPMailer, PHP debug mode.

---

### [SEC-01] Any signed-in user can mark any invoice Paid by sending a fake "migrated" import
- Category: WRONG
- Severity: Critical
- Confidence: High
- Location: server/routes/finance.js:L101-L102; web/control-tower/invoices/js/finance/core.js:L69; web/control-tower/invoices/js/finance/workflow.js:L49-L50; web/control-tower/invoices/js/finance/service.js:L32
- Evidence:
  ```js
  // finance.js:101
  const imported = req => (...inputs).map(i => kindOf(req) === 'entry' && i?.source !== 'migrated' ? { ...noHandStatus(i), status: 'pending' } : i);
  // core.js:69
  status: pick('status') || 'pending',
  // workflow.js:49-50
  const STAGE_OF = { pending: 'received', approved: 'to_be_paid', paid: 'paid', rejected: 'rejected' };
  export const stageOf = entry => STAGES.includes(entry?.stage) ? entry.stage : STAGE_OF[entry?.status] || 'received';
  ```
- What's wrong: the request body decides whether the status filter is applied. If a request sets `"source":"migrated"`, its
  `status`/`stage` are kept. `POST /api/finance/entries/import` with `[{..., "source":"migrated", "status":"paid"}]` therefore
  creates an invoice that is already **Paid**, with no CJI3 line, no PM step and no Lead step. The audit line only says
  "import". The same trick works with `status:"approved"`, which lands the invoice in To Be Paid.
- What it should be: the client never gets to choose `source`. The one-time legacy migration should be a server-only script, or
  a route limited to an admin role and switched off after use.
  ```js
  const imported = req => (Array.isArray(req.body?.inputs) ? req.body.inputs : [])
    .map(i => kindOf(req) === 'entry' ? { ...noHandStatus(i), source: 'import', status: 'pending' } : i);
  ```
- Impact: anyone in the company can make paid figures up. Those figures feed the Payment Tables and the Control Tower cost
  ring (paid / sanctioned), so this is "wrong money" on every finance view.

### [SEC-02] The CJI3 upload and manual match have no role check, so the whole approval chain can be skipped
- Category: FUNDAMENTALLY WRONG
- Severity: Critical
- Confidence: High
- Location: server/routes/finance.js:L67-L75; web/control-tower/invoices/js/finance/service.js:L115, L300, L310-L327; web/control-tower/invoices/js/ui/cji3-lines.js:L145
- Evidence:
  ```js
  // finance.js:67-74: no may(req) is passed
  router.post('/cji3/import', run(async req => { ... b.fileBase64 ? await readSheets(...) : b.sheets; return finance.importCji3({...}, actor(req), ...) }));
  router.post('/cji3/match', run(req => finance.matchLine(String(req.body?.lineId || ''), String(req.body?.invoiceId || ''), actor(req))));
  // service.js:115: the default lets everything through
  async function moveStage(ids, to, { note = '', byCji3 = false, paidBy, may = () => '' } = {}, actor) {
  // service.js:327
  if (stage !== 'paid') await moveStage([inv.id], 'paid', { byCji3: true, ... }, actor);
  ```
  The UI says the opposite (cji3-lines.js:145): `"One not yet approved is linked, not moved."`
- What's wrong: under this design a CJI3 line *is* the approval. But any signed-in user can:
  1. post `sheets` as raw JSON (no file at all, so there is no proof it came from SAP), or
  2. hand-match any line to any open invoice.

  Either way the invoice goes to Paid from **Received**. `roleFor` maps CJI3 moves to `accountant2`, but the route never
  passes `may`. `ROLE_ACCOUNTANT2` is also no longer documented in `.env.example`. The route never compares the uploader with
  the person who created the invoice.
- What it should be: CJI3 import, rematch and match/unmatch limited to a named Accountant 2 list that is required (not
  "empty = anyone") in production. Pass `may(req)` into `importCji3`/`matchCji3`/`matchLine`. Refuse an upload by the person
  who created or sent the invoice. Accept only a real file (`fileBase64`), never pre-parsed `sheets`. Make the UI wording match
  what the server actually does.
- Impact: one person can create an invoice and mark it Paid alone. Separation of duties does not exist for the step that
  decides "paid".

### [SEC-03] Every verified @petronas.com employee can sign themselves up and gets full write access to finance, reports and the public site
- Category: FUNDAMENTALLY WRONG
- Severity: Critical
- Confidence: High
- Location: server/auth.js:L46-L51, L99-L113; server/routes/finance.js:L10-L13, L55-L61; .env.example (server/.env.example) `ROLE_PM=`; server/routes/site.js:L28-L36; server/routes/portal.js:L16-L28
- Evidence:
  ```js
  // auth.js: anyone in the domain, verified, gets in
  if (!inDomain(email)) return `Only @${SIGNUP_DOMAIN} addresses ...`;
  // finance.js:10-11
  // "A role whose list is empty is open to anyone signed in."
  if (role && list.length && !list.includes(me)) return `Only the ${ROLES[role]} may do this`;
  ```
  `.env.example`: `ROLE_PM=` … "Left empty, anyone signed in may." There is no ROLE_* for the Lead or Accountant 2 at all.
  Routes with no role check: `PUT /settings`, `POST /sanctioned/batch`, `POST /:kind/delete|restore|recalculate|import`,
  `PUT /api/site/public`, `POST /api/portal/save`.
- What's wrong: authentication ("is a PETRONAS employee") is being used as authorization. A whole national oil company's
  workforce can self-register and then change sanctioned amounts, delete or restore invoices, change settings (tax and forex),
  rewrite any JDA's report, and deface the public, PETRONAS-branded landing page and Master Pages. The default for every role is
  "open".
- What it should be: an explicit membership or role store (Firestore `members/{email}` with roles and JDA ids, managed by an
  admin) that is checked server-side on every write route, and denied by default. Self sign-up may create an account, but that
  account gets no rights until an admin grants them. In production the server should refuse to start with empty role lists.
- Impact: a single curious or hostile employee anywhere in the company can corrupt finance data or the public site.

### [SEC-04] No per-JDA access control (IDOR across JDAs)
- Category: MISSING
- Severity: Major
- Confidence: High
- Location: server/routes/finance.js:L28 (`/data`), L31-L34 (`/audit`), L95-L102; server/routes/portal.js:L16-L28
- Evidence:
  ```js
  router.get('/data', run(async () => ({ ...(await finance.data()), storage })));   // every JDA's entries + sanctioned
  // portal.js: "anyone signed in may edit any JDA's report"
  const known = JDAS.find(j => j.id === req.body?.jda?.id);
  ```
- What's wrong: `/api/finance/data` returns every JDA's register and sanctioned amounts to every user. Any user can edit any
  JDA's records by id, read any JDA's audit (`?jdaId=`), and save any JDA's report. CONTEXT confirms this is how it works.
- What it should be: filter reads and refuse writes by the user's JDA membership, e.g. `entries.filter(e => req.user.jdas.includes(e.jdaId))`,
  plus a membership check in `save/remove/moveStage/importCji3/matchLine` and in the portal middleware.
- Impact: partner-confidential figures (sanctioned amounts, partner invoices) for every JDA are open to every signed-in
  employee.

### [SEC-05] ALLOWED_EMAILS exceptions skip the "verified" check (account pre-claim), and usernames live on an outside domain
- Category: WRONG
- Severity: Major
- Confidence: Medium
- Location: server/auth.js:L49-L51, L131-L133; firebase/firestore.rules:L8-L11; web/shared/config/firebase-config.js (`USERNAME_DOMAIN = 'jda.app'`)
- Evidence:
  ```js
  function refusal(email, { verified } = {}) {
    if (allowedEmails().includes(email)) return '';        // before the verified check
  ```
  ```
  || request.auth.token.email in get(/databases/$(database)/documents/access/allowlist).data.emails);   // no email_verified
  ```
  `// A username typed at /login ("aina") is this address ("aina@jda.app").`
- What's wrong: the Firebase web API key is public, so anyone can call `accounts:signUp` directly with an exception address
  that has no account yet. They get an unverified account, and both the server and the Firestore rules accept it.
  The exception addresses are on `jda.app`, a domain this repo gives no sign of PETRONAS owning. Whoever controls that domain's
  mail also gets the password-reset links that `/api/auth/reset` sends (L131-L133).
- What it should be: require `verified === true` for exceptions too, and add `request.auth.token.email_verified == true` to the
  allowlist branch of the rules. Use only addresses on domains the organisation controls. Create exception accounts
  administratively, never by self sign-up.
- Impact: an outsider can take over a not-yet-created exception account, then get full access (see SEC-03). To confirm: check
  who owns `jda.app` and whether every ALLOWED_EMAILS address already exists in Firebase Auth.

### [SEC-06] Firestore rules let any user write jdas/projects/meta directly and forge audit lines (and the rules are not published)
- Category: RISK
- Severity: Critical
- Confidence: Medium
- Location: firebase/firestore.rules:L22-L28, L37-L40; reviews/CONTEXT.md "How auth works" step 5
- Evidence:
  ```
  match /jdas/{doc} { allow read, write: if onAccessList(); }
  match /projects/{doc} { allow read, write: if onAccessList(); }
  match /meta/{doc} { allow read, write: if onAccessList(); }
  match /activity/{doc} { allow read, create: if onAccessList(); }
  ```
  CONTEXT: "These rules are not yet published: the live project still has old rules (jdaReports was observed publicly readable)."
- What's wrong:
  1. Even the intended rules let any signed-in employee delete or overwrite JDAs, projects and meta straight from the browser
     console. That skips server validation and the audit log. They can also `create` `activity` lines with any `by` and
     `detail`, which forges the change log.
  2. The live project still runs older rules, under which the private JDA reports (progress, owners, challenges) can be read
     by anyone on the internet who has the public project id and API key.
- What it should be: publish the rules before release. Make `jdas`, `projects` and `meta` server-written only (`allow write: if false`).
  For `activity`, either make it server-only or validate it: `request.resource.data.by == request.auth.token.email`, plus a
  fixed set of keys.
- Impact: the private reports are publicly exposed today. Integrity of the JDA/project structure and of the change log
  depends on every employee behaving well. To confirm (1) live: `firebase firestore:rules get` or the console's Rules tab.

### [SEC-07] JDA 3's report is intentionally world-readable
- Category: RISK
- Severity: Major
- Confidence: High
- Location: firebase/jda3-rules.txt:L19-L28
- Evidence:
  ```
  match /report/{doc} {
    allow read: if true;
  ```
  "JDA 3's report stays readable by anyone who knows the project while its read rule is "if true""
- What's wrong: the project id and API key are in `web/shared/config/firebase-config.js`, which anyone can download. So
  JDA 3's full private report (the progress, tasks and owners that the public Info page deliberately filters out) can be read
  by anyone on the internet.
- What it should be: `allow read: if false`. Read it server-side with `JDA3_GOOGLE_APPLICATION_CREDENTIALS`, as the file itself
  says.
- Impact: this breaks the requirement that the public pages leak nothing private, for one of the three JDAs.

### [SEC-08] No security headers (CSP, HSTS, frame-ancestors, Referrer-Policy)
- Category: MISSING
- Severity: Major
- Confidence: High
- Location: server/app.js:L48
- Evidence:
  ```js
  app.use((req, res, next) => { res.setHeader('X-Content-Type-Options', 'nosniff'); next(); });
  ```
  No vercel.json exists, so nothing adds headers at the edge either.
- What's wrong: the UI renders almost everything through `innerHTML` templates, which today depend only on careful `esc()`.
  There is no CSP as a backstop. There is no `frame-ancestors`/`X-Frame-Options`, so the Control Tower, with its delete and
  match buttons, can be framed by another site (clickjacking). There is no HSTS.
- What it should be:
  ```js
  app.use((req, res, next) => { res.set({
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'self'; img-src 'self' https: data:; connect-src 'self' https://*.googleapis.com https://*.firebaseio.com; frame-ancestors 'self'; object-src 'none'; base-uri 'self'",
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Referrer-Policy': 'strict-origin-when-cross-origin' }); next(); });
  ```
  (or `helmet`).
- Impact: any future escaping slip becomes full XSS on a finance tool, and clickjacking is possible now.

### [SEC-09] Microsoft refresh tokens with Mail.ReadWrite and Sites.Read.All are stored in plaintext, through a borrowed first-party client
- Category: RISK
- Severity: Major
- Confidence: High
- Location: server/ms-graph.js:L41-L48, L76-L81
- Evidence:
  ```js
  const PUBLIC_CLIENT = () => ... : '14d82eec-204b-4c2f-b7e8-296a70dab67e'; // Microsoft Graph Command Line Tools
  const SCOPES = 'offline_access openid profile User.Read Sites.Read.All Mail.ReadWrite';
  fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens(), null, 1), { mode: 0o600 });
  ```
- What's wrong: each person's long-lived refresh token, which can read and write their whole mailbox and read every SharePoint
  site they can see, sits unencrypted in `server/.ms-tokens.json`. Anyone who gets that file or the server's memory gets every
  user's mailbox. The tokens come from Microsoft's own CLI client id rather than a tenant-owned app, which is a pattern
  security teams flag and often block. The device-code flow also invites phishing: a user can be tricked into entering a code
  that another person started.
- What it should be: a tenant app registration with `Sites.Selected` (just the one List) and `Mail.ReadWrite` only if drafts
  are kept. Encrypt the tokens at rest (KMS or a key from env), or keep no refresh tokens and use the .eml path only.
- Impact: compromising one server means compromising many PETRONAS mailboxes.

### [SEC-10] Any user can write drafts into the shared MS_MAIL_SENDER mailbox with any recipients and HTML
- Category: RISK
- Severity: Minor
- Confidence: High
- Location: server/routes/finance.js:L92; server/ms-graph.js:L144-L149
- Evidence:
  ```js
  if (graphMailConfigured()) return { webLink: (await graph(`/users/${encodeURIComponent(env('MS_MAIL_SENDER'))}/messages`, await appAccessToken(), { method: 'POST', body: message })).webLink || '' };
  ```
- What's wrong: `to`, `cc`, `subject` and `html` come straight from the client, with no role check and no check that the HTML
  is the generated approval email. A user can stage a phishing draft in a trusted shared mailbox.
- What it should be: build the HTML on the server from `keys` (`emailHtml` is already shared code), limit recipients to the
  JDA's Lead, and require the PM role.
- Impact: misuse of a trusted sender identity.

### [SEC-11] Unauthenticated requests get the 25 MB body parser just by sending any Cookie header
- Category: WRONG
- Severity: Minor
- Confidence: High
- Location: server/app.js:L45-L46
- Evidence:
  ```js
  app.use(['/api/finance', ...], (req, res, next) => req.headers.cookie || req.headers.authorization ? big(req, res, next) : next());
  ```
- What's wrong: the check only asks whether a cookie or Authorization header is *present*. It runs before `requireUser`, so
  `Cookie: x=1` makes the server buffer and parse up to 25 MB of JSON for anyone.
- What it should be: mount `big` after `requireUser`, e.g. `app.use('/api/finance', requireUser, big, financeRoutes(...))`.
- Impact: cheap memory/CPU denial of service. Vercel's 4.5 MB request cap softens this there, but not on a local or VM host.

### [SEC-12] Rate limits are per instance, and the server-side sign-up/reset policy can be bypassed through the public Firebase API
- Category: RISK
- Severity: Minor
- Confidence: High
- Location: server/rate-limit.js:L1-L4; server/auth.js:L139; docs/server-and-invoices.md:L295-L296
- Evidence:
  ```js
  // Enough for one server process, which is how this runs; several processes would each keep their own count.
  const slowly = rateLimit({ windowMs: 15 * 60_000, max: 5, what: 'tries' });
  ```
- What's wrong: on Vercel each function instance has its own `Map`, so the 5-per-15-minutes limit multiplies with instances
  and resets on cold start. Separately, Firebase `signUp` and `sendOobCode` can be called straight from the public API key.
  That bypasses the domain and password rules here, as well as the limit and the hidden "EMAIL_EXISTS" answer (account
  enumeration and reset-email flooding of staff inboxes), unless Firebase Email Enumeration Protection and API key
  restrictions are on.
- What it should be: a shared limiter store (Firestore or Upstash). Turn on Email Enumeration Protection, restrict the API key
  to the production referrer, and enable App Check. Consider a blocking function (`beforeCreate`) that enforces the domain
  inside Firebase itself.
- Impact: brute force and abuse protections are much weaker than the code suggests. To confirm: the Firebase console settings.

### [SEC-13] Sessions cannot be revoked; sign-out only clears the browser's copy
- Category: MISSING
- Severity: Minor
- Confidence: High
- Location: server/session.js:L26-L39; server/auth.js:L72-L77
- Evidence:
  ```js
  export const clearSession = (req, res) => res.setHeader('Set-Cookie', `${COOKIE}=; Max-Age=0; ${flags(req)}`);
  ```
- What's wrong: the cookie is a stateless HMAC token valid for 8 hours. If it is stolen, logging out does nothing, and neither
  does disabling the Firebase account. The Bearer fallback renews the cookie on every call for as long as the Firebase
  refresh token lives.
- What it should be: add a session id plus a server-side revocation list or `tokensValidAfter` check. Re-check that the
  Firebase account is not disabled when renewing.
- Impact: a stolen or leaving user's session stays usable for up to 8 hours or more.

### [SEC-14] CSV export formula guard misses known payloads
- Category: WRONG
- Severity: Minor
- Confidence: High
- Location: web/control-tower/invoices/js/finance/sheets.js:L11
- Evidence:
  ```js
  const safe = s => /^[=+@]|^-(?!\d)/.test(s) ? `'${s}` : s;
  ```
- What's wrong: `-2+3+cmd|' /C calc'!A0` (a minus followed by a digit), a leading TAB (`\t=`) or CR, and the full-width `＝`
  all get through. Partner and description values come from the Microsoft List, which outside parties may influence.
- What it should be: `const safe = s => /^[\s]*[=+\-@\t\r|]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;`
  (still lets plain negative numbers through, and only for text cells).
- Impact: a formula/DDE run when an accountant opens the exported CSV. (The XLSX export writes strings as strings and is not
  affected.)

### [SEC-15] Separation of duties and the audit trail identify people by the part of the email before the @
- Category: WRONG
- Severity: Minor
- Confidence: High
- Location: server/auth.js:L56; server/routes/finance.js:L21, L58-L59
- Evidence:
  ```js
  const userOf = email => ({ email, name: email.split('@')[0] });
  if (... record?.stageBy && record.stageBy === actor(req))
  ```
- What's wrong: `ali@petronas.com` and an exception `ali@partner.com` are the same "person" in the audit log and in the
  "you validated this, someone else must approve" check. Two different people with the same local part get blocked, or
  attribution is ambiguous.
- What it should be: store and compare the full lower-cased email (`req.user.email`) in `stageBy`, `createdBy`, `updatedBy`
  and audit lines.
- Impact: the audit trail cannot reliably show who did what.

### [SEC-16] CORS defaults to `*` when ALLOWED_ORIGIN is not set (it is not in the Vercel settings table)
- Category: RISK
- Severity: Minor
- Confidence: Medium
- Location: server/app.js:L42-L43; docs/server-and-invoices.md:L307-L315
- Evidence:
  ```js
  const origins = (process.env.ALLOWED_ORIGIN || '*').split(',').map(s => s.trim());
  app.use(cors({ origin: origins.includes('*') ? '*' : origins }));
  ```
- What's wrong: the server serves its own pages, so it needs no CORS at all. `*` lets any site make Bearer-token calls and
  read the answers, and widens the attack surface if a token leaks into another origin. Cookie-authenticated cross-site calls
  are still blocked (SameSite=Lax, plus `*` is not allowed with credentials).
- What it should be: no `cors()` middleware at all, or a default of the production origin only.
- Impact: low today, and it removes a defence-in-depth layer.

### [SEC-17] Finance and page data are sent to the Anthropic API with no data-handling control
- Category: RISK
- Severity: Minor
- Confidence: Medium
- Location: server/routes/chat.js:L11-L24; server/routes/drive.js:L13-L18
- Evidence:
  ```js
  const reply = await ask({ system: chatSystem(context), messages, maxTokens: 800 });   // context: up to 200,000 chars from the page
  ```
- What's wrong: whatever the page puts in `context` goes to a third-party API, including invoice amounts, partners and
  sanctioned figures, as well as invoice PDFs from Drive. Nothing redacts it, and nothing records that this is approved. The
  user can also craft `context` (prompt injection, or cost abuse at 200k characters × 20 calls a minute per user).
- What it should be: confirm PETRONAS data classification and approval for this processor, or move it to the AI Builder
  target. Build `context` on the server from ids rather than taking it from the client, and lower the size limit.
- Impact: possible data-governance breach, and API cost abuse.

### [SEC-18] Weak passkeys and an admin passkey remain in git history
- Category: RISK
- Severity: Nit
- Confidence: High
- Location: git history: jda/server/portal-passkeys.json (added b020108, removed ee0ee8a)
- Evidence:
  ```
  -  "jda4": "4004",
  -  "admin": "12345"
  ```
- What's wrong: the passkey system has been removed, so these no longer grant access. But they show credentials were once
  committed, and they may have been reused elsewhere (Vercel, Firebase users).
- What it should be: confirm none of these values is reused anywhere. Optionally purge them with `git filter-repo` before the
  repository is shared more widely.
- Impact: low.

---

## Top 3 blockers
- **SEC-01**: one JSON field (`source:"migrated"`) lets any employee create invoices already marked Paid. Every finance
  figure becomes untrustworthy.
- **SEC-02**: CJI3 import and manual match have no role check and accept raw JSON "sheets", so one person can skip the whole
  approval chain and mark Paid from Received.
- **SEC-03**: open self sign-up for the whole @petronas.com domain, with every role defaulting to "anyone", gives every
  employee write access to finance, reports and the public site.
  (SEC-06 is a close fourth: the live Firestore rules still expose the private reports publicly.)

## Missing entirely
- An authorization model: roles and JDA membership stored server-side, deny by default, checked on every write route.
- Tests that a non-role user is refused CJI3 import/match, settings, sanctioned and delete. No test covers the `source:"migrated"`
  import path either.
- Security headers (CSP, HSTS, frame-ancestors, Referrer-Policy) and any `vercel.json`. The deployment config (root directory,
  static output) is not in the repo, so it cannot be verified that Vercel serves `web/control-tower/*` only through
  `requirePage` (Confidence: Low; confirm in the Vercel project settings).
- Session revocation, and an admin view of active users or accounts.
- A shared rate-limit store, Firebase App Check, API key restrictions and Email Enumeration Protection (none is configured in
  the repo).
- Size, row and decompression limits on xlsx parsing (ExcelJS loads up to 25 MB of zip fully into memory). There is no
  type or macro check beyond the `.xlsx` filename extension. Macros are not executed, but a renamed `.xlsm` is accepted
  silently.
- A real dependency audit: `npm audit --offline` gives no result. Run `npm audit` online in CI.
- An incident or alerting path: no security-relevant events are logged (sign-in failures, refused role moves, CJI3 uploads by
  user).

## Out-of-lane flags
- `web/control-tower/invoices/js/config/app-config.json` has `"demoMode": true` on main, so the live Invoice Tracker runs on
  sample data in the browser.
- Picture uploads and Microsoft sign-ins write to local disk, which Vercel cannot write (docs say so). Edit public site pictures
  and the List sign-in are broken in production.
- CJI3 manual-match UI copy ("One not yet approved is linked, not moved") contradicts what the server does (it moves to Paid).
