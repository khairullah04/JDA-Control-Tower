import crypto from 'node:crypto';

// The JDA Control Tower session: after /login has checked a person's Firebase sign-in against the
// access list (auth.js), the server hands the browser this cookie. It is httpOnly (no script can read
// it), SameSite=Lax (another site cannot make the browser send it with a form post) and signed, so it
// cannot be made up or changed. Every private page, file and API call is checked against it.
//
// SESSION_SECRET (server/.env, 32+ characters) signs it. Without one, a random secret is made at
// start-up, so a restart signs everyone out.
export const COOKIE = 'ct_session';
export const SESSION_MS = 8 * 60 * 60 * 1000;
const SECRET = process.env.SESSION_SECRET?.length >= 32 ? process.env.SESSION_SECRET : crypto.randomBytes(32);
const mac = body => crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

export function parseCookies(header = '') {
  const out = {};
  for (const part of String(header).split(';')) {
    const at = part.indexOf('=');
    if (at > 0) { try { out[part.slice(0, at).trim()] = decodeURIComponent(part.slice(at + 1).trim()); } catch { /* a cookie that is not ours */ } }
  }
  return out;
}

export function sessionToken(email, now = Date.now()) {
  const body = Buffer.from(JSON.stringify({ email, exp: now + SESSION_MS })).toString('base64url');
  return `${body}.${mac(body)}`;
}
// The email a valid, unexpired session cookie names, or ''.
export function sessionEmail(req, now = Date.now()) {
  const [body, sig] = String(parseCookies(req.headers.cookie)[COOKIE] || '').split('.');
  if (!body || !sig || !same(sig, mac(body))) return '';
  try { const { email, exp } = JSON.parse(Buffer.from(body, 'base64url').toString()); return exp > now && typeof email === 'string' ? email : ''; }
  catch { return ''; }
}

const flags = req => `Path=/; HttpOnly; SameSite=Lax${req.secure ? '; Secure' : ''}`;
export const setSession = (req, res, email) => res.setHeader('Set-Cookie', `${COOKIE}=${sessionToken(email)}; Max-Age=${SESSION_MS / 1000}; ${flags(req)}`);
export const clearSession = (req, res) => res.setHeader('Set-Cookie', `${COOKIE}=; Max-Age=0; ${flags(req)}`);
