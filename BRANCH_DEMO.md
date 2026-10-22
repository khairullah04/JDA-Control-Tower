# Demo: `main` and `feature/invoice-approval-cji3` side by side

Two copies of the app from one clone, using `git worktree`: `main` on port **8080**, this branch on
port **8081**, each with its own folder and its own data. Nothing here changes `main` or pushes anything.

Copy-paste the blocks in order, in a terminal at the top of your clone (the folder with `README.md`).
The two copies go next to it, as `../jda-demo-main` and `../jda-demo-branch`.

## 1. Make the two copies

```bash
git fetch origin
# --detach: each copy is the branch's latest commit, whatever is checked out in your own folder
git worktree add --detach ../jda-demo-main main
git worktree add --detach ../jda-demo-branch feature/invoice-approval-cji3
```

(If `feature/invoice-approval-cji3` only exists on GitHub, use `origin/feature/invoice-approval-cji3`.)

## 2. Install and set up each copy

```bash
for d in ../jda-demo-main ../jda-demo-branch; do
  (cd "$d/server" && npm install)
  # settings: your own .env if you have one, otherwise sign-in off, for trying it on this computer only
  if [ -f server/.env ]; then cp server/.env "$d/server/.env"; else printf 'REQUIRE_AUTH=false\n' > "$d/server/.env"; fi
done
```

`npm install` may print warnings about `npm audit` and "install scripts": they are harmless.

**Keep the two copies' data apart.** Do **not** copy `service-account.json` into either demo folder.
With no database key and `FINANCE_STORE=file` (below), each copy keeps its invoices, payments and
landing-page text in files inside its own folder (`server/.finance-data.json`,
`server/.site-content.json`), and its uploaded pictures in its own `web/public/assets/`. The branch
can then never write to `main`'s data, or to Firestore.

## 3. Run them (two terminals)

Terminal 1, `main` on 8080:

```bash
cd ../jda-demo-main/server && FINANCE_STORE=file PORT=8080 npm start
```

Terminal 2, the branch on 8081:

```bash
cd ../jda-demo-branch/server && FINANCE_STORE=file PORT=8081 npm start
```

Open them in **different addresses**, so the browser keeps their sign-ins and saved settings apart:

- `main`: <http://localhost:8080/control-tower/>
- branch: <http://127.0.0.1:8081/control-tower/>

(In GitHub Codespaces, open each port from the **Ports** tab instead.)

What to show on the branch, in the sidebar under Invoice Tracker:

1. **Approvals**: the Microsoft List for a JDA. Import an export of the List (or sign in to Microsoft
   and pull it), tick invoices, Generate Email: they go to Pending Lead approval. No approve buttons:
   the CJI3 payment line is the approval.
2. **CJI3 payments**: upload a CJI3 file on its tab (JDA 1 + JDA 2, or JDA 3). Preview, Import;
   upload the same file again and nothing is added; a line whose Reference is an invoice's number
   makes that invoice Paid.
3. **Payment tables**: the tabs "JDA 1 + JDA 2 (CJI3 file)" and "JDA 3 (CJI3 file)".

`main` has none of these: compare its CJI3 register (here: Invoice history) and Payment tables.

## 4. Demo data, and resetting it

The Invoice Tracker's **demo mode** is on in both copies (`"demoMode": true` in
`web/control-tower/invoices/js/config/app-config.json`): it starts with sample JDAs, projects and
invoices that live **in the browser tab only**.

- **Reset**: reload the page. Each copy, and each tab, starts again from the same sample data.
- **Upload in demo mode**: CSV only (Excel files are read by the server). Save a CJI3 sheet as CSV,
  or switch demo mode off (next point).

To demo with **real .xlsx files** and data kept between reloads, switch demo mode off **in the branch
copy only**:

```bash
cd ../jda-demo-branch
sed -i 's/"demoMode": *true/"demoMode": false/' web/control-tower/invoices/js/config/app-config.json
```

Then restart its server. Its invoices and CJI3 lines are kept in `../jda-demo-branch/server/.finance-data.json`.
To reset them, stop that server and delete its files (this touches the branch copy only):

```bash
rm -f ../jda-demo-branch/server/.finance-data.json ../jda-demo-branch/server/.site-content.json
```

Outside demo mode the tracker reads its JDAs and projects from Firebase, in the browser, so it needs a
real sign-in (`ALLOWED_EMAILS` and a Firebase account; with sign-in off it says "Missing or insufficient
permissions"). Those JDAs and projects are the same ones `main` uses: the branch only reads them, as
long as nobody adds a JDA or project from the branch copy. Its invoices and CJI3 lines still stay in its
own file. Until sign-in is set up, demo mode is the way to show the branch.

## 5. Remove the copies afterwards

Stop both servers (Ctrl + C in each terminal), then, from your own clone:

```bash
git worktree remove --force ../jda-demo-main
git worktree remove --force ../jda-demo-branch
git worktree prune
```

`--force` is needed because of the installed `node_modules` and the data files; it deletes only those
two folders. Your clone and its branches are untouched.
