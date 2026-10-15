# TriCipta AI and the JDA Control Tower

A public site, a private one, and one server, in one repository.

```
web/                      The front end. Plain HTML, CSS and ES modules, no build step. Each folder is
                          served at the address of the same name.
  public/                 Public (/public): the TriCipta AI landing page (/), sign-in (/login) and each
                          JDA's Info page (/jda/<id>/info)
    components/           landing, info, login, edit (the landing page's edit mode)
    styles/  assets/      their styles; uploaded pictures (the Roles picture)
  control-tower/          Private (/control-tower, sign-in needed): the JDA Control Tower
    components/           the landing page and its edit mode; the JDA report pages and their editors
    lib/                  the Control Tower's figures (progress %, cost %, latest update)
    config/               jda-content.js: each JDA's built-in content (private: it holds starter data)
    styles/
    invoices/             the Invoice Tracker (CJI3 register, Payment Tables): its own small app
  shared/                 Public (/shared), code and pictures only, no data: what every page uses
    lib/                  sign-in session, Firebase, escaping, dates, report and task logic, picture paths
    components/           account (sign out), edit-mode kit, solution detail blocks
    config/               the JDA list (jdas.js), the Firebase web settings
    styles/               tokens.css (every colour, size and font), the report styles, edit mode
    assets/               brand/ (logos, icon), solutions/, photos/
    vendor/               Firebase, Chart.js, SortableJS, kept in the repository
server/                   Node + Express: serves web/, checks the sign-in, saves everything, Drive and AI
  routes/  scripts/       the API; backup, restore and one-off database scripts
firebase/                 database rules and indexes (and JDA 3's own project's rules)
docs/                     control-tower.md, server-and-invoices.md
OVERHAUL_CHECKLIST.md     the overhaul: what was asked, what is done, how each item was checked
```

Nothing is built or compiled. The pages are plain files; the server is Node.

## Run it on your own computer

1. Install Node 22.3 or newer (`node --version` shows what you have).
2. In a terminal:

       cd server
       npm install
       cp .env.example .env

3. Fill in `server/.env` ([docs/server-and-invoices.md](docs/server-and-invoices.md), "Setup", says what each line is).
4. Start it:

       npm start

5. Open http://localhost:8080 for the public site and http://localhost:8080/login to sign in to the
   JDA Control Tower. Stop the server with Ctrl+C.

To look around with sample data and no Firebase accounts, on your own computer only: set
`"demoMode": true` in `web/control-tower/invoices/js/config/app-config.json` and `REQUIRE_AUTH=false` in
`server/.env` (which opens every private page, so never on a network), then open
http://localhost:8080/control-tower/.

## Editing the two landing pages

Sign in, open the page and press **Edit page** (in the sidebar of the public page, top right on the
Control Tower). Text with a dashed outline is edited where it stands; each JDA has a form. Nothing is
published until **Save changes**. The Roles picture is uploaded from the public page's edit mode (or put
in `web/public/assets/` as `roles.jpg` or `roles.png`). Each JDA's public Info page copies its Master Page, which
is edited in the JDA report's editor.

## Scripts that change the database

Run from `server`; each lists what it would do and changes nothing without `--apply`, and each takes
a full backup first (`scripts/backup.mjs`) and stops if the backup did not save what it is about to change.

- `node scripts/remove-jdas.mjs` removes JDA 4 and above with everything that hangs off them.
- `node scripts/migrate-tasks.mjs` writes the new Weekly progress task fields into the stored reports
  (`--revert` takes them out again).

## Check that everything still works

    cd server
    npm test

About a hundred tests: the money rules, the register, the Payment Table, imports and exports, the
sign-in checks and which pages are private, report saves, the Drive syncs and the portal's page logic. They need
no network, no Firebase and no keys.

## Before putting it in front of people

[docs/server-and-invoices.md](docs/server-and-invoices.md) has "Running in production" (HTTPS, the keys, the database rules,
restarts) and "Backup and restore". Do the backup first.
