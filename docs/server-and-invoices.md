# JDA Invoice Tracker (inside the JDA Control Tower)

```
web/      Frontend (no build step, ES modules)
  css/        base (colour tokens) · layout · components · timeline · finance
  js/config   app-config.json (the switches below). The Firebase settings are in ../web/shared/config/firebase-config.js
  js/finance  money · core · sheets · service · book: the rules of the CJI3 register and the Payment Tables
              (also run by the server), and the page's own copy of the register
  js/services auth · db · ai · finance · analytics · sync (+ live/ Firebase and the server, demo/ sample data)
  js/ui       jda · project · cji3 · payments · finance-ui · finance-io · timeline · sync · log
              · copilot · markdown · modal · render · checks · state · dom
server/   Node + Express. Serves every page (app.js), holds the Claude key, checks the sign-in, and
          saves the invoices, payments and reports. scripts/ has backup, restore and the one-off move to Firestore
firestore.rules · firestore.indexes.json · firebase.json   the database rules and indexes, and how to publish them
../shared/   code and libraries both sites use (see ../README.md)
```

## Config switches (web/control-tower/invoices/js/config/app-config.json)
- `demoMode`: true = sample data, no Firebase/server needed. false = real system.
- `fxToMYR`: only used once, when the old invoice list is brought over ("Bring over old tracker invoices"). Every invoice now stores its own rate.
- `defaultJdaStart` / `defaultJdaEnd`: the timeline range for a JDA that has no dates of its own (those created before dates were required). New JDAs must state both; "Edit dates" on a JDA page changes them. Timelines always run to the end of the current month at least.

## Sign-in

The tracker is part of the JDA Control Tower, at `/control-tower/invoices/`. It has no login of its own:
people sign in once at `/login` with their Firebase account, which must be on `ALLOWED_EMAILS`, and
the server gives the browser a signed session cookie (`server/session.js`, `server/auth.js`). The
server checks that cookie before it sends any page or file under `/control-tower` (otherwise it
redirects to `/login`) and on every `/api` call (otherwise 401). The tracker also keeps the Firebase
sign-in `/login` made, because it reads JDAs and projects from Firestore. What is public and what is
private is listed at the top of `server/app.js`; `server/app.test.mjs` checks every private file and API.

## JDA report Drive sync
The server also serves `/api/portal/*` for the JDA report pages: `save` writes a report, and `sync`
reads one JDA's Drive folder and has Claude extract its Master Page (`scope: master`) or progress
(`scope: progress`). Behind the same sign-in. Folder
layout and setup are in `docs/control-tower.md`, "Updating from Google Drive". `npm test` in `server/`
checks the folder handling and assembly with Drive and Claude stubbed out.

## Invoices and payments (CJI3 register, Payment Tables)
An invoice is entered once, in the CJI3 register. From then on every figure in the tracker comes from it.
The register and the Payment Table each have a page of their own, as wide as the window, reached
from the top bar or from the "Invoices and payments" totals on a JDA or project page:
`#/cji3`, `#/cji3/<jda>`, `#/cji3/<jda>/<project>` and `#/payments/<jda>`, `#/payments/<jda>/<project>`.

- **Three amounts**, as in the payment table sheet: original currency, MYR, taxed MYR. The amount typed
  in is before tax; tax is charged on the MYR amount.
- **Payment Table**: one per JDA, one row per project + partner + month, ID `project-partner-YYMM`
  (`AA-IBM-2508`). Its left half is the sanctioned amounts, its right half the invoices of that
  project, partner and payment month. It is worked out on the spot, never copied, so an edit shows
  at once; click a row for the records behind it.
- **A sanctioned amount over several months**: give "Add sanctioned amount" a last month as well, and say
  whether the amount is for each month or the total to split evenly. It is saved as one record per
  month (all of them or none), so each month's row has its own figure and can be corrected alone.
- **Only Paid invoices count as actual** (Total, variance, spend bars, cumulative spend).
  Variance = Total − w TAX: above zero is over sanctioned (red), below is under, zero is within.
- **Forecast at completion** = everything invoiced so far (rejected invoices left out) plus the
  sanctioned amounts, with tax, of the months still to come. A month to come that is already invoiced
  above its sanctioned amount counts the invoices, never both.
- **Today and this month** are Malaysia's (`web/shared/lib/dates.js`), on every page, whatever the clock of
  the computer or the server.
- **Budgets** are saved in whole sen (`budgetMinor`), like every other amount.
- **Payment month** defaults to the month of the invoice date and can be changed.
- **Tax rate**: one setting ("Tax rate" on the register page, 8% to start). Each record keeps the rate
  it was entered with. A change applies to new records only.
- **Exchange rate**: stored on each invoice with its date and source. "Get Bank Negara rate" fetches
  the 5 pm middle rate for the invoice date (public service, no key). Typing over a fetched rate
  marks it overridden. Nothing recalculates by itself: select invoices and choose Recalculate.
- **Money** is whole sen (or cents) with its currency code, never a floating-point number, and is
  rounded one way everywhere: half away from zero, as Excel's ROUND does (`js/finance/money.js`).
- **Limits**: a text field holds 200 characters (description and remarks 1,000, partner 40), checked by
  the form and again by the server. In the tables a long value is cut with … and shown in full on
  hover and in Edit, so no entry can stretch a column.
- **Audit log**: every change records who, when, field, old value, new value ("History" on a row,
  "Audit log" on the register page). A delete only marks the record; "Show deleted" > Restore.
- **Import / Export**: CSV or Excel, in the CJI3 sheet's and the payment table sheet's own columns.
  An import shows a preview first and never enters the same invoice twice. A row that states its
  MYR figures keeps them exactly. The preview says how many rows were read, names the blank line
  that ended the table if more lines lie below it, and shows which way round the dates are read
  (month first or day first), with a switch.
- **Sync from Drive** reads each file in the invoice inbox once. A file already read is skipped, and
  the register refuses it if asked again, so a sync that was interrupted or run twice adds nothing twice.
- **Who sees it**: invoices and payments are for people signed in to the JDA Control Tower only.
  Every finance request is checked by the server, and the person's name goes into the audit log.

### Invoice approval (Approvals, `#/approvals`)

Every invoice in the register goes through the approval process before it is paid. The stages and
the moves allowed between them are in `web/control-tower/invoices/js/finance/workflow.js`; the server
refuses any other move.

```
Received ─┬─ Route 1: Direct ─────► Sent to PD ───────────────────────┐
          └─ Route 2: Validation ─► With PM ─► Pending Lead ─┬─► To Be Paid ─┤
                                                             └─► Rejected     │
                                      Paid (shown by a CJI3 line) ◄──────────┘
```

- **Queues** (one tab each on Approvals): Intake (Accountant 1 chooses the route), PM validation,
  Lead approval, To Be Paid (Accountant 2: approved invoices and those sent to PD, oldest due date
  first), Paid, and Rejected (the archive).
- **Every move is confirmed** in a dialog first, with a note; a reason is required to reject, to
  return an invoice, or to restore one from the archive. Each move is kept in the invoice's history
  (`financeStages`: who, when, from, to, note) and in the audit log.
- **Rejected invoices are archived, not deleted**: they keep everything, leave the active queues, and
  **Restore from archive** sends one back to the Project Lead.
- **Route 1 passes nothing to PD**: the invoice is only marked Sent to PD, then waits in To Be Paid.
- **Paid is never a button**: an invoice becomes Paid when a CJI3 line is matched to it (below).
- **The Payment Tables do not change**: they read the invoice's `status` (pending / approved / paid /
  rejected), which is worked out from its stage (Received, With PM, Pending Lead → pending; Sent to PD,
  To Be Paid → approved; Paid → paid; Rejected → rejected). Invoices entered before the process get
  their stage from their status. **There is no way to set a status by hand**: the register shows it
  read-only (linked to the invoice's Approvals queue), the invoice form has no status field, imported
  invoices always start at Received, and the server refuses all of these.
- **Roles**: `ROLE_ACCOUNTANT1`, `ROLE_PM`, `ROLE_LEAD`, `ROLE_ACCOUNTANT2` in `server/.env`
  (comma-separated emails) limit each queue's moves to those people. Left empty (as now), anyone
  signed in may make any move.

### Invoices from the Microsoft List (a JDA's tracker page, under the graphs)

The company's Microsoft List holds the invoices **before approval** (CJI3 is the evidence after payment).

- **Getting the List in:** with `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_SITE_ID` and
  `MS_LIST_ID` in `server/.env` (an app registration with `Sites.Read.All` and admin consent),
  **Pull from the List** reads it through Microsoft Graph. Without them, export the List to Excel or CSV
  and **Import the List (export)**. Either way the page works the same.
- **Columns:** the first time, a dialog asks which List column is Invoice No., Partner, Amount,
  Currency, Description, JDA, Supporting documents and the item's ID. It proposes from the column names,
  and you confirm. It's remembered and asked again only if the columns change (**Columns…** reopens it).
- **The list:** a JDA's rows (by the JDA column), with a checkbox each, Invoice No., Partner, Amount
  (in its own currency), Description and the supporting documents from the List as links. What a row
  lacks is said under its number; one already sent shows its stage.
- **Generate Email:** with invoices ticked (count and a total per currency above the table). If any
  lack something, the missing data is listed invoice by invoice first, with **Proceed anyway**. Then a
  preview, and:
  - **Generate email (.eml):** downloads a draft that opens in Outlook, formatted, to edit and send;
  - **Copy formatted email:** copies it, and opens a new message with the subject, to paste into;
  - **Create Outlook draft:** only with Graph `Mail.ReadWrite` and `MS_MAIL_SENDER`.
- **Generating sends them:** each becomes an invoice in the register if it is not one yet (a draft:
  the project and dates the List does not give are to be completed there), and moves to **Pending Lead
  approval** (through With PM). The email is logged (`listEmails`: who, when, which invoices).
  The List amount is taken as the invoice total (tax rate 0 on the draft).
- **Recipients and sign-off** are blank for now (`invoices/js/config/email-recipients.js`).

### CJI3 payments (`#/cji3-lines`)

The CJI3 export is the only payment evidence. It comes as **two files** (JDA 1 + JDA 2 together, and
JDA 3) and is uploaded again and again as payments are made one at a time.

- **Upload** on the file's tab: **Preview** says what the file will do (lines added, skipped,
  updated, rows that cannot be read), then **Import**.
- **No duplicates**: a line is known by **WBS Element + Reference + Posting Date + Document Date +
  Document Type + Cost Element + Transaction Currency + Value TranCurr**, and by its order among
  lines identical in all of these within one file. The same file again, or an overlapping one, adds
  only the lines not seen before; a known line whose other columns changed (Remarks, Forex,
  Val/COArea Crcy…) is updated, and the change goes in the audit log. A line's record id is made from
  this key, so two uploads at the same moment cannot store it twice.
- **Checks**: a file without one of the key's columns is refused, naming them; a row without a WBS
  Element, a readable amount (`1,000.00`, `-1,000.00`, `(1,000.00)` and `1,000.00-` are read) or a
  readable posting date is left out and listed by line number. The last heading of SAP's export
  ("Forex Confidential - For PETRONAS Staff Only…") is read as Forex.
- **Log**: every upload (file, who, when, rows, added, skipped, updated, not readable, matched) is kept
  in `cji3Imports` and listed under Uploads.
- **Amounts are checked**: a line's Val/COArea Crcy (MYR, tax included) is compared with the invoice's
  taxed MYR, all of the invoice's lines together. Within RM 1 or 0.5%: Paid. Less: **Part payment**, Paid
  when the rest arrives. More, or a line with no MYR amount: linked and flagged (**Amount to check**);
  **Confirm invoice Paid** is the person's check. The lines table shows both amounts.
- **Matching**: each new line's Reference is compared with the invoice numbers of its file's JDAs
  (ignoring case and spaces; CO Object Name narrows a number that bills several projects). One
  match that is To Be Paid or Sent to PD → the invoice becomes **Paid**, with the line recorded on it;
  one already Paid → the line is added to it; one not yet approved → linked and flagged, not moved;
  none or several → left for a person: **Match…** picks the invoice, **Undo match** takes it back
  (an invoice made Paid by that line returns to To Be Paid), **Match again** tries the unmatched lines
  against the invoices there are now.
- **Which project a line is**: today, from the invoice it matches. Assigning lines by WBS Element
  (a WBS → JDA/project list) is not built yet.
- **Payment Tables per file**: the tabs **JDA 1 + JDA 2 (CJI3 file)** and **JDA 3 (CJI3 file)** show
  one Payment Table over the file's JDAs, by the same rules; **Export Excel** writes it, then a sheet
  per JDA and per project. The CJI3 payments page exports its lines per file.

### Where invoices and payments are saved
The browser never writes them. The server does, after validating and working out each change:
- **Firestore** (collections `financeEntries`, `financeSanctioned`, `financeAudit`, `financeMeta`) when
  the server has the Firebase project's service-account key: Firebase console > Project settings >
  Service accounts > Generate new private key, saved as `server/service-account.json`
  (`GOOGLE_APPLICATION_CREDENTIALS` in `.env` already points there). If Drive is in use, share the
  Drive folders with that key's `client_email`. Then publish `firestore.rules`, which closes those
  collections to browsers.
- **`server/.finance-data.json`** when there is no key yet. Fine for trying things out; the tracker
  shows a red notice while this is the case. `FINANCE_STORE=file` or `firestore` in `.env` forces one.

`npm test` in `server/` covers the calculations (hand-worked figures), the Payment Table, the audit
log, import/export, the sign-in checks and which pages are private, the Drive syncs and the Bank Negara rate lookup.
It runs on Node 22.3 or newer and needs no network and no keys.

## Setup
Do these once. Steps 1 to 4 are in the Firebase console (https://console.firebase.google.com).

1. Create the Firebase project. Authentication > Sign-in method: enable Email/Password, and under
   Settings > User actions turn **off** "Enable create (sign-up)". Create Firestore (Standard,
   asia-southeast1, Production).
2. Project settings > Your apps > add a Web app. Copy its config into `web/shared/config/firebase-config.js`
   (`firebaseConfig`). This is the only copy; both sites and the server read it.
3. Project settings > Service accounts > Generate new private key. Save the file as
   `server/service-account.json`. It is a secret: it is not in git and must never be.
4. Authentication > Users > Add user, once for each person. A username `aina` is the address
   `aina@jda.app`. There is no "create account" on the site.
5. In a terminal:

       cd server
       npm install
       cp .env.example .env

6. In `server/.env` fill in:
   - `ANTHROPIC_API_KEY`: the Claude key.
   - `FIREBASE_API_KEY`: the `apiKey` from step 2.
   - `ALLOWED_EMAILS`: the addresses from step 4, comma-separated. Only these can sign in.
   - `SESSION_SECRET`: 32 or more random characters (signs the session cookie).
   - `DRIVE_ROOT_FOLDER_ID`: the Drive folder that is the invoice inbox. Share that folder with the
     `client_email` inside `service-account.json` (Viewer is enough).
7. Publish the database rules and indexes (asks you to sign in to Firebase the first time):

       cd firebase
       npx firebase-tools login
       npx firebase-tools deploy --only firestore --project YOUR_PROJECT_ID

8. Start the server: `cd server && npm start`. One command serves everything on port 8080
   (`PORT` in `.env`): the public TriCipta AI site at http://localhost:8080, the JDA Control Tower at
   http://localhost:8080/control-tower/ and this tracker at http://localhost:8080/control-tower/invoices/.
9. Open http://localhost:8080/login and sign in.

## Running in production

The server is one Node process. Everything else follows from that.

- **Node**: 22.3 or newer (`engines` in `server/package.json`). Install with `npm ci` in `server/`.
- **One reverse proxy in front, with HTTPS.** The server speaks plain HTTP on `PORT` and expects
  exactly one proxy before it (nginx, Caddy, a cloud load balancer). It takes the caller's address
  from the proxy's `X-Forwarded-For`, which the rate limits depend on. The session cookie travels in
  every request (and is marked Secure behind HTTPS), so never expose it without HTTPS. If there is no
  proxy, or more than one, change `app.set('trust proxy', 1)` in `server/app.js` to match.
- **Set in `.env` on the server**: everything from Setup step 6, plus `NODE_ENV=production` and
  `FINANCE_STORE=firestore`. With `NODE_ENV=production` the server refuses to start unless it is
  told where invoices are kept, so it can never quietly fall back to a local file.
  `ALLOWED_ORIGIN` only matters if a site is served from a different address than the server; when
  the server serves both sites (the usual way) set it to that one address, e.g. `https://jda.example.com`.
- **Secrets that live only on the server**, never in git: `.env`, `service-account.json`
  (and `service-account-jda3.json` if JDA 3's report is saved from here).
- **Keep it running** with whatever restarts a process on your host. With systemd, for example,
  save this as `/etc/systemd/system/jda.service` (change the paths and the user), then
  `sudo systemctl enable --now jda`:

      [Unit]
      Description=JDA Control Tower
      After=network.target

      [Service]
      WorkingDirectory=/srv/jda-control-tower/server
      ExecStart=/usr/bin/node server.js
      Restart=always
      User=jda
      Environment=NODE_ENV=production

      [Install]
      WantedBy=multi-user.target

- **What a restart does.** With `SESSION_SECRET` set, nothing for the people signed in. Without it,
  everyone is signed out and sent to `/login`; an Editor Page open at that moment loses what was typed
  into it. Changing `.env` (including `ALLOWED_EMAILS`) needs a restart; someone taken off the list
  is refused on their next request.
- **One process only.** The rate limits and the "one sync at a time" rule are
  kept in the process's memory. Do not run two copies behind a load balancer.
- **The database indexes** (`firestore.indexes.json`) make the change log and the audit log read
  only the lines a page shows. Without them the pages still work, more slowly, and the server log
  says so. Publish them with the command in Setup step 7.
- **After updating the code**: `git pull`, `npm ci` in `server/`, `npm test`, restart. If
  `firestore.rules` or `firestore.indexes.json` changed, publish them again (Setup step 7).

## Backup and restore

Back up before every update, before publishing new database rules, and on a schedule you choose.

    cd server
    node scripts/backup.mjs

It writes `backups/<date and time>/` at the top of the repository (not served by anything, not in
git) and lists what it saved:

- every collection of the main Firebase project, with the saved versions of each report
  (needs `service-account.json`);
- each JDA's report document, read the way the Control Tower reads it, which also covers JDA 3's
  separate project;
- the local finance file, if the server was saving to one.

If anything could not be read it says "NOT backed up", lists it, and ends with an error, so a
partial backup is never mistaken for a whole one. Copy the folder somewhere off the server.

To put things back, first look at what the backup holds. Nothing changes until you add `--write`:

    node scripts/restore.mjs ../backups/2026-10-12T07-18-24-372Z
    node scripts/restore.mjs ../backups/<folder> --write                          everything
    node scripts/restore.mjs ../backups/<folder> --only=financeEntries --write    one collection
    node scripts/restore.mjs ../backups/<folder> --report=jda1 --write            one JDA's report

Each document in the backup replaces the one with the same id. Documents created after the backup
are left alone; nothing is deleted. To restore a local finance file instead, stop the server and
copy the backup's `finance-data.json` over `server/.finance-data.json`.

Smaller accidents need no backup: a deleted invoice or sanctioned amount is only marked ("Show
deleted" > Restore), every change is in the audit log, and the server keeps the last 20 saved
versions of each JDA's report in `jdaReports/<jda>/versions` (Firebase console).

If invoices were entered while the server was saving to the local file, move them into Firestore
once the key is in place: `node scripts/finance-file-to-firestore.mjs` (safe to run twice).

Usernames map to a hidden email (`username@jda.app`) because Firebase Auth needs one.
