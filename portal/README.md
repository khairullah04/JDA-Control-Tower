# JDA Programme Portal

Every page uses the design of the JDA3 reference report (`index (5).html`): its stylesheet, markup,
images and behaviour, shared from one place.

```
portal/
  index.html               Portal main page: one card per JDA (live progress) + Administration
  jda-report.html          One template for every JDA: its Master Page at jda-report.html#/jda1 ... #/jda4,
                           and its Editor Page at #/jda1/edit
  css/
    styles.css               The reference stylesheet verbatim, plus a short portal-only block at the bottom
  assets/                    Shared images (extracted from the reference) - see assets/README.md
  js/
    portal.js                Portal main page: JDA cards, Administration passkey gate
    report.js                 JDA report page: the reference's script, ported
    editor.js                 The Editor Page: in-place editing of a Master Page
    block-editor.js           The full-page block editor for a solution's detail page
    blocks.js                 Block types, the HTML clean-up and how a block is drawn (shared by both)
    config/
      app-config.js           JDA list (name, edit icon, where its data lives), Invoice Tracker link
      firebase.js              Both Firebase projects' configs
      jda-content.js           Everything written about a specific JDA (overview text, solutions, starter data)
  _legacy/                  The previous portal's files, kept as a backup. Nothing loads them; safe to delete.
```

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
| JDA 1, 2, 4 | `test-invoice-c38a4` (same as the Invoice Tracker) | `jdaReports/jda1`, `jda2`, `jda4` |

JDA 3 reads and writes the same document the reference page does, so the Excel -> Power Automate
sync described in the reference `SETUP.md` keeps feeding it. To move a JDA, change its `source` in
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
  drag the grip to reorder (mouse or touch; SortableJS, loaded from cdnjs), or use the up/down
  buttons; change a block's type, duplicate or delete it; format text with bold, italic, underline,
  lists and links. Its Save publishes straight away, together with any other unsaved Master Page
  edits. Detail pages saved in the older shape load as blocks automatically, and the first save
  over one keeps the old version in the record as `overviewBackup`;
- **Update from Google Drive** at the top, which reads the JDA's Master File folder into the page
  as an unsaved draft, and **Open Master File folder**, which opens that folder in Drive;
- **Save changes** in the bottom bar. Nothing changes on the live pages until then.

On Overall progress and Weekly progress it has the same in-place editing, with **Delete** on every
project, challenge, task and key update and **+ Add** for each; click a status, severity or the
overall status pill to change it. **Update from Google Drive** at the top of both screens reads the
Overall Progress and Weekly Progress folders into the page as a draft. The S-curve is not editable
here (it comes from Drive or the database). Edit report, in the footer, still works as before.

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

What this does not protect: saves go from the browser straight to Firestore, whose rules allow
writes from anyone with the link, so someone technical can bypass the page. Closing that needs the
saves moved onto the server and the rules locked.

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
   its Drive URL), and add the portal's origin
   to `ALLOWED_ORIGIN`, comma-separated, e.g. `http://localhost:8080,http://localhost:8081`.
3. Restart the server (`cd jda/server && npm install && npm start`).
4. If the server is not at `http://localhost:3000`, set `SYNC_API_URL` in `js/config/app-config.js`.

## A JDA with nothing in it yet

It gets the same page with every section in place and the values blank: no zeros, no sample
numbers, and never another JDA's content. To fill it in:

- Master Page: its Editor Page, typing it in or updating from its Master File folder. Or as an
  entry in `js/config/jda-content.js`, next to `jda3` (the only way to add an architecture diagram).
- Progress: its Edit report screen, by hand or Sync from Drive.
- S-curve: there is no S-curve editor (the reference has none either). Add a `scurve` field to its
  document in the Firebase console.

## Setup

1. Firestore rules: the `jdaReports` block in `firestore-rules-addition.txt` on the portal's
   project, and the `report` block from the reference `SETUP.md` on the JDA3 project.
2. In `js/config/app-config.js`, set `INVOICE_TRACKER_URL`; change the JDA passkeys and the
   Invoice Tracker's (`"admin"`) in `jda/server/portal-passkeys.json`. In
   `jda/web/js/config/app-config.json`, set `portalUrl` to wherever this portal is served.
3. Run everything with one command: `cd jda/server && npm start`. The server serves this portal at
   http://localhost:8080 and the Invoice Tracker at http://localhost:8080/tracker/, alongside its API.
   (No build step. The pages must come over http(s); browsers block ES modules on `file://`.)
4. Microsoft Calendar sync (Edit report) needs `MS_CLIENT_ID` in `js/config/app-config.js`; see
   section 5 of the reference `SETUP.md`.

The Administration card's passkey is the Invoice Tracker's (`"admin"` in `portal-passkeys.json`). The
server checks it and hands the tracker a session; without one the tracker's invoices and payments
cannot be read, whichever way it is opened.
