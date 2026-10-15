# TriCipta AI and the JDA Control Tower

A public site, a private one, and one server, in one repository.

| Folder | What it is | Read |
|---|---|---|
| [site/](site/) | The public TriCipta AI site: landing page (`/`), employee sign-in (`/login`) and each JDA's Info page (`/jda/<id>/info`). | |
| [portal/](portal/) | The JDA Control Tower (private, `/control-tower/`): one report page per JDA (Master Page, Overall progress, Weekly progress) and its Editor Page. | [portal/README.md](portal/README.md) |
| [jda/web/](jda/web/) | The Invoice Tracker (private, `/control-tower/tracker/`): the CJI3 register (every invoice, entered once), the Payment Tables, budgets and the assistant. | [jda/README.md](jda/README.md) |
| [jda/server/](jda/server/) | The server. It serves every page (what is public and what is private is listed in `app.js`), checks the sign-in, saves every report, invoice and payment, and talks to Google Drive, Claude and Bank Negara. | [jda/README.md](jda/README.md) |
| [shared/](shared/) | Code both sites and the server use (escaping, dates, the Firebase settings) and the libraries kept in the repository ([shared/vendor/](shared/vendor/README.md)). | |
| [OVERHAUL_CHECKLIST.md](OVERHAUL_CHECKLIST.md) | The TriCipta AI overhaul: what was asked, what is done and how each item was checked. | |

Nothing is built or compiled. The pages are plain files; the server is Node.

## Run it on your own computer

1. Install Node 22.3 or newer (`node --version` shows what you have).
2. In a terminal:

       cd jda/server
       npm install
       cp .env.example .env

3. Fill in `jda/server/.env` ([jda/README.md](jda/README.md), "Setup", says what each line is).
4. Start it:

       npm start

5. Open http://localhost:8080 for the public site and http://localhost:8080/login to sign in to the
   JDA Control Tower. Stop the server with Ctrl+C.

To look around with sample data and no Firebase accounts, on your own computer only: set
`"demoMode": true` in `jda/web/js/config/app-config.json` and `REQUIRE_AUTH=false` in
`jda/server/.env` (which opens every private page, so never on a network), then open
http://localhost:8080/control-tower/.

## Check that everything still works

    cd jda/server
    npm test

About a hundred tests: the money rules, the register, the Payment Table, imports and exports, the
sign-in checks and which pages are private, report saves, the Drive syncs and the portal's page logic. They need
no network, no Firebase and no keys.

## Before putting it in front of people

[jda/README.md](jda/README.md) has "Running in production" (HTTPS, the keys, the database rules,
restarts) and "Backup and restore". Do the backup first.
