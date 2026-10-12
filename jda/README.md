# JDA Invoice Tracker

```
web/      Frontend (no build step, ES modules)
  css/        base (colour tokens) · layout · components · timeline · finance
  js/config   app-config.json (the switches below). The Firebase settings are in ../shared/firebase-config.js
  js/finance  money · core · sheets · service · book: the rules of the CJI3 register and the Payment Tables
              (also run by the server), and the page's own copy of the register
  js/services auth · db · ai · finance · analytics · sync (+ live/ Firebase and the server, demo/ sample data)
  js/ui       dashboard · jda · project · cji3 · payments · finance-ui · finance-io · timeline · sync · log
              · copilot · markdown · modal · render · checks · state · dom
server/   Node + Express. Serves both sites, holds the Claude key, checks sign-ins and passkeys, and
          saves the invoices, payments and reports. scripts/ has backup, restore and the one-off move to Firestore
firestore.rules · firestore.indexes.json · firebase.json   the database rules and indexes, and how to publish them
../shared/   code and libraries both sites use (see ../README.md)
```

## Config switches (web/js/config/app-config.json)
- `requireLogin`: true = login page shown. false = skip it (also set REQUIRE_AUTH=false in server/.env; the
  database rules then refuse the tracker's JDAs and projects, so this is only for demo mode or the emulator).
- `demoMode`: true = sample data, no Firebase/server needed. false = real system.
- `fxToMYR`: only used once, when the old invoice list is brought over ("Bring over old tracker invoices"). Every invoice now stores its own rate.
- `defaultJdaStart` / `defaultJdaEnd`: the timeline range for a JDA that has no dates of its own (those created before dates were required). New JDAs must state both; "Edit dates" on a JDA page changes them. Timelines always run to the end of the current month at least.

## Portal Drive sync
The server also serves `/api/portal/*` for the JDA Programme Portal: `unlock` checks a JDA's passkey
(`server/portal-passkeys.json`) and returns a session token; `sync` reads one JDA's Drive folder and
has Claude extract its Master Page (`scope: master`) or progress (`scope: progress`). Token-gated,
not sign-in gated. Folder
layout and setup are in `portal/README.md`, "Updating from Google Drive". `npm test` in `server/`
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
- **Today and this month** are Malaysia's (`shared/dates.js`), on every page, whatever the clock of
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
- **Passkey**: the tracker's invoices and payments are for passkey holders only. The passkey is
  `"admin"` in `server/portal-passkeys.json`; the server checks it (on the portal's Administration
  card, or on the tracker's own prompt) and every finance request needs the session it hands back.

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
log, import/export, the passkey and sign-in checks, the Drive syncs and the Bank Negara rate lookup.
It runs on Node 22.3 or newer and needs no network and no keys.

## Setup
Do these once. Steps 1 to 4 are in the Firebase console (https://console.firebase.google.com).

1. Create the Firebase project. Authentication > Sign-in method: enable Email/Password, and under
   Settings > User actions turn **off** "Enable create (sign-up)". Create Firestore (Standard,
   asia-southeast1, Production).
2. Project settings > Your apps > add a Web app. Copy its config into `shared/firebase-config.js`
   (`firebaseConfig`). This is the only copy; both sites and the server read it.
3. Project settings > Service accounts > Generate new private key. Save the file as
   `server/service-account.json`. It is a secret: it is not in git and must never be.
4. Authentication > Users > Add user, once for each person. A username `aina` is the address
   `aina@jda.app`. There is no "create account" on the site.
5. In a terminal:

       cd jda/server
       npm install
       cp .env.example .env
       cp portal-passkeys.example.json portal-passkeys.json

6. In `server/.env` fill in:
   - `ANTHROPIC_API_KEY`: the Claude key.
   - `FIREBASE_API_KEY`: the `apiKey` from step 2.
   - `ALLOWED_EMAILS`: the addresses from step 4, comma-separated. Only these can sign in.
   - `DRIVE_ROOT_FOLDER_ID`: the Drive folder that is the invoice inbox. Share that folder with the
     `client_email` inside `service-account.json` (Viewer is enough).
7. In `server/portal-passkeys.json` set a passkey of 8 or more characters for each JDA and for
   `"admin"` (the Invoice Tracker). The server will not start on the example values or short ones.
8. Publish the database rules and indexes (asks you to sign in to Firebase the first time):

       cd jda
       npx firebase-tools login
       npx firebase-tools deploy --only firestore --project YOUR_PROJECT_ID

9. Start the server: `cd jda/server && npm start`. One command serves everything on port 8080
   (`PORT` in `.env`): the portal at http://localhost:8080 and this tracker at
   http://localhost:8080/tracker/.
10. Open the tracker, sign in, and enter the Invoice Tracker passkey.

## Running in production

The server is one Node process. Everything else follows from that.

- **Node**: 22.3 or newer (`engines` in `server/package.json`). Install with `npm ci` in `server/`.
- **One reverse proxy in front, with HTTPS.** The server speaks plain HTTP on `PORT` and expects
  exactly one proxy before it (nginx, Caddy, a cloud load balancer). It takes the caller's address
  from the proxy's `X-Forwarded-For`, which the lock-out after wrong passkeys depends on. Passkeys
  and sign-in tokens travel in every request, so never expose it without HTTPS. If there is no
  proxy, or more than one, change `app.set('trust proxy', 1)` in `server/server.js` to match.
- **Set in `.env` on the server**: everything from Setup step 6, plus `NODE_ENV=production` and
  `FINANCE_STORE=firestore`. With `NODE_ENV=production` the server refuses to start unless it is
  told where invoices are kept, so it can never quietly fall back to a local file.
  `ALLOWED_ORIGIN` only matters if a site is served from a different address than the server; when
  the server serves both sites (the usual way) set it to that one address, e.g. `https://jda.example.com`.
- **Secrets that live only on the server**, never in git: `.env`, `service-account.json`
  (and `service-account-jda3.json` if JDA 3's report is saved from here), `portal-passkeys.json`.
- **Keep it running** with whatever restarts a process on your host. With systemd, for example,
  save this as `/etc/systemd/system/jda.service` (change the paths and the user), then
  `sudo systemctl enable --now jda`:

      [Unit]
      Description=JDA Control Tower
      After=network.target

      [Service]
      WorkingDirectory=/srv/jda-control-tower/jda/server
      ExecStart=/usr/bin/node server.js
      Restart=always
      User=jda
      Environment=NODE_ENV=production

      [Install]
      WantedBy=multi-user.target

- **What a restart does.** Every passkey session ends: editors and tracker users are asked for the
  passkey again, and an Editor Page that is open at that moment can no longer save what was typed
  into it. Restart when nobody is editing. Sign-ins are not affected. Changing a passkey in `portal-passkeys.json` needs
  no restart; changing `.env` (including `ALLOWED_EMAILS`) does.
- **One process only.** The passkey sessions, the lock-outs and the "one sync at a time" rule are
  kept in the process's memory. Do not run two copies behind a load balancer.
- **The database indexes** (`firestore.indexes.json`) make the change log and the audit log read
  only the lines a page shows. Without them the pages still work, more slowly, and the server log
  says so. Publish them with the command in Setup step 8.
- **After updating the code**: `git pull`, `npm ci` in `server/`, `npm test`, restart. If
  `firestore.rules` or `firestore.indexes.json` changed, publish them again (Setup step 8).

## Backup and restore

Back up before every update, before publishing new database rules, and on a schedule you choose.

    cd jda/server
    node scripts/backup.mjs

It writes `backups/<date and time>/` at the top of the repository (not served by anything, not in
git) and lists what it saved:

- every collection of the main Firebase project, with the saved versions of each report
  (needs `service-account.json`);
- each JDA's report document, read the way the portal reads it, which also covers JDA 3's
  separate project;
- the local finance file, if the server was saving to one.

If anything could not be read it says "NOT backed up", lists it, and ends with an error, so a
partial backup is never mistaken for a whole one. Copy the folder somewhere off the server.

To put things back, first look at what the backup holds. Nothing changes until you add `--write`:

    node scripts/restore.mjs ../../backups/2026-10-12T07-18-24-372Z
    node scripts/restore.mjs ../../backups/<folder> --write                          everything
    node scripts/restore.mjs ../../backups/<folder> --only=financeEntries --write    one collection
    node scripts/restore.mjs ../../backups/<folder> --report=jda1 --write            one JDA's report

Each document in the backup replaces the one with the same id. Documents created after the backup
are left alone; nothing is deleted. To restore a local finance file instead, stop the server and
copy the backup's `finance-data.json` over `server/.finance-data.json`.

Smaller accidents need no backup: a deleted invoice or sanctioned amount is only marked ("Show
deleted" > Restore), every change is in the audit log, and the server keeps the last 20 saved
versions of each JDA's report in `jdaReports/<jda>/versions` (Firebase console).

If invoices were entered while the server was saving to the local file, move them into Firestore
once the key is in place: `node scripts/finance-file-to-firestore.mjs` (safe to run twice).

Usernames map to a hidden email (`username@jda.app`) because Firebase Auth needs one.
