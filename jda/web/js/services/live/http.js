import { config } from '../../config/index.js';
import { auth } from './firebase.js';

// The one way this app calls its server. Whatever comes back - JSON, a file, an error page from
// something in between - becomes either the answer or an Error that says what happened in words.
// The Error carries `status`, and `passkey` when the server is asking for the Invoice Tracker passkey.
export async function request(path, { method = 'GET', body, headers = {} } = {}) {
  let res;
  try {
    res = await fetch(config.apiBase + path, {
      method, body: body && JSON.stringify(body),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ((await auth.currentUser?.getIdToken()) || ''), ...headers }
    });
  } catch { throw new Error(`Couldn't reach the server at ${config.apiBase || location.origin}. Is it running?`); }
  if (res.ok && !res.headers.get('content-type')?.includes('json')) return res.blob();
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(out.error || `The server could not do that (error ${res.status}).`), { status: res.status, passkey: !!out.passkey });
  return out;
}
