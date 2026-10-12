// A small in-memory limit on how often one person may call a route: `max` calls in any `windowMs`.
// The person is the signed-in user where there is one, otherwise the address. Enough for one server
// process, which is how this runs; several processes would each keep their own count.
export function rateLimit({ windowMs, max, what = 'requests' }) {
  const calls = new Map();
  return (req, res, next) => {
    const who = req.user?.email || req.ip, now = Date.now();
    const recent = (calls.get(who) || []).filter(t => now - t < windowMs);
    if (recent.length >= max) {
      res.set('Retry-After', String(Math.ceil((recent[0] + windowMs - now) / 1000)));
      return res.status(429).json({ error: `Too many ${what} in a short time. Wait a moment and try again.` });
    }
    recent.push(now);
    calls.set(who, recent);
    if (calls.size > 5000) for (const [k, v] of calls) if (!v.some(t => now - t < windowMs)) calls.delete(k); // forget people who have gone quiet
    next();
  };
}
