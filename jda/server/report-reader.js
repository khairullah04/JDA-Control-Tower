import { adminDb, hasKey } from './firebase-admin.js';
import { FIREBASE_PROJECTS } from '../../shared/firebase-config.js';

// A JDA's report document, read by the server for the pages that may not read it themselves (the
// public landing page and Info pages, and the Control Tower summary). With the project's
// service-account key it is read directly. Without one it is read the way a browser would, which
// only works while that project's rules still let anyone read it; otherwise there is no report and
// the pages show what edit mode and the built-in content say. Answers are kept for a minute, so
// public traffic cannot turn into a stream of database reads.
const KEEP_MS = 60_000, kept = new Map();
export const forgetReports = () => kept.clear();
export const sourceOf = jda => jda.source || { project: 'portal', collection: 'jdaReports', doc: jda.id };

// Firestore's REST form ({ stringValue: 'x' }, { mapValue: { fields } }, ...) as plain values.
export function fromRest(v) {
  if (!v || typeof v !== 'object') return null;
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, fromRest(x)]));
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromRest);
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  for (const k of ['stringValue', 'booleanValue', 'timestampValue']) if (k in v) return v[k];
  return null;
}

async function fetchReport(jda) {
  const s = sourceOf(jda);
  if (hasKey(s.project)) {
    const d = await (await adminDb(s.project)).collection(s.collection).doc(s.doc).get();
    return d.exists ? d.data() : null;
  }
  const cfg = FIREBASE_PROJECTS[s.project];
  const res = await fetch(`https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents/${s.collection}/${s.doc}?key=${cfg.apiKey}`, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) return null; // 404: no report yet; 403: the rules keep it private and there is no key
  return fromRest({ mapValue: { fields: (await res.json()).fields || {} } });
}

export async function readReport(jda, now = Date.now()) {
  const hit = kept.get(jda.id);
  if (hit && hit.until > now) return hit.report;
  let report = null;
  try { report = await fetchReport(jda); } catch (e) { console.warn(`Could not read ${jda.name}'s report: ${e.message}`); }
  kept.set(jda.id, { report, until: now + KEEP_MS });
  return report;
}
