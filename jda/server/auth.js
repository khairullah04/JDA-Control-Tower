// Only signed-in users may call the API (AI, Drive, invoices and payments). Verifies the Firebase ID token via Google's REST API.
export async function requireUser(req, res, next) {
  if (process.env.REQUIRE_AUTH === 'false') return next();
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Not signed in' });
  try {
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${process.env.FIREBASE_API_KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: token })
    });
    if (!r.ok) {
      const reason = (await r.json().catch(() => ({}))).error?.message || '';
      if (/API key/i.test(reason)) return res.status(500).json({ error: 'The server cannot check sign-ins: FIREBASE_API_KEY in server/.env is missing or wrong. It is the apiKey in web/js/config/firebase-config.js.' });
      return res.status(401).json({ error: 'Session expired. Sign in again.' });
    }
    const email = (await r.json()).users?.[0]?.email || '';
    req.user = { email, name: email.split('@')[0] }; // who made a change, for the audit log
    next();
  } catch { res.status(500).json({ error: 'Auth check failed' }); }
}
