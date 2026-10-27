# UI review: TriCipta AI / JDA Control Tower (main @ 89e49bf)

Reviewer: UI (senior web/UI designer). Scope: whole repo, front end in `web/`. Read-only.

---

### [UI-01] The live Invoice Tracker and Control Tower cost ring show sample data, with nothing on screen saying so
- Category: WRONG
- Severity: Critical
- Confidence: High
- Location: web/control-tower/invoices/js/config/app-config.json:2; web/control-tower/invoices/js/services/finance.js:7-8; web/control-tower/invoices/js/services/db.js (line 2 of the file, `config.demoMode ? demo/db.js`); web/control-tower/components/control-tower.js:64-68
- Evidence:
  ```json
  "demoMode": true,
  ```
  ```js
  withBook(config.demoMode ? await import('./demo/finance.js') : await import('./live/finance.js'));
  ```
  ```js
  const [trackerJdas, fin] = await Promise.all([tracker.listJdas(), tracker.finance.data()]);
  return costsByName(trackerJdas, fin);
  ```
  A grep for "demo" in `js/ui/*.js` and `components/*.js` turns up only a hidden button (`cji3.js:41`), an Excel error string (`finance-ui.js:103`) and the List connect box (`list-invoices.js:38`). Nothing tells the user they are looking at sample data.
- What's wrong: On production, every Invoice Tracker page (KPIs, Payment Tables, Invoice history, CJI3 payments, Approvals) and the Control Tower's Cost ring ("RM x paid of RM y sanctioned") are built from sample data that lives only in the browser. Nothing on screen marks it as demo. Changes users make look saved but are not.
- What it should be: Set `demoMode` to false on main. Any time demo mode is on, show a banner that cannot be dismissed on every tracker page and on the Cost ring, e.g. in `storageNotice`:
  ```js
  export const storageNotice = ctx => (config.demoMode ? '<div class="banner over notice" role="status"><b>Demo data.</b> These invoices and payments are samples in this browser only. Nothing here is saved.</div>' : '') + (ctx.fin.storage === 'file' ? … : '');
  ```
  Also put a "Demo" tag on the Cost ring in `panel()`.
- Impact: Project leads read money figures that are not real, and that is a release blocker. Changes made in demo mode are thrown away without any warning.

### [UI-02] CJI3 payments page: the copy and the "Confirm invoice Paid" button follow the old workflow, not the current CJI3 = approval rule
- Category: WRONG
- Severity: Major
- Confidence: High
- Location: web/control-tower/invoices/js/ui/cji3-lines.js:72, 90, 145
- Evidence:
  ```js
  ${['part_paid', 'amount_differs'].includes(l.matchState) && inv && ['to_be_paid', 'sent_to_pd'].includes(stageOf(inv)) ? `<button … data-confirm=…>Confirm invoice Paid</button>` : ''}
  …confirm('Undo this match? If this line is what made its invoice Paid, the invoice goes back to the To Be Paid queue.')
  <p class="legend">An invoice that is To Be Paid or Sent to PD becomes Paid. One not yet approved is linked, not moved.</p>
  ```
  The real behaviour is different: `workflow.js:33` gives `...OPEN().map(from => ({ from, to: 'paid', … by: 'cji3' }))`, `service.js:327` moves any stage to paid, and `unpaidStage` returns `paidFrom`.
- What's wrong: Invoices sent from the Microsoft List sit at **Pending Lead approval**, which is now the normal path. When their CJI3 line comes in short or with a different amount, no "Confirm invoice Paid" button appears, so the accountant has to work out that Undo match → Match… does the job. The Match dialog says unapproved invoices are "linked, not moved", which is false. The Undo dialog says the invoice goes "to the To Be Paid queue", but it really goes back to the stage it came from.
- What it should be: Show Confirm for any open stage (`!['paid','rejected'].includes(stageOf(inv))`). Change the copy to: "Matching makes the invoice Paid, whatever its stage: the CJI3 line is the approval." For Undo: "The invoice goes back to <STAGE_LABEL[paidFrom]>."
- Impact: Accountants get wrong guidance at the exact step that decides whether money counts as paid. Part payments stall.

### [UI-03] "All JDAs at a glance" shows one JDA at a time; nothing on the page compares them
- Category: FUNDAMENTALLY WRONG
- Severity: Major
- Confidence: Medium
- Location: web/control-tower/index.html:37-38; web/control-tower/components/control-tower.js:157-160
- Evidence:
  ```html
  <h2>All JDAs at a glance</h2>
  ```
  ```js
  $('ctTabs').innerHTML = jdas.map((j, i) => `<button type="button" role="tab" … ><span>${esc(j.name)}</span><small aria-label="progress">${… progress …}</small></button>`)
  $('ctPanels').innerHTML = jdas.map((j, i) => `<section class="ct-panel" role="tabpanel" …${i === at ? '' : ' hidden'}>
  ```
- What's wrong: The landing page is a tablist. Only one JDA's progress, cost, pending count and stale-update warning are visible at a time. The tabs carry progress % only: no cost %, no "over sanctioned" marker, no pending or overdue count, no stale flag. A lead cannot see which JDA needs attention without clicking through every tab.
- What it should be: Put a summary strip above the tabs with one row or card per JDA showing progress %, cost % (red when over 100 or unsanctioned), invoices pending, and the date of the latest update (stale marked). Or show at least cost % and a warning dot on each tab:
  ```js
  <small>${p}%</small>${over ? '<span class="ct-dot bad" aria-label="over sanctioned"></span>' : ''}${f.pending ? `<span class="ct-count">${f.pending}</span>` : ''}
  ```
- Impact: The dashboard does not do its main job: telling the lead at a glance which JDA is over budget, stalled or waiting on approvals.

### [UI-04] Overdue invoices are never shown anywhere
- Category: MISSING
- Severity: Major
- Confidence: High
- Location: web/control-tower/invoices/js/ui/finance-ui.js:146; web/control-tower/invoices/css/finance.css:124; web/control-tower/invoices/js/ui/cji3.js:22-23
- Evidence:
  ```js
  + input('dueDate', 'Due date (optional)', v('dueDate'), 'type="date"')
  ```
  ```css
  td.overdue{color:var(--bad);font-weight:700}
  ```
  The Invoice history columns are `['when','Last change'], ['documentDate','Invoice date'], ['invoiceNo',…] … ['status','Status']`, with no due date. A grep for `overdue` in `js/ui` finds nothing outside the AI context.
- What's wrong: The form records a due date, and the stylesheet has a rule ready for overdue cells, yet no page shows a due date, an overdue flag, an overdue count or an overdue filter. The Control Tower doesn't either.
- What it should be: Add a "Due" column to Invoice history with `class="overdue"` when `dueDate < today && status !== 'paid'`, an "Overdue" option in the status filter, and an "N overdue" count in `costKpis` and on the Control Tower Cost card.
- Impact: Late payments to partners stay invisible until someone complains.

### [UI-05] The JDA page shows two different "cost %" figures, one against sanctioned and one against budget, without saying which is which
- Category: WRONG
- Severity: Major
- Confidence: High
- Location: web/control-tower/invoices/js/ui/finance-ui.js:56-60; web/control-tower/invoices/js/ui/jda.js:53-54
- Evidence:
  ```js
  <div class="kpi"><small>Paid of sanctioned</small><b>${pct === null ? '—' : `${pct}%`}</b></div>
  ```
  ```js
  <div>${rm(r.actual)} paid of ${rm(r.budget)}</div>
  ${spendBar(r.budgetUsedPct)}
  ```
- What's wrong: The owner decided cost means paid ÷ sanctioned (the Control Tower ring uses that). On the same JDA page the project cards show a % bar of paid ÷ **budget**, and nothing on the bar says so. Users will compare 40% (KPI) with 12% (card) and assume one of them is wrong.
- What it should be: Give the project cards the same paid ÷ sanctioned measure (from `tableTotals(paymentTable(...))`), or label the bar explicitly: `<small>of budget</small>`.
- Impact: Users stop trusting the cost figures, and a lead may judge a project's spend from the wrong base.

### [UI-06] Each tick of an invoice checkbox redraws the whole List section, and keyboard focus is lost
- Category: WRONG
- Severity: Major
- Confidence: High
- Location: web/control-tower/invoices/js/ui/list-invoices.js:32, 71-72
- Evidence:
  ```js
  const draw = () => { … root.innerHTML = `…<table class="reg-table li-table">…`; wire(); };
  root.querySelectorAll('[data-pick]').forEach(c => c.onchange = () => { c.checked ? sel.add(c.dataset.pick) : sel.delete(c.dataset.pick); draw(); });
  ```
- What's wrong: Ticking one checkbox (Space) rebuilds the whole section, so focus falls back to `<body>`. A keyboard or screen-reader user picking 10 invoices has to tab back from the top of the page every time. Horizontal scroll in `.pt-scroll` also resets.
- What it should be: Update only the selection bar (count, totals, Generate Email disabled state) and the "select all" state, not the table:
  ```js
  c.onchange = () => { c.checked ? sel.add(k) : sel.delete(k); updateBar(); };
  ```
- Impact: The main approval-request step is close to unusable without a mouse.

### [UI-07] "Import the List (export)" cannot be reached with the keyboard
- Category: WRONG
- Severity: Major
- Confidence: High
- Location: web/control-tower/invoices/js/ui/list-invoices.js:36
- Evidence:
  ```js
  <label class="ghost btn-sm li-file">${canPull ? 'Import an export instead' : 'Import the List (export)'}<input type="file" accept=".xlsx,.csv" id="li-file" hidden></label>
  ```
- What's wrong: The `hidden` attribute takes the file input out of the tab order, and a `<label>` cannot receive focus. When Graph is not set up (`canPull` false), this control is the **only** way to load the List, and keyboard users cannot activate it.
- What it should be: A real button that opens the input:
  ```html
  <button type="button" class="ghost btn-sm" id="li-file-btn">Import the List (export)</button><input type="file" id="li-file" accept=".xlsx,.csv" hidden>
  ```
  ```js
  $('#li-file-btn', root).onclick = () => $('#li-file', root).click();
  ```
- Impact: Keyboard-only users (an accessibility failure) cannot run the approval flow at all.

### [UI-08] Headline money is truncated instead of rounded, and written as "MYR" here but "RM" elsewhere
- Category: WRONG
- Severity: Minor
- Confidence: High
- Location: web/control-tower/invoices/js/ui/finance-ui.js:54-60; web/control-tower/invoices/js/finance/money.js:43-44; web/control-tower/components/control-tower.js:32
- Evidence:
  ```js
  const rm = m => money(m).replace(/\.\d\d$/, '');      // "MYR 1,234.99" -> "MYR 1,234"
  ```
  ```js
  // Headline figures (cards, KPIs, the timeline) are shown to the whole ringgit, by the same rounding rule.
  export const ringgit = sen => 'RM ' + fmt(Number(roundDiv(sen || 0, 100)), 'JPY');
  ```
  ```js
  const rm = myr => `RM ${Math.round(myr).toLocaleString('en-MY')}`;
  ```
- What's wrong: The KPI row cuts the sen off instead of rounding (RM 1,234.99 shows as 1,234), which breaks the documented "half away from zero" rule. It also writes "MYR 1,234" while the project cards and the Control Tower write "RM 1,235" for the same amount. The page ends up with three formatters and two currency labels.
- What it should be: Use `ringgit()` (dom.js `rm`) in `costKpis`. Pick one label (RM for headlines, ISO code in tables) and write it down in tokens.css or money.js.
- Impact: The KPI and the card on the same page can differ by RM 1, and the mixed labels look careless in a finance tool.

### [UI-09] Dates appear in five formats and two time zones
- Category: WRONG
- Severity: Minor
- Confidence: High
- Location: web/control-tower/invoices/js/ui/cji3.js:21, 65; web/control-tower/invoices/js/ui/cji3-lines.js:18, 68; web/control-tower/invoices/js/ui/finance-ui.js:13, 250; web/control-tower/invoices/js/ui/payments.js:106; web/control-tower/invoices/js/ui/list-invoices.js:16
- Evidence:
  ```js
  <td title="${esc(when(e))}">${esc(day(when(e)))}</td><td>${esc(e.documentDate || '')}</td>   // "14 Aug 2025" next to "2025-08-14"
  <td class="mono">${esc(l.postingDate)}</td>                                                    // raw ISO
  export const monthLabel = m => … `${MON[m.slice(5) - 1]}-${m.slice(2, 4)}`                      // "Aug-25"
  const when = iso => new Date(iso).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }); // "14/08/2025, 10:00", browser time zone
  ```
- What's wrong: Neighbouring columns use different formats: "Last change" is human-readable and "Invoice date" is raw ISO. The timestamps use the browser's time zone, while `shared/lib/dates.js` says the app runs on Malaysia time.
- What it should be: One `fmtDate`/`fmtDateTime` in `shared/lib/dates.js` (`en-GB`, `day:'numeric', month:'short', year:'numeric'`, `timeZone:'Asia/Kuala_Lumpur'`), used everywhere. Keep "Aug-25" only where it copies the Payment Table sheet, and add a legend for it.
- Impact: Users misread dates, and a user outside Malaysia sees audit timestamps that don't match the server.

### [UI-10] Invoice history shows a coarse status; the real stage is only in a tooltip, and "Incomplete" looks like "Rejected"
- Category: WRONG
- Severity: Major
- Confidence: High
- Location: web/control-tower/invoices/js/ui/cji3.js:66, 70
- Evidence:
  ```js
  <td title="${esc(STAGE_LABEL[stageOf(e)])}">${statusBadge(e.status)}</td>
  ${e.missing?.length ? ` <span class="st rejected" title="${esc(e.missing.join('\n'))}">Incomplete</span>` : ''}
  ```
- What's wrong: Received, With PM, and Pending Lead approval all show as "Pending". The stage that says who has the invoice now is only in a `title` attribute, which keyboard and touch users cannot open. "Incomplete" uses the red Rejected pill, and what is missing is also only in a tooltip.
- What it should be: Show the stage label as the pill text (or as a second line), with each stage given its own colour class. Use an amber "Incomplete" pill (`st pending` or a new `st incomplete`), and list what is missing as visible small text, as `list-invoices.js` already does.
- Impact: Nobody can tell from the list whether an invoice is waiting on the PM or the Lead. Incomplete invoices read as rejected.

### [UI-11] Invoice history total row sums every status, rejected included, as one bold "Taxed MYR" figure
- Category: RISK
- Severity: Minor
- Confidence: High
- Location: web/control-tower/invoices/js/ui/cji3.js:61, 73
- Evidence:
  ```js
  const list = shown(), taxed = st => fmt(list.filter(e => !st || e.status === st).reduce(…));
  <td colspan="7">${list.length} invoice${…} · paid ${esc(taxed('paid'))} MYR taxed</td><td class="num mono"><b>${esc(taxed())}</b></td>
  ```
- What's wrong: The emphasised total under "Taxed MYR" adds Pending, Approved, Paid **and Rejected** together. The paid figure is the one that counts as spend (COUNTS_AS_ACTUAL), yet it sits in plain text inside the label cell.
- What it should be: Put the bold figure on Paid, or break it down: "Paid X · Open Y · Rejected Z (not counted)". Leave rejected invoices out of any grand total.
- Impact: People screenshot the bold number as spend and overstate it.

### [UI-12] The tax-rate dialog tells users to use a Recalculate action that has no UI
- Category: MISSING
- Severity: Minor
- Confidence: High
- Location: web/control-tower/invoices/js/ui/cji3.js:120
- Evidence:
  ```js
  <p class="legend">… Those already entered keep the rate they were entered with; to change them, select them and choose Recalculate.</p>
  ```
  `grep -rni recalculat js/ui` finds only this text and the audit label (finance-ui.js:249). Invoice history has no row selection, and no screen has a Recalculate button, although `finance.recalculate` is exported (services/finance.js:7).
- What's wrong: The instruction points at a feature that is not on screen.
- What it should be: Either restore bulk selection with a Recalculate action on Invoice history and the Payment Table, or remove the sentence and say how existing records are corrected (Edit each record).
- Impact: After a tax change, users look for a feature that is not there, and existing records keep the old rate without anyone noticing.

### [UI-13] The "Sanctioned vs paid" timeline works by mouse only and has no text alternative
- Category: WRONG
- Severity: Major
- Confidence: High
- Location: web/control-tower/invoices/js/ui/timeline.js:66, 98-101, 127-128, 154-155
- Evidence:
  ```js
  <div class="legend">… · Ctrl + scroll to zoom · click a bar for details</div>
  return `<div class="tl-col …" data-key="${key}" … title="${esc(tip)}">
  root.querySelectorAll('#tl-view button').forEach(btn => btn.classList.toggle('on', btn.dataset.view === view));
  chart.onclick = e => { const col = e.target.closest('.tl-col'); …
  ```
- What's wrong: The bars are plain `div`s with no tabindex or role, so details only open on a click. The figures are only in `title`. The segmented View and Level buttons show their state with an `.on` class and no `aria-pressed`. The chart has no table or summary that a screen reader could read.
- What it should be: Make each column a `<button class="tl-col" aria-label="Aug 2025: sanctioned RM x, paid RM y">`, set `aria-pressed` on the segmented buttons, and add a "Show as table" `<details>` holding the monthly figures.
- Impact: The JDA and project pages' main graph cannot be used without a mouse or sight.

### [UI-14] Progress messages appear in red error style, and errors are not announced or tied to their fields
- Category: WRONG
- Severity: Minor
- Confidence: High
- Location: web/control-tower/invoices/css/components.css:21; web/control-tower/invoices/js/ui/finance-ui.js:152, 234; web/control-tower/invoices/js/ui/list-invoices.js:47, 91; web/control-tower/invoices/js/ui/modal.js (form-msg, "Working…"); web/control-tower/invoices/js/ui/payments.js:77; web/control-tower/invoices/js/ui/cji3.js:50
- Evidence:
  ```css
  .msg{…;color:var(--red);min-height:1em}
  ```
  ```js
  <p class="msg" id="form-msg"></p>   …   btn.disabled = true; msg.textContent = 'Saving…';
  <p class="msg" id="li-msg"></p>     …   msg('Reading the List…');
  ```
- What's wrong: "Saving…", "Reading the List…" and "Working…" appear in error red. The error lines (`#form-msg`, `#li-msg`, `#pt-msg`, `#reg-msg`) have no `role="alert"`/`aria-live`, so screen readers say nothing when a save is refused. No field gets `aria-invalid` or focus when validation fails. The login page already does all of this correctly (login.js:14-19).
- What it should be: Put progress in a neutral `role="status"` line, give error lines `role="alert"`, and on a server field error set `aria-invalid` and focus the field, the same way the login page does.
- Impact: Users can't tell whether a save failed or is still running. Screen-reader users miss refusals entirely.

### [UI-15] Finance tables lack table semantics: no thead or scope, repeated header names, no aria-sort, and an expandable row with no aria-expanded
- Category: WRONG
- Severity: Minor
- Confidence: High
- Location: web/control-tower/invoices/js/ui/payments.js:30-36, 80-86; web/control-tower/invoices/js/ui/cji3.js:62-63; web/control-tower/invoices/js/ui/cji3-lines.js:65-66; web/control-tower/invoices/js/ui/list-invoices.js:51-52
- Evidence:
  ```js
  <tr class="pt-row …" data-key="…" tabindex="0" title="Click to see this row's invoices and sanctioned amounts">
  { key: 'ptOrig', label: 'Original' … }, { key: 'ptMyr', label: 'MYR' … } … { key: 'invOrig', label: 'Original' … }, { key: 'invMyr', label: 'MYR' … }
  $('#reg-table').innerHTML = `<table class="reg-table">
      <tr>${COLS.map(…)}<th></th></tr>
  ```
- What's wrong: The Payment Table row works as a disclosure but never sets `aria-expanded`. Its column names "Original / MYR / w TAX" appear twice, and the full names exist only in `title`. The register tables have no `<thead>` and no `scope`. Sorted columns do not set `aria-sort`, and the action column header is empty.
- What it should be: Set `aria-expanded` on `.pt-row` and update it in `toggle()`. Add visually hidden full names (`<span class="visually-hidden">Sanctioned </span>MYR`), `<thead>`, `scope="col"`, `aria-sort` on the sorted `th`, and `<th><span class="visually-hidden">Actions</span></th>`.
- Impact: Screen-reader users cannot tell the sanctioned and paid columns apart in the core finance table.

### [UI-16] Low-contrast "—"/"several" text and tiny labels in the Payment Table
- Category: WRONG
- Severity: Minor
- Confidence: High
- Location: web/control-tower/invoices/css/finance.css:54, 56, 18, 25, 40
- Evidence:
  ```css
  .pt-none{color:#9fb0ad}
  .pt-orig small{… font:600 max(min(9.5px, 14px), calc(9.5px * var(--type-scale))) …}
  .pt-table .pt-groups small{… font-size:max(min(10px, 14px), …)}
  ```
- What's wrong: #9fb0ad on white measures about 2.3:1 (AA needs 4.5:1), and it carries meaning ("several", "—"). Currency codes and group labels are 9.5–10px.
- What it should be: `.pt-none{color:var(--muted)}` (about 5.6:1), and labels at least 11px.
- Impact: The table is hard to read on office projectors and laptops, and fails WCAG AA.

### [UI-17] The Invoice Tracker uses a different header from every other private page
- Category: WRONG
- Severity: Minor
- Confidence: High
- Location: web/control-tower/invoices/index.html:22-27; compare web/control-tower/index.html:23-31 and web/control-tower/components/control-tower.js:20
- Evidence:
  ```html
  <header class="topbar">
    <a href="/control-tower/" class="brand"><span class="wordmark">JDA</span>Invoice Tracker</a>
    <span id="whoami"></span> … <button class="ghost light" id="logout-btn">Sign out</button>
  ```
  The other pages call `mountCtTopbar({ bar: …, tabs: …, actions: … })`, which adds the user menu and View public site.
- What's wrong: The tracker keeps its old frame: a "JDA" tile wordmark instead of the Carigali/TriCipta brand, a bare Sign out button instead of the user menu, and no `<h1>` (pages start at h2). The CSS comment in finance.css:1 says the tracker follows index5, but its header does not.
- What it should be: Mount `mountCtTopbar` here too. Keep Ask AI as an action, and make each page title an `<h1>`.
- Impact: The tracker looks like a separate app, and moving between the Control Tower and the tracker is disorienting.

### [UI-18] The "Unsorted" placeholder JDA shows as a real JDA in tabs and filters
- Category: WRONG
- Severity: Minor
- Confidence: Medium
- Location: web/control-tower/invoices/js/config/app-config.json:10; web/control-tower/invoices/js/ui/finance-ui.js:42; web/control-tower/invoices/js/ui/cji3.js:44; compare web/control-tower/invoices/js/ui/approvals.js:13
- Evidence:
  ```json
  { "name": "Unsorted", "subProjects": ["UNSORTED"] }
  ```
  ```js
  ${ctx.jdas.map(j => `<a class="ghost${j.id === jdaId ? ' on' : ''}" href="${base}/${esc(j.id)}">${esc(j.name)}</a>`).join('')}
  ```
  ```js
  const jdas = ctx.jdas.filter(j => j.name !== 'Unsorted')   // only Approvals filters it
  ```
- What's wrong: The Payment Table tabs, the Invoice history JDA filter and the record form's JDA select all list "Unsorted" next to JDA 1–3. The scope requires JDA 1–3 only.
- What it should be: One helper, `visibleJdas(ctx)`, that drops Unsorted (or shows it as "Unsorted invoices" with a count, only when it is non-empty), used in every list.
- Impact: Clutter, and invoices can be filed against a JDA that does not exist.

### [UI-19] The public landing page ships with "coming soon" placeholders
- Category: MISSING
- Severity: Minor
- Confidence: High
- Location: web/public/components/landing.js:150-155, 169; web/public/components/info.js:67, 82; web/public/assets/ (contains only README.md)
- Evidence:
  ```js
  <figcaption><b>Picture coming soon</b><span>It will appear here once it is added.</span></figcaption>
  <p><b>Roles chart coming soon</b><span>It will appear here once it is added.</span></p>
  ```
- What's wrong: No pictures have been uploaded (`server/site-content.js:60`: "None yet: null, and the page shows … a placeholder"), so public visitors see these placeholder boxes.
- What it should be: Hide the figure when no picture exists (render the section text full-width), or ship real default pictures from `shared/assets`. Show the placeholders only in edit mode.
- Impact: The public face of the programme looks unfinished.

### [UI-20] Page load failure is a dead end, and the loading text is not announced
- Category: MISSING
- Severity: Minor
- Confidence: High
- Location: web/control-tower/invoices/js/ui/render.js:17, 37-38
- Evidence:
  ```js
  if (!again) page.innerHTML = `<p>${loading}</p>`;
  $('#page').innerHTML = '<p class="msg"></p>';
  $('#page').firstChild.textContent = `Could not load: ${e.message}`;
  ```
- What's wrong: The error shows a raw message with no Retry and no way back. The loading paragraph has no `role="status"`. A 403 from the PM-role check uses the same generic text, so there is no distinct no-permission state.
- What it should be: `<div class="msg" role="alert">Could not load this page: … <button data-retry>Try again</button> <a href="/control-tower/">Back to Control Tower</a></div>`, plus a distinct message for 403 ("You do not have permission to …").
- Impact: Users get stuck on failures and reload blindly.

### [UI-21] The email preview leaves the page stale when closed with Esc, and downloads the .eml before the send is recorded
- Category: RISK
- Severity: Minor
- Confidence: Medium
- Location: web/control-tower/invoices/js/ui/list-invoices.js:130-138, 141-148
- Evidence:
  ```js
  $('#cancel', d).textContent = 'Close';
  $('#cancel', d).onclick = () => { d.close(); ctx.refresh(); };
  …
  document.body.append(a); a.click(); a.remove(); …
  await finish('The draft is downloaded: …');
  ```
- What's wrong: `ctx.refresh()` runs only from the Close button. Escape closes the `<dialog>` without it, so the List keeps showing the sent invoices without their new "Pending Lead approval" stage, and they can be ticked and sent again (the server skips them, but the UI suggests otherwise). The .eml is saved before `sendListToLead` succeeds, so if that call fails, the user holds an approval email for invoices that never moved.
- What it should be: `d.addEventListener('close', () => sent && ctx.refresh())`. Call `send()` first and download only once it succeeds.
- Impact: The PM sees a stale list and may send duplicate or premature approval emails.

### [UI-22] Table action buttons are too small to tap
- Category: WRONG
- Severity: Nit
- Confidence: Medium
- Location: web/control-tower/invoices/css/components.css:14; web/control-tower/invoices/js/ui/payments.js:101
- Evidence:
  ```css
  .btn-sm{padding:calc(.3rem * var(--space-scale)) calc(.7rem * var(--space-scale));font-size:max(min(.76rem, 14px), …)}
  ```
- What's wrong: The buttons come out about 26px high. tokens.css:35-36 promises "Tap targets (40-48px) keep theirs". Edit, History and Delete sit side by side.
- What it should be: `@media (pointer:coarse){.btn-sm{min-height:40px}}`, as report.css:587 already does for the editor.
- Impact: Mis-taps on tablets, including Delete.

### [UI-23] Navigation does not always show where you are
- Category: WRONG
- Severity: Nit
- Confidence: High
- Location: web/control-tower/invoices/js/main.js:23; web/control-tower/invoices/js/ui/finance-ui.js:41-43; compare web/control-tower/invoices/js/ui/cji3-lines.js:32
- Evidence:
  ```js
  sidebar.mark(`/control-tower/invoices/#/${kind}`);   // #/jda/<id> and #/project/<id> match no sidebar link
  <a class="ghost${j.id === jdaId ? ' on' : ''}" href="${base}/${esc(j.id)}">   // no aria-current
  ```
- What's wrong: On a JDA or project page of the tracker, no sidebar link is marked. The Payment Table and Invoice history scope tabs show the current one by colour only. CJI3 payments sets `aria-current`, the others do not.
- What it should be: Mark the matching JDA link for `jda`/`project` routes, and add `aria-current="page"` to the active scope-bar link.
- Impact: Users lose their place, and screen readers are not told which tab is current.

### [UI-24] Project banner says "RM 0 under", and a link has an inline style
- Category: WRONG
- Severity: Nit
- Confidence: High
- Location: web/control-tower/invoices/js/ui/project.js:28, 35
- Evidence:
  ```js
  <a class="ghost" href="#/jda/${jda.id}" style="text-decoration:none;display:inline-flex;align-items:center">
  ${r.overSanctioned ? `<b>${rm(r.variance)} over</b> …` : `${rm(-r.variance)} under the sanctioned amount.`}
  ```
- What's wrong: When paid equals sanctioned, the banner reads "RM 0 under the sanctioned amount". The back link is styled inline instead of with a component class.
- What it should be: Add a third branch: "exactly the sanctioned amount". Use a `.back-link` class.
- Impact: Small polish issues.

### [UI-25] "Portal" naming is left in code and stylesheet comments
- Category: WRONG
- Severity: Nit
- Confidence: High
- Location: web/shared/lib/portal-api.js:10-14; web/shared/styles/report.css:1, 360; web/control-tower/invoices/js/ui/dom.js:9; web/shared/lib/firebase.js:15-19
- Evidence:
  ```js
  res = await fetch(`/api/portal/${path}`, …
  /* ---- Verbatim from the reference design (index5). Portal-only additions are at the bottom. ---- */
  ```
- What's wrong: The product is now the JDA Control Tower, but the API path, module names and comments still say "portal". None of it is visible to users (I checked the rendered strings).
- What it should be: Rename it as part of a later cleanup (`/api/ct/...`, `ct-api.js`).
- Impact: Confuses maintainers, and any of these names that leak into an error message will confuse users.

---

## Top 3 blockers
- **UI-01**: production shows sample data as the real invoices, payments and Control Tower cost ring, with no marker.
- **UI-02**: the CJI3 payments page gives the wrong rule and hides "Confirm invoice Paid" for invoices at Pending Lead approval, which is where every invoice from the List sits.
- **UI-07** (with UI-06): keyboard users cannot import the List, and lose focus on every tick, so the approval-request flow is not accessible.

## Missing entirely
- Overdue indicators, filters and counts (UI-04).
- A cross-JDA comparison view on the Control Tower (UI-03).
- A demo/sample-data banner (UI-01).
- A no-permission (403) state, distinct from a generic load error (UI-20).
- A text or table alternative for the timeline chart (UI-13).
- A Recalculate UI that the tax-rate copy refers to (UI-12).
- Visible stage per invoice in Invoice history (UI-10).
- A shared date/number formatting helper (UI-08, UI-09).
- A browser/E2E or automated a11y check (axe, Playwright). There is none in the repo, so none of the above would be caught.

## Out-of-lane flags
- The landing page's picture uploads are written to `web/public/assets/` on the server's filesystem (server/site-content.js:59-69). On Vercel that filesystem is read-only or wiped on redeploy, so uploads will fail or vanish. (Architect)
- `sendListToLead` runs after the .eml is downloaded (list-invoices.js:141-148), so the email can exist while the register was never updated. (Developer)
- Every signed-in user sees and acts on every JDA, with no per-JDA access control (per CONTEXT.md). (Security)
