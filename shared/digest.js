// A short fingerprint of a JSON value, the same in the browser and on the server whatever order an
// object's keys come in. A page sends the fingerprint of each part of a report as it was when the
// page loaded; the server compares it with what is stored now, and so knows whether someone else
// changed that part in between. It detects change; it is not a security hash.
const stable = v => v === undefined ? 'null' : v === null || typeof v !== 'object' ? JSON.stringify(v)
  : Array.isArray(v) ? `[${v.map(stable).join(',')}]`
  : `{${Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;

export function digest(value) {
  if (value === undefined) return 'none';
  const s = stable(value);
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;                 // cyrb53: two 32-bit running hashes, combined to 53 bits
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${s.length}.${(4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)}`;
}
export const digests = (doc, fields) => Object.fromEntries(fields.map(k => [k, digest(doc?.[k])]));
