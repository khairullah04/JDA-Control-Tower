# Future plan: tech stack overhaul

Revised 2026-10-28: **Firebase stays**, **Vercel is for testing only**, and the live site runs on
**Firebase App Hosting**. This replaces the 2026-10-27 version (Postgres, Auth.js, Vercel Pro). Facts
marked ✅ were checked against official documentation (sources at the bottom).

Read with `TODO.md` (what is left), `reviews/REVIEW.md` (178 findings on the current code) and
`CHECKLIST.md` (decisions so far).

## 1. Why a new stack

The current system can't be run properly yet:

- **No AI Builder:** Power Automate isn't paid for, so there's no AI Builder. It was meant to handle data, document uploads and the chat bot.
- **Login fails:** the causes were set-up, not Firebase. The API key in Vercel was wrong, and the database rules were never published.
- **Hard to test:** the internal logic is tangled, and the system has too many features to test.
- **Not company-approved:** there is no company-level Vercel account.
- **No framework:** future coders have no common structure to follow.
- **Unproven integrations:** email sign-up, document processing and the Microsoft List are not proven on the hosting.

**Goal:** a framework that **runs today with no paid accounts**. Every outside service sits behind a
swappable adapter, so AI Builder, Microsoft login and SharePoint plug in later with a setting, not a rewrite.

## 2. The ideal stack

### Core

| Layer | Tool |
|---|---|
| Language | **TypeScript** |
| Framework (pages + server) | **Next.js** (App Router) |
| UI | **Tailwind CSS + shadcn/ui** |
| Tables / charts | **TanStack Table** / **Recharts** |
| Forms and validation | **React Hook Form + Zod**: the same rules in the browser and on the server |
| Money | Whole sen (integers), never decimals; the existing `money.js` rules |

### Firebase (data, login, files, jobs)

| Job | Tool | When |
|---|---|---|
| Database | **Cloud Firestore**, written **only by the server** (Firebase Admin SDK); browsers read-only, with tight rules | Now |
| Sign-in | **Firebase Authentication**: email + password, @petronas.com, verified | Now |
| | **Microsoft (Entra ID) sign-in**, limited to the PETRONAS tenant | Later, after IT registers the app |
| Files (invoices, pictures) | **Cloud Storage for Firebase** | Now |
| Scheduled jobs (backups, List pulls) | **Cloud Functions** | Later (Blaze) |
| Block non-PETRONAS sign-ups at source | **Blocking functions** + Identity Platform | Later (Blaze) |
| Local development, no accounts | **Firebase Local Emulator Suite** | Now |

### Hosting

| Purpose | Tool |
|---|---|
| Testing | **Vercel** preview deployments, with links protected (Vercel Authentication) |
| Live site | **Firebase App Hosting**, Singapore (`asia-southeast1`), Blaze plan |

The same Next.js code runs on both. Settings are read in one place and checked at start-up, so a missing
or wrong key stops the app with a clear message (the cause of the earlier login failure).

### Microsoft and AI (adapters, switched on later)

| Job | Now | Later |
|---|---|---|
| Invoice / CJI3 reading | Upload Excel/CSV (existing parsers) | **AI Builder** (Power Automate Premium + Copilot Credits) writes to a SharePoint List |
| Microsoft List | Import an exported file | **Microsoft Graph** reads the List |
| Supporting documents | Links | **SharePoint document library** (Graph can't read List attachments) |
| Emails | `.eml` download / outbox | **Graph sendMail** from a PETRONAS mailbox |
| Chat bot | Off (feature flag) | Copilot Studio / AI Builder, or another model |

**Where Power Automate and the app meet:** SharePoint. AI Builder flows write to a SharePoint List and
library, and the app reads them through Graph.

### Quality and team

| Job | Tool |
|---|---|
| Rule tests | **Vitest** (the ~200 existing tests carried over) |
| Screen tests | **Playwright** |
| Database rules tests | Firestore emulator + `@firebase/rules-unit-testing` |
| CI | **GitHub Actions**: tests on every pull request |
| Code style | **ESLint + Prettier** |
| Errors in production | **Sentry** |
| Reviews | The 9 reviewer agents (`.claude/agents/review/`) |

## 3. Using Firestore safely (lessons from `reviews/REVIEW.md`)

Firestore's ✅ transactions and batched writes are all-or-nothing. The old code's problems came from how
it used them. Rules for the new code:

- **Only the server writes.** Browsers never write finance data, JDAs or projects (SWE-10, SEC-06).
- **No side effects inside a transaction.** ✅ Firestore re-runs a transaction when data changes under
  it, so work out the result inside and act on it after (LOG-09).
- **One transaction per operation:**
  - a CJI3 import is recorded as pending first and finished last (LOG-10);
  - re-matching unmatches the old invoice in the same transaction (SWE-02).
- **Field updates, not whole documents**, so two people's changes don't overwrite each other (SWE-05).
- **Mind the limits:** ✅ 1 MiB per document; ✅ 10 MiB per request; ✅ 270 s per transaction. Big
  imports go in slices, each with its own import record.
- **Stable ids:** one JDA id everywhere (`jda1`..`jda3`), not names (SWE-09).
- **Every change in the audit log**, written in the same transaction as the change (ACC-14).

If the finance data outgrows Firestore, ✅ **Firebase SQL Connect** (formerly Data Connect) gives real
Postgres inside Firebase: it has an emulator and a 3-month trial, then costs from about US$9.37 per month
(Cloud SQL) and needs Blaze. Keep database code behind one module so that swap stays possible.

## 4. Version 1 scope (keep it small and testable)

1. Login (@petronas.com, verified).
2. JDAs and projects (one stable id per JDA).
3. Invoices: **Pending → Approved (by hand) → Paid (only from CJI3)**, with Reject / Restore / Undo approval.
4. CJI3 upload and matching: **exact amount, no tolerance**; tax, MYR and paid amount taken from CJI3.
5. Sanctioned amounts (= planned) and Payment Tables, paid invoices only.
6. Invoice history and audit log.

**Later add-ons:** Microsoft List + approval email, the public TriCipta site, Control Tower progress pages,
the chat bot, AI extraction.

**Owner decisions to keep (2026-10-27/28):**
- Everyone signed in may do everything; some functions become PM- or Project Lead-only later.
- No per-JDA access.
- No CJI3 tolerance.
- Tax and forex come from the CJI3 extraction.
- Ask AI is an enhancement for later.
- Firebase stays; Vercel is for testing only.

## 5. Verified facts (2026-10-27/28)

**Firebase**
- ✅ App Hosting: built-in support for Next.js 13.5 and up. ✅ It needs the **Blaze** plan; free up to 10 GiB/month of outgoing data. A Google Cloud locations page lists `asia-southeast1` (Singapore); confirm it on Firebase's own "App Hosting locations" page.
- ✅ Firestore free tier: 20K writes/day, 50K reads/day. ✅ Authentication: free up to 50K monthly users (phone sign-in billed per SMS).
- ✅ Firebase Auth signs in Microsoft work accounts and can be limited to one tenant (`tenant` parameter; the default "common" allows any tenant).
- ✅ Blocking functions (`beforeUserCreated`) can reject sign-ups outside a domain, but need the **Identity Platform** upgrade. Cloud Functions need Blaze (free up to 2M calls/month). Use an exact domain match, not "contains".
- ✅ The Local Emulator Suite covers Auth, Firestore, Storage, Hosting and (beta) Functions, so you can test without production data.
- ✅ SQL Connect: real Postgres; a 3-month trial; from about US$9.37/month after; archived if not on Blaze by the end of the trial.

**Microsoft**
- ❌ **AI Builder needs two paid things:**
  - **Power Automate Premium**: a flow with any AI Builder action is a premium flow; US$15 per user per month, yearly.
  - **Copilot Credits**: since November 2025, new customers must buy Copilot Credits; AI Builder trials are discontinued.
  - Invoice reading costs 8 credits per page, about US$0.08 per page. It also needs a Dataverse environment.
- ✅ The AI Builder prebuilt invoice model extracts invoice ID, vendor, dates, subtotal, TotalTax, total and line items, from PDF/JPG/PNG up to 20 MB.
- ✅ The SharePoint connector is **Standard**; the HTTP connector is **Premium**.
- ✅ Graph reads List items (`Sites.Read.All`) and sends mail (`Mail.Send`). ❌ Graph can't read List item attachments, so use a document library, or the SharePoint REST API with `?$expand=AttachmentFiles`.
- ⚠️ A Copilot Studio chat bot over SharePoint is possible, but licensing is unclear: it may need Copilot Studio credits **and** Microsoft 365 Copilot licences.

**Vercel**
- ✅ Hobby is "non-commercial, personal use only". Testing a company tool is a grey area, so keep test links protected or test on App Hosting too. Pro is US$20 per developer per month, if ever needed.

## 6. Costs

| Stage | Cost |
|---|---|
| Now (build and test) | **US$0**: Firebase Spark, emulators, Vercel Hobby previews |
| Going live | Firebase **Blaze** (pay-as-you-go). Expected usage stays mostly inside the free quotas. |
| AI Builder (later) | Power Automate Premium **US$15/user/month** + Copilot Credits **about US$0.08 per invoice page** |
| Microsoft sign-in, Graph (later) | Entra app registration by IT; no licence |
| Optional | Firebase SQL Connect from **about US$9.37/month** |

Also ask IT whether PETRONAS allows finance data on Google Cloud (Firebase).

## 7. Steps

1. **Skeleton:** new repo with Next.js + TypeScript + Tailwind/shadcn + Firebase (Admin SDK on the server, client SDK for sign-in) + Emulator Suite + Vitest + ESLint/Prettier + CI. `npm run dev` with the emulators and seed data, no accounts needed.
2. **Rules:** port `web/control-tower/invoices/js/finance/` (money, core, cji3, workflow, sheets) to TypeScript, with their tests.
3. **Data model:** jdas, projects, invoices, stages, CJI3 lines and imports, sanctioned amounts, audit log; server-only writes, following section 3; Firestore rules and their tests.
4. **Sign-in:** Firebase Auth, @petronas.com, verified; server-side session; start-up settings check.
5. **Core screens:** Invoice history (approve/reject), CJI3 payments, Payment Tables, sanctioned amounts.
6. **Adapters**, each with its "now" version and a README on switching to "later".
7. **Deploy:** Vercel previews for testing; Firebase App Hosting (Singapore) for live once Blaze is approved.
8. **Hand-over guide** for future coders: running it, the structure, plugging in AI Builder, Entra and Graph.
9. **Later add-ons** (section 4), one at a time.

## 8. What to carry over from this repository

- `web/control-tower/invoices/js/finance/` and `server/*.test.mjs`: the rules and their ~200 tests.
- `firebase/firestore.rules` and `server/firestore-rules.test.mjs`: the starting point for the new rules.
- `docs/server-and-invoices.md`: the business rules in words.
- `CHECKLIST.md`, `TODO.md`, `reviews/`: decisions, open work, findings.
- `.claude/agents/review/`: the 9 reviewer agents.
- The CJI3 and List parsers (`finance/cji3.js`, `finance/list-source.js`, `finance/sheets.js`).

Leave behind: the Express server, the browser-side Firestore writes, demo mode, the vendored Firebase
files (`web/shared/vendor/`; use npm packages instead) and the old hand-drawn screens.

## Sources (checked 2026-10-27/28)

**Firebase**
- App Hosting: <https://firebase.google.com/docs/app-hosting>
- App Hosting frameworks (Next.js 13.5+): <https://firebase.google.com/docs/app-hosting/frameworks-tooling>
- App Hosting troubleshooting / locations: <https://firebase.google.cn/docs/app-hosting/troubleshooting>
- Google Cloud locations list (App Hosting in asia-southeast1): <https://docs.cloud.google.com/developer-connect/docs/locations>
- Firebase pricing: <https://firebase.google.com/pricing>
- Firestore transactions: <https://firebase.google.com/docs/firestore/manage-data/transactions>
- Firestore quotas: <https://firebase.google.com/docs/firestore/quotas>
- Firebase Auth with Microsoft: <https://firebase.google.com/docs/auth/web/microsoft-oauth>
- Blocking functions: <https://firebase.google.com/docs/auth/extend-with-blocking-functions>
- Local Emulator Suite: <https://firebase.google.com/docs/emulator-suite>
- SQL Connect: <https://firebase.google.com/docs/data-connect>
- SQL Connect pricing: <https://firebase.google.com/docs/sql-connect/pricing>

**Microsoft**
- AI Builder licensing: <https://learn.microsoft.com/en-us/ai-builder/administer-licensing>
- End of AI Builder credits: <https://learn.microsoft.com/en-us/ai-builder/endofaibcredits>
- AI Builder invoice model: <https://learn.microsoft.com/en-us/ai-builder/prebuilt-invoice-processing>
- SharePoint connector: <https://learn.microsoft.com/en-us/connectors/sharepointonline/>
- HTTP with Microsoft Entra ID connector: <https://learn.microsoft.com/en-us/connectors/webcontents/>
- Power Automate pricing: <https://www.microsoft.com/en-us/power-platform/products/power-automate/pricing>
- Graph, list items: <https://learn.microsoft.com/en-us/graph/api/listitem-list?view=graph-rest-1.0>
- Graph, sendMail: <https://learn.microsoft.com/en-us/graph/api/user-sendmail>
- Graph, List item attachments not supported (Microsoft Q&A): <https://learn.microsoft.com/en-us/answers/a/1867148>
- Copilot Studio licensing for SharePoint agents (Microsoft Q&A): <https://learn.microsoft.com/en-us/answers/questions/5875068/licensing-clarification-for-microsoft-365-copilot>

**Vercel and Next.js**
- Vercel Hobby plan: <https://vercel.com/docs/plans/hobby>
- Next.js self-hosting: <https://nextjs.org/docs/app/guides/self-hosting>
