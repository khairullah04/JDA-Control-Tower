// The backup every script that changes the database takes first (scripts/backup.mjs), and the check
// that it really saved what is about to change: it must be the backup just made, and `needed` (prefixes
// of lines in its MANIFEST "saved" list, e.g. "firestore-main/") must all be there. Otherwise the script stops.
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function backupFirst(needed) {
  console.log('\nBacking up first...');
  const started = new Date().toISOString();
  const run = spawnSync(process.execPath, [fileURLToPath(new URL('./backup.mjs', import.meta.url))], { stdio: 'inherit' });
  let latest, manifest = null;
  try {
    const dir = new URL('../../backups/', import.meta.url);
    latest = fs.readdirSync(dir).sort().at(-1);
    manifest = JSON.parse(fs.readFileSync(new URL(`${latest}/MANIFEST.json`, dir), 'utf8'));
  } catch { /* checked below */ }
  const missing = !manifest ? needed : needed.filter(n => !manifest.saved.some(line => line.startsWith(n)));
  if (run.status > 1 || !manifest || !(manifest.at >= started) || missing.length) {
    console.error(`The backup did not save ${missing.length ? missing.join(', ') : 'what is about to change'}. Nothing was changed.`);
    process.exit(1);
  }
  return `backups/${latest}`;
}
