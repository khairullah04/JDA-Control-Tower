import { config } from '../../config/index.js';
import { auth } from './firebase.js';
import { toLogin } from '../../../../../shared/lib/session.js';

// The one way this app calls its server. Whatever comes back - JSON, a file, an error page from
// something in between - becomes either the answer or an Error that says what happened in words.
// The Error carries `status`. When the sign-in has ended (401), the person is sent to /login, which brings them back.
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
  if (res.status === 401 && out.signIn) toLogin();
  if (!res.ok) throw Object.assign(new Error(out.error || `The server could not do that (error ${res.status}).`), { status: res.status });
  return out;
}
