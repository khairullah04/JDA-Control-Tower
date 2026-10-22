// node --test list-email.test.mjs
// Invoices from the Microsoft List and the approval-request email: the column mapping, the proof links
// (web addresses only), what is missing, the selection, the HTML (escaped, totals, links by label) and the .eml.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rowsFromSheet, suggestMapping, unmappedNeeded, itemsFrom, parseProofs, isWebLink, inJda, selectionTotals } from '../web/control-tower/invoices/js/finance/list-source.js';
import { emailHtml, emlFile, subjectFor, mailtoLink, escHtml } from '../web/control-tower/invoices/js/finance/email.js';

const HEAD = ['ID', 'Invoice Number', 'Vendor', 'Invoice Amount', 'Currency', 'Description', 'JDA', 'Supporting Documents', 'Created By'];
const sheet = (...rows) => [{ name: 'Sheet1', rows: [['Invoices (List export)'], HEAD, ...rows] }];

test('column mapping: proposed from the names, a confirmed one kept, "not in the List" kept, required ones checked', () => {
  const { headers, rows } = rowsFromSheet(sheet(['7', 'INV-1', 'IBM', '1,000.00', 'USD', 'Sept', 'JDA 1', '', 'aina']));
  assert.deepEqual([headers.length, rows.length, rows[0]['Invoice Number']], [9, 1, 'INV-1']);
  const m = suggestMapping(headers);
  assert.deepEqual(m, { invoiceNo: 'Invoice Number', partner: 'Vendor', amount: 'Invoice Amount', currency: 'Currency', description: 'Description', jda: 'JDA', proofs: 'Supporting Documents', id: 'ID' });
  const odd = suggestMapping(['Ref', 'Supplier Co', 'Sum'], {});
  assert.deepEqual(unmappedNeeded(odd), ['Invoice No.', 'Partner', 'Amount']);                  // nothing guessed for unusual names
  assert.equal(suggestMapping(['Ref', 'Sum'], { invoiceNo: 'Ref', amount: 'Sum' }).invoiceNo, 'Ref'); // the confirmed mapping wins
  assert.equal(suggestMapping(['Currency'], { currency: '' }).currency, '');                       // confirmed as not in the List
  assert.equal(suggestMapping(['Gone'], { invoiceNo: 'Old column' }).invoiceNo, '');               // a column no longer there is not used
});

test('proof links: http(s) only; label | url, [label](url), "url, description" and Hyperlink objects', () => {
  assert.deepEqual([isWebLink('https://x.sharepoint.com/a'), isWebLink('http://a.b'), isWebLink('javascript:alert(1)'), isWebLink('ftp://a'), isWebLink('not a url'), isWebLink('')], [true, true, false, false, false, false]);
  assert.deepEqual(parseProofs('Timesheet | https://a.com/t.pdf\n[DO](https://a.com/do)\nhttps://a.com/bare;javascript:alert(1)\nhttps://sp.com/x.pdf, Delivery note'),
    [{ label: 'Timesheet', url: 'https://a.com/t.pdf' }, { label: 'DO', url: 'https://a.com/do' }, { label: '', url: 'https://a.com/bare' }, { label: 'Delivery note', url: 'https://sp.com/x.pdf' }]);
  assert.deepEqual(parseProofs({ Url: 'https://sp.com/y', Description: 'https://sp.com/y' }), [{ label: '', url: 'https://sp.com/y' }]);
  assert.deepEqual(parseProofs({ Url: 'javascript:x', Description: 'bad' }), []);
});

test('items: amounts in their own currency, and what each one is missing, in words', () => {
  const { headers, rows } = rowsFromSheet(sheet(['1', 'INV-1', 'IBM', 'USD 1,250.50', 'usd', 'Sept work', 'JDA 1', 'TS | https://a.com/ts', ''],
    ['2', '', 'TAI', 'n/a', '', '', 'JDA 2', '', '']));
  const m = suggestMapping(headers), [a, b] = itemsFrom(rows, m);
  assert.deepEqual([a.key, a.amountMinor, a.currency, a.missing], ['1', 125050, 'USD', []]);
  assert.deepEqual(b.missing, ['Invoice No.', 'Amount ("n/a" is not a number)', 'Currency', 'Description', 'Supporting documents']);
  assert.deepEqual([inJda(a, 'JDA 1', m), inJda(b, 'JDA 1', m), inJda(b, 'jda2', m), inJda(b, 'JDA 1', { ...m, jda: '' })], [true, false, true, true]);
});

test('selection: count, and a total per currency (mixed currencies never added together)', () => {
  const items = [{ key: 'a', amountMinor: 100000, currency: 'MYR' }, { key: 'b', amountMinor: 5000, currency: 'USD' }, { key: 'c', amountMinor: 25050, currency: 'MYR' }, { key: 'd', amountMinor: null, currency: 'MYR' }];
  const t = selectionTotals(items, new Set(['a', 'b', 'c', 'd']));
  assert.deepEqual([t.count, t.byCurrency], [4, [{ currency: 'MYR', minor: 125050 }, { currency: 'USD', minor: 5000 }]]);
  assert.deepEqual(selectionTotals(items, new Set()).count, 0);
});

test('the email: escaped text, rows numbered, totals per currency, links by label or "Document n", never a raw address', () => {
  const html = emailHtml({ jdaName: 'JDA 1', items: [
    { invoiceNo: 'INV-1<script>', partner: 'A & B "Co"', description: '<img src=x onerror=alert(1)>', amountMinor: 100000, currency: 'MYR', proofs: [{ label: 'Timesheet', url: 'https://a.com/t?x=1&y=2' }, { label: '', url: 'https://a.com/second' }] },
    { invoiceNo: 'INV-2', partner: 'IBM', description: 'Sept', amountMinor: 50050, currency: 'MYR', proofs: [] },
    { invoiceNo: 'INV-3', partner: 'IBM', description: 'USD one', amountMinor: 1000, currency: 'USD', proofs: [] }] });
  assert.doesNotMatch(html, /<script>|<img src=x/);
  assert.match(html, /INV-1&lt;script&gt;/);
  assert.match(html, /A &amp; B &quot;Co&quot;/);
  assert.match(html, /<a href="https:\/\/a\.com\/t\?x=1&amp;y=2"[^>]*>Timesheet<\/a>/);
  assert.match(html, />Document 2<\/a>/);
  assert.doesNotMatch(html.replace(/href="[^"]*"/g, ''), /https?:\/\//);                         // no raw address shown as text
  assert.match(html, /TOTAL<\/td><td[^>]*>MYR 1,500\.50<br>USD 10\.00<\/td>/);
  assert.doesNotMatch(html, /display:\s*(flex|grid)|<link|<style/);                               // Outlook-safe: tables and inline styles only
  assert.match(html, /background-color:#013d39/);
  assert.equal(escHtml(`<'">&`), '&lt;&#39;&quot;&gt;&amp;');
});

test('the subject, the .eml (an unsent draft for Outlook) and the mailto link', () => {
  const subject = subjectFor('JDA 2', 3, new Date(2026, 9, 22));
  assert.equal(subject, '[JDA 2] Invoice Approval Request – 3 invoices – 22/10/2026');
  assert.equal(subjectFor('JDA 2', 1, new Date(2026, 0, 5)), '[JDA 2] Invoice Approval Request – 1 invoice – 05/01/2026');
  const eml = emlFile({ to: 'lead@x.com', cc: 'a@x.com\r\nBcc: evil@x.com', subject, html: '<p>Hi ✓</p>' });
  const [head, body] = eml.split('\r\n\r\n');
  const lines = head.split('\r\n');
  assert.equal(lines[0], 'X-Unsent: 1');
  assert.ok(lines.includes('Content-Type: text/html; charset=utf-8'));
  assert.ok(lines.includes('To: lead@x.com'));
  assert.ok(lines.includes('Cc: a@x.com Bcc: evil@x.com'));                                       // a line break in a field cannot add a header
  assert.ok(!lines.some(l => /^Bcc:/.test(l)));
  assert.match(lines.find(l => l.startsWith('Subject:')), /^Subject: =\?UTF-8\?B\?.+\?=$/);
  assert.equal(Buffer.from(body.replace(/\r\n/g, ''), 'base64').toString('utf8'), '<p>Hi ✓</p>');
  assert.ok(!emlFile({ subject: 's', html: '' }).includes('Cc:'));                                 // blank recipients for now: no Cc line
  const mt = mailtoLink({ to: '', cc: '', subject });
  assert.match(mt, /^mailto:\?subject=/);
  assert.ok(!/body=/.test(mt));
});
