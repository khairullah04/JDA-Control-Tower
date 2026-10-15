# TriCipta AI / JDA Control Tower overhaul: checklist

Branch `overhaul/tricipta-landing`. An item is ticked only after it was checked, and the check is
written beside it. Review findings are logged under each phase.

## Architecture

### Before the overhaul (as found on 2026-10-15)

- **One Node + Express server** (`jda/server/server.js`) serves everything on one port. There is no
  build, lint or type-check step: the pages are plain HTML, CSS and ES modules. `npm test` in
  `jda/server` (99 tests, Node's own runner) is the only automated check.
- **Programme Portal** (`portal/`), served at `/`, with no sign-in at all:
  - `index.html` + `js/portal.js`: one card per JDA (average project % as a ring) and an
    Administration card that took the Invoice Tracker passkey.
  - `jda-report.html` + `js/report.js`: one template for every JDA (`#/jda1` ...). Three screens:
    the **Master Page** (overview: hero, aspiration, solutions, architecture, collaborators, press
    release), **Overall progress** (projects, challenges, S-curve) and **Weekly progress** (tasks
    `{task, project, owner, due, status}` and key updates `{date, text}`).
  - Editing: each JDA's icon asked for that JDA's passkey (`jda/server/portal-passkeys.json`) and
    opened the in-place Editor Page (`js/editor.js`, `block-editor.js`). Saves went through
    `POST /api/portal/save`.
  - Data: one report document per JDA in Firestore, **read directly by the browser with public
    read rules**. JDA 1, 2 and 4 in project `test-invoice-c38a4` (`jdaReports/<id>`); JDA 3 in its
    own project `jda3-9c0c5` (`report/current`, fed by an Excel to Power Automate flow).
  - The JDA list is `portal/js/config/app-config.js` (`JDAS`); built-in text per JDA is
    `portal/js/config/jda-content.js`.
  - Drive sync: the server reads each JDA's Drive folders and Claude extracts the content
    (`portal-sync.js`, `portal-drive.js`).
- **Invoice Tracker** (`jda/web/`), served at `/tracker/`: Firebase email/password sign-in
  (limited to `ALLOWED_EMAILS`) **and** the "admin" passkey. Dashboard of JDA cards with a
  **Sync from Drive** button (reads invoices from Drive), per-JDA and per-project pages, the CJI3
  register and the Payment Tables. JDAs and projects are Firestore collections (`jdas`, `projects`,
  `activity`, `processedFiles`) read by the browser; invoices, sanctioned amounts and their audit
  log (`financeEntries`, `financeSanctioned`, `financeAudit`, `financeMeta`) only through the
  server (`/api/finance`), which also needed the admin passkey.
- **API auth**: `/api/portal/*` by per-JDA passkey token; everything else under `/api` by a
  Firebase ID token checked against `ALLOWED_EMAILS` (`jda/server/auth.js`).
- Tracker JDAs (Firestore ids) and portal JDAs (`jda1` ...) are separate records joined by name
  ("JDA 1").

### After the overhaul (target)

| Path | Access | What |
|---|---|---|
| `/` | Public | TriCipta AI landing page (`site/index.html`) |
| `/jda/<id>/info` | Public | Read-only Info page, a copy of the JDA's Master Page with private data stripped (`site/info.html`) |
| `/login` | Public | Employee sign-in (Firebase account on the access list) |
| `/control-tower/` | Private | JDA Control Tower landing page (replaces the portal index and the tracker dashboard) |
| `/control-tower/jda-report.html#/<id>` | Private | The original JDA report pages (Master, Overall, Weekly) and their editor |
| `/control-tower/tracker/` | Private | The Invoice Tracker: CJI3 register and Payment Tables |
| `/api/public/*` | Public | Only what the public pages show |
| every other `/api/*` | Private | Session cookie or Firebase token, on the access list |

- One sign-in: `/login` signs in with Firebase, the server checks the account against
  `ALLOWED_EMAILS` and sets an httpOnly session cookie. The server checks that cookie before it
  sends any private page, script or API answer. The tracker's own login, the tracker passkey and the
  per-JDA editor passkeys are gone (decided 2026-10-15).
- Content for both landing pages is kept by the server in Firestore (`site/public`,
  `site/controlTower`), or in `jda/server/.site-content.json` when there is no service-account key.

## Phase 0: setup

- [x] Codebase explored and summarised above. *Checked: read server, routes, auth, passkeys, portal, tracker, store code.*
- [x] Branch `overhaul/tricipta-landing` created. *Checked: `git branch --show-current`.*
- [ ] Database backed up before any deletion. *Partial: `backups/2026-10-15T02-30-32-901Z` holds the report documents of JDA 1 and JDA 3 (JDA 2 and 4 have none). The main Firestore collections need `jda/server/service-account.json`, which is not in the Codespace yet; the user is adding it.*
- [x] Old planning/review files removed after the user confirmed (2026-10-15): `reviews/SUMMARY.md`, `reviews/accountant.md`, `reviews/project-manager.md`, `reviews/security-engineer.md`, `reviews/software-engineer.md`, `reviews/submission-user.md`, and the old agents `.claude/agents/{accountant,project-manager,security-engineer,software-engineer,submission-user}.md`.
- [x] Four review agents written: `.claude/agents/software-developer.md`, `web-designer.md`, `team-leader.md`, `team-member.md`.

## Phase 1 (Priority 1): remove JDA 4 and onwards

- [x] JDA 4+ removed from code: portal JDA list (`portal/js/config/app-config.js`), tracker default JDAs (`jda/web/js/config/app-config.json`), demo data and its JDA 4 projects DA/DB/DC (`jda/web/js/services/demo/data.js`), passkey example and the local `portal-passkeys.json`, READMEs, rule and code comments. *Checked: grep below; `npm test` 102/102.*
- [x] Test fixtures no longer name JDA numbers above 3 (jda7/jda9 became `jdaz` / "JDA Z"). *Checked: grep below.*
- [x] Repo search for `JDA 4`, `JDA4`, `jda-4`, `jda_4`, `jda4` and 5+ finds nothing outside this checklist, the review agent's instructions, and the removal script and its test. *Checked: `grep -rniE "jda[ _-]?([4-9]|[1-9][0-9])\b"` and a search for "1, 2 and 4" / "1-4" (excluding node_modules, backups, vendor, drive-test-files).*
- [x] Database cleanup script `jda/server/scripts/remove-jdas.mjs` (logic in `jda/server/jda-removal.js`) removes JDA 4+ tracker records and every dependent row: projects, invoices, sanctioned amounts, audit lines (by JDA, project or record), activity log lines, report documents and their versions. Dry run by default; `--apply` runs `scripts/backup.mjs` first and deletes nothing unless the main project was saved. `processedFiles` is left: it names no JDA, and deleting a line would make the next Drive sync import that file again. *Checked: `jda-removal.test.mjs` (3 tests) on a stand-in database, including an invoice filed under Unsorted against a JDA 4 project.*
- [ ] Script run against the real database, and a second dry run finds nothing left. *Needs the service-account key.*
- [x] JDA list still comes from data/config, so adding a JDA later needs no code change. *Checked: the portal reads `JDAS` in `portal/js/config/app-config.js`; the tracker reads its `jdas` collection; nothing counts to 3.*

## Phase 2 (Priority 2): access control and routing

- [x] `/`, `/jda/<id>/info` and `/login` open without signing in; an unknown JDA id is 404. Of `portal/`, only `css/`, `assets/` and `js/blocks.js` are public, each served from its own root so `..` (plain or `%2e%2e`) cannot climb out. *Checked: `app.test.mjs` "the public pages...", including raw HTTP requests with `..` that the first version let through (the test fails on that version).*
- [x] Everything under `/control-tower` needs a session; without one, a page request redirects to `/login?next=<page>`. *Checked: `app.test.mjs` requests every file in `portal/` and `jda/web/` (over 40) signed out and expects 302 to /login.*
- [x] Old addresses (`/tracker/...`, `/jda-report.html`, `/index.html`) redirect (301) into `/control-tower`, and so to `/login` when signed out. *Checked: `app.test.mjs`.*
- [x] Every private API endpoint rejects a request with no session (401): `requireUser` sits in front of all of `/api` except `/api/auth`. Made-up, altered and expired cookies, and a person taken off the access list, are refused too. *Checked: `app.test.mjs`, 15 endpoints including an unknown one.*
- [x] Sign in leads to the Control Tower landing page, or to the private page that was asked for, including its `#/jda1` part (`next`, resolved as the browser will and kept only if it stays on this site). *Checked: `app.test.mjs` (token for cookie, me, sign out); `session-browser.test.mjs` (`nextPath`: tab, newline, backslash and `//` tricks); `/login` loaded in a browser. A real Firebase sign-in has not been tried: no account on `ALLOWED_EMAILS` in this Codespace.*
- [x] The tracker's own login and passkey are removed; the tracker is not reachable without the main sign-in. *Checked: `app.test.mjs` (every tracker file 302 signed out, finance API 401); tracker loaded in a browser with no console errors.*
- [x] Per-JDA editor passkeys are replaced by the main sign-in; `passkeys.js`, its test and `portal-passkeys.example.json` are deleted. *Checked: editor opened in a browser from the JDA icon with no prompt; grep finds no passkey code.*
- [ ] Firestore rules: report documents readable only by signed-in people on the access list. *Written in `jda/firestore.rules` (and `site` closed to browsers); not yet published: needs `npx firebase-tools deploy --only firestore` by the user. JDA 3's project is outside this repository (Known issues).*
- [x] "Portal" renamed to "JDA Control Tower" in every user-facing place (page titles, headings, top bars, footers, built-in JDA text, error messages, READMEs). Left: internal names (`portal/` folder, `/api/portal`, `portalApi`), which other code and tests depend on. *Checked: grep for user-facing "Portal" in html and js.*

## Phase 3 (Priority 3): public landing page

- [x] Persistent sidebar: Home, JDA Status, Contacts (scroll to sections, the current one highlighted) and Sign in ("Open Control Tower" when already signed in). On a phone it is a drawer behind a menu button (Escape closes it). *Checked: screenshots at 1440px and 390px.*
- [x] Sections in order: TRICIPTA AI header, Overview, Roles image (`site/public/roles.jpg`, `.png`, `.jpeg` or `.webp`; placeholder until supplied), What is JDA, Existing JDAs, JDA Status cards, Contacts. *Checked: screenshots; `site-content.test.mjs` (roles image null until supplied).*
- [x] Existing JDAs: a tab per JDA (arrow keys move between tabs) with press release overview (five lines, then Read more), projects (six shown, then "+N more"), Program Lead cards, Business Champions cards, and View more to its Info page. *Checked: screenshots; links open `/jda/<id>/info`.*
- [x] People seeded with "Name TBC" / "Title TBC" placeholders (one Program Lead, two Business Champions per JDA). *Checked: `site-content.test.mjs`.*
- [x] JDA Status cards: name, title, number of projects, status badge with its own colour and icon (In the works amber / clock, In progress teal / pulse, Finished green / tick). *Checked: screenshots.*
- [x] Info page per JDA at `/jda/<id>/info`: a separate read-only copy of the Master Page (`site/info.html`, `site/js/info.js`; the original `portal/jda-report.html` is untouched by it and shares no state). The server builds what it shows (`infoPage` in `jda/server/site-content.js`); private data is never sent and is listed below. *Checked: `site-content.test.mjs` (no owner, %, task, update, challenge, S-curve, backup or bad link in the answer); pages loaded in a browser with no console errors.*
- [x] Desktop and phone layouts checked. *Checked: screenshots at 1440, 1366 and 390px; no sideways scroll.*

## Phase 4 (Priority 4): Control Tower landing page

- [x] Replaces the old portal main page and the tracker dashboard (`portal/index.html`, `portal/js/control-tower.js`; `portal/js/portal.js` and `jda/web/js/ui/dashboard.js` deleted; the tracker's own front-page address leads to it). *Checked: browser, `/control-tower/tracker/` redirects to `/control-tower/`.*
- [x] Top tab bar to switch JDAs (each tab shows its progress %; arrow keys; `#jda2` opens a tab). *Checked: browser, ArrowRight moved to JDA 2 and set `#jda2`.*
- [x] Sync from Drive button, top right (the tracker's own `runSync`, not rewritten): the button shows "Syncing: <file>" while it runs, then a result dialog, or the error in the same dialog. *Checked: browser in demo mode, 6 files, "6 invoice(s) created".*
- [x] Per JDA: progress circle (left; average of its projects' %, A1) and the latest key update with its date, from Weekly progress (right). *Checked: browser with JDA 1's and JDA 3's real reports (44%, 24%).*
- [x] Info button ("Agreement & BRD", left corner) opens a dialog with the Agreement and BRD links (written in edit mode, Phase 6; "not linked yet" until then). *Checked: browser.*
- [x] Key Insights boxes and Challenges boxes (challenges from Overall progress with severity, unless written in edit mode; four shown, then "Show all"). *Checked: browser.*
- [x] Cost circle: paid / sanctioned, both with tax (A2), from the Invoice Tracker's Payment Table totals; red over 100%; Detail cost opens that JDA's page in the tracker (CJI3, payment tables, projects). *Checked: browser, JDA 3 33%, Detail cost → `tracker/#/jda/j2` opened JDA 2.*
- [x] CJI3 to Payment Table flow verified after the move (tax, forex, status, sanctioned checks). *Checked: `npm test` (finance-core, finance-api, finance-store: hand-worked tax and forex, status, duplicates, sanctioned-over checks, Excel in and out); CJI3, Payment Table and project pages loaded in a browser under `/control-tower/tracker/` with no console errors.*

## Phase 5 (Priority 5): richer Weekly Progress tasks

- [ ] Task fields: title, description, owner, status, priority, start, due, completed dates, progress % or checklist, project, notes/blockers, last updated.
- [ ] Older tasks read without error (missing fields filled with blanks), with a way back.
- [ ] Filter and sort by status, owner, due date; expandable rows.
- [ ] Editable in the existing editor; Drive sync keeps working.

## Phase 6 (Priority 6): edit mode

- [ ] Edit page button on both landing pages, only for signed-in people.
- [ ] Every displayed piece of content editable (texts, roles image, JDA tab content, people add/remove/reorder, status, counts where not derived, contacts, insights, challenges, document links, cost figures).
- [ ] Saved on the server (Firestore, or the local file without a key), shown after reload.
- [ ] Derived values shown as derived; manual overrides labelled as overrides.

## Definition of done

- [ ] Every item above ticked with how it was checked.
- [ ] Zero JDA 4+ references in code and database.
- [ ] Every private route answers 302 or 401 when signed out (tested).
- [ ] `npm test` passes; the app runs with no console errors.
- [ ] No outstanding High findings from the four review agents.

## Assumptions log

| # | Assumption | Why |
|---|---|---|
| A1 | JDA progress % = the average of its projects' % complete. | This is what the portal's JDA cards already compute (`portal/js/portal.js`), so the code answers open question 1. |
| A2 | Cost % = paid invoices (with tax, in MYR) / sanctioned amount (with tax). | Decided by the user on 2026-10-15. |
| A3 | Sign-in is the existing Firebase accounts on `ALLOWED_EMAILS`; it replaces the tracker passkey and the per-JDA editor passkeys. | Decided by the user on 2026-10-15. |
| A4 | Agreement and BRD are links (Drive or SharePoint), edited in edit mode. | Open question 3 default; nothing in the code stores them. |
| A5 | JDA status (In the works / In progress / Finished) is set by hand in edit mode. | Open question 4 default. |
| A6 | Every signed-in person can use edit mode; there is no role system. | Open question 5 default; the code has none besides the passkeys being removed. |
| A7 | Info pages show project names only, no figures. | Open question 6 default. |
| A8 | Tracker JDAs and portal JDAs are matched by name ("JDA 1"). | That is how the two lists are joined today. |
| A13 | A session lasts 8 hours. The pages also send the Firebase token, which renews it, so a save made after it ran out still goes through. | Avoids losing an editor's unsaved work; Firebase keeps its own sign-in until Sign out. |
| A14 | Private APIs accept the session cookie or a Firebase token (Bearer). | The token is what renews the cookie; it also lets a non-browser caller (e.g. a Power Automate flow) use the API. |
| A15 | A username typed at /login means `<username>@jda.app` (`shared/firebase-config.js`); a full email is used as typed. | Matches how the tracker's accounts were created. |
| A16 | `REQUIRE_AUTH=false` opens everything, for trying things on one's own computer only; refused with `NODE_ENV=production`. | Lets the demo mode run without Firebase accounts. |
| A17 | Changes to private APIs must be sent as JSON (415 otherwise). | With SameSite=Lax this closes form-post CSRF, including from another subdomain. |
| A18 | A JDA's landing-page title is its Master Page tagline, its press release overview the Master Page press release, and its projects the names on Overall progress, unless written in edit mode. Status, when not set, is "In progress" if it has projects, otherwise "In the works". | Shows real content before anyone edits; edit mode overrides each one. |
| A19 | The public pages' report reads are cached for a minute and rate-limited (120 per minute per address). | Public traffic must not become a stream of database reads. |
| A20 | **Needs the user's confirmation.** What the Master Page shows stays public on the Info page: banner, winning aspiration (including targets such as "Unit Production Cost below USD 6/BOE" and "30% NPV"), solution cards and detail pages (less targets and delivery leads), collaborators (including their "Read more" text, e.g. the IP terms) and sections added in the editor. | The old portal showed all of it with no sign-in, but that does not prove it was meant to be public. |
| A21 | The landing page's text in `PUBLIC_DEFAULTS` (`jda/server/site-content.js`) is draft copy for the user to rewrite in edit mode; contacts are empty ("To be announced") until written. | No real copy or contacts were supplied. |
| A22 | The tracker's old front page (a card per JDA, Sync from Drive, Add JDA, Recent activity) is replaced by the Control Tower landing page, which carries Sync from Drive, Add JDA and Recent activity; the tracker's own address now leads there. | The brief scraps that page; its tools stay reachable. |
| A23 | A JDA added with Add JDA exists only in the Invoice Tracker until it is also added to `portal/js/config/app-config.js` (`JDAS`), which gives it a tab, a report and an Info page. The page says so after adding. | The two JDA lists are separate records (A8). |
| A9 | There is no build, lint or type-check in this repository; `npm test` plus `node --check` stand in for it. | Nothing to run otherwise. |
| A10 | The cleanup matches a tracker JDA only when its name is exactly "JDA <n>". Every other name is listed as kept in the dry run, so an odd name can be checked before `--apply`. | A looser match could delete a JDA by accident. |
| A11 | An invoice or sanctioned amount filed under another JDA (e.g. Unsorted) but against a JDA 4+ project is deleted with that project. | It would otherwise point at a project that no longer exists. |
| A12 | `processedFiles` (which Drive files the tracker has read) is kept. | It names no JDA; deleting a line would make the next Drive sync import the file again. |

## Stripped from the public Info pages

Not sent by the server at all (`infoPage`, `publicJda` in `jda/server/site-content.js`, tested in `site-content.test.mjs`):

- **Overall progress**: projects' owners, % complete, status, descriptions; overall status; challenges; the S-curve.
- **Weekly progress**: tasks (names, owners, due dates), key updates, the week label.
- **The system architecture diagram** (internal systems and data flows).
- **Solution detail pages' targets and delivery leads**: a "Targets" or "Delivery lead" heading and everything under it is dropped, also from detail pages saved by the editor (which keeps the built-in ones as blocks). *Tested: `site-content.test.mjs`, "a detail page saved by the editor...".*
- **Editing**: the editor, Edit report, Drive sync and Master File folder links, saved versions, `overviewBackup`.
- **Anything stored with the public page that the page does not use** (who saved it, notes): only the known text fields are sent.
- **Anything that is not a safe picture or link**: images other than this site's stock pictures or `https://` addresses; links other than `http(s)://`.
- **Invoices, payments, costs**: never on a Master Page in the first place (decided 2026-10-12), and not read by these endpoints.

Kept, because the Master Page has always shown them publicly (the old portal had no sign-in): the banner, winning aspiration (including its targets, e.g. "30% NPV"), solution cards, collaborators, press release and sections added in the editor. On the landing page each JDA shows only its title, press release text, project **names** and how many there are.

## Known issues

- JDA 1's saved report has `"kai"` in its press release image field, which is not an image address. The page now skips such a field; correct it in the JDA 1 editor.
- Real Firebase sign-in not tried in this Codespace: `ALLOWED_EMAILS` in `jda/server/.env` is empty. Tested with the Google check stubbed (`app.test.mjs`).
- JDA 3's report document lives in another Firebase project (`jda3-9c0c5`) whose rules this
  repository does not control. Until its rules require sign-in, that document stays readable by
  anyone who knows the project, whatever this server does.
- New Firestore rules (`jda/firestore.rules`) only take effect once published, and must be published in this order, or every report page breaks: (1) put `service-account.json` in `jda/server`, (2) restart and check the log says the access list was "copied to Firestore for the database rules", (3) `cd jda && npx firebase-tools deploy --only firestore`. Until then JDA 1 and 2's report documents stay readable by anyone with the public Firebase settings.
- Sign out clears the cookie in the browser only; a copied cookie keeps working until it runs out (8 hours). A server-side revocation list is not built.
- `REQUIRE_AUTH=false` is only refused when `NODE_ENV=production` is set; a server deployed without it and with `false` would be open (the start-up log says so loudly).
- The tracker's top bar (seven items) wraps to three rows on a phone and its buttons are under 44px; not changed in this overhaul yet.
- `app.set('trust proxy', 1)` assumes one proxy in front; reached directly, a caller can set `X-Forwarded-For` and dodge the public rate limit (the one-minute cache limits the cost). Set it to match the real deployment.
- No Content-Security-Policy header yet on the public pages (all output is escaped; a CSP would be a second line of defence).

## Review findings

### Phase 1 (software-developer, team-leader; web-designer and team-member had nothing to review: no page changed)

| Who | Sev. | Finding | Done |
|---|---|---|---|
| both | High | `jda/firestore.rules` comment still said "JDA 1, 2 and 4"; the grep tick was wrong. | Fixed; search widened to "1, 2 and 4" wording. |
| dev | Med | Deletes ran parents first; a failure part way left rows no rerun could find. | Fixed: children first, JDAs last (`jda-removal.js`, tested). |
| dev | Med | Backup check read the newest folder, which might be an older backup. | Fixed: must be newer than the run's start and list `firestore-main/` files; a missing manifest stops the run. |
| dev | Med | Audit lines of a record moved out of a JDA 4 project were deleted. | Fixed: audit lines go only with their record (tested). |
| dev | Med | Old tracker `invoices` / `scope` rows not covered. | Fixed: in the plan (tested). |
| lead | Med | Name-matching and cleanup decisions not logged. | Fixed: A10 to A12; dry run lists every JDA it keeps. |
| dev | Low | `--from 1` would delete JDA 1 to 3. | Fixed: refused below 4. |
| dev | Low | Plan made before the backup could miss writes in between. | Fixed: plan made again after the backup; the dry run says to stop the server. |
| both | Low | Add JDA placeholder named an existing JDA. | Fixed: "Name, in the form JDA <number>". |
| both | Low | Uncommitted `demoMode: true` in `jda/web/js/config/app-config.json`. | Kept out of every commit (the user's local setting). |
| lead | Low | Grep note did not mention the removal script and test. | Fixed. |

### Phase 2 (all four)

| Who | Sev. | Finding | Done |
|---|---|---|---|
| dev, lead | High | `/site/portal/css/../` (and `%2e%2e`) served any private file in `portal/` signed out. | Fixed: css and assets each their own root; raw-request tests. |
| lead, dev | High/Med | Open redirect through `next` (`/\t/evil.com`). | Fixed: resolved with `URL`, same origin only; `session-browser.test.mjs`. |
| member | High | Bookmarks lost their `#/jda1` after signing in. | Fixed: the # the browser brings to /login is kept. |
| member, designer | High/Med | Editor's unsaved work lost when the cookie ran out. | Fixed: pages send the Firebase token too, which renews the cookie (A13); tested. |
| lead, dev | High/Med | Report documents still public until the rules are published; publishing before the access list is in Firestore breaks every report. | Not fixable from here: order written in Known issues; item stays unticked. |
| dev | Med | JDA 3's report is public in its own project. | Known issue (needs that project's key and rules). |
| designer, member, lead | Med | No Sign out on Control Tower and report pages. | Fixed: name and Sign out in both top bars. |
| member | Med | `/jda-report.html?jda=` lost its query. | Fixed, tested. |
| designer | Med | Invisible focus on Open Invoice Tracker and the tracker top bar. | Fixed. |
| designer, member | Med/Low | JDA edit icon had no visible label. | Fixed: icon + "Edit". |
| member | Med | Tracker forms dropped on a 401. | Mostly avoided by token renewal (A13); a 401 now means Firebase is signed out too. |
| designer | Med | Tracker top bar wraps on phones. | Logged (Known issues). |
| dev | Low | CSRF relied on SameSite alone. | Fixed: JSON required for changes (A17), tested. |
| dev | Low | Missing `SESSION_SECRET` silent. | Fixed: warning; refused in production. |
| dev | Low | Logout does not revoke the cookie server-side; `REQUIRE_AUTH=false` guard needs `NODE_ENV`. | Logged (Known issues). |
| member, designer | Low | Technical or raw error text on /login. | Fixed: plain wording, details to the server log; `auth/user-disabled` and a general fallback. |
| designer | Low | Sign-in page: progress in the error line, no aria-invalid, no busy state, autocapitalise. | Fixed. |
| designer | Low | Padlock and "Signed in" badge on the tracker card; "sign-in off" text. | Fixed: receipt icon, "Finance"; "Signed in as …", "Sign-in off (local)". |
| lead | Low | "Portal" left in Drive errors, a comment, test-file notes. | Fixed. |
| lead | Low | Phase 2 choices not logged. | Fixed: A13 to A17. |
| designer | Low | "Edit report" vs the editor naming; token differences between site.css and styles.css; primary gradient contrast; tracker whoami loading state. | Logged for Phase 6 / final pass. |

### Phase 3 (all four)

No High findings.

| Who | Sev. | Finding | Done |
|---|---|---|---|
| lead, dev | Med | Targets and delivery leads published once a Master Page is saved by the editor. | Fixed: those headings and what is under them are dropped; tested through the editor's own save path. |
| dev | Med | A report part of the wrong type gave the Info page a 500. | Fixed: shapes checked before use; tested with hostile values. |
| dev | Med | Any key stored with the public page was published. | Fixed: only known text fields; tested. |
| lead | Med | What stays public was not confirmed. | Logged as A20 for the user to confirm. |
| lead | Med | Landing page fell back to built-in tagline and press text an editor had removed. | Fixed: both public pages read the Master Page the same way. |
| lead, member | Med | Made-up contacts and placeholder people looked real. | Fixed: contacts empty and shown as "To be announced", no links; A21. People stay "Name TBC" until edit mode. |
| member | Med | Info page did not say it is public, nor lead to the real report. | Fixed: a strip says so; "Open full report" (through sign-in when needed). |
| member | Med | Info page footer named the private Control Tower. | Fixed: a public note instead. |
| member | Med | Phone menu dead if the content failed to load. | Fixed: menu wired first; error offers Try again and sign-in. |
| member | Med | No way from a report to its public page. | Fixed on the Control Tower landing page ("Public page ↗" per JDA, "Public site" in the top bar). |
| designer | Med | Closed drawer reachable by Tab; open drawer let Tab escape; scrim did not return focus. | Fixed with `inert`, focus back to the menu button. |
| designer | Med | Sections hidden under the phone bar; empty `aria-current`; weak selected tab; button contrast 3.2:1; Read more cut off; focus lost after a solution page. | Fixed. |
| dev | Low | Failed read cached as "no report"; silent 403; no shared reads. | Fixed: last good report kept, reason logged, one read shared; tested. |
| dev | Low | Unchecked `col`; unknown `art` gave a broken image; unknown public API path gave 401; `#solution/constructor` and bad `%` broke the page. | Fixed. |
| lead, dev | Low | JDA 3 lists "Project 2b" twice (two dash styles). | Counted once now; the data itself should be fixed in JDA 3's feed. |
| lead, designer, member | Low | Tab count vs card count; chip names cut off; "+N more" went nowhere; footer said sign-in when signed in; no sign out on the public page; "← All JDAs" lost the JDA; hard-coded eyebrow and footer; logo alt read twice; heading levels; mono font; tier names unexplained; error pages with no way on. | Fixed. |
| dev | Low | `trust proxy` lets `X-Forwarded-For` dodge the public rate limit when no proxy is in front; no Content-Security-Policy on public pages. | Logged (Known issues). |
| designer | Low | Shared tokens differ between `site.css` and `styles.css`; status stripe colours alike; detail-page block headings are `div`s. | Logged for the final pass. |
| member | Low | "Program Lead" vs "Programme". | Kept the brief's wording ("Program Lead"). |
