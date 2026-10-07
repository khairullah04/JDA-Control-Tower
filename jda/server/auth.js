// Only signed-in users may call the AI endpoints. Verifies the Firebase ID token via Google's REST API.
export async function requireUser(req, res, next) {
  if (process.env.REQUIRE_AUTH === 'false') return next();
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Not signed in' });
  try {
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${process.env.FIREBASE_API_KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: token })
    });
    if (!r.ok) return res.status(401).json({ error: 'Session expired. Sign in again.' });
    next();
  } catch { res.status(500).json({ error: 'Auth check failed' }); }
}
