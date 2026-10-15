// node scripts/restore.mjs <backup folder> [--only=<collection>] [--report=<jda id>] [--write]     (run from jda/server)
// Puts back what scripts/backup.mjs saved. Without --write it only says what it would do.
//
//   node scripts/restore.mjs ../../backups/2026-10-12T07-18-24-372Z                     what is in the backup
//   node scripts/restore.mjs ../../backups/<stamp> --write                              every collection of the main project
//   node scripts/restore.mjs ../../backups/<stamp> --only=financeEntries --write        one collection
//   node scripts/restore.mjs ../../backups/<stamp> --report=jda1 --write                one JDA's report document
//
// Each document in the backup is written back whole, replacing the one of the same id. Documents
// created after the backup are left alone: nothing is deleted. Needs the service-account key, as the
// server does (GOOGLE_APPLICATION_CREDENTIALS in .env; JDA3_GOOGLE_APPLICATION_CREDENTIALS for JDA 3).
// The local finance file is not handled here: stop the server and copy the backup's
// finance-data.json over jda/server/.finance-data.json.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { adminDb } from '../firebase-admin.js';
import { JDAS } from '../../web/shared/config/jdas.js';

const args = process.argv.slice(2), folder = args.find(a => !a.startsWith('--'));
const flag = name => args.find(a => a.startsWith(`--${name}=`))?.split('=')[1];
const write = args.includes('--write'), only = flag('only'), report = flag('report');
if (!folder || !fs.existsSync(folder)) { console.error('Which backup? Give the folder, e.g. node scripts/restore.mjs ../../backups/2026-10-12T07-18-24-372Z'); process.exit(1); }
const read = file => JSON.parse(fs.readFileSync(path.join(folder, file), 'utf8'));

const { Timestamp } = await import('firebase-admin/firestore');
// The backup holds dates the database kept as timestamps as { _seconds, _nanoseconds }.
const revive = v => Array.isArray(v) ? v.map(revive) : v && typeof v === 'object'
  ? (Object.keys(v).length === 2 && '_seconds' in v && '_nanoseconds' in v ? new Timestamp(v._seconds, v._nanoseconds) : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, revive(x)]))) : v;
// A report saved the way the portal reads it is in Firestore's typed form: { stringValue: 'x' } and so on.
const plain = v => 'stringValue' in v ? v.stringValue : 'integerValue' in v ? Number(v.integerValue) : 'doubleValue' in v ? v.doubleValue : 'booleanValue' in v ? v.booleanValue
  : 'nullValue' in v ? null : 'timestampValue' in v ? Timestamp.fromDate(new Date(v.timestampValue)) : 'arrayValue' in v ? (v.arrayValue.values || []).map(plain)
  : 'mapValue' in v ? Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, plain(x)])) : null;

let count = 0;
async function putCollection(coll, docs, label) {
  for (const [id, saved] of Object.entries(docs)) {
    count++;
    if (write) await coll.doc(id).set(revive(saved.data));
    for (const [key, sub] of Object.entries(saved)) if (key.startsWith('/')) await putCollection(coll && coll.doc(id).collection(key.slice(1)), sub, `${label}/${id}${key}`);
  }
  console.log(`${write ? 'Restored' : 'Would restore'} ${label}: ${Object.keys(docs).length} document(s)`);
}

if (report) {
  const jda = JDAS.find(j => j.id === report), file = `reports/${report}.json`;
  if (!jda || !fs.existsSync(path.join(folder, file))) { console.error(`This backup has no report for "${report}".`); process.exit(1); }
  const src = jda.source || { project: 'portal', collection: 'jdaReports', doc: jda.id }, data = plain({ mapValue: read(file) });
  count++;
  if (write) await (await adminDb(src.project)).collection(src.collection).doc(src.doc).set(data);
  console.log(`${write ? 'Restored' : 'Would restore'} ${jda.name}'s report to ${src.collection}/${src.doc} (${Object.keys(data).join(', ')})`);
} else {
  for (const [label, project] of [['firestore-main', 'portal'], ['firestore-jda3', 'jda3']]) {
    const dir = path.join(folder, label);
    if (!fs.existsSync(dir)) { console.log(`No ${label} in this backup (it was made without that project's service-account key).`); continue; }
    for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.json') && (!only || f === `${only}.json`))) {
      await putCollection(write ? (await adminDb(project)).collection(file.slice(0, -5)) : null, read(`${label}/${file}`), `${label}/${file.slice(0, -5)}`);
    }
  }
}
console.log(count ? (write ? `\nDone: ${count} document(s) written.` : `\nNothing was changed. Add --write to restore these ${count} document(s).`) : '\nNothing to restore from this backup with those options.');
