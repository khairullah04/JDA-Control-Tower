import { adminDb, hasKey } from './firebase-admin.js';
import { allowedEmails } from './auth.js';

// The database rules cannot read the server's settings, so the access list (ALLOWED_EMAILS) is
// copied into Firestore at start-up, as access/allowlist, where firestore.rules looks it up. No
// browser can read or write that document. Without the service-account key it cannot be copied;
// the rules then let nobody in, which is the safe way to fail.
export async function publishAccessList() {
  const emails = allowedEmails();
  if (process.env.REQUIRE_AUTH === 'false') return 'Sign-in is off (REQUIRE_AUTH=false): the access list is not checked by the server.';
  if (!emails.length) return 'ALLOWED_EMAILS is empty: nobody can sign in to the Invoice Tracker. Set it in server/.env.';
  if (!hasKey('portal')) return `Access list: ${emails.length} address(es), checked by the server only. Without the service-account key it cannot be copied to Firestore for the database rules.`;
  try {
    await (await adminDb('portal')).collection('access').doc('allowlist').set({ emails, updatedAt: new Date().toISOString() });
    return `Access list: ${emails.length} address(es), copied to Firestore for the database rules.`;
  } catch (e) { return `Access list could NOT be copied to Firestore (${e.message}). The database rules will refuse everyone until it is.`; }
}
