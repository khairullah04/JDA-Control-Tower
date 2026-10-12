// The one way the portal's pages call the JDA server (jda/server, /api/portal/...). Whatever comes
// back becomes either the answer or an Error that says what happened in words; the Error carries
// the HTTP `status`, and `changed` when a save was refused because someone else saved first.
import { SYNC_API_URL } from './config/app-config.js';

export async function portalApi(path, body = {}, token = '') {
  let res;
  try {
    res = await fetch(`${SYNC_API_URL}/api/portal/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Portal-Token': token },
      body: JSON.stringify(body)
    });
  } catch { throw new Error(`Couldn't reach the server at ${SYNC_API_URL || location.origin}. Is it running?`); }
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(out.error || `The server could not do that (error ${res.status}).`), { status: res.status, changed: out.changed });
  return out;
}
