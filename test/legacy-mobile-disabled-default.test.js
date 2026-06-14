'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ROOT = path.resolve(__dirname, '..');

test('legacy mobile implementation is removed and namespace is permanently retired', () => {
  const routeIndex = fs.readFileSync(path.join(ROOT, 'src/routes/index.js'), 'utf8');
  assert.equal(fs.existsSync(path.join(ROOT, 'src/routes/mobileRoutes.js')), false);
  assert.doesNotMatch(routeIndex, /ENABLE_LEGACY_MOBILE_ROUTES/);
  assert.doesNotMatch(routeIndex, /require\(['"]\.\/mobileRoutes['"]\)/);
  assert.match(routeIndex, /retiredRoute\('mobile-legacy'/);
  assert.match(routeIndex, /replacement: '\/api\/mobile'/);
});

test('legacy environment flag is removed', () => {
  for (const file of ['.env.example', '.env.production.example']) {
    const env = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.doesNotMatch(env, /ENABLE_LEGACY_MOBILE_ROUTES/);
  }
});
