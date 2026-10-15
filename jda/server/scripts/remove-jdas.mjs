// node scripts/remove-jdas.mjs            (run from jda/server) lists what would be deleted, deletes nothing
// node scripts/remove-jdas.mjs --apply    takes a full backup first, then deletes it
//
// Removes every JDA numbered 4 and above (JDA 4, JDA 5, ...) from the main Firebase project, with
// everything that hangs off it, so nothing is left pointing at a JDA that no longer exists:
//   jdas                      the tracker's JDA records named "JDA <n>", n >= 4
//   projects                  their projects (jdaId)
//   financeEntries            invoices of those JDAs or projects (jdaId, projectId)
//   financeSanctioned         sanctioned amounts of those JDAs or projects
//   financeAudit              audit lines about any of the above (jdaId, projectId, entityId)
//   activity                  change-log lines about those JDAs or projects (projectId holds either)
//   jdaReports/jda<n>         the portal's report document, with its versions subcollection
// Left alone: processedFiles (it records which Drive files were read and names no JDA; deleting a
// line would make the next Drive sync import that file again), meta, access, financeMeta.
//
// The first JDA to remove is FROM (default 4): `--from 5` keeps JDA 4. The backup is
// scripts/backup.mjs; if it cannot save the main project, nothing is deleted.
import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { adminDb } from '../firebase-admin.js';
import { planRemoval } from '../jda-removal.js';

const args = process.argv.slice(2), apply = args.includes('--apply');
const from = Number(args[args.indexOf('--from') + 1]) || 4;
const db = await adminDb('portal');
const plan = await planRemoval(db, from);
const { jdas } = plan;
console.log(`JDAs numbered ${from} and above: ${jdas.map(d => `${d.get('name')} (${d.id})`).join(', ') || 'none'}\n`);
for (const [what, docs] of Object.entries(plan)) console.log(`  ${what.padEnd(28)} ${docs.length}`);
const total = Object.values(plan).reduce((n, docs) => n + docs.length, 0);

if (!total) console.log('\nNothing to remove.');
else if (!apply) console.log(`\n${total} documents would be deleted. Nothing has been changed. Run again with --apply to back up and delete them.`);
else {
  console.log('\nBacking up first...');
  const backup = spawnSync(process.execPath, [fileURLToPath(new URL('./backup.mjs', import.meta.url))], { stdio: 'inherit' });
  // backup.mjs exits with 1 when anything was missed. Only the main project matters here: it says so on its own line.
  if (backup.status !== 0 && backup.status !== 1) { console.error('The backup failed. Nothing was deleted.'); process.exit(1); }
  const { readdirSync, readFileSync } = await import('node:fs');
  const dir = new URL('../../../backups/', import.meta.url), latest = readdirSync(dir).sort().at(-1);
  const manifest = JSON.parse(readFileSync(new URL(`${latest}/MANIFEST.json`, dir), 'utf8'));
  if (manifest.missing.some(m => m.startsWith('firestore-main'))) { console.error('The backup could not save the main Firebase project. Nothing was deleted.'); process.exit(1); }
  const docs = Object.values(plan).flat();
  for (let i = 0; i < docs.length; i += 400) {
    const batch = db.batch();
    docs.slice(i, i + 400).forEach(d => batch.delete(d.ref));
    await batch.commit();
  }
  console.log(`\nDeleted ${docs.length} documents. Backup: backups/${latest}. Run this script again without --apply to confirm nothing is left.`);
}
