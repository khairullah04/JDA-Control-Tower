// "Today" and "this month" mean today in Malaysia, on every page and on the server, whatever clock
// the machine keeps. (toISOString() gives the date in UTC: until 8 am in Malaysia that is still
// yesterday, and on the 1st it is still last month.)
const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit' });
// -> "2026-07-01"
export function localToday(now = new Date()) {
  const p = Object.fromEntries(parts.formatToParts(now).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
// -> "2026-07"
export const localMonth = now => localToday(now).slice(0, 7);
