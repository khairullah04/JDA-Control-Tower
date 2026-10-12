# JDA Invoice Tracker

```
web/      Frontend (no build step, ES modules)
  css/        base (colour tokens) · layout · components · timeline · finance
  js/config   firebase-config.js · app-config.json
  js/finance  money · core · sheets · service: the rules of the CJI3 register and the Payment Tables (also run by the server)
  js/services auth · db · ai · finance · analytics (+ live/ Firebase+Claude+server, demo/ sample data)
  js/ui       dashboard · jda · project · cji3 · payments · copilot · modal · state · dom
server/   Node + Express. Holds the Claude key, checks the user is signed in, and keeps the invoices and payments
firestore.rules
```

## Config switches (web/js/config/app-config.json)
- `requireLogin`: true = login page shown. false = skip it (also set REQUIRE_AUTH=false in server/.env and open the Firestore rules).
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
- **Only Paid invoices count as actual** (Total, variance, spend bars, cumulative spend, forecast).
  Variance = Total − w TAX: above zero is over sanctioned (red), below is under, zero is within.
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
  MYR figures keeps them exactly.
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
log, import/export and the passkey gate.

## Setup
1. Firebase: create project, enable Authentication > Email/Password, create Firestore (Standard, asia-southeast1, Production), publish `firestore.rules`.
2. Register a Web app; paste its config into `web/js/config/firebase-config.js`.
3. `cd server && cp .env.example .env`; fill ANTHROPIC_API_KEY and FIREBASE_API_KEY (the apiKey from step 2).
   Add the service-account key and set the tracker's passkey: see "Invoices and payments" above.
4. `npm install && npm start`. This one command serves everything on :8080 (`PORT` in `.env`):
   the JDA Programme Portal at http://localhost:8080 and this tracker at http://localhost:8080/tracker/.
5. Open http://localhost:8080/tracker/.
6. Create account (username + password, 6+ chars) and sign in.

Usernames map to a hidden email (`username@jda.app`) because Firebase Auth needs one.
