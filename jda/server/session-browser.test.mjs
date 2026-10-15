// node --test session-browser.test.mjs
// Where /login sends someone after signing in (shared/session.js, run in the browser): this site only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextPath } from '../../shared/session.js';

const at = (raw, hash = '') => nextPath(raw, { origin: 'https://jda.example.com', hash });

test('a page of this site is kept, with its query and #', () => {
  assert.equal(at('/control-tower/jda-report.html#/jda1'), '/control-tower/jda-report.html#/jda1');
  assert.equal(at('/control-tower/jda-report.html?jda=jda2'), '/control-tower/jda-report.html?jda=jda2');
  assert.equal(at('/control-tower/tracker/'), '/control-tower/tracker/');
});

test('the # the browser brought along is used when the address has none', () => {
  assert.equal(at('/control-tower/jda-report.html', '#/jda1/weekly'), '/control-tower/jda-report.html#/jda1/weekly');
  assert.equal(at('/control-tower/tracker/', '#/payments/abc/def'), '/control-tower/tracker/#/payments/abc/def');
  assert.equal(at('/control-tower/jda-report.html#/jda2', '#/jda1'), '/control-tower/jda-report.html#/jda2');
  assert.equal(at('/control-tower/', '#"><script>'), '/control-tower/');
});

test('anything that could lead off the site goes to the Control Tower instead', () => {
  for (const bad of ['https://evil.com/', '//evil.com/', '/\\evil.com', '/\t/evil.com', '/\n/evil.com', '\t//evil.com', '/%09/evil.com/x',
    'javascript:alert(1)', 'evil.com', '', null, undefined, '/\\/evil.com', ' //evil.com']) {
    const out = at(bad);
    assert.ok(out.startsWith('/') && !out.startsWith('//'), String(bad));
    assert.equal(new URL(out, 'https://jda.example.com').origin, 'https://jda.example.com', String(bad));
  }
  assert.equal(at('/\t/evil.com'), '/control-tower/');
});
