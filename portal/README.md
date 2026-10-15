# JDA Programme Portal

Every page uses the design of the JDA3 reference report (`index (5).html`): its stylesheet, markup,
images and behaviour, shared from one place.

```
portal/
  index.html               Portal main page: one card per JDA (live progress) + Administration
  jda-report.html          One template for every JDA: its Master Page at jda-report.html#/jda1 ... #/jda3,
                           and its Editor Page at #/jda1/edit
  css/
    styles.css               The reference stylesheet verbatim, plus a short portal-only block at the bottom
  assets/                    Shared images (extracted from the reference) - see assets/README.md
  js/
    portal.js                Portal main page: JDA cards, Administration passkey gate
    report.js                 JDA report page: the reference's script, ported
    editor.js                 The Editor Page: in-place editing of a Master Page and the progress screens
    block-editor.js           The full-page block editor for a solution's detail page
    blocks.js                 Block types, the HTML clean-up and how a block is drawn (shared by both)
    overview.js               How a saved Master Page combines with a JDA's built-in content
    progress.js               Project ids, and how a task stays tied to its project
    api.js                    The one way these pages call the JDA server
    config/
      app-config.js           JDA list (name, edit icon, where its data lives), Invoice Tracker link
      firebase.js              Opens each JDA's report document (the settings are in ../shared/firebase-config.js)
      jda-content.js           Everything written about a specific JDA (overview text, solutions, starter data)
../shared/                  Code and libraries this portal shares with the Invoice Tracker: esc, dates,
                            the Firebase settings, and Chart.js, SortableJS and the Firebase SDK (shared/vendor)
```

The pages are served by the JDA server (`jda/server`), which also serves `/shared`. They do not
work opened from a plain file server that has only this folder.

## Pages and navigation

- Portal top bar: two tabs, JDAs and Administration, which jump to those sections of the page.
- Portal -> a JDA: the JDA cards. A JDA -> Portal: the "Portal" tab or the logo.
- Portal -> Invoice Tracker: Administration card, after the passkey (`INVOICE_TRACKER_URL`).
  Invoice Tracker -> Portal: "Portal" in its top bar and on its login screen (`portalUrl` in
  `jda/web/js/config/app-config.json`).
- Inside a JDA: Overview, Overall progress, Weekly progress, plus project and solution detail
  screens and Edit report (footer link).

## Where each JDA's data lives

| JDA | Firebase project | Document |
|---|---|---|
| JDA 3 | `jda3-9c0c5` (the original JDA3 report's own project) | `report/current` |
| JDA 1, 2 | `test-invoice-c38a4` (same as the Invoice Tracker) | `jdaReports/jda1`, `jda2` |

JDA 3 reads the same document the reference page does, so the Excel -> Power Automate sync that
feeds it carries on working. To move a JDA, change its `source` in
`js/config/app-config.js`.

Document shape (all fields optional):

```js
{
  weekLabel: "Week of ...", overallStatus: "green"|"amber"|"red",
  projects: [{ name, owner, pct, status, description, taiPct?, ibmPct?, scurve? }],
  tasks: [{ task, project, owner, due: "YYYY-MM-DD", status: "Not started"|"In progress"|"Done" }],
  updates: [{ date: "YYYY-MM-DD", text }],
  challenges: [{ severity: "low"|"medium"|"high", title, description, mitigation }],
  scurve: { startMonth: "YYYY-MM", months: [...], planned: [...], actual: [...] }  // actual: null for future months
}
```

## Master Page, Editor Page and passkeys

The **Master Page** is a JDA's main page (the overview screen). Each one carries that JDA's own
icon, top right of the banner (`icon` in `js/config/app-config.js`); it is the only way into the
editor, and the tabs in the top bar then move between the three screens. Clicking it asks for the JDA's passkey ("Master Access JDA 1")
and opens the **Editor Page** (`#/jda1/edit`, `/edit/progress`, `/edit/weekly`): the same three
screens, drawn by the same code. On the Master Page it has

- every piece of text editable in place (dashed outline);
- dashed buttons to add or remove aspirations, solution groups, solutions (with their detail
  pages), collaborators, the press release, and whole new sections of cards;
- drag handles (the dotted grip): drag an aspiration, solution, collaborator or card to reorder it
  (solutions can be dragged between groups), and drag **Move section** to move a whole section up
  or down the page. With the keyboard, focus a handle and use the arrow keys;
- **Edit detail page** on a solution card opens a full-page block editor for that solution's
  detail page. The page is a list of blocks: Header, Sub Header, Sub Sub Header, Body, or a Box
  row (boxes side by side, each a title and an optional explanation). Add a block between any two,
  drag the grip to reorder (mouse or touch; SortableJS, kept in `shared/vendor`), or use the up/down
  buttons; change a block's type, duplicate or delete it; format text with bold, italic, underline,
  lists and links. Its Save publishes straight away, together with any other unsaved Master Page
  edits. Detail pages saved in the older shape load as blocks automatically, and the first save
  over one keeps the old version in the record as `overviewBackup`;
- **Update from Google Drive** at the top, which reads the JDA's Master File folder into the page
  as an unsaved draft, and **Open Master File folder**, which opens that folder in Drive. Nothing is
  uploaded from the page: files are put into the folder in Drive itself;
- **Save changes** in the bottom bar. Nothing changes on the live pages until then.

On Overall progress and Weekly progress it has the same in-place editing, with **Delete** on every
project, challenge, task and key update and **+ Add** for each; click a status, severity or the
overall status pill to change it. **Update from Google Drive** at the top of both screens reads the
Overall Progress and Weekly Progress folders into the page as a draft. The S-curve is not editable
here (it comes from Drive or the database).

**Edit report**, in the footer, is housekeeping behind the same passkey, not a second editor: Sync
from Drive, Load starter data (for a JDA that has some and no report yet), Clear completed tasks
(asks first, and says how many), and Microsoft Calendar once it is configured. The left and right
arrow keys move between the three reading screens only.

- **Reset to the built-in content** removes what the editor saved, so the page shows what is
  written in `js/config/jda-content.js` again.

Once a Master Page has been saved from the editor, the saved version is what shows: later changes
to that JDA's entry in `jda-content.js` do not appear until it is reset. The architecture diagram,
header and footer are not editable here; they stay in the template and `jda-content.js`.

Passkeys: one per JDA, in `jda/server/portal-passkeys.json` (`{"jda1": "...", ...}`). Change a value
and save; no restart needed, and open sessions for that JDA end. The server checks the passkey and
gives the browser a session token; the passkey never sits in the portal's code. The token is kept
only while that page stays open: reloading, reopening the link, leaving the editor or clicking the
icon again all ask for the passkey again. The same passkey unlocks that JDA's Edit report. Opening an Editor Page link
without a session goes back to the Master Page. The JDA server must be running to unlock anything.

Every save goes to the JDA server (`POST /api/portal/save`), which checks the passkey session and
writes with its service-account key; with the rules in `firestore-rules-addition.txt` published,
no browser can write a report. A save is refused if someone else changed the same part of the
report since the page loaded it (press Save again to overwrite knowingly), and the server keeps the
last 20 versions of each report.

## Updating from Google Drive

Every JDA is updated by dropping files into its Drive folder. The Master File folder is read from
the Editor Page (**Update from Google Drive**), and the two Progress folders from Edit report
(**Sync from Drive**). The JDA server reads the folder and Claude extracts the information.

```
<portal Drive folder>/
  JDA 1/
    Master File/              -> the home page: hero text, winning aspiration, solutions,
                                 collaborators, press release
    Progress/
      Overall Progress/       -> overall status, projects (owner, % complete, status),
                                 challenges, S-curve
        Weekly Progress/      -> one file per weekly report: week label, tasks, key updates
  JDA 2/ ...
```

- Folders are matched by name, ignoring case and spaces: the JDA folder by its name ("JDA 1" or
  "jda1"), and inside it any folder whose name contains "master", "overall" or "weekly". Weekly
  Progress may sit inside Overall Progress or beside it.
- Readable files: PDF, Word (.docx), Excel (.xlsx), Google Docs / Sheets / Slides, images, and
  plain text / CSV. Anything else (PowerPoint .pptx, old .doc / .xls) is listed as skipped; save it
  as PDF.
- Master File and Overall Progress: all files in the folder are read together, and where two
  disagree the one modified later wins. To replace information, add the newer file or overwrite.
- Weekly Progress: each file is one week's report. The latest week sets the week label and task
  list; key updates build up across every week's file. Task project names are matched to the
  project names from Overall Progress. If the latest weekly file is newer than the Overall Progress
  files and states percent complete for a project, that figure is used.
- A progress sync replaces the sections it has files for, including edits made by hand on Edit
  report. A section whose folder is empty is left alone. A Master File update only fills the
  editor; you review and save.
- Not filled from Drive: pictures (solutions use the stock illustrations, collaborator logos only
  for Petronas Carigali, IBM and Tridiagonal) and the architecture diagram.
- Claude is only called when a folder's files have changed since the last sync; results are cached
  in `jda/server/.portal-cache.json`.

One-time setup:

1. In Google Drive, create the portal folder and the JDA folders inside it as above. Share the
   portal folder (Viewer) with the service account's email - the `client_email` in
   `jda/server/service-account.json`.
2. In `jda/server/.env` add `PORTAL_DRIVE_ROOT_FOLDER_ID` (the portal folder's id, the last part of
   its Drive URL).
3. Restart the server (`cd jda/server && npm install && npm start`).
4. Nothing else. The server serves this portal itself, so the pages call it at the address they came
   from (http://localhost:8080 on your own computer). Only if the portal is ever served from
   somewhere else: set `SYNC_API_URL` in `js/config/app-config.js` to the server's address, and add
   the portal's address to `ALLOWED_ORIGIN` in `.env`.

## A JDA with nothing in it yet

It gets the same page with every section in place and the values blank: no zeros, no sample
numbers, and never another JDA's content. To fill it in:

- Master Page: its Editor Page, typing it in or updating from its Master File folder. Or as an
  entry in `js/config/jda-content.js`, next to `jda3` (the only way to add an architecture diagram).
- Progress: its Editor Page (Overall progress and Weekly progress), by hand or from Drive; or Sync
  from Drive on Edit report.
- S-curve: there is no S-curve editor (the reference has none either). Add a `scurve` field to its
  document in the Firebase console.

## Setup

1. Firestore rules: publish `jda/firestore.rules` on the portal's project (it holds the `jdaReports`
   block), and follow `firestore-rules-addition.txt` for the `report` block on the JDA 3 project.
   Read its warning first: two things must be in place before JDA 3's rule is closed.
2. In `js/config/app-config.js`, set `INVOICE_TRACKER_URL`. Copy
   `jda/server/portal-passkeys.example.json` to `portal-passkeys.json` and set a passkey of 8 or more
   characters for each JDA and for the Invoice Tracker (`"admin"`); the server will not start on the
   example values. In `jda/web/js/config/app-config.json`, set `portalUrl` to wherever this portal is served.
3. Run everything with one command: `cd jda/server && npm start`. The server serves this portal at
   http://localhost:8080 and the Invoice Tracker at http://localhost:8080/tracker/, alongside its API.
   (No build step. The pages must come over http(s); browsers block ES modules on `file://`.)
4. Microsoft Calendar sync is optional: see "Microsoft Calendar" below.

Running it for real (HTTPS, restarts, backups) is in `jda/README.md`, "Running in production" and
"Backup and restore".

## Microsoft Calendar

Edit report can push open tasks that have a due date to the signed-in person's Outlook calendar.
The card is hidden until a client ID is set. To turn it on:

1. In the Azure portal (https://portal.azure.com): Microsoft Entra ID > App registrations > New
   registration. Name it, and choose who may sign in (your organisation's accounts).
2. Under Redirect URI choose **Single-page application (SPA)** and enter the address of the report
   page exactly as people open it, without anything after `.html`, for example
   `https://jda.example.com/jda-report.html` (and `http://localhost:8080/jda-report.html` to try
   it on your own computer).
3. API permissions > Add a permission > Microsoft Graph > Delegated permissions >
   `Calendars.ReadWrite`.
4. Copy the **Application (client) ID** from the app's Overview page into `MS_CLIENT_ID` in
   `js/config/app-config.js`.

Microsoft's sign-in library is fetched from its CDN only when "Connect Microsoft Calendar" is
pressed, and only if it matches the integrity hash in `js/report.js`. Syncing again updates the
same calendar events instead of adding new ones.

The Administration card's passkey is the Invoice Tracker's (`"admin"` in `portal-passkeys.json`). The
server checks it and hands the tracker a session; without one the tracker's invoices and payments
cannot be read, whichever way it is opened.
