# JDAM review: JDA member (submitting and tracking invoices)

Scope: `main` @ 89e49bf, whole repository, read-only. The lens is a non-technical JDA member who puts invoices in, follows them and sends the approval email.
Summary: Critical 1 · Major 9 · Minor 7 · Nit 2 (19 findings).

### [JDAM-01] The live Invoice Tracker runs on sample data in the browser, and nothing on screen says so
- Category: WRONG
- Severity: Critical
- Confidence: High
- Location: web/control-tower/invoices/js/config/app-config.json:L2; web/control-tower/invoices/js/services/finance.js:L7-8; web/control-tower/invoices/js/services/demo/finance.js:L1-13; web/control-tower/invoices/js/services/demo/auth.js:L2-5; web/control-tower/invoices/js/ui/finance-ui.js:L33-34
- Evidence:
  - `"demoMode": true,`
  - `withBook(config.demoMode ? await import('./demo/finance.js') : await import('./live/finance.js'));`
  - `// Demo: the real register rules, run in this page over sample data. Edits last until the page is refreshed.`
  - `const user = { email: 'demo@jda.app' };`
  - `storageNotice = ctx => ctx.fin.storage === 'file' ? '<div class="banner …">…' : ''` (demo returns `storage: 'demo'`, so no banner appears)
- What's wrong: In production, every member gets the in-memory demo register. Imports, List pulls and "sent to Lead" moves disappear when the page is refreshed. Every action is recorded as "demo". The top bar says "Signed in as demo". Excel List exports are refused ("Demo mode reads CSV files only"), even though the file picker offers `.xlsx`. The `.eml` the member downloads is real and gets sent, but the system keeps no record of it.
- What it should be: Set `"demoMode": false` on `main`. If demo mode stays possible, show a permanent banner whenever `storage === 'demo'`:
  ```js
  export const storageNotice = ctx => ctx.fin.storage === 'demo'
    ? '<div class="banner over notice">Demo: sample data only. Nothing you do here is saved.</div>'
    : ctx.fin.storage === 'file' ? '…existing…' : '';
  ```
- Impact: Members cannot track any invoice. They lose their work and send approval emails that nobody can trace. This blocks release.

### [JDAM-02] The approval email never comes out ready to send: To, greeting and sign-off are always placeholders
- Category: MISSING
- Severity: Major
- Confidence: High
- Location: web/control-tower/invoices/js/config/email-recipients.js:L4-10; web/control-tower/invoices/js/finance/email.js:L38, L47
- Evidence:
  - `'JDA 1': { to: '', cc: '', greeting: '' }, … export const SIGN_OFF = '';`
  - `Dear ${escHtml(recipient) || '[Project Lead]'},`
  - `Best regards,<br>${escHtml(sender) || '[Your name]'}`
- What's wrong: Every JDA has an empty To and Cc, and the signature is always blank. The member has to look up the Lead's address and replace "[Project Lead]" and "[Your name]" by hand, every time. If they miss one, the Lead receives "Dear [Project Lead]".
- What it should be: Fill in the recipients for each JDA, or keep them in settings an admin can edit. Sign with the signed-in person's name (`req.user` / `usernameOf(user)`) and pass it as `sender`. Block "Generate" (or warn) while To is empty.
- Impact: Every email needs manual fixing. Recipients will be wrong or missing, and placeholder text will reach the Lead.

### [JDAM-03] Downloading or copying the email marks the invoices "Pending Lead approval" even if it is never sent, and there is no undo or resend
- Category: FUNDAMENTALLY WRONG
- Severity: Major
- Confidence: High
- Location: web/control-tower/invoices/js/ui/list-invoices.js:L121, L129-148; web/control-tower/invoices/js/finance/service.js:L374
- Evidence:
  - `Generating sends these invoices to the Project Lead: they move to <b>Pending Lead approval</b>`
  - `await finish('The draft is downloaded: open it to edit and send it in Outlook.');` (the `.eml` click calls `sendListToLead`)
  - `if (!['received', 'with_pm'].includes(stage)) { skipped.push({ invoiceNo: ref, why: \`already ${STAGE_LABEL[stage]}\` }); continue; }`
- What's wrong: The system records the email as sent as soon as the file is downloaded or the email is copied. Sending happens later in Outlook, and may never happen. If the member closes Outlook, finds a mistake or loses the file, the invoices still show "Pending Lead approval". Trying again skips them as "already Pending Lead approval", so a corrected email cannot be generated for them.
- What it should be: Split it into two steps. "Generate email" only produces the email. A separate "I've sent it" (or "Mark as sent") step calls `sendListToLead`. Also allow "Generate again" for invoices that are already Pending Lead: build the email without moving them.
- Impact: The status shown is false ("waiting for the Lead" when nothing was sent), and invoices cannot be re-sent.

### [JDAM-04] The email is produced before the register is updated: if the update fails, the email goes out but nothing is recorded, and the error is mislabelled
- Category: WRONG
- Severity: Major
- Confidence: High
- Location: web/control-tower/invoices/js/ui/list-invoices.js:L141-159
- Evidence:
  - `.eml`: `a.click(); … await finish(…)`. The file is already downloaded when `finish` (the server call) runs.
  - Copy: `location.href = mailtoLink(…); await finish(…); } catch (e) { fail(new Error(\`The email could not be copied (${e.message}). Use Generate email (.eml) instead.\`)); }`
  - Outlook draft: `await finance.listDraft(…); if (webLink) open(webLink…); await finish(…)`
- What's wrong: The draft, file or mailto window is created first, and the invoices are only registered afterwards. If that fails (for example ROLE_PM refusal "Only the Project Manager may do this…", an expired session or a network error), the member already has a sendable email but the register shows nothing. On the Copy path, a server refusal is reported as "The email could not be copied (…)" and the member is told to use the .eml instead, which runs into the same refusal.
- What it should be: Call `send()` first. Only build or download the email once it succeeds. Report server errors as server errors:
  ```js
  $('#pv-eml', d).onclick = async () => {
    try { await send(); } catch (e) { return fail(e); }
    /* then build + download the .eml, then show the success message */
  };
  ```
- Impact: Emails reach the Lead for invoices the tracker never registered. The error text points the member at the wrong cause.

### [JDAM-05] The app has no way to record that the Lead rejected or returned an invoice, so it stays "Pending Lead approval" forever
- Category: MISSING
- Severity: Major
- Confidence: High
- Location: web/control-tower/invoices/js/finance/workflow.js:L29-31; web/control-tower/invoices/js/ui/finance-ui.js:L230
- Evidence:
  - `{ from: 'pending_lead', to: 'rejected', action: 'Reject', note: true }, { from: 'pending_lead', to: 'with_pm', action: 'Return to PM', note: true },`
  - `// no status: it follows the invoice's stage (Pending until emailed from the List, Paid from a CJI3 match)`
  - `grep -rn "moveStage" web/control-tower/invoices/js/ui/` finds nothing: no page calls it.
- What's wrong: The moves exist, but no button or form reaches them. When the Lead replies "rejected" or "fix the amount", the member cannot record it. Only a CJI3 payment ever ends the Pending stage, so rejected invoices show as pending without end.
- What it should be: Add "Lead rejected" and "Lead returned" actions, each with a required note, to the invoice's History/Edit dialog for Pending Lead invoices, using the `moveStage` that already exists.
- Impact: Members cannot tell rejected invoices from ones still waiting. "Waiting for approval" counts grow forever.

### [JDAM-06] Two partners with the same invoice number are treated as one invoice
- Category: WRONG
- Severity: Major
- Confidence: High
- Location: web/control-tower/invoices/js/finance/service.js:L361, L374; web/control-tower/invoices/js/ui/list-invoices.js:L27
- Evidence:
  - `let rec = entries.find(e => !e.deletedAt && (e.listItemId === item.key || (item.invoiceNo && key(e.invoiceNo) === key(item.invoiceNo))));`
  - `const inRegister = i => ctx.fin.entries.find(e => … (e.listItemId === i.key || (i.invoiceNo && key(e.invoiceNo) === key(i.invoiceNo))));`
- What's wrong: Partners number their own invoices, so "INV-001" from Partner A and "INV-001" from Partner B are common. The match ignores the partner. Partner B's invoice shows Partner A's status badge, and sending it gets "Not moved: INV-001 (already Pending Lead approval)". It never enters the register.
- What it should be: Match on invoice number and partner (and amount, if needed):
  ```js
  const same = (e, i) => e.listItemId === i.key || (i.invoiceNo && key(e.invoiceNo) === key(i.invoiceNo) && key(e.partner) === key(i.partner));
  ```
- Impact: Invoices are silently dropped and show the wrong status. The member believes they were sent.

### [JDAM-07] Invoice history shows "Pending" for every open stage, so a member cannot see where an invoice is or what it needs
- Category: WRONG
- Severity: Major
- Confidence: High
- Location: web/control-tower/invoices/js/ui/cji3.js:L46, L54, L70; web/control-tower/invoices/js/finance/core.js:L8
- Evidence:
  - `<td title="${esc(STAGE_LABEL[stageOf(e)])}">${statusBadge(e.status)}</td>`
  - `STATUS_LABEL = { pending: 'Pending', approved: 'Approved', paid: 'Paid', rejected: 'Rejected' }`
  - The status filter uses `STATUSES` (pending/approved/paid/rejected), not the stages.
- What's wrong: Received, With PM and Pending Lead approval all show as "Pending". The real stage only appears on mouse hover, which does nothing on touch screens. Nothing on the page says who has the invoice now or what is needed from the member (for example "complete project and date", "waiting for Lead email reply", "waiting for SAP payment").
- What it should be: Show the stage as the badge (`STAGE_LABEL[stageOf(e)]`) and filter by stage. Add a "Next step" column, such as "Email to Lead", "Waiting for Lead's reply since 3 Oct" or "Waiting for payment (CJI3)".
- Impact: Members cannot track an invoice without opening its History log.

### [JDAM-08] Supporting documents attached to the SharePoint List item itself are not read, so the email says "None"
- Category: RISK
- Severity: Major
- Confidence: Medium
- Location: server/ms-graph.js:L117-119; web/control-tower/invoices/js/finance/list-source.js:L16, L83-94
- Evidence:
  - `${base}/items?expand=fields&$top=500` (attachments are not requested)
  - `like: ['supportingdocuments', …, 'attachments', 'links']`
  - Tried locally: a row with `Attachments: true` maps `proofs: 'Attachments'` → `"proofs":[]`, `"missing":[…,"Supporting documents"]`
- What's wrong: The usual way to add documents to a Microsoft List item is its built-in Attachments. Graph only reports `Attachments: true`, which gets mapped as the proof column and produces no links. Only a separate Hyperlink or text column of URLs works.
- What it should be: For items with `Attachments === true`, fetch the attachment URLs (SharePoint REST `AttachmentFiles`, or the item's driveItem). Otherwise, state clearly in the UI: "Put document links in a Hyperlink column called 'Supporting documents'". Confirm by checking the real List's columns.
- Impact: Every approval email shows "None" under Supporting Documents. The Lead cannot open the evidence.

### [JDAM-09] Amounts written "RM 1,234.50" are rejected as "not a number"
- Category: WRONG
- Severity: Major
- Confidence: High
- Location: web/control-tower/invoices/js/finance/list-source.js:L101-102
- Evidence:
  - `const amountMinor = rawAmount ? toMinor(rawAmount.replace(/^[A-Z]{3}\s*/i, ''), currency || 'MYR') : null;`
  - Tried locally: `Amount: 'RM 1,234.50'` → `"amountMinor":null`, `"missing":["Amount (\"RM 1,234.50\" is not a number)", …]`
- What's wrong: Only a 3-letter prefix ("MYR") is removed. "RM", the everyday Malaysian form, stays and the amount fails to parse. The email then shows "—" for the amount and leaves it out of the TOTAL.
- What it should be: Accept "RM" as MYR, plus other common symbols:
  ```js
  const m = rawAmount.match(/^(RM|[A-Z]{3})\s*/i);
  const cur = currency || (m && (m[1].toUpperCase() === 'RM' ? 'MYR' : m[1].toUpperCase())) || '';
  const amountMinor = toMinor(rawAmount.replace(/^(RM|[A-Z]{3})\s*/i, ''), cur || 'MYR');
  ```
- Impact: Approval emails go out with blank amounts and wrong totals.

### [JDAM-10] Without a JDA column, every List invoice appears under every JDA and can be sent under the wrong JDA
- Category: RISK
- Severity: Major
- Confidence: High
- Location: web/control-tower/invoices/js/finance/list-source.js:L127-129; web/control-tower/invoices/js/ui/list-invoices.js:L22; web/control-tower/invoices/js/ui/approvals.js:L13
- Evidence:
  - `export const inJda = (item, jdaName, mapping = {}) => !mapping.jda || norm(item.jda) === norm(jdaName);`
  - `jda = jdas.find(j => j.id === jdaId) || jdas[0];` (Approvals opens on JDA 1 by default)
- What's wrong: There is one shared List pull, saved once for all JDAs. If it has no recognisable JDA column, JDA 1, 2 and 3 all show the same invoices. A member who stays on the default JDA 1 sends JDA 3's invoices as "[JDA 1] Invoice Approval Request" and registers them under JDA 1.
- What it should be: When no JDA column is found, show a clear warning ("This List has no JDA column; choose which JDA these invoices are for") and keep pulls per JDA, rather than showing all rows everywhere.
- Impact: Invoices are filed and emailed under the wrong JDA, which feeds wrong Payment Tables later.

### [JDAM-11] With no currency column, the email shows bare numbers and every invoice raises "information is missing"
- Category: WRONG
- Severity: Minor
- Confidence: High
- Location: web/control-tower/invoices/js/finance/email.js:L9; web/control-tower/invoices/js/finance/list-source.js:L120
- Evidence:
  - `` const amount = (minor, currency) => minor == null ? '—' : `${escHtml(currency || '')} ${escHtml(fmt(minor, currency || 'MYR'))}`.trim(); ``
  - `if (!item.currency) out.push('Currency');`
- What's wrong: An all-MYR List (no currency column) produces "1,234.50" with no RM/MYR in the email. Every invoice also triggers the "Some information is missing … Proceed anyway" dialog, which trains members to click past real gaps.
- What it should be: Default a missing currency to MYR, show it as "MYR" in the email, and don't list Currency as missing when the List has no currency column.
- Impact: The email is unclear about money, and members learn to ignore warnings.

### [JDAM-12] The .eml "opens as a draft" only in classic Outlook for Windows
- Category: RISK
- Severity: Minor
- Confidence: Medium
- Location: web/control-tower/invoices/js/finance/email.js:L62-77; web/control-tower/invoices/js/ui/list-invoices.js:L146
- Evidence:
  - `// The .eml file: an unsent message (X-Unsent: 1), so Outlook opens it as a draft to edit and send.`
  - `await finish('The draft is downloaded: open it to edit and send it in Outlook.');`
- What's wrong: The new Outlook for Windows, Outlook on the web and Outlook for Mac open `.eml` files as received, read-only messages; `X-Unsent` is not honoured there. The member cannot press Reply or Send, and the instruction "open it to edit and send it" does not work for them. Confirm by opening a generated file in new Outlook and in OWA.
- What it should be: Make the Outlook draft (Graph) or Copy + mailto the default path. Label the .eml "for classic Outlook desktop", and give a fallback hint.
- Impact: Members get stuck with an email they cannot send, after the invoices were already marked as sent (see JDAM-03).

### [JDAM-13] Invoice history links only one document, labelled "file", and hides the rest of the List's supporting documents
- Category: MISSING
- Severity: Minor
- Confidence: High
- Location: web/control-tower/invoices/js/ui/cji3.js:L67; web/control-tower/invoices/js/finance/service.js:L365-366
- Evidence:
  - `${e.fileUrl ? \` <a href="${esc(e.fileUrl)}" … title="Open the invoice file">file</a>\` : ''}`
  - `fileUrl: item.proofs[0]?.url || ''`, `proofs: item.proofs`
- What's wrong: The stored `proofs` list is never shown after sending. Only the first link appears, as a tiny "file" link with an "invoice file" tooltip, even when that first document is a PO or a timesheet.
- What it should be: Show every proof as a named chip (as the List view does, `li-chip` with `p.label || 'Document n'`) in Invoice history.
- Impact: Members cannot get to an invoice's documents after it was emailed.

### [JDAM-14] Jargon members would not know: CJI3, w TAX, Taxed MYR, sanctioned, PD, routes, "Is it running?"
- Category: WRONG
- Severity: Minor
- Confidence: High
- Location: web/control-tower/components/ct-sidebar.js:L37-38; web/control-tower/invoices/js/ui/cji3.js:L23, L73; web/control-tower/invoices/js/finance/workflow.js:L18, L25-26; web/control-tower/invoices/js/services/live/http.js:L15
- Evidence:
  - `link('/control-tower/invoices/#/cji3-lines', 'cji3-lines', 'CJI3 payments', …)`
  - `['grossMyrMinor', 'Taxed MYR', 'num']`; `paid … MYR taxed`
  - `sent_to_pd: 'Sent to PD'`; `'Route 1: send direct to PD'`
  - `` `Couldn't reach the server at ${config.apiBase || location.origin}. Is it running?` ``
- What's wrong: The menu and labels use SAP report codes and internal abbreviations without explanation. The network error asks a non-technical user whether "the server is running".
- What it should be: Use plain labels with the code as a hint, e.g. "SAP payments (CJI3)", "Amount incl. tax (MYR)", "Sent to Project Director". Network message: "Can't reach the tracker right now. Check your connection and try again."
- Impact: Members misread pages and cannot act on error messages.

### [JDAM-15] Nowhere to submit an invoice, and no link to the Microsoft List
- Category: MISSING
- Severity: Minor
- Confidence: High
- Location: web/control-tower/invoices/js/ui/cji3.js:L4, L72; web/control-tower/invoices/js/ui/list-invoices.js:L38-45
- Evidence:
  - `// Nothing is added here: invoices come from the Microsoft List (Approvals) …`
  - `'No invoices yet. They arrive from the Microsoft List (Approvals).'`
  - The List URL only appears as an input box (`id="li-url"`) after a Microsoft sign-in. There is no "Open the List" link.
- What's wrong: Submitting happens in the Microsoft List, but the app never links to it or says how to add an invoice there (which columns, where the documents go).
- What it should be: Add an "Add an invoice (opens the Microsoft List)" link to `state.listUrl` on Approvals and Invoice history, with a one-line guide to the required columns.
- Impact: New members cannot find out how to submit an invoice.

### [JDAM-16] The Outlook draft can land in a shared mailbox the member cannot open
- Category: RISK
- Severity: Minor
- Confidence: Medium
- Location: server/ms-graph.js:L147-148
- Evidence: `if (graphMailConfigured()) return { webLink: (await graph(\`/users/${encodeURIComponent(env('MS_MAIL_SENDER'))}/messages\`, …`
- What's wrong: A member who has not signed in to Microsoft still gets "Create Outlook draft". The draft is made in `MS_MAIL_SENDER`'s mailbox, and the page says "The draft is in Outlook." The draft is not in the member's Outlook, and the webLink may be refused.
- What it should be: Say which mailbox the draft is in ("Draft created in finance@… mailbox"), or create drafts only for the member's own sign-in.
- Impact: Members look for a draft that is not in their Outlook, while the invoices are already marked as sent.

### [JDAM-17] Why an invoice is "Incomplete" is shown only on mouse hover
- Category: WRONG
- Severity: Minor
- Confidence: High
- Location: web/control-tower/invoices/js/ui/cji3.js:L66
- Evidence: `` <span class="st rejected" title="${esc(e.missing.join('\n'))}">Incomplete</span> ``
- What's wrong: The list of what is missing (the thing needed from the member) is only in a `title` tooltip. Touch screens and keyboard users cannot see it, and the badge uses the red "rejected" style, so it reads like a rejection.
- What it should be: Show the missing items inline (small text under the number), as the List view does with `Missing: …`, in a neutral or warning style.
- Impact: Members can't see what they need to fix.

### [JDAM-18] "Copy formatted email" puts only the subject on the plain-text clipboard
- Category: WRONG
- Severity: Nit
- Confidence: High
- Location: web/control-tower/invoices/js/ui/list-invoices.js:L151
- Evidence: `'text/plain': new Blob([subject], { type: 'text/plain' })`
- What's wrong: A member pasting into a plain-text field or app gets only the subject line, not the invoices.
- What it should be: Put a plain-text version of the table (invoice, partner, amount, links) in `text/plain`.
- Impact: The pasted email is empty in plain-text editors.

### [JDAM-19] A session that expires during the email preview throws the member to /login and loses the selection
- Category: RISK
- Severity: Nit
- Confidence: Medium
- Location: web/control-tower/invoices/js/services/live/http.js:L18; web/control-tower/invoices/js/ui/list-invoices.js:L15
- Evidence:
  - `if (res.status === 401 && out.signIn) toLogin();`
  - `const picked = {}; // per JDA: the ticked invoices, kept while the page redraws` (memory only)
- What's wrong: After the 8-hour session, clicking Generate sends the member straight to the login page. The ticked invoices are lost, and the .eml may already be downloaded (see JDAM-04).
- What it should be: Check the session before showing the preview, and keep the selection in sessionStorage.
- Impact: Repeated work and partly finished sends.

## Top 3 blockers
- **JDAM-01**: production runs on throw-away sample data with no warning, so nothing a member does is saved.
- **JDAM-03**: generating the email marks invoices as sent to the Lead whether or not they were sent, and they can never be re-sent.
- **JDAM-02**: every approval email needs manual To, greeting and signature, so it is never right out of the box.

## Missing entirely
- An in-app way (or even a link) to submit an invoice to the Microsoft List, with guidance on the required columns.
- A "what's next / who has it now" view per invoice, and a "my invoices" filter.
- Recording a Lead's rejection or return of an invoice (UI for the existing `reject` / `return` moves).
- Re-sending or regenerating the approval email for invoices already Pending Lead.
- Real recipients per JDA, and the signed-in person's name as sign-off.
- Reading SharePoint List item attachments as supporting documents.
- A visible "demo / not saved" banner.
- Invoice date and project in the approval email.

## Out-of-lane flags
- `firebase/firestore.rules` not published on the live project; jdaReports was observed publicly readable (CONTEXT.md §How auth works, item 5).
- No per-JDA access control: any signed-in @petronas.com user sees and acts on every JDA's invoices (CONTEXT.md, item 6).
- `ROLE_PM` empty means anyone may email List invoices to the Lead (server/routes/finance.js:L56-57).
