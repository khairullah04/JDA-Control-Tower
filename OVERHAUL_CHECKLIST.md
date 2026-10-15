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
- [x] Repo search for `JDA 4`, `JDA4`, `jda-4`, `jda_4`, `jda4` and 5+ finds nothing outside this checklist and the review agent's instructions. *Checked: `grep -rniE "jda[ _-]?([4-9]|[1-9][0-9])\b"` and a search for "1, 2 and 4" / "1-4" (excluding node_modules, backups, vendor, drive-test-files).*
- [x] Database cleanup script `jda/server/scripts/remove-jdas.mjs` (logic in `jda/server/jda-removal.js`) removes JDA 4+ tracker records and every dependent row: projects, invoices, sanctioned amounts, audit lines (by JDA, project or record), activity log lines, report documents and their versions. Dry run by default; `--apply` runs `scripts/backup.mjs` first and deletes nothing unless the main project was saved. `processedFiles` is left: it names no JDA, and deleting a line would make the next Drive sync import that file again. *Checked: `jda-removal.test.mjs` (3 tests) on a stand-in database, including an invoice filed under Unsorted against a JDA 4 project.*
- [ ] Script run against the real database, and a second dry run finds nothing left. *Needs the service-account key.*
- [x] JDA list still comes from data/config, so adding a JDA later needs no code change. *Checked: the portal reads `JDAS` in `portal/js/config/app-config.js`; the tracker reads its `jdas` collection; nothing counts to 3.*

## Phase 2 (Priority 2): access control and routing

- [ ] `/`, `/jda/<id>/info` and `/login` open without signing in.
- [ ] Everything under `/control-tower` needs a session; without one, a page request redirects to `/login` and an API request gets 401.
- [ ] Old addresses (`/tracker/`, `/jda-report.html`, `/index.html`) redirect into `/control-tower` (and so to `/login` when signed out).
- [ ] Every private API endpoint rejects a request with no session.
- [ ] Sign in leads to the Control Tower landing page (or the private page that was asked for).
- [ ] The tracker's own login and passkey are removed; the tracker is not reachable without the main sign-in.
- [ ] Per-JDA editor passkeys are replaced by the main sign-in.
- [ ] Firestore rules: report documents readable only by signed-in people on the access list.
- [ ] "Portal" renamed to "JDA Control Tower" in every user-facing place.

## Phase 3 (Priority 3): public landing page

- [ ] Persistent sidebar: Home, JDA Status, Contacts (scroll to sections) and Sign in.
- [ ] Sections in order: TRICIPTA AI header, Overview, Roles image (jpg or png, placeholder until supplied), What is JDA, Existing JDAs, JDA Status cards, Contacts.
- [ ] Existing JDAs: tab per JDA with press release overview, projects, Program Lead cards, Business Champions cards, View more to its Info page; long text truncated.
- [ ] People seeded with "Name TBC" / "Title TBC" placeholders.
- [ ] JDA Status cards: name, title, number of projects, status badge (In the works / In progress / Finished).
- [ ] Info page per JDA at `/jda/<id>/info`: a separate read-only copy of the Master Page; private data stripped and listed below.
- [ ] Desktop and phone layouts checked.

## Phase 4 (Priority 4): Control Tower landing page

- [ ] Replaces the old portal main page and the tracker dashboard.
- [ ] Top tab bar to switch JDAs.
- [ ] Sync from Drive button (the tracker's existing sync), with loading, success and error states.
- [ ] Per JDA: progress circle (left), latest key update and date from Weekly Progress (right).
- [ ] Info button: Agreement and BRD documents.
- [ ] Key Insights boxes and Challenges boxes.
- [ ] Cost circle: paid / sanctioned (decided 2026-10-15), with Detail cost opening the tracker for that JDA.
- [ ] CJI3 to Payment Table flow verified end to end after the move (tax, forex, status, sanctioned checks).

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
| A9 | There is no build, lint or type-check in this repository; `npm test` plus `node --check` stand in for it. | Nothing to run otherwise. |

## Stripped from the public Info pages

(Filled in during Phase 3.)

## Known issues

- JDA 3's report document lives in another Firebase project (`jda3-9c0c5`) whose rules this
  repository does not control. Until its rules require sign-in, that document stays readable by
  anyone who knows the project, whatever this server does.
- New Firestore rules (`jda/firestore.rules`) only take effect once published in the Firebase console.

## Review findings

(Logged after each phase.)
