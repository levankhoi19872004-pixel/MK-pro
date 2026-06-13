'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'src/services/mobile/sales.service.js'), 'utf8');

test('mobile sales creation persists idempotency in Mongo transaction', () => {
  assert.match(source, /buildPersistentKey\('mobile\.sales\.create'/);
  assert.match(source, /beginRequest\(\{[\s\S]*scope: 'mobile\.sales\.create'/);
  assert.match(source, /completeRequest\(persistentRequest\.key, response, \{ session \}\)/);
});

test('mobile sales UI capability agrees with stock-posted update guard', () => {
  assert.match(source, /canEdit: order\.stockPosted !== true/);
  assert.match(source, /if \(order\.stockPosted\)/);
});
