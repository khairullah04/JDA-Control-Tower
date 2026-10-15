import { adminDb } from './firebase-admin.js';
import { createReportSaver } from './portal-save.js';

// The report documents in Firestore, through the Admin SDK. `source` says where a JDA's document
// lives: { project: 'portal' | 'jda3', collection, doc } (portal/js/config/app-config.js).
// Versions are kept beside each document, in its `versions` subcollection, which no browser can read.
const firestoreReports = () => ({
  read: async s => { const d = await (await adminDb(s.project)).collection(s.collection).doc(s.doc).get(); return d.exists ? d.data() : null; },
  async transact(s, decide) {
    const db = await adminDb(s.project), ref = db.collection(s.collection).doc(s.doc);
    let keep = 20;
    const saved = await db.runTransaction(async t => {
      const snap = await t.get(ref), { next, version, keep: k } = decide(snap.exists ? snap.data() : null);
      keep = k;
      t.set(ref, next);
      if (version) t.set(ref.collection('versions').doc(version.savedAt.replace(/[:.]/g, '-')), version);
      return next;
    });
    // Older versions than the newest `keep` are dropped. A failure here loses nothing, so it does not fail the save.
    try { const old = await ref.collection('versions').orderBy('savedAt', 'desc').offset(keep).get(); await Promise.all(old.docs.map(d => d.ref.delete())); }
    catch (e) { console.error('Could not prune old report versions:', e.message); }
    return saved;
  }
});

let saver;
export const reports = () => (saver ||= createReportSaver(firestoreReports()));
