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
- [x] Repo search for `JDA 4`, `JDA4`, `jda-4`, `jda_4`, `jda4` and 5+ finds nothing outside this checklist, the review agent's instructions, and the removal script, its module (`jda-removal.js`), its test and the README line describing it, which name JDA 4 on purpose. *Checked: `grep -rniE "jda[ _-]?([4-9]|[1-9][0-9])\b"` and a search for "1, 2 and 4" / "1-4" (excluding node_modules, backups, vendor, drive-test-files).*
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
- [x] Sync from Drive button, top right (the tracker's own `runSync`, not rewritten): the button shows "Syncing: <file>" while it runs, then a result dialog, or the error in the same dialog. *Checked: browser in demo mode (sample Drive files), 6 files, "6 invoice(s) created"; the button is held while it runs.*
- [x] Per JDA: progress circle (left; average of its projects' %, A1) and the latest key update with its date, from Weekly progress (right). *Checked: browser with JDA 1's and JDA 3's real reports (44%, 24%).*
- [x] Info button ("Agreement & BRD", left corner, before the JDA's name) opens a dialog with the Agreement and BRD links (written in edit mode, Phase 6; "not linked yet" until then). *Checked: browser.*
- [x] Key Insights boxes and Challenges boxes (challenges from Overall progress with severity, unless written in edit mode; four shown, then "Show all"). *Checked: browser.*
- [x] Cost circle: paid / sanctioned, both with tax (A2), from the Invoice Tracker's Payment Table totals; red over 100%; "Invoices & payments →" (the brief's Detail cost) opens that JDA's page in the tracker (CJI3, payment tables, projects); the number of pending invoices is shown. *Checked: browser in demo mode (sample finance data), JDA 3 33%, the button opened JDA 2's page. The live Firestore and Drive paths are not tried in this Codespace (no key).*
- [x] CJI3 to Payment Table flow verified after the move (tax, forex, status, sanctioned checks). *Checked: `npm test` (finance-core, finance-api, finance-store: hand-worked tax and forex, status, duplicates, sanctioned-over checks, Excel in and out); CJI3, Payment Table and project pages loaded in a browser under `/control-tower/tracker/` with no console errors.*

## Phase 5 (Priority 5): richer Weekly Progress tasks

- [x] Task fields: title, description, owner, status (badge), priority (badge), start, due and completed dates, progress % or a checklist (progress then worked out from it), project, notes and blockers, last updated, and a stable id (worked out from title and project for tasks that have none, so the same every time). Completed is set when a task is marked Done in an edit; last updated is set on save for every task that changed. Stored values are read as they are (an unknown status is shown as written). *Checked: `portal-pages.test.mjs` (normalizeTask, taskProgress, stampTasks); the editor in a browser.*
- [x] Older tasks read without error (missing fields read as blank, `normalizeTask` in `portal/js/progress.js`), with a migration that writes the fields into the stored reports and a way back: `jda/server/scripts/migrate-tasks.mjs` (dry run by default, `--apply`, `--revert`; backup first; each save also keeps the previous version). *Checked: `task-migration.test.mjs` (only adds; old → new → revert gives back the stored tasks exactly, odd values included; keeps anything typed since). The script re-reads after a backup that must contain the reports it changes, and saves only if nobody changed them meanwhile. Not run on the real database: needs the key.*
- [x] Filter by status, due date (overdue, next 7 days, next 30 days, no date) and owner, with Clear filters; sort by due date, priority, status, owner or last updated; each row opens to its details (description, checklist, notes and blockers, dates, progress, last updated). *Checked: `portal-pages.test.mjs` (viewTasks); browser: sort by status, filter Not started (2 of 5), rows open and close.*
- [x] Editable in the existing editor (every task shown in stored order with its details as a form: description, notes, start, completed, checklist items; priority and status by clicking their badges; progress as a number when there is no checklist); the Drive sync reads the new fields when a weekly report states them, and its tasks are merged into the existing ones (ids and typed details kept), both on Edit report and in the editor. *Checked: browser (typed a description, added a checklist item, set priority; "Unsaved changes"); `portal-sync.test.mjs`.*

## Phase 6 (Priority 6): edit mode

- [x] Edit page button on both landing pages, only for signed-in people (public page: in the sidebar once signed in; Control Tower: top right). Saves are refused signed out (401) and must be JSON (415). *Checked: `app.test.mjs` (signed-out PUT 401, signed-in save, 409); browser on both pages.*
- [x] Every displayed piece of content editable: on the public page every header, subheader and body text, the eyebrow, tagline, contacts and footer in place; the Roles picture (upload, JPEG/PNG/WebP up to 8 MB, checked by its bytes) and its description; per JDA its title, status, press release overview, projects, number of projects, Program Leads and Business Champions (add, remove, reorder). On the Control Tower per JDA: Agreement and BRD links, key insights, challenges, progress and cost figures. Not editable here, by design: JDA names (the JDA list, A23); the Info pages, which copy each JDA's Master Page and are edited in its report editor; on the Control Tower each JDA's tagline, status, projects and latest key update, which come from its report and are edited there (the edit form says so); and fixed wording such as the mini-headings ("Press release overview", "Program Lead"), button labels and the sidebar links (the edit form says so). *Checked: browser, both pages saved and redrawn; `site-edit.test.mjs`.*
- [x] Saved on the server (Firestore `site/public` and `site/controlTower`, or `jda/server/.site-content.json` without a key), shown at once and after reload; who saved and when is kept but never published; a save made after someone else's is refused unless confirmed ("Save anyway"). *Checked: `site-edit.test.mjs`, `app.test.mjs`; browser.*
- [x] Derived values shown as derived (the public form shows the worked-out value as the field's placeholder with "Leave empty to use …"; status "Automatic: …"); overrides labelled ("Set by hand", "Written by hand" on the Control Tower; a written public value simply replaces the derived one). *Checked: browser (progress override shown "Set by hand").*

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
| A6 | Every signed-in person can use edit mode (both landing pages, report editor); there is no role system. | Open question 5 default; the code has none besides the passkeys being removed. |
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
| A24 | Task statuses stay the three in use (Not started, In progress, Done); "Completed" is read as Done, and any other status is kept and shown as written. | The JDA 3 feed and older reports use these; a new status would need its own rules. |
| A25 | Done counts as 100% when a task has no checklist and no % written; a checklist, when present, decides the %. | The simplest reading of "progress % or sub-tasks". |
| A26 | A completed date is only set when a task is marked Done in an edit; tasks that were Done before keep a blank date. Leaving Done clears it. | A made-up date is worse than none. |
| A27 | A weekly report from Drive still decides which tasks are on the list, but each matching task keeps its id and every detail the report does not state. | Before the overhaul the sync replaced the list; typed details must not be lost. |
| A28 | The JDA 3 Excel → Power Automate feed writes tasks in the old shape; its tasks get ids worked out from their titles, and details typed in the editor for JDA 3 are overwritten by the feed's next run. | The feed is outside this repository (Known issues). |
| A30 | The roles picture is stored as a file on the server (`site/public/`, not in git), not in the database. An upload waits outside public reach until Save; Cancel throws it away; the picture before (or one removed) is kept in `server/.roles-previous/`, outside public reach (R2 review); the backup copies both. | A picture is large; one server serves the site (see "One process only"). A second server would need the file copied. |
| A32 | (R2) The hero uses the two existing wide photos (`hero-banner.jpg`, `press.jpg`); project highlights use the stock solution pictures, at card size, in turn (not one per project). | No other pictures were supplied; a per-project picture would need a new edit field. |
| A33 | (R2) One accent, gold `#e2b53e` (`--accent`), only for thin rules and the active slide line; never text on white. | "One primary + one accent". |
| A34 | (R2) Microsoft Calendar's sign-in returns to `/control-tower/` (one address for every JDA page). | The progress pages' addresses differ per JDA. |
| A35 | (R2) "Projects under way" on the public figures strip = each JDA's projects less those at 100% on Overall progress. | Reviewers found the first version counted finished projects twice. |
| A36 | (R2) The progress ring opens Overall progress (not Weekly progress as the brief's mapping said); Latest key update, All updates and View tasks open Weekly progress. | Overall progress became its own page (the user's choice). |
| A37 | (R2) The Invoice Tracker keeps its own top bar (brand, Ask AI, Sign out); it gets the sidebar and, on a JDA's pages, the breadcrumb, JDA pages and JDA tabs. The progress pages' top bar carries Edit page only; their Drive sync stays in Housekeeping. | The tracker's bar holds its own tools (Ask AI); moving them is a separate piece of work. |
| A38 | (R2) The public Info page keeps its top bar, not the landing page's sidebar. | It is a single page with one way back ("All JDAs"); logged as a design follow-up. |
| A31 | Each landing-page save keeps the version before it (`previous`); a save made after someone else's is refused until confirmed, and the check and the write are not one transaction. | Two saves in the same instant are very unlikely for two pages edited by a small team. |
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

Kept, because the Master Page has always shown them publicly (the old portal had no sign-in): the banner, winning aspiration (including its targets, e.g. "30% NPV"), solution cards, collaborators, press release and sections added in the editor. On the landing page each JDA shows only its title, press release text and date, its press picture, project **names**, how many there are and how many are finished (a count, from Overall progress). What the report says underneath values written in edit mode (`report`, `derived`) goes only to edit mode, signed in (R2 review).

## Left for you

What the code cannot do on its own, in the order it is needed:

1. **Put the database key in place**: `server/service-account.json` (and `service-account-jda3.json` for JDA 3's project). Unblocks steps 2, 3, 6 and a full backup.
2. **Remove JDA 4 from the database**: `cd server && node scripts/remove-jdas.mjs` (dry run), then `--apply`. Ticks Phase 1's last item.
3. **Optionally write the new task fields into stored reports**: `node scripts/migrate-tasks.mjs`, then `--apply`.
4. **Give people access**: create their Firebase accounts and list their emails in `ALLOWED_EMAILS` (`server/.env`); set `SESSION_SECRET` (32+ characters). Nobody can sign in until then; real sign-in has not been tried here.
5. **For a real server**: `NODE_ENV=production`, `FINANCE_STORE=firestore`, HTTPS in front (docs/server-and-invoices.md, "Running in production").
6. **Publish the database rules** after steps 1 and 4 (start the server once so it copies the access list): `cd firebase && npx firebase-tools deploy --only firestore`. Until then the report documents stay publicly readable (the one outstanding High finding, Phase 2). Close JDA 3's own project rules the same way (`portal/firestore-rules-addition.txt`).
7. **Fill in the public page with Edit page**: the Roles picture, Program Lead and Business Champion names and job titles, contacts, and rewrite the draft copy (A21). On the Control Tower: each JDA's Agreement and BRD links, and key insights.
8. **Confirm A20**: that the Master Page content shown on the public Info pages (aspiration targets, collaborators' terms, extra sections) may be public.
9. **Data to correct**: JDA 1's press release image field holds "kai"; JDA 3's feed lists "Project 2b" twice.

## Known issues

- JDA 1's saved report has `"kai"` in its press release image field, which is not an image address. The page now skips such a field; correct it in the JDA 1 editor.
- Real Firebase sign-in not tried in this Codespace: `ALLOWED_EMAILS` in `server/.env` is empty. Tested with the Google check stubbed (`app.test.mjs`).
- JDA 3's report document lives in another Firebase project (`jda3-9c0c5`) whose rules this
  repository does not control. Until its rules require sign-in, that document stays readable by
  anyone who knows the project, whatever this server does.
- New Firestore rules (`firebase/firestore.rules`) only take effect once published, and must be published in this order, or every report page breaks: (1) put `service-account.json` in `jda/server`, (2) restart and check the log says the access list was "copied to Firestore for the database rules", (3) `cd firebase && npx firebase-tools deploy --only firestore`. Until then JDA 1 and 2's report documents stay readable by anyone with the public Firebase settings.
- Sign out clears the cookie in the browser only; a copied cookie keeps working until it runs out (8 hours). A server-side revocation list is not built.
- `REQUIRE_AUTH=false` is only refused when `NODE_ENV=production` is set; a server deployed without it and with `false` would be open (the start-up log says so loudly).
- The tracker's top bar (seven items) wraps to three rows on a phone and its buttons are under 44px; not changed in this overhaul yet.
- `app.set('trust proxy', 1)` assumes one proxy in front; reached directly, a caller can set `X-Forwarded-For` and dodge the public rate limit (the one-minute cache limits the cost). Set it to match the real deployment.
- JDA 3's tasks are rewritten by its Excel → Power Automate feed in the old shape, so details typed in the editor for JDA 3 do not survive the feed's next run (A28). The feed would have to update tasks field by field.
- The tracker's own JDA page keeps its Sync from Drive button as a second way to the same sync (A22).
- Microsoft Calendar sync still keys its events by task title, so renaming a task makes a second event. Changing the key would duplicate every event already synced, so it is left.
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

### Phase 4 (web-designer, team-member; software-developer and team-leader stopped early on a usage limit and are run again with Phase 5)

| Who | Sev. | Finding | Done |
|---|---|---|---|
| designer, member | High | Sync from Drive stayed clickable while running (the tracker's code was handed the label, not the button): a second click read the same files again. | Fixed: the whole button is held (`disabled`, `aria-busy`) until the sync ends. |
| member | Med | Detail cost fell back to the first JDA's Payment Table when a JDA was not in the tracker. | Fixed: no button then; "Not in the Invoice Tracker yet". |
| member | Med | Cost failure looked like "no data". | Fixed: "Cost figures could not be read just now". |
| member | Med | Pending-invoice count from the old front page was gone. | Fixed: "N invoices pending →" on the cost gauge, to that JDA's CJI3 register. |
| member | Med | Recent activity lines lost their JDA / project. | Fixed: "JDA / project:" in front again; reloads after a sync. |
| member, designer | Med/Low | Add JDA message told staff to edit a code file. | Fixed: plain wording. |
| member | Med | Landing "sanctioned" vs tracker "budget" figures. | Labelled: the ring says paid of sanctioned, with tax; the tracker page's budget figures are a different measure (logged). |
| designer | Med | Rings alike and far apart; progress ring had no heading. | Fixed: progress (teal) and cost (blue, red over 100%) side by side in one card, each with a heading. |
| designer | Med | Sticky tab bar slid under a two-row top bar at tablet widths. | Fixed: sticky only above 1100px. |
| designer | Med | Status pill contrast 2.5–3.0:1. | Fixed on this page (darker text). |
| designer | Med | Tab panel focus invisible. | Fixed: panels are no longer a Tab stop (they hold links and buttons). |
| designer | Med | Insight and challenge text cut at 4 lines with no way to read it. | Fixed: long text opens with "Read all". |
| designer, member | Low | Selected tab badge contrast; top-bar link contrast; summary had no disclosure sign; low severity looked like an insight; small touch targets; title after the button; import failure left "Loading" forever; stale update not marked; "Detail cost" wording; back links lost the tab; "Sync from Drive" ambiguous. | Fixed. |
| designer | Low | Shared `#modal` has no accessible name; refresh resets "Show all". | Logged for the final pass. |
| member | Low | Tracker Copilot's all-JDA question chips went with the old front page. | Logged. |

### Phase 4 again and Phase 5 (all four)

| Who | Sev. | Finding | Done |
|---|---|---|---|
| dev, lead, member | High | Drive update replaced the task list: typed details and ids lost. | Fixed: `mergeTasks` (match by id, then title and project), in Edit report and the editor; tested. |
| dev, lead, member | High | First save gave every old Done task today's completed date. | Fixed: only a task marked Done in this edit; tested (A26). |
| member | High | Sign out from the editor lost unsaved work. | Fixed: Sign out asks first when there are unsaved changes (editor and landing-page edit mode). |
| designer | High | Priority and status in the editor were mouse-only. | Fixed: real buttons with names; checked by keyboard. |
| dev, lead | Med | `normalizeTask` and the migration rewrote stored values; revert could not undo them. | Fixed: values read as stored; migration only adds; round-trip test with odd values. |
| dev, lead | Med | Migration's backup check weaker than the removal script's; plan made before the backup; saved with force. | Fixed: one shared `backup-first.mjs` (both scripts) requires the reports it changes in the backup; re-read after it; saved with the read version; `--revert` is a dry run without `--apply`. |
| lead | Med | Random ids for id-less tasks changed on every read. | Fixed: ids worked out from title and project (A28 for JDA 3's feed). |
| lead | Med | No due-date filter; Phase 5 choices not logged. | Fixed: Due filter; A24 to A28. |
| lead | Med | Agreement & BRD button was on the right. | Fixed: left, before the name. |
| dev | Med | Page stuck on "Loading" if drawing failed (e.g. cost override with the tracker unavailable). | Fixed: money formatted locally; drawing errors shown. |
| member | Med | Completed date accepted on a task not Done, then dropped; untitled task dropped on save; dates redrawn mid-typing; no way into editing tasks. | Fixed: disabled until Done; kept as "Untitled task"; dates taken without a redraw; "Edit tasks" on Weekly progress and in the Control Tower. |
| designer | Med | Phone table needed sideways scrolling; toggle had no name; Done and OVERDUE contrast; every form open at once; "Show less" missing. | Fixed: cards on phones; named toggle; darker text; editor rows open one at a time; Read all / Show less. |
| designer | Med | Gauges still apart; Sync disabled button loses focus. | Gauges share one card (progress left, cost right, per the brief's layout); disabled kept so a second sync cannot start. |
| member | Med | Concurrent saves of progress overwrite as a whole. | Logged: the save is refused first and says so (existing behaviour); per-field saving not built. |
| dev, lead, member | Low | Nothing-sanctioned case; duplicate tracker names; dead catch; pending link wording; unused export and function; status list repeated; tracker back links; Edit report button name; prompt cache; sort direction; Clear filters; empty detail sections; open rows by position; owner in mono. | Fixed. |
| dev | Low | Calendar events keyed by title. | Logged (Known issues). |
| member | Low | Last updated does not say who; no undo for Delete task; "Live report, backed by Firestore" wording. | Logged for the final pass. |

### Phase 6 and final review (all four)

| Who | Sev. | Finding | Done |
|---|---|---|---|
| lead, dev | High | A new test named `jda9`. | Fixed: `jdaz`; the search is clean apart from the removal files. |
| lead, member, dev | High/Med | Edit-mode saves sent only the cookie: a save after it ran out was lost. | Fixed: the Control Tower sends the Firebase token; on the public page an ended sign-in keeps the edit on screen and offers sign-in in a new tab. |
| member, designer, dev | High/Med | The Roles picture went public on choosing it; Cancel could not undo it; the old one was deleted. | Fixed: it waits until Save, Cancel discards it, the one before is kept, Remove picture added; tested. |
| dev | High | Document links accepted http:// and had no length limit. | Fixed: https only, label 300 and link 2000 characters; tested. |
| designer | High | Focus lost after Move up/down or Remove in the list editor. | Fixed: focus stays on the item's button or the next field; each change is announced. Checked in a browser. |
| designer, lead, member, dev | Med | Control Tower forms vanished after a sync or Add JDA during editing. | Fixed: both held while editing. |
| designer, lead, member, dev | Med/Low | Cancel left "unsaved changes" behind; listeners piled up; "Save anyway" stuck. | Fixed. |
| designer | Med | In-place fields all named "Type here"; no focus or message on open, save or cancel; menu stayed open on phones; save bar over Sign out and the page bottom. | Fixed: fields named by section; focus moved and a message shown; menu closes; bar beside the sidebar; phone padding and safe area. |
| member | Med | Values from the reports not shown once overridden; wrong project count in the note; derived progress and cost not shown beside their overrides. | Fixed: the report's values are always sent and shown; progress and cost notes give the current figures. |
| member | Med | Typed challenges lost by unticking; bad links and numbers dropped silently. | Fixed: kept while unticked; warnings beside link and number fields. |
| dev, member | Med | Saves not undoable; backup missed the landing content and picture. | Fixed: previous version kept; backup copies both (A30, A31). |
| dev | Med | Edit mode errors not shown; double-click opened it twice. | Fixed: awaited, button held until open. |
| lead | Med | No single list of what is left for the user. | Fixed: "Left for you" above. |
| dev, lead | Low | `force` accepted any truthy value; read errors said "could not be saved"; 25 MB bodies parsed for anyone. | Fixed: `force === true`; messages per route; 1 MB except signed-in routes that need more. |
| lead | Low | 401 test missed the new routes. | Fixed. |
| designer | Low | Invalid font shorthands; placeholder contrast; small touch targets and iOS zoom; status wording; "Title" for people. | Fixed. |
| designer, member | Low | Groups not collapsible on the Control Tower form; check-and-write not one transaction; no undo for a single removal. | Logged (A31; Cancel undoes everything unsaved). |

---

# Round 2: fixes, restructure and visual refresh

Brief pasted 2026-10-15. Decisions asked of the user that day: the Master Page is edited **on the public Info page** by signed-in staff (no private copy); **Overall progress stays as its own private page** next to Weekly progress. Open-question defaults: hero images are the largest existing ones; colours keep the teal primary with one accent; Agreement/BRD are Drive (or SharePoint) links with an embedded preview where the link allows it.

## R2 Phase 1: restructure (no behaviour change)

Audit of the tree before the move (2026-10-15):

- **Three front-end roots with no shared shape**: `site/` (public), `portal/` (private Control Tower and report pages), `jda/web/` (Invoice Tracker), plus `shared/` at the top, and the server buried in `jda/server/` beside the database rules in `jda/`.
- **Three `package.json` files** (`portal/`, `jda/web/`, `shared/`) that only say `"type": "module"`.
- **Design tokens defined four times**: `:root` colours in `site/css/site.css`, `portal/css/styles.css`, `jda/web/css/base.css` and `jda/web/css/finance.css`, already drifting (`--muted`, `--green`, `--amber`, `--red` differ).
- **Business logic in components**: progress % (average of projects), cost % (paid / sanctioned), latest key update and challenge selection live inside `portal/js/control-tower.js` (`figures`, `loadCosts`).
- **Misplaced and leftover code**: `SYNC_API_URL` (`portal/js/config/app-config.js`, `portal/js/api.js`) for a cross-origin setup the single sign-in no longer supports; `portal/js/config/jda-content.js` (private starter data) beside public config; the architecture diagram markup and styles (`arch2-*`, `archModal`) used by no public page and only by the private master page that Round 2 removes; the private master page itself (`portal/jda-report.html` overview screen, `masterEditBtn`, `editorTop`).
- **Local leftovers**: `jda/server/portal-passkeys.json` (passkeys were removed in Phase 2; not in git).
- **Docs spread** over `README.md`, `jda/README.md`, `portal/README.md`, `portal/firestore-rules-addition.txt`, `portal/assets/README.md`, `site/public/README.md`.
- Not ours, left alone: `graphify-out/`, `.gitattributes` and the git hooks that stage them (another tool on this machine).

- [x] Target structure in place (the tree in `README.md`): one front-end root `web/` whose folders are the addresses: `web/public` → `/public` (public), `web/shared` → `/shared` (public, code and pictures only), `web/control-tower` → `/control-tower` (private), with the Invoice Tracker at `web/control-tower/invoices` (`/control-tower/invoices/`; the old `/tracker/` and `/control-tower/tracker/` redirect there). 175 files moved with git (history kept); their relative imports recomputed by script from each file's new place. *Checked: `npm test` 140/140; every page loaded in a browser with no console errors.*
- [x] Server in `server/` (its local `.env`, `node_modules` and data files moved with it), database rules in `firebase/`, docs in `docs/`. *Checked: server starts; tests pass from `server/`.*
- [x] One component per file; modules named in kebab-case (the repository's convention: no framework, so no PascalCase component files); routes in kebab-case. The JDA's private built-in content (`jda-content.js`) is under `web/control-tower/config`, outside every public folder. *Checked: `app.test.mjs` requests every file under `web/control-tower` signed out (302) and tries `..` out of `/public` and `/shared` (refused).*
- [x] Business logic moved out of the page code: progress %, cost %, latest key update, challenges and tracker totals into `web/control-tower/lib/jda-figures.js` (private: it uses the tracker's rules); report, task and picture-path logic in `web/shared/lib/` (`overview.js`, `progress.js`, `assets.js`). Drive sync stays where it was: the server (`server/portal-sync.js`) and the tracker's service (`invoices/js/services/sync.js`). *Checked: `jda-figures.test.mjs` (4 tests).*
- [x] Design tokens in one file (`web/shared/styles/tokens.css`), loaded first by all six pages; the four `:root` blocks are gone; the tracker's `--green` (which meant teal) now uses the teal tokens. *Checked: grep finds one `:root`; screenshots.*
- [x] Dead code and orphaned files deleted, each listed:
  - `portal/package.json`, `shared/package.json`, `jda/web/package.json` → one `web/package.json`.
  - `SYNC_API_URL` (`jdas.js`, `portal-api.js`): a cross-origin setting the single sign-in cannot use.
  - Four duplicate `:root` token blocks (`site.css`, `styles.css`, tracker `base.css`, `finance.css`).
  - The tracker's own web fonts (Inter, Manrope, JetBrains Mono): every page now uses the token fonts.
  - Server routes for `/site/...` and `/lib/blocks.js` (replaced by `/public` and `/shared`).
  - Not deleted, for the user: `server/portal-passkeys.json` (a local, ignored file of the passkeys removed in Phase 2; unused).
  - Removed in R2 Phase 3 instead (they are behaviour): the private master page and the architecture diagram.
- [x] No behaviour change: sign-in (route and session tests), Drive sync (portal and tracker sync tests; tracker page loads), invoice flow (finance tests; CJI3 and Payment Table pages load), weekly progress (page and editor load) checked after the move. One visible change: the tracker's fonts are now the shared ones. *Checked: `npm test` 140/140; browser pass over all pages.*

## R2 Phase 2: scale down and visual refresh

- [x] UI about 20% smaller through the tokens (type, spacing, radii, component sizes), body text at least 14px, tap targets usable. `--space-scale` and `--type-scale` (0.8) in `web/shared/styles/tokens.css`; every stylesheet's sizes go through them; text never below 14px where it was 14px or more; 40–48px tap targets and page max-widths keep their size.
- [x] Public landing: hero carousel (TRICIPTA AI, slides Overview / What is JDA / each JDA, slide titles as tabs), latest press releases (one featured, smaller dated cards), JDA status pillar cards, a key-figures strip, image-led project highlights, a subtle pattern in sidebar and footer, a clean footer. The carousel turns every 7 s, stops while hovered or focused, in edit mode, with reduced motion, or on Pause; tabs work with arrow keys. Press releases are dated with the new **Press release date** field (edit mode, per JDA); the newest is featured. Figures: number of JDAs, projects under way, projects finished (100% on Overall progress). Footer: section links, sign-in, ©, and LinkedIn / website once written (new optional Contacts cards, shown in edit mode until filled). Sections fade in on scroll (not with reduced motion).
- [x] Same card, type and spacing system in the Control Tower: same tokens, one accent (`--accent`) under headings, dot pattern (`--dots`) in sidebar and footer. Its top bar and per-card links are reworked in R2 Phase 5.
- [x] Collapsible sidebar (icon rail with tooltips, remembered per browser, drawer on phones) on both sides. One script (`web/shared/components/sidebar.js`) and one stylesheet (`web/shared/styles/sidebar.css`); the Control Tower's is drawn by `web/control-tower/components/ct-sidebar.js` on its landing page, a JDA's pages and the Invoice Tracker (Control Tower, each JDA, CJI3 register, Payment tables, View public site). The tracker's and landing page's duplicate top-bar links (CJI3, Payments, ← Control Tower, Public site) were removed in favour of it.
- [x] Overview and What is JDA in faint section boxes.

Assumptions: the hero uses the two existing wide photos (`hero-banner.jpg`, `press.jpg`); the 480px solution pictures are used only at card size. Accent is a gold (`#e2b53e`) used for thin rules only, never for text on white.

## R2 Phase 3: master page only public

- [x] Private master page routes, components and links removed; no references left. The Overview screen, solution detail screen, architecture diagram (markup, script, 70 + 29 style rules), jump bar, "Continue to…" band and the JDA's edit icon are gone from `web/control-tower/jda-report.html` and `components/report.js`. The page is now only Overall and Weekly progress, at `/control-tower/<jda>/overall-progress` and `/weekly-progress` (`/control-tower/<jda>` leads to the first). Old addresses (`jda-report.html#/jda1/...`, `?jda=`) are forwarded by `web/control-tower/lib/old-addresses.js` (tested): the Master Page and its solutions → `/jda/<jda>/info`; progress, project, weekly and their edit modes → the new pages (`#edit`, `#project/<name>`). The Control Tower's "Master Page" link is now "Master Page (public) ↗".
- [x] Master Page edited on the public Info page by signed-in staff; Info pages still render. Signed in, the Info page shows **Edit Master Page**, which loads `web/control-tower/components/master-edit.js` and `master-page.html` (private: signed out, both answer 302 to /login, tested) and turns the page into the editor in place: the same in-place editing, drag-to-reorder, block editor for solution pages, Update from Google Drive, Reset and Save as before, saving through `/api/portal/save`. `editor.js` now has two modes (`master`, `progress`). Progress is edited on its own pages (**Edit progress**, which became **Edit page** in the top bar in R2 Phase 5).

Assumption: Microsoft Calendar's sign-in now returns to one fixed address, `/control-tower/` (the per-page address changed with every JDA and page); docs updated.

## R2 Phase 4: Agreement & BRD page

- [x] `/control-tower/<jda>/documents`: Agreement and BRD with preview/embed, open/download, metadata (title, version, date, source), edit mode to add, replace, remove and edit metadata. Page: `web/control-tower/documents.html`, `components/documents.js`; link rules in `lib/documents.js` (tested). Google Drive files and Google Docs/Sheets/Slides are previewed and downloaded directly; SharePoint links preview with `action=embedview` and download with `download=1`; a plain `.pdf` link is previewed by the browser; any other https link has Open only. The first document of each kind is previewed on arrival, the others on **Preview**; the newest by date is marked **Latest**. Source is worked out from the link when not written. **Edit page**: add, replace (new link), remove, reorder, and edit title, version, date and source; saved with the Control Tower's written content (`/api/site/controlTower`, checked again on the server). Entries saved before (`{ label, url }`) read as `{ title, url }`. The Control Tower's **Agreement & BRD** button opens this page (the dialog is gone), and its edit form points here instead of holding a second copy of the document fields.
- [x] Mapping of what the private master page linked to → its new home:

| Was (private Master Page, `jda-report.html#/<jda>`) | Now |
|---|---|
| The Master Page itself (hero, aspiration, solutions, collaborators, press release, added sections) | The public Info page, `/jda/<jda>/info`; edited there with **Edit Master Page** (signed in) |
| A solution's detail page (`#/<jda>/solution/<key>`) | `/jda/<jda>/info#solution/<key>` |
| The JDA's edit icon → Editor Page (`#/<jda>/edit`) | **Edit Master Page** on the Info page; progress: **Edit page** on its own pages |
| Overall progress (`#/<jda>/progress`), a project (`#/<jda>/project/<name>`) | `/control-tower/<jda>/overall-progress`, `…#project/<name>` |
| Weekly progress (`#/<jda>/weekly`), Edit tasks (`#/<jda>/edit/weekly`) | `/control-tower/<jda>/weekly-progress`, `…#edit` |
| "Continue to overall progress / weekly progress" band | The top bar's Overall progress / Weekly progress, and the sidebar |
| Architecture diagram ("View full architecture diagram") | Removed with the private Master Page (it was never public) |
| Agreement & BRD (a dialog on the Control Tower) | `/control-tower/<jda>/documents` |
| Edit report (footer) | Unchanged, in the bottom bar of the progress pages |

## R2 Phase 5: Control Tower top bar, no per-card action bar

- [x] Per-card link bar removed; every action mapped (table below) and discoverable.
- [x] Top bar: title and JDA tabs left; Sync from Drive, Edit page, View public site, user menu right. One module, `web/control-tower/components/ct-topbar.js`, styled by `styles/ct-frame.css`, on the Control Tower landing page, Overall/Weekly progress and Agreement & BRD. On the landing page the tabs are its JDA tabs (with progress %); Sync from Drive and Edit page sit beside View public site; the user menu (person icon) shows who is signed in and Sign out (Escape or a click outside closes it). "+ Add JDA (invoices)" stays in the page header. On a narrow window the tabs wrap to their own row; on a phone the action labels become icons.
- [x] Sub-pages (documents, overall progress, weekly progress, invoices): breadcrumb and JDA tabs that keep the sub-page. Under the top bar: Control Tower › JDA › page, then the JDA's pages (Agreement & BRD · Overall progress · Weekly progress · Invoices & payments · Master Page (public) ↗; Agreement & BRD first, at the user's request). The JDA tabs lead to the same page of the other JDA. `/control-tower/<jda>/invoices` opens the Invoice Tracker's JDA of that name (`#/named/<name>`, tested); there the breadcrumb, pages and JDA tabs sit above the tracker's own page (its top bar is its own), and its "← Control Tower" button is gone.

| Was on each JDA card (link bar) | Now |
|---|---|
| Overall progress | Click the **progress ring**; the JDA's pages under the top bar; the sidebar's JDA |
| Weekly progress & tasks | Click **Latest key update**, **All updates**, or **View tasks** (to the task list) |
| Edit tasks | **Edit tasks** on Weekly progress (as before), or **Edit page** in its top bar |
| Master Page (public) ↗ | **Master Page ↗** in the JDA's pages; **View public site** in the top bar |
| Invoices & payments | Click the **cost ring**, or **Detail cost →**, both `/control-tower/<jda>/invoices` |
| Agreement & BRD | Unchanged button, now the Agreement & BRD page |
| Edit page, Sync from Drive (page header) | The top bar |

## R2 Phase 6: review

- [x] Four review agents run with the Round 2 checks; High findings fixed; others logged (tables below).
- [x] Tests and syntax checks pass (145 of 145; `node --check` on every changed file); no console errors on any page in a headless browser (Firestore's streaming channel errors in this sandbox aside); signed out, every private route redirects to /login (developer reviewer, all 66 private files and every new address, plus app tests).

### R2 review: fixed

| From | Severity | Finding | Fix |
|---|---|---|---|
| member | High | Edit tasks on Weekly progress did nothing (only added `#edit`). | It switches into edit mode; the address keeps `#edit`. |
| lead, designer | High | "Continue to weekly progress" left over; Housekeeping said to use "the icon on the Master Page" (gone). | Button removed; text says Edit page, and Edit Master Page on the Info page. |
| designer | High | Sign out invisible (white on white) in the user menu. | Dark button and focus ring inside the white menu. |
| developer | High | `jda9` back in two new tests. | `jdaz`. |
| member, lead, developer | Medium | After saving the Master Page the Info page showed the old one for up to a minute. | The server forgets that JDA's cached report on every save (tested). |
| lead | Medium | The public API sent the report's wording under values written over it. | `report`/`derived` only go to edit mode, signed in (tested). |
| lead, developer | Medium | A removed Roles picture stayed public as `roles-previous.*`. | Kept in `server/.roles-previous/`, not served; backup copies it (tested). |
| lead, designer | Medium | "Projects under way" counted finished projects. | Projects less finished (A35). |
| lead | Medium | Status colours drifted from the tokens. | Control Tower styles use `--amber`, `--green`, `--red` and tints. |
| lead, developer | Medium | Setup steps, scripts, messages and docs pointed to `jda/…`, `portal/…`. | Paths fixed (`server/`, `firebase/`, `docs/`); restore examples `../backups/…`. |
| member | Medium | Switching Overall/Weekly while editing left edit mode. | Handled in the page; the draft and `#edit` stay. |
| member | Medium | Sign-in ending mid-edit sent the person to /login, losing the edit. | The editors keep the page and say to sign in in a new tab. |
| member, designer | Medium | Overall progress hard to find on the landing page; sidebar JDA only switched tabs. | Visible "Overall progress →"; sidebar JDA opens its Overall progress. |
| member | Medium | Editing the Master Page not findable from the Control Tower. | "Master Page (public) ↗" on each JDA (landing and its pages), saying edits happen there. |
| member | Medium | Drawer stayed open after a link on the same page. | Any link closes it on a phone. |
| member, lead | Medium | Out-of-date edit intro; "Edit report" name. | Intro rewritten; "Edit report" is "Housekeeping". |
| designer | Medium | Top bar text contrast. | Bar in the sidebar's deep teal; inactive tabs white. |
| designer | Medium | Tap targets and edit controls shrunk by the scale. | 40px small buttons; edit controls 24px, 40px on touch. |
| designer | Medium | Ring labels 10px. | 12px. |
| designer | Medium | Top bar three rows on a phone; Edit page with no icon. | Bar scrolls away under 640px; every action has an icon and label. |
| designer | Medium | iOS zoom on edit and sign-in fields. | 16px fields on phones. |
| designer | Medium | Hero tabs off-screen and text over bare photo on phones. | Tabs share the width and follow the slide; even dark veil. |
| designer | Medium | No skip link; progress pages had no `<main>`. | Skip links on every private page; `<main id="main">`. |
| designer | Medium | Focus lost opening Master Page edit mode. | Focus goes to the editor's heading. |
| designer | Medium | Phone drawer could not scroll. | It scrolls. |
| designer | Medium | Tab focus ring invisible on the tracker's light JDA tabs. | Teal ring there. |
| developer | Medium | Two name-matching rules (cost ring vs Invoices & payments). | One `jdaNameKey` used by both. |
| several | Low | Broken reset button markup; `aria-current=""`; both crumbs to one address; menu stays open on Tab-out; storage not wrapped; Back after opening the editor threw; unclear error when the session ended before edit mode; old `#/jda1/edit` and `?jda=` bookmarks; same-site PDF previews; two auto previews on phones; JDA nav missing on the tracker's CJI3/Payment pages; duplicate page title; dead CSS (13 classes, 20 selectors); hover lift on cards that are not links; slide labels; Housekeeping and banner wording. | All fixed. |

### R2 review: logged, not fixed

| From | Severity | Finding | Why not now |
|---|---|---|---|
| developer, lead | Medium | `web/shared` holds code only private pages use (progress, portal-api, firebase, account), and `overview.js` imports the private `jda-content.js`. | No data is exposed (verified signed out); moving five modules touches the server's imports and tests. Next restructure. |
| lead | Medium | The tracker keeps its own top bar; progress pages have no Sync in the bar. | Logged as A37. |
| lead | Medium | About 70 more hard-coded colours (shadows, gradients, chart colours) in report.css, edit.css, finance.css. | The status colours are fixed; the rest need a design pass with new tokens. |
| member | Low | "Latest" ignores undated documents; replacing a link keeps no history (a hint now says to use + Add). | Needs a "new version" action. |
| member | Low | "Invoices pending" opens the full register, not filtered to Pending. | Needs a filter in the tracker's address. |
| designer, lead | Low | Project highlights use stock pictures in turn (A32); Info page has no sidebar (A38). | Need pictures / a design decision. |
| designer | Low | Public edit bar starts at 244px when the rail is collapsed; collapsed sidebar animates on load; some sizes outside the tokens; headings floor at 14px. | Cosmetic. |
| developer | Low | `architecture` still in the built-in content and section lists (hidden; moving sections skips it now). | Data clean-up with the next content change. |

## R2 summary

- **New structure**: `web/public` (public pages, `/public`), `web/control-tower` (private, `/control-tower`, with the Invoice Tracker in `invoices/`), `web/shared` (code, styles and pictures every page uses, `/shared`), `server/`, `firebase/`, `docs/`. The README's tree has the detail. New in Round 2: `web/shared/styles/sidebar.css` and `components/sidebar.js`; `web/control-tower/components/ct-sidebar.js`, `ct-topbar.js`, `master-edit.js`, `documents.js`; `master-page.html`, `documents.html`; `lib/old-addresses.js`, `lib/documents.js`; `styles/ct-frame.css`.
- **Files moved and deleted**: listed under R2 Phase 1 (175 files moved, the deletion list there); Round 2 also deleted the private Master Page screens, the architecture diagram, the Agreement & BRD dialog and their styles (R2 Phases 3–5).
- **Old link → new home**: the tables under R2 Phase 4 (the private Master Page) and R2 Phase 5 (the per-card link bar). Old `jda-report.html#/…` and `?jda=` bookmarks are forwarded.
- **Things to supply**:
  - **Everything under "Left for you"**: the database key, removing JDA 4, `ALLOWED_EMAILS` and `SESSION_SECRET`, publishing the rules, confirming A20, writing the content.
  - **For each JDA**: the Agreement and BRD links (with version, date and source) on its Agreement & BRD page, and a press release date.
  - **Contacts**: the LinkedIn and website addresses, if wanted.
  - **Pictures**: a picture per project, if the stock pictures (A32) should go.

## After Round 2: requested changes

- [x] Agreement & BRD first in a JDA's pages; its button at the bottom right of Latest key update.
- [x] S-curve charts no longer shrink (fixed-height box, measured again when shown); the % centred in the Overall progress ring.
- [x] Picture placeholders beside Overview and What is a JDA.
- [x] **Edit public site** (`/control-tower/site`): the public site is edited in one place in the Control Tower, in tabs Main page, JDA 1, JDA 2, JDA 3, each the live page in edit mode. The public pages' own edit buttons are replaced by "Edit in Control Tower". New on the main page: five uploadable pictures (two hero slides, Overview, What is a JDA, Roles; server `PICTURES`, `/api/site/image/<key>`, tested: unknown names refused, nothing public before Save, removed ones kept out of public reach) and editable figure labels. Old `#/<jda>/edit` bookmarks lead to the JDA's tab here.
  - Not yet uploadable (still links typed in edit mode): a Master Page's press release picture and collaborator logos; solution pictures are chosen from the built-in set. The landing page's menu labels and footer links are fixed wording.
- [x] The top bar's actions (Edit page, Sync invoices from Drive, Edit public site, View public site) in one **Tools** menu (keyboard: arrows, Escape); a running sync's progress shows beside it.
