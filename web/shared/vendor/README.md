# Libraries kept in the repository

These files are other people's code, copied here so the pages do not depend on a public CDN at
run time (a network that blocks outside scripts would otherwise stop the report page and the
Invoice Tracker from opening). They are served by the JDA server at `/shared/vendor/`.

| File | Library and version | Licence | Downloaded from |
|---|---|---|---|
| `chart.umd.min.js` | Chart.js 4.4.0 | MIT | `https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js` |
| `Sortable.min.js` | SortableJS 1.15.2 | MIT | `https://cdnjs.cloudflare.com/ajax/libs/Sortable/1.15.2/Sortable.min.js` |
| `firebase-app.js` | Firebase JS SDK 10.12.2 | Apache-2.0 | `https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js` |
| `firebase-auth.js` | Firebase JS SDK 10.12.2 | Apache-2.0 | `https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js` |
| `firebase-firestore.js` | Firebase JS SDK 10.12.2 | Apache-2.0 | `https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js` |

## What was changed after downloading

1. In `firebase-auth.js` and `firebase-firestore.js`, the one import of
   `https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js` was changed to `./firebase-app.js`,
   so all three use the copy here.
2. The last line of each file that named a source map (`//# sourceMappingURL=...`) was removed; the
   maps are not kept here.

Nothing else was edited. Do not edit these files by hand.

## Checking a file against the original

The Firebase files as published (before the two changes above) have these SHA-384 digests:

    firebase-app.js (as published) sha384-stTNz2qNbq7DNZ/YGSW5tO9xP6QJJfI4FWVs8ua/u1eqMw9QYxdFg859xCkme49a
    firebase-auth.js (as published) sha384-xc1TV9O0/6B1UfdVv335cLLPR5z0/W7C/tHMVb0Io3DzsB2qscQnsXnZgVh/+kdU
    firebase-firestore.js (as published) sha384-mr45ONjFgd7GUimISmrEP4jMaKhbf2j/wb50swz+5/wVp7Oh6QSDbkxxa7y+YgF0

`chart.umd.min.js` and `Sortable.min.js` are unchanged apart from point 2 (neither had a
source-map line), so they can be compared with the download directly:

    curl -s https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js | cmp - chart.umd.min.js
    curl -s https://cdnjs.cloudflare.com/ajax/libs/Sortable/1.15.2/Sortable.min.js | cmp - Sortable.min.js

## Updating a library

Download the new version from the same address with the new version number, repeat the two
changes above for the Firebase files, update the table, and run the tests and both sites.
All three Firebase files must be the same version.

## Still loaded from outside

- **Fonts** (Google Fonts). If they cannot be fetched the pages fall back to the system fonts and
  everything still works.
- **Microsoft's sign-in library** (MSAL 2.38.3), only when "Connect Microsoft Calendar" is pressed,
  and only if it matches the integrity hash in `web/control-tower/components/report.js`. The Calendar feature needs
  Microsoft's servers in any case.
