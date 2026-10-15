// The one way these pages call the JDA server (jda/server, /api/portal/...). The JDA Control Tower
// session cookie and the Firebase sign-in go with every call, so a save made after the cookie has run
// out still goes through (and renews it). Only when both have ended is the person sent to sign in
// again; the editor's "leave this page?" warning then protects what is unsaved. Whatever
// comes back becomes either the answer or an Error that says what happened in words; the Error carries
// the HTTP `status`, and `changed` when a save was refused because someone else saved first.
import { SYNC_API_URL } from './config/app-config.js';
import { toLogin } from '../../shared/session.js';
import { auth } from './config/firebase.js';

export async function portalApi(path, body = {}) {
  let res;
  try {
    const token = await auth.currentUser?.getIdToken().catch(() => '');
    res = await fetch(`${SYNC_API_URL}/api/portal/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) }, body: JSON.stringify(body) });
  } catch { throw new Error(`Couldn't reach the server at ${SYNC_API_URL || location.origin}. Is it running?`); }
  const out = await res.json().catch(() => ({}));
  if (res.status === 401 && out.signIn) toLogin();
  if (!res.ok) throw Object.assign(new Error(out.error || `The server could not do that (error ${res.status}).`), { status: res.status, changed: out.changed });
  return out;
}
