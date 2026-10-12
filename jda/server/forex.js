import { perUnit } from '../web/js/finance/money.js';

// Bank Negara Malaysia's published exchange rates: the 5 pm middle rate, in ringgit for one unit of
// the currency. The service is public and needs no key. A date that has no rate (a weekend, a
// holiday, today before 5 pm) takes the nearest earlier day that has one.
const API = 'https://api.bnm.gov.my/public/exchange-rate';

export async function bnmRate(currency, date) {
  const get = async path => {
    const r = await fetch(`${API}/${path}?session=1700&quote=rm`, { headers: { Accept: 'application/vnd.BNM.API.v1+json' } });
    return r.ok ? (await r.json()).data : null;
  };
  let found = null;
  if (date) for (let back = 0, day = new Date(date + 'T00:00:00Z'); back < 7 && !found?.rate?.middle_rate; back++, day.setUTCDate(day.getUTCDate() - 1)) {
    found = await get(`${currency}/date/${day.toISOString().slice(0, 10)}`);
  }
  if (!found?.rate?.middle_rate) found = await get(currency);
  if (!found?.rate?.middle_rate) throw Object.assign(new Error(`Bank Negara publishes no rate for ${currency}. Enter the rate by hand.`), { status: 404 });
  return { rate: perUnit(String(found.rate.middle_rate), found.unit || 1), date: found.rate.date, source: 'Bank Negara 5pm middle rate' };
}
