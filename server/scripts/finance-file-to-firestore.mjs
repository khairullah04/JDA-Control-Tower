// node scripts/finance-file-to-firestore.mjs [path/to/.finance-data.json]      (run from server/)
// One-off: copies what the server saved in its local finance file (invoices, sanctioned amounts,
// audit log, settings) into Firestore, once the service-account key is in place. Every record
// keeps its id, so running it twice writes the same documents again and duplicates nothing.
// It refuses to run if Firestore already holds a record that the file does not (someone has been
// saving to Firestore since): pass --merge to copy the file's records in beside them anyway.
import 'dotenv/config';
import { FILE, readFinanceFile } from '../finance-store.js';
import { adminDb } from '../firebase-admin.js';

const args = process.argv.slice(2), merge = args.includes('--merge'), file = args.find(a => !a.startsWith('--')) || FILE;
const data = readFinanceFile(file), collections = Object.keys(data);
if (!collections.length) { console.log(`Nothing to copy: ${file} is empty or does not exist.`); process.exit(0); }

const db = await adminDb('portal');
for (const coll of collections) {
  const there = (await db.collection(coll).select().get()).docs.map(d => d.id), extra = there.filter(id => !(id in data[coll]));
  if (extra.length && !merge) {
    console.error(`Stopped: Firestore's ${coll} already holds ${extra.length} record(s) that are not in the file. Nothing was copied.\nRun again with --merge to add the file's records beside them.`);
    process.exit(1);
  }
}
for (const coll of collections) {
  const docs = Object.entries(data[coll]);
  for (let i = 0; i < docs.length; i += 400) {
    const batch = db.batch();
    for (const [id, doc] of docs.slice(i, i + 400)) batch.set(db.collection(coll).doc(id), doc);
    await batch.commit();
  }
  console.log(`${coll}: ${docs.length} record(s) copied`);
}
console.log('\nDone. Set FINANCE_STORE=firestore in .env (or simply restart: with the key in place the server uses Firestore), then keep the file as a backup.');
