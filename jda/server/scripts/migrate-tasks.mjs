// node scripts/migrate-tasks.mjs            (run from jda/server) says which reports have tasks in the old shape
// node scripts/migrate-tasks.mjs --apply    backs up, then writes the new task fields into them
// node scripts/migrate-tasks.mjs --revert   backs up, then takes the new fields out again where they are blank
//
// The Weekly progress tasks gained fields in the overhaul (description, priority, start and completed
// dates, progress, checklist, notes, last updated, and an id). The pages read old tasks without this
// (missing fields are blank), so it is optional: it makes the stored documents match what the pages show.
// Each save also keeps the version before it in the report's versions (report-store.js).
// Needs the service-account key of each report's project; a JDA whose key is missing is skipped and named.
import 'dotenv/config';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { JDAS } from '../../../portal/js/config/app-config.js';
import { hasKey } from '../firebase-admin.js';
import { reports } from '../report-store.js';
import { sourceOf } from '../report-reader.js';
import { needsMigration, migrateTasks, revertTasks } from '../task-migration.js';

const apply = process.argv.includes('--apply'), revert = process.argv.includes('--revert');
if (apply && revert) { console.error('Choose --apply or --revert, not both.'); process.exit(1); }

const todo = [];
for (const jda of JDAS) {
  const s = sourceOf(jda);
  if (!hasKey(s.project)) { console.log(`${jda.name}: skipped, no service-account key for its project (${s.project}).`); continue; }
  const doc = await reports().read(s);
  const tasks = doc?.tasks || [];
  const next = revert ? revertTasks(tasks) : migrateTasks(tasks);
  const changes = revert ? JSON.stringify(next) !== JSON.stringify(tasks) : needsMigration(tasks);
  console.log(`${jda.name}: ${tasks.length} task(s), ${changes ? (revert ? 'new fields to take out' : 'in the old shape') : 'nothing to do'}.`);
  if (changes) todo.push({ jda, s, next });
}

if (!todo.length) console.log('\nNothing to change.');
else if (!apply && !revert) console.log(`\n${todo.length} report(s) would change. Nothing has been changed. Run again with --apply (or --revert).`);
else {
  console.log('\nBacking up first...');
  const started = new Date().toISOString();
  spawnSync(process.execPath, [fileURLToPath(new URL('./backup.mjs', import.meta.url))], { stdio: 'inherit' });
  let manifest = null;
  try {
    const dir = new URL('../../../backups/', import.meta.url), latest = fs.readdirSync(dir).sort().at(-1);
    manifest = JSON.parse(fs.readFileSync(new URL(`${latest}/MANIFEST.json`, dir), 'utf8'));
  } catch { /* checked below */ }
  if (!manifest || !(manifest.at >= started)) { console.error('No new backup was written. Nothing was changed.'); process.exit(1); }
  for (const { jda, s, next } of todo) {
    await reports().save(s, { patch: { tasks: next }, force: true });
    console.log(`${jda.name}: saved.`);
  }
}
