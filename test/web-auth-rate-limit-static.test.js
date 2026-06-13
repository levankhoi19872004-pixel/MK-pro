'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '..', 'src/routes/authRoutes.js'), 'utf8');

test('web login and refresh have dedicated abuse rate limits', () => {
  assert.match(source, /const authLimiter = rateLimit/);
  assert.match(source, /AUTH_RATE_LIMIT_MAX/);
  assert.match(source, /router\.post\('\/login', authLimiter/);
  assert.match(source, /router\.post\('\/refresh', refreshLimiter/);
});
