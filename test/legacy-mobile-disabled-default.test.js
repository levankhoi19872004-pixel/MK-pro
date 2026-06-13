'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('legacy mobile namespace is disabled by default and only available behind explicit rollback flag', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/index.js'), 'utf8');
  assert.match(source, /process\.env\.ENABLE_LEGACY_MOBILE_ROUTES === 'true'/);
  assert.match(source, /app\.use\('\/api\/mobile-legacy', legacyMobileRoutes\)/);
  assert.doesNotMatch(source, /\n\s*app\.use\('\/api\/mobile-legacy', legacyMobileRoutes\);\n\s*\/\/ MOBILE_MODULAR_ROUTE_MOUNT_END/);

  const env = fs.readFileSync(path.join(__dirname, '../.env.production.example'), 'utf8');
  assert.match(env, /ENABLE_LEGACY_MOBILE_ROUTES=false/);
});
