// node scripts/remove-jdas.mjs            (run from jda/server) lists what would be deleted, deletes nothing
// node scripts/remove-jdas.mjs --apply    takes a full backup first, then deletes it
//
// Removes every JDA numbered 4 and above (JDA 4, JDA 5, ...) from the main Firebase project, with
// everything that hangs off it, so nothing is left pointing at a JDA that no longer exists:
//   jdas                      the tracker's JDA records named "JDA <n>", n >= 4
//   projects                  their projects (jdaId)
//   financeEntries            invoices of those JDAs or projects (jdaId, projectId)
//   financeSanctioned         sanctioned amounts of those JDAs or projects
//   financeAudit              audit lines about the invoices and sanctioned amounts above (entityId)
//   invoices, scope           the old tracker's records of those projects ("Bring over old tracker records")
//   activity                  change-log lines about those JDAs or projects (projectId holds either)
//   jdaReports/jda<n>         the portal's report document, with its versions subcollection
// Left alone: processedFiles (it records which Drive files were read and names no JDA; deleting a
// line would make the next Drive sync import that file again), meta, access, financeMeta.
//
// The first JDA to remove is FROM (default 4, never less): `--from 5` keeps JDA 4. Stop the server first. The backup is
// scripts/backup.mjs; if it cannot save the main project, nothing is deleted.
import 'dotenv/config';
import { adminDb } from '../firebase-admin.js';
import { planRemoval } from '../jda-removal.js';
import { backupFirst } from './backup-first.mjs';

const args = process.argv.slice(2), apply = args.includes('--apply');
const from = args.includes('--from') ? Number(args[args.indexOf('--from') + 1]) : 4;
if (!Number.isInteger(from) || from < 4) { console.error('--from must be a whole number, 4 or more: JDA 1 to 3 are never removed by this script.'); process.exit(1); }

const db = await adminDb('portal');
const count = plan => Object.values(plan).reduce((n, docs) => n + docs.length, 0);
function show(plan) {
  console.log(`JDAs numbered ${from} and above: ${plan.jdas.map(d => `${d.get('name')} (${d.id})`).join(', ') || 'none'}`);
  for (const [what, docs] of Object.entries(plan)) console.log(`  ${what.padEnd(28)} ${docs.length}`);
}
let plan = await planRemoval(db, from);
show(plan);
// Only a name that is exactly "JDA <n>" is matched. Every other JDA is listed, so an odd name ("JDA 4 (Pilot)") shows up here before anything is deleted.
const kept = (await db.collection('jdas').get()).docs.filter(d => !plan.jdas.some(j => j.id === d.id)).map(d => d.get('name'));
console.log(`Kept: ${kept.join(', ') || 'none'}`);

if (!count(plan)) console.log('\nNothing to remove.');
else if (!apply) console.log(`\n${count(plan)} documents would be deleted. Nothing has been changed. Stop the server, then run again with --apply to back up and delete them.`);
else {
  const latest = backupFirst(['firestore-main/']).replace('backups/', '');
  plan = await planRemoval(db, from); // again, after the backup: whatever was written meanwhile is included
  const docs = Object.values(plan).flat(); // children first, the JDAs last (jda-removal.js)
  for (let i = 0; i < docs.length; i += 400) {
    const batch = db.batch();
    docs.slice(i, i + 400).forEach(d => batch.delete(d.ref));
    await batch.commit();
  }
  console.log(`\nDeleted ${docs.length} documents. Backup: backups/${latest}. Run this script again without --apply to confirm nothing is left.`);
}
