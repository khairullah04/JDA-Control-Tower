# JDA Control Tower

Two sites and one server, in one repository.

| Folder | What it is | Read |
|---|---|---|
| [portal/](portal/) | The JDA Programme Portal: one report page per JDA (Master Page, Overall progress, Weekly progress) and the Editor Page behind each JDA's passkey. | [portal/README.md](portal/README.md) |
| [jda/web/](jda/web/) | The Invoice Tracker: the CJI3 register (every invoice, entered once), the Payment Tables, budgets and the assistant. | [jda/README.md](jda/README.md) |
| [jda/server/](jda/server/) | The server. It serves both sites, checks sign-ins and passkeys, saves every report, invoice and payment, and talks to Google Drive, Claude and Bank Negara. | [jda/README.md](jda/README.md) |
| [shared/](shared/) | Code both sites and the server use (escaping, dates, the Firebase settings) and the libraries kept in the repository ([shared/vendor/](shared/vendor/README.md)). | |
| [reviews/](reviews/) | The five-role review of the system and what has been fixed since. | [reviews/SUMMARY.md](reviews/SUMMARY.md) |

Nothing is built or compiled. The pages are plain files; the server is Node.

## Run it on your own computer

1. Install Node 22.3 or newer (`node --version` shows what you have).
2. In a terminal:

       cd jda/server
       npm install
       cp .env.example .env
       cp portal-passkeys.example.json portal-passkeys.json

3. Open `jda/server/portal-passkeys.json` and give every entry a passkey of your own, 8 characters or
   more. The server refuses to start on the example values.
4. Fill in `jda/server/.env` ([jda/README.md](jda/README.md), "Setup", says what each line is).
5. Start it:

       npm start

6. Open http://localhost:8080 for the portal and http://localhost:8080/tracker/ for the Invoice
   Tracker. Stop the server with Ctrl+C.

To look around with sample data and no Firebase, set `"demoMode": true` in
`jda/web/js/config/app-config.json` and open the tracker.

## Check that everything still works

    cd jda/server
    npm test

About a hundred tests: the money rules, the register, the Payment Table, imports and exports, the
passkey and sign-in checks, report saves, the Drive syncs and the portal's page logic. They need
no network, no Firebase and no keys.

## Before putting it in front of people

[jda/README.md](jda/README.md) has "Running in production" (HTTPS, the keys, the database rules,
restarts) and "Backup and restore". Do the backup first.
