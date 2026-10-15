// The browser half of the JDA Control Tower sign-in (the server half is jda/server/auth.js).
// /login signs in with Firebase, then trades the Firebase ID token for the server's session cookie.
// The private pages keep the Firebase sign-in too: they read JDAs and reports from Firestore with it.

// Where to go after signing in: a path on this site only, never another address.
export function nextPath(raw, fallback = '/control-tower/') {
  const p = String(raw || '');
  return p.startsWith('/') && !p.startsWith('//') && !p.startsWith('/\\') ? p : fallback;
}

// A signed-in Firebase user -> the server's session cookie. Throws with the server's reason.
export async function startSession(user) {
  const res = await fetch('/api/auth/session', { method: 'POST', headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || `Sign-in failed (error ${res.status}).`);
  return out;
}

// { signedIn, email?, signInOff? } from the server.
export async function me() {
  try { return await (await fetch('/api/auth/me')).json(); } catch { return { signedIn: false }; }
}

// A private page that reads Firestore needs the Firebase sign-in as well as the session cookie. Waits
// until Firebase knows whether there is one; without one, the person is sent to /login (unless the
// server runs with sign-in off, for trying things locally, where there is never a Firebase user).
export async function needFirebaseUser(auth) {
  await auth.authStateReady();
  if (!auth.currentUser && !(await me()).signInOff) toLogin();
}

// Sign out everywhere: the server's cookie, then Firebase (`auth`, when the page has one), then home.
export async function endSession(auth) {
  await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
  if (auth) { const { signOut } = await import('./vendor/firebase-auth.js'); await signOut(auth).catch(() => {}); }
  location.href = '/';
}

// Sent to sign in again, coming back to this page afterwards (an API call answered 401).
export const toLogin = () => location.assign(`/login?next=${encodeURIComponent(location.pathname + location.search + location.hash)}`);
