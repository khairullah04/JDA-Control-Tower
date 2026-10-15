// node --test forex.test.mjs
// Reading Bank Negara Malaysia's published rates, with their service stubbed out.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { bnmRate } from './forex.js';

const realFetch = globalThis.fetch;
let published, asked;
// `published`: what the service has, by path ("USD/date/2026-09-04", or "USD" for the latest).
beforeEach(() => {
  asked = [];
  globalThis.fetch = async (url, init) => {
    const path = String(url).replace('https://api.bnm.gov.my/public/exchange-rate/', '').replace('?session=1700&quote=rm', '');
    asked.push([path, init.headers.Accept, String(url).endsWith('?session=1700&quote=rm')]);
    return path in published ? { ok: true, json: async () => ({ data: published[path] }) } : { ok: false, status: 404, json: async () => ({ message: 'No records found.' }) };
  };
});
afterEach(() => { globalThis.fetch = realFetch; });
const day = (date, middle, unit = 1, code = 'USD') => ({ currency_code: code, unit, rate: { date, buying_rate: middle - 0.01, selling_rate: middle + 0.01, middle_rate: middle } });

test('the 5 pm middle rate for the date, asked for the way the service wants', async () => {
  published = { 'USD/date/2026-09-04': day('2026-09-04', 4.2255) };
  assert.deepEqual(await bnmRate('USD', '2026-09-04'), { rate: '4.2255', date: '2026-09-04', source: 'Bank Negara 5pm middle rate' });
  assert.deepEqual(asked, [['USD/date/2026-09-04', 'application/vnd.BNM.API.v1+json', true]]);
});

test('a currency quoted per 100 units is brought to one unit, exactly', async () => {
  published = { 'JPY/date/2026-09-04': day('2026-09-04', 2.8565, 100, 'JPY'), 'IDR/date/2026-09-04': day('2026-09-04', 0.0271, 100, 'IDR') };
  assert.equal((await bnmRate('JPY', '2026-09-04')).rate, '0.028565');
  assert.equal((await bnmRate('IDR', '2026-09-04')).rate, '0.000271');
});

test('a weekend or holiday takes the nearest earlier day that has a rate, and says which', async () => {
  published = { 'USD/date/2026-09-04': day('2026-09-04', 4.2255) };
  assert.deepEqual(await bnmRate('USD', '2026-09-06'), { rate: '4.2255', date: '2026-09-04', source: 'Bank Negara 5pm middle rate' });   // Sunday -> Friday
  assert.deepEqual(asked.map(a => a[0]), ['USD/date/2026-09-06', 'USD/date/2026-09-05', 'USD/date/2026-09-04']);
  asked = [];
  await bnmRate('USD', '2026-01-02').catch(() => {});                                                // it looks back across a month and a year end
  assert.deepEqual(asked.map(a => a[0]).slice(0, 4), ['USD/date/2026-01-02', 'USD/date/2026-01-01', 'USD/date/2025-12-31', 'USD/date/2025-12-30']);
});

test('nothing within a week, or no date given: the latest published rate', async () => {
  published = { USD: day('2026-10-09', 4.31) };
  assert.deepEqual([(await bnmRate('USD', '2026-09-06')).date, asked.length], ['2026-10-09', 8]);    // seven days back, then the latest
  asked = [];
  assert.deepEqual([(await bnmRate('USD', '')).rate, asked.map(a => a[0])], ['4.31', ['USD']]);
});

test('a currency Bank Negara does not publish is said so, as a 404, and an answer with no rate counts as none', async () => {
  published = { 'XXX/date/2026-09-04': { currency_code: 'XXX', unit: 1, rate: {} } };
  await assert.rejects(bnmRate('XXX', '2026-09-04'), e => e.status === 404 && /publishes no rate for XXX\. Enter the rate by hand\./.test(e.message));
});
