# JDA Control Tower (private)

Every page uses the design of the JDA3 reference report (`index (5).html`): its stylesheet, markup,
images and behaviour, shared from one place.

The files are laid out in `web/` as the top-level `README.md` shows: the Control Tower in
`web/control-tower/` (served at `/control-tower/`), code and pictures every page uses in `web/shared/`.

The pages are served by the JDA server (`server`) at `/control-tower/`, only to people signed
in (`/login`); it also serves `/shared`. They do not work opened from a plain file server that has
only this folder. The public site (TriCipta AI landing page, Info pages, sign-in) is `web/public/`.

## Pages and navigation

- Control Tower landing page (`/control-tower/`, `#jda2` opens JDA 2's tab): a tab per JDA. Each shows
  its progress (the average of its projects' % on Overall progress) and its latest key update (Weekly
  progress), an **Agreement & BRD** button (its documents page, below), key insights, challenges
  (from Overall progress unless written in edit mode) and cost (paid / sanctioned, with tax, from the
  Invoice Tracker). The progress ring opens Overall progress; Latest key update, All updates and View tasks
  open Weekly progress; the cost ring and **Detail cost** open its Invoices & payments. **+ Add JDA
  (invoices)** sits in the page header; Recent activity is at the bottom.
- Sidebar (every private page; collapses to a rail of icons, a drawer on a phone): Control Tower, each JDA, CJI3 register, Payment tables, View public site.
- Top bar (the Control Tower and every JDA page): the JDA tabs; **Tools**, a menu with the page's own
  actions (on the landing page **Edit page** and **Sync invoices from Drive**, the tracker's invoice inbox;
  on a JDA page its **Edit page**), **Edit public site** and **View public site** (a running sync says
  what it is doing beside the menu); the user menu with Sign out.
- A JDA's pages (Agreement & BRD, Overall progress, Weekly progress, Invoices & payments at
  `/control-tower/<jda>/invoices`): a breadcrumb and links to the others under the top bar, and the JDA
  tabs there keep the page (JDA 1's Weekly progress → JDA 2's).
- **Edit page** (top right): per JDA, its key insights, challenges, and the progress and cost figures when they must be set by hand (shown as "Set by hand"). It saves on the server (`/api/site/...`), and a save made after someone else's is refused until confirmed.
- **Edit public site** (top bar and sidebar, `/control-tower/site`): the one place the public site is edited. Tabs **Main page · JDA 1 · JDA 2 · JDA 3**; the chosen page is shown live, in edit mode (`?edit`), as the public sees it. Moving to another tab with unsaved changes asks first. `#main`, `#jda1`… in the address open a tab. The public pages have no edit buttons; signed in, they show **Edit in Control Tower**, which leads here.
  - **Main page**: every heading and text (click the dashed outline), the figure labels, each JDA's tab (title, status, press release and its date, projects, number of projects, Program Lead, Business Champions), contacts (with LinkedIn and website), the footer, and five pictures: the first hero slide, the "What is a JDA" hero slide, the Overview and What is a JDA pictures (a placeholder until one is added) and the Roles chart (with its description). Pictures are JPEG, PNG or WebP up to 8 MB; they go public on Save, Cancel throws them away, and the one before is kept in `server/.roles-previous/`. A JDA's own hero slide uses the picture of its press release, set on its Master Page.
  - **JDA 1–3**: the Master Page editor, below.
- A JDA -> Control Tower: the breadcrumb, the logo or the sidebar. Invoice Tracker -> Control Tower:
  the sidebar, its logo, or on a JDA's page the breadcrumb. The tracker's old front page (a card per JDA) is gone: its address
  leads to the Control Tower.
- **Agreement & BRD** (`/control-tower/<jda>/documents`): the signed agreement and the Business
  Requirement Document, each with its title, version, date and source (worked out from the link when
  not written), a preview (Google Drive / Docs, SharePoint, or a plain PDF link), Open and Download.
  **Edit page** there adds, replaces (paste the new link), removes and reorders them. The newest by date
  is marked Latest. Previewing a private file needs the viewer to be signed in to Google or SharePoint
  in the same browser.
- Inside a JDA: **Overall progress** (`/control-tower/<jda>/overall-progress`, a project's page at
  `#project/<name>`) and **Weekly progress** (`/control-tower/<jda>/weekly-progress`), with **Edit page**
  in the top bar and **Edit report** in the bar at the bottom. Its **Master Page** is public: the JDA's
  Info page (`/jda/<jda>/info`), linked as **Master Page ↗** in the JDA's pages. Addresses of the old single page
  (`jda-report.html#/jda1/...`) lead to the same screen in its new place.

## Where each JDA's data lives

| JDA | Firebase project | Document |
|---|---|---|
| JDA 3 | `jda3-9c0c5` (the original JDA3 report's own project) | `report/current` |
| JDA 1, 2 | `test-invoice-c38a4` (same as the Invoice Tracker) | `jdaReports/jda1`, `jda2` |

JDA 3 reads the same document the reference page does, so the Excel -> Power Automate sync that
feeds it carries on working. To move a JDA, change its `source` in
`web/shared/config/jdas.js`.

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

## Master Page and editing

A JDA's **Master Page** (hero text, winning aspiration, AI solutions and their detail pages,
collaborators, press release) is its public Info page, `/jda/<jda>/info`. There is no private copy.
It is edited in the Control Tower's **Edit public site** (its JDA's tab), which shows the Info page in
edit mode (`web/control-tower/components/master-edit.js` and `master-page.html`, served only to people
signed in). In edit mode:

- every piece of text is editable in place (dashed outline);
- dashed buttons add or remove aspirations, solution groups, solutions (with their detail pages),
  collaborators, the press release, and whole new sections of cards;
- a collaborator's **Logo** and the press release's **Picture** are uploaded (Choose file: JPEG, PNG
  or WebP up to 8 MB, checked by the server and stored under `web/public/assets/uploads/` by a name made
  from the picture itself); they show at once and go public with Save changes. **Remove logo** takes one away;
- drag handles (the dotted grip) reorder an aspiration, solution, collaborator or card (solutions can
  be dragged between groups), and **Move section** moves a whole section. With the keyboard, focus a
  handle and use the arrow keys;
- **Edit detail page** on a solution card opens a full-page block editor for that solution's detail
  page: Header, Sub Header, Sub Sub Header, Body, or a Box row. Add a block between any two, drag the
  grip to reorder (SortableJS, kept in `web/shared/vendor`) or use the up/down buttons; change a
  block's type, duplicate or delete it; format text with bold, italic, underline, lists and links. Its
  Save publishes straight away, with any other unsaved Master Page edits. Detail pages saved in the
  older shape load as blocks, and the first save over one keeps the old version as `overviewBackup`;
- **Update from Google Drive** at the top reads the JDA's Master File folder into the page as an
  unsaved draft, and **Open Master File folder** opens that folder in Drive;
- **Save changes** in the bottom bar publishes; **Leave the editor** goes back to the page as saved;
- **Reset to the built-in content** removes what was saved, so the page shows what is written in
  `web/control-tower/config/jda-content.js` again.

Once saved from edit mode, the saved version is what shows: later changes to that JDA's entry in
`jda-content.js` do not appear until it is reset. The architecture diagram of the old private Master
Page is gone.

**Overall progress** and **Weekly progress** are edited on their own pages: **Edit page** in the
top bar (or `#edit` on the address, which **Edit tasks** uses) makes them editable the same way,
with **Delete** on every project, challenge, task and key update and **+ Add** for each; click a
status, severity or the overall status pill to change it. **Update from Google Drive** at the top of
both reads the Overall Progress and Weekly Progress folders into a draft. The S-curve is not editable
here (it comes from Drive or the database).

**Edit report**, in the bottom bar, is housekeeping: Sync from Drive, Load starter data (for a JDA
that has some and no report yet), Clear completed tasks (asks first, and says how many), and Microsoft
Calendar once it is configured. The left and right arrow keys move between the two progress pages.

Who may edit: everyone signed in to the JDA Control Tower.

Every save goes to the JDA server (`POST /api/portal/save`), which checks the sign-in and
writes with its service-account key; with the rules in `firebase/jda3-rules.txt` published,
no browser can write a report. A save is refused if someone else changed the same part of the
report since the page loaded it (press Save again to overwrite knowingly), and the server keeps the
last 20 versions of each report.

## Updating from Google Drive

Every JDA is updated by dropping files into its Drive folder. The Master File folder is read from
the Master Page's edit mode (**Update from Google Drive**), and the two Progress folders from the
progress pages' edit mode or Edit report (**Sync from Drive**). The JDA server reads the folder and Claude extracts the information.

```
<JDA Control Tower Drive folder>/
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
  edit mode; you review and save.
- Not filled from Drive: pictures (solutions use the stock illustrations, collaborator logos only
  for Petronas Carigali, IBM and Tridiagonal) and the architecture diagram.
- Claude is only called when a folder's files have changed since the last sync; results are cached
  in `server/.portal-cache.json`.

One-time setup:

1. In Google Drive, create the JDA Control Tower folder and the JDA folders inside it as above. Share
   that folder (Viewer) with the service account's email - the `client_email` in
   `server/service-account.json`.
2. In `server/.env` add `PORTAL_DRIVE_ROOT_FOLDER_ID` (that folder's id, the last part of
   its Drive URL).
3. Restart the server (`cd server && npm install && npm start`).
4. Nothing else. The server serves these pages itself, so they call it at the address they came
   from (http://localhost:8080 on your own computer).

## A JDA with nothing in it yet

It gets the same page with every section in place and the values blank: no zeros, no sample
numbers, and never another JDA's content. To fill it in:

- Master Page: Edit public site in the Control Tower (its JDA's tab), typing it in or updating from its Master File
  folder. Or as an entry in `web/control-tower/config/jda-content.js`, next to `jda3`.
- Progress: Edit page on its Overall or Weekly progress page, by hand or from Drive; or Sync
  from Drive on Edit report.
- S-curve: there is no S-curve editor (the reference has none either). Add a `scurve` field to its
  document in the Firebase console.

## Setup

1. Firestore rules: publish `firebase/firestore.rules` on the main Firebase project (it holds the `jdaReports`
   block), and follow `firebase/jda3-rules.txt` for the `report` block on the JDA 3 project.
   Read its warning first: two things must be in place before JDA 3's rule is closed.
2. Accounts: each person needs a Firebase account on `ALLOWED_EMAILS` in `server/.env`
   (`docs/server-and-invoices.md`, "Setup").
3. Run everything with one command: `cd server && npm start`. The server serves the public site
   at http://localhost:8080, these pages at http://localhost:8080/control-tower/ and the Invoice
   Tracker at http://localhost:8080/control-tower/invoices/, alongside its API.
   (No build step. The pages must come over http(s); browsers block ES modules on `file://`.)
4. Microsoft Calendar sync is optional: see "Microsoft Calendar" below.

Running it for real (HTTPS, restarts, backups) is in `docs/server-and-invoices.md`, "Running in production" and
"Backup and restore".

## Microsoft Calendar

Edit report can push open tasks that have a due date to the signed-in person's Outlook calendar.
The card is hidden until a client ID is set. To turn it on:

1. In the Azure portal (https://portal.azure.com): Microsoft Entra ID > App registrations > New
   registration. Name it, and choose who may sign in (your organisation's accounts).
2. Under Redirect URI choose **Single-page application (SPA)** and enter the Control Tower's address,
   for example `https://jda.example.com/control-tower/` (and `http://localhost:8080/control-tower/` to try
   it on your own computer). Every JDA's pages use this one address.
3. API permissions > Add a permission > Microsoft Graph > Delegated permissions >
   `Calendars.ReadWrite`.
4. Copy the **Application (client) ID** from the app's Overview page into `MS_CLIENT_ID` in
   `web/shared/config/jdas.js`.

Microsoft's sign-in library is fetched from its CDN only when "Connect Microsoft Calendar" is
pressed, and only if it matches the integrity hash in `web/control-tower/components/report.js`. Syncing again updates the
same calendar events instead of adding new ones.
