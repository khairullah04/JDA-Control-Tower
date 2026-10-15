// node scripts/migrate-tasks.mjs                    (run from server/) lists the reports whose tasks are in the old shape
// node scripts/migrate-tasks.mjs --apply            backs up, then adds the new task fields to them
// node scripts/migrate-tasks.mjs --revert           lists what a revert would take out
// node scripts/migrate-tasks.mjs --revert --apply   backs up, then takes the new fields out again where they are blank
//
// The Weekly progress tasks gained fields in the overhaul (description, priority, start and completed
// dates, progress, checklist, notes, last updated, and an id). The pages read old tasks without this
// (missing fields are blank), so it is optional: it makes the stored documents match what the pages show.
// Only missing fields are added; nothing stored is changed, so a revert gives back exactly what was there.
// A report changed by someone between the backup and the save is not overwritten: run it again.
// Needs the service-account key of each report's project; a JDA whose key is missing is skipped and named.
import 'dotenv/config';
import { JDAS } from '../../web/shared/config/jdas.js';
import { digest } from '../../web/shared/lib/digest.js';
import { hasKey } from '../firebase-admin.js';
import { reports } from '../report-store.js';
import { sourceOf } from '../report-reader.js';
import { needsMigration, migrateTasks, revertTasks } from '../task-migration.js';
import { backupFirst } from './backup-first.mjs';

const apply = process.argv.includes('--apply'), revert = process.argv.includes('--revert');
const change = tasks => revert ? revertTasks(tasks) : migrateTasks(tasks);
const differs = tasks => revert ? JSON.stringify(revertTasks(tasks)) !== JSON.stringify(tasks) : needsMigration(tasks);
// Where the backup keeps each report: the main project's collections, or JDA 3's own project.
const backedUpAs = s => s.project === 'portal' ? `firestore-main/${s.collection}` : `firestore-${s.project}/${s.collection}`;

async function plan() {
  const todo = [];
  for (const jda of JDAS) {
    const s = sourceOf(jda);
    if (!hasKey(s.project)) { console.log(`${jda.name}: skipped, no service-account key for its project (${s.project}).`); continue; }
    const tasks = (await reports().read(s))?.tasks || [];
    const yes = differs(tasks);
    console.log(`${jda.name}: ${tasks.length} task(s), ${yes ? (revert ? 'new fields to take out' : 'in the old shape') : 'nothing to do'}.`);
    if (yes) todo.push({ jda, s, tasks });
  }
  return todo;
}

const todo = await plan();
if (!todo.length) console.log('\nNothing to change.');
else if (!apply) console.log(`\n${todo.length} report(s) would change. Nothing has been changed. Add --apply to do it.`);
else {
  const at = backupFirst([...new Set(todo.map(t => backedUpAs(t.s)))]);
  for (const { jda, s } of await plan()) { // read again: the reports as they are now, after the backup
    const tasks = (await reports().read(s))?.tasks || [];
    try { await reports().save(s, { patch: { tasks: change(tasks) }, base: { tasks: digest(tasks) } }); console.log(`${jda.name}: saved.`); }
    catch (e) { console.error(`${jda.name}: not saved (${e.message}). Run the script again.`); }
  }
  console.log(`\nBackup: ${at}`);
}
