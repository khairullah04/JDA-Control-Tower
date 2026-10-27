# Future plan: tech stack overhaul

Written 2026-10-27, as the hand-over into a new repository. Facts marked ✅ were checked against official
documentation that day (sources at the bottom). Read this together with `TODO.md` (what is left),
`reviews/REVIEW.md` (178 findings on the current code) and `CHECKLIST.md` (decisions so far).

## 1. Why a new stack

The current system can't be run properly yet:

- **No AI Builder:** Power Automate isn't paid for, so there's no AI Builder. It was meant to handle data, document uploads and the chat bot.
- **No login:** sign-in doesn't work, because of Firebase set-up problems.
- **Hard to test:** the internal logic is tangled, and the system has too many features to test.
- **Not company-approved:** there is no company-level Vercel or Firebase account.
- **No framework:** future coders have no common structure to follow.
- **Unproven integrations:** email sign-up, document processing and the Microsoft List are not proven on Vercel.

**Goal:** a framework that **runs today with no paid or company accounts**. Every outside service sits
behind a swappable adapter, so AI Builder, Microsoft login, SharePoint and official hosting plug in later
with a setting, not a rewrite.

## 2. The stack

| Layer | Choice | Why |
|---|---|---|
| Language | **TypeScript** | Catches mistakes before they run, which matters most for money. |
| Framework | **Next.js** (App Router), pages and server in one project | ✅ Runs on Vercel, and also self-hosted on any Node.js server or Docker (e.g. Azure App Service). |
| UI | **Tailwind CSS + shadcn/ui**, **TanStack Table** (finance tables), **Recharts** (charts) | Ready-made, accessible parts; Excel-style sort and filter. |
| Forms and validation | **React Hook Form + Zod** | One set of rules, checked in the browser and on the server. |
| Database | **Postgres** with **Drizzle ORM** | Proper tables, all-or-nothing saves, a real audit log. |
| Database, local | **PGlite** | ✅ Postgres inside the app; runs in Node and saves to a folder. Drizzle supports it. |
| Database, hosted | **Neon** (Singapore, `aws-ap-southeast-1`) on Vercel, or **Azure Database for PostgreSQL** if IT prefers Azure | ✅ Neon has Singapore. ⚠️ Confirm the Azure region with IT. |
| Sign-in | **Auth.js**: email + password (@petronas.com only) now; **Microsoft Entra ID** (PETRONAS SSO, single tenant) later | ✅ Auth.js supports Entra ID limited to one organisation. No Firebase. |
| File storage | Local folder now; **Vercel Blob** or a **SharePoint document library** later | ✅ Vercel Blob is on all plans, with a chosen region. |
| Microsoft integration | **Microsoft Graph** | ✅ Reads List items; ✅ sends mail (`Mail.Send`). ❌ Cannot read List item attachments (see section 5). |
| Emails | Local outbox and `.eml` download now; **Graph sendMail** from a PETRONAS mailbox later | |
| Excel | **ExcelJS** on the server | CJI3 and List import, Payment Table export. |
| Scheduled and long jobs | **Vercel Cron**; a queue (Inngest or Vercel Queues) for big imports | Nightly backups, automatic List pulls. |
| Rate limiting | **Upstash Redis** | Works across every copy of the server. |
| AI (enhancement, later) | Behind one adapter: AI Builder / Copilot Studio, or any model through the Vercel AI SDK | Switch the model with a setting. |
| Testing | **Vitest** (rules), **Playwright** (screens) | |
| CI | **GitHub Actions**: tests on every pull request; preview deployment per branch | |
| Monitoring | Vercel Observability + Sentry | |
| Hosting | Your laptop or Codespace now; **Vercel Pro** (`sin1`, Singapore) or **Azure App Service** later | ✅ Vercel Hobby is non-commercial only. Pro is US$20 per developer per month. |

## 3. Adapters: what works now, what switches on later

| Job | Now (no accounts) | Later (one setting) |
|---|---|---|
| Database | PGlite | Neon or Azure Postgres |
| Login | Email + password, @petronas.com, verified | Microsoft Entra ID (SSO, PETRONAS MFA) |
| Invoice and CJI3 reading | Upload Excel/CSV; the existing parsers | AI Builder (Power Automate) writes extracted data into a SharePoint List; the app reads it |
| Microsoft List | Import an exported file | Graph reads the List |
| Supporting documents | Links typed or imported | Files in a **SharePoint document library**, link stored in the List |
| Email | Outbox page + `.eml` | Graph `sendMail` |
| Files | Local folder | Vercel Blob / SharePoint |
| Chat bot | Off (feature flag) | Copilot Studio, AI Builder or another model |

**Where Power Automate and the app meet:** SharePoint. AI Builder flows write to a SharePoint List and
library (the ✅ SharePoint connector is **Standard**), and the app reads them through Graph.

## 4. Version 1 scope (keep it small and testable)

1. Login (@petronas.com).
2. JDAs and projects (one stable id per JDA).
3. Invoices: **Pending → Approved (by hand) → Paid (only from CJI3)**, with Reject / Restore / Undo approval.
4. CJI3 upload and matching: **exact amount, no tolerance**; tax, MYR and paid amount taken from CJI3.
5. Sanctioned amounts (= planned) and Payment Tables, paid invoices only.
6. Invoice history and audit log.

**Later add-ons:** Microsoft List + approval email, the public TriCipta site, Control Tower progress pages,
the chat bot, AI extraction.

**Owner decisions to keep (2026-10-27):**
- Everyone signed in may do everything; some functions become PM- or Project Lead-only later.
- No per-JDA access.
- No CJI3 tolerance.
- Tax and forex come from the CJI3 extraction.
- Ask AI is an enhancement for later.

## 5. Verified facts and corrections (2026-10-27)

- ❌ **AI Builder needs two paid things:**
  - **Power Automate Premium**: a flow with any AI Builder action is a premium flow; US$15 per user per month, yearly.
  - **Copilot Credits**: since November 2025, new customers must buy Copilot Credits; AI Builder trials are discontinued.
  - Invoice reading costs 8 Copilot Credits per page, about US$0.08 per page on pay-as-you-go.
  - It also needs a Power Platform environment with Dataverse.
- ✅ AI Builder's **prebuilt invoice model** extracts invoice ID, vendor, dates, subtotal, **TotalTax**, total and line items, from PDF/JPG/PNG up to 20 MB, inside Power Automate.
- ✅ SharePoint connector: **Standard**. The HTTP connector: **Premium**. Once flows are premium for AI Builder anyway, HTTP to the app is also available.
- ❌ **Graph can't read SharePoint List item attachments.** Use a document library, or the SharePoint REST API (`?$expand=AttachmentFiles`).
- ✅ Graph reads List items (`Sites.Read.All`) and sends mail (`Mail.Send`).
- ✅ Next.js self-hosts on Node or Docker. ⚠️ Microsoft has no Next.js-specific App Service guide; the general Node.js quickstart applies.
- ✅ Vercel: Singapore region `sin1`; Hobby is non-commercial; Pro is US$20 per developer per month; Blob is on all plans.
- ✅ Neon: Singapore. Its Azure regions are closed to new projects.
- ⚠️ Copilot Studio chat bot over SharePoint: possible, but licensing is unclear. It may need Copilot Studio credits **and** Microsoft 365 Copilot licences.
- To look into: **Azure AI Document Intelligence** called directly from the app, as invoice extraction without Power Automate. Pricing not checked.

## 6. Budget to request (when moving from "now" to "later")

| Item | Cost (official list price, 2026) | Needed for |
|---|---|---|
| Power Automate Premium | US$15 / user / month (yearly) | AI Builder flows |
| Copilot Credits | about US$0.08 per invoice page (pay-as-you-go) | AI Builder document reading |
| Vercel Pro | US$20 / developer / month | Company use of Vercel, Singapore region |
| Neon (or Azure Postgres) | per usage | Hosted database |
| Microsoft Entra app registration | IT request, no licence | SSO and Graph |

Also ask IT whether PETRONAS allows finance data on outside clouds (Vercel, Neon), or requires Azure.

## 7. Steps

1. **Skeleton:** new repo, Next.js + TypeScript + PGlite + Drizzle + Auth.js + Tailwind/shadcn + Vitest + CI. `npm run dev` works with seed data and no accounts.
2. **Rules:** port `web/control-tower/invoices/js/finance/` (money, core, cji3, workflow, sheets) to TypeScript, with their tests. This is the part that is already right.
3. **Schema:** JDAs, projects, invoices, stages, CJI3 lines and imports, sanctioned amounts, audit log. All-or-nothing writes.
4. **Core screens:** Invoice history (approve/reject), CJI3 payments, Payment Tables, sanctioned amounts.
5. **Adapters**, each with its "now" version and a README on switching to "later".
6. **Fixes from `reviews/REVIEW.md`** built in from the start:
   - exact amounts, CJI3 paid amount;
   - reversals, part payments;
   - atomic imports; locked Paid records;
   - security headers; one JDA id.
7. **Hand-over guide** for future coders: running it, the structure, plugging in AI Builder, Entra and hosting.
8. **Later add-ons** (section 4), one at a time.

## 8. What to carry over from this repository

- `web/control-tower/invoices/js/finance/` and `server/*.test.mjs`: the rules and their ~200 tests.
- `docs/server-and-invoices.md`: the business rules in words.
- `CHECKLIST.md`, `TODO.md`, `reviews/`: decisions, open work, findings.
- `.claude/agents/review/`: the 9 reviewer agents, to review the new code the same way.
- The parsers for CJI3 and List exports (`finance/cji3.js`, `finance/list-source.js`, `finance/sheets.js`).

Leave behind: Firebase (`firebase/`, `server/firebase-admin.js`, `web/shared/vendor/firebase-*`), the
Express server, demo mode and the old hand-drawn screens.

## Sources (checked 2026-10-27)

- AI Builder licensing: <https://learn.microsoft.com/en-us/ai-builder/administer-licensing>
- End of AI Builder credits: <https://learn.microsoft.com/en-us/ai-builder/endofaibcredits>
- AI Builder invoice model: <https://learn.microsoft.com/en-us/ai-builder/prebuilt-invoice-processing>
- SharePoint connector: <https://learn.microsoft.com/en-us/connectors/sharepointonline/>
- HTTP with Microsoft Entra ID connector: <https://learn.microsoft.com/en-us/connectors/webcontents/>
- Power Automate pricing: <https://www.microsoft.com/en-us/power-platform/products/power-automate/pricing>
- Graph, list items: <https://learn.microsoft.com/en-us/graph/api/listitem-list?view=graph-rest-1.0>
- Graph, sendMail: <https://learn.microsoft.com/en-us/graph/api/user-sendmail>
- Graph, List item attachments not supported (Microsoft Q&A): <https://learn.microsoft.com/en-us/answers/a/1867148>
- Next.js self-hosting: <https://nextjs.org/docs/app/guides/self-hosting>
- Azure App Service Node.js quickstart: <https://learn.microsoft.com/en-us/azure/app-service/quickstart-nodejs>
- PGlite: <https://pglite.dev/docs/>
- Drizzle + PGlite: <https://orm.drizzle.team/docs/connect-pglite>
- Neon regions: <https://neon.com/docs/introduction/regions>
- Vercel Hobby plan: <https://vercel.com/docs/plans/hobby>
- Vercel regions: <https://vercel.com/docs/regions>
- Vercel function regions: <https://vercel.com/docs/functions/configuring-functions/region>
- Vercel Blob: <https://vercel.com/docs/vercel-blob>
- Auth.js + Microsoft Entra ID: <https://authjs.dev/getting-started/providers/microsoft-entra-id>
- Copilot Studio licensing for SharePoint agents (Microsoft Q&A): <https://learn.microsoft.com/en-us/answers/questions/5875068/licensing-clarification-for-microsoft-365-copilot>
