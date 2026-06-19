'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { maintenanceWriteGuard } = require('../src/middlewares/maintenance.middleware');

function callGuard(method, url) {
  let status = 0;
  let body = null;
  let next = false;
  maintenanceWriteGuard(
    { method, originalUrl: url },
    { status(value) { status = value; return this; }, json(value) { body = value; return value; } },
    () => { next = true; }
  );
  return { status, body, next };
}

test('maintenance mode blocks business writes but allows reset and reads', () => {
  const previous = process.env.SYSTEM_MAINTENANCE_MODE;
  process.env.SYSTEM_MAINTENANCE_MODE = 'true';
  try {
    assert.equal(callGuard('POST', '/api/orders').status, 503);
    assert.equal(callGuard('GET', '/api/orders').next, true);
    assert.equal(callGuard('POST', '/api/system/backup').next, true);
    assert.equal(callGuard('POST', '/api/system/reset').next, true);
    assert.equal(callGuard('POST', '/api/auth/login').next, true);
  } finally {
    if (previous === undefined) delete process.env.SYSTEM_MAINTENANCE_MODE;
    else process.env.SYSTEM_MAINTENANCE_MODE = previous;
  }
});

test('system reset replaces collections inside one Mongo transaction', () => {
  const source = require('./helpers/sourceBundle.util').readSource(path.join(__dirname, '..', 'src/services/systemService.js'));
  assert.match(source, /withMongoTransaction\(async \(session\)/);
  assert.match(source, /repository\.replaceAll\(nextData, \{ session \}\)/);
});
