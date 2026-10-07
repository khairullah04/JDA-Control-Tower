# JDA Invoice Tracker

```
web/      Frontend (no build step, ES modules)
  css/        base (colour tokens) · layout · components
  js/config   firebase-config.js · app-config.json
  js/services auth · db · ai · analytics (+ live/ Firebase+Claude, demo/ sample data)
  js/ui       dashboard · project · copilot · modal · state · dom
server/   Node + Express. Holds the Claude key, checks the user is signed in
firestore.rules
```

## Config switches (web/js/config/app-config.json)
- `requireLogin`: true = login page shown. false = skip it (also set REQUIRE_AUTH=false in server/.env and open the Firestore rules).
- `demoMode`: true = sample data, no Firebase/server needed. false = real system.
- `fxToMYR`: exchange rates for the currency check. Update as needed.
- `defaultJdaStart` / `defaultJdaEnd`: the timeline range for a JDA that has no dates of its own (those created before dates were required). New JDAs must state both; "Edit dates" on a JDA page changes them. Timelines always run to the end of the current month at least.

## Portal Drive sync
The server also serves `/api/portal/*` for the JDA Programme Portal: `unlock` checks a JDA's passkey
(`server/portal-passkeys.json`) and returns a session token; `sync` reads one JDA's Drive folder and
has Claude extract its Master Page (`scope: master`) or progress (`scope: progress`). Token-gated,
not sign-in gated. Folder
layout and setup are in `portal/README.md`, "Updating from Google Drive". `npm test` in `server/`
checks the folder handling and assembly with Drive and Claude stubbed out.

## Setup
1. Firebase: create project, enable Authentication > Email/Password, create Firestore (Standard, asia-southeast1, Production), publish `firestore.rules`.
2. Register a Web app; paste its config into `web/js/config/firebase-config.js`.
3. `cd server && cp .env.example .env`; fill ANTHROPIC_API_KEY and FIREBASE_API_KEY (the apiKey from step 2).
4. `npm install && npm start`. This one command serves everything on :8080 (`PORT` in `.env`):
   the JDA Programme Portal at http://localhost:8080 and this tracker at http://localhost:8080/tracker/.
5. Open http://localhost:8080/tracker/.
6. Create account (username + password, 6+ chars) and sign in.

Usernames map to a hidden email (`username@jda.app`) because Firebase Auth needs one.
