// Money for the CJI3 register and the Payment Tables. Used by the browser and by the server.
// An amount is a whole number of minor units (sen, cents) with its currency code beside it; it is
// never a floating-point fraction. Anything that multiplies or divides goes through BigInt.
// One rounding rule everywhere: half away from zero, to the minor unit - the same as Excel's ROUND.
const ZERO_DECIMAL = ['JPY', 'KRW', 'VND', 'IDR'];
export const exponent = currency => ZERO_DECIMAL.includes(currency) ? 0 : 2;
const RATE_DP = 8;
const pow10 = n => 10n ** BigInt(n);

export function roundDiv(n, d) {
  n = BigInt(n); d = BigInt(d);
  if (d < 0n) { n = -n; d = -d; }
  const q = (2n * (n < 0n ? -n : n) + d) / (2n * d);
  return n < 0n ? -q : q;
}

// "1,234.5" or 1234.5 -> a BigInt holding `dp` decimals, or null when it is not a plain decimal number.
function scaled(value, dp) {
  const m = String(value ?? '').replace(/[,\s]/g, '').match(/^(-?)(\d*)(?:\.(\d*))?$/);
  if (!m || !(m[2] || m[3])) return null;
  const frac = m[3] || '';
  const n = roundDiv(BigInt((m[2] || '0') + frac.padEnd(dp, '0')), pow10(Math.max(frac.length - dp, 0)));
  return m[1] ? -n : n;
}
const unscaled = (n, dp) => {
  const s = (n < 0n ? -n : n).toString().padStart(dp + 1, '0');
  return (n < 0n ? '-' : '') + (dp ? `${s.slice(0, -dp)}.${s.slice(-dp)}`.replace(/0+$/, '').replace(/\.$/, '') : s);
};

// What someone typed (or a spreadsheet cell) -> minor units; null if it is not a number.
export function toMinor(value, currency = 'MYR') {
  const n = scaled(value, exponent(currency));
  return n === null || n > BigInt(Number.MAX_SAFE_INTEGER) || n < -BigInt(Number.MAX_SAFE_INTEGER) ? null : Number(n);
}
// 123456 -> "1,234.56". `plain` leaves out the thousands separators (form fields, spreadsheets).
export function fmt(minor, currency = 'MYR', plain = false) {
  if (minor == null) return '';
  const e = exponent(currency), s = String(Math.abs(minor)).padStart(e + 1, '0');
  const whole = e ? s.slice(0, -e) : s;
  return (minor < 0 ? '-' : '') + (plain ? whole : whole.replace(/\B(?=(\d{3})+$)/g, ',')) + (e ? '.' + s.slice(-e) : '');
}
export const money = (minor, currency = 'MYR') => minor == null ? '' : `${currency} ${fmt(minor, currency)}`;
// Headline figures (cards, KPIs, the timeline) are shown to the whole ringgit, by the same rounding rule.
export const ringgit = sen => 'RM ' + fmt(Number(roundDiv(sen || 0, 100)), 'JPY');

// A rate is kept as the decimal text that was entered ("4.449824"): units of MYR for one unit of the currency.
export function normRate(value) {
  const n = scaled(value, RATE_DP);
  return n === null || n <= 0n ? null : unscaled(n, RATE_DP);
}
export function convert(minor, from, rate, to = 'MYR') {
  return Number(roundDiv(BigInt(minor) * scaled(rate, RATE_DP) * pow10(exponent(to)), pow10(exponent(from) + RATE_DP)));
}
// The rate that turns `minor` of `from` into `toMinorUnits` of `to` (for records imported with both amounts but no rate).
export const impliedRate = (minor, from, toMinorUnits, to = 'MYR') =>
  unscaled(roundDiv(BigInt(toMinorUnits) * pow10(exponent(from) + RATE_DP), BigInt(minor) * pow10(exponent(to))), RATE_DP);
// A rate quoted per `unit` (Bank Negara quotes JPY per 100) -> the rate for one.
export const perUnit = (rate, unit) => unscaled(roundDiv(scaled(rate, RATE_DP), BigInt(unit)), RATE_DP);

// Tax rates are whole basis points: 8% = 800.
export const percentage = (minor, bps) => Number(roundDiv(BigInt(minor) * BigInt(bps), 10000n));
export function toBps(percent) {
  const n = scaled(percent, 2);
  return n === null || n < 0n || n > 10000n ? null : Number(n);
}
export const fromBps = bps => unscaled(BigInt(bps), 2);
// The amount before tax inside a tax-inclusive one.
export const beforeTax = (grossMinor, bps) => Number(roundDiv(BigInt(grossMinor) * 10000n, 10000n + BigInt(bps)));
// a * n / d, for sharing an amount out or scaling it, rounded once.
export const scale = (minor, n, d) => Number(roundDiv(BigInt(minor) * BigInt(n), BigInt(d)));
