// node --test demo-mode.test.mjs
// The Invoice Tracker ships with demo mode off: on, it shows sample figures kept only in the browser, and
// the live site would look real while saving nothing (reviews/REVIEW.md, UI-01). Turn it on locally only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('demo mode is off in the committed settings', () => {
  const cfg = JSON.parse(fs.readFileSync(new URL('../web/control-tower/invoices/js/config/app-config.json', import.meta.url), 'utf8'));
  assert.equal(cfg.demoMode, false);
});
