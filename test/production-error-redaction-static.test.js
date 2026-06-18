'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? files(full) : [full];
  });
}

test('controllers do not expose internal error field unconditionally in production', () => {
  const controllerDir = path.join(__dirname, '..', 'src', 'controllers');
  for (const file of files(controllerDir).filter((name) => name.endsWith('.js'))) {
    const source = require('./helpers/sourceBundle.util').readSource(file);
    assert.doesNotMatch(source, /error:\s*err(?:\?|)\.message(?!\s*:)/, file);
  }
});

test('mobile 5xx responses replace internal messages in production', () => {
  const source = require('./helpers/sourceBundle.util').readSource(path.join(__dirname, '..', 'src/controllers/mobile/_mobileResponse.js'));
  assert.match(source, /NODE_ENV === 'production'.*Number\(status\) >= 500/s);
  assert.match(source, /\? fallbackMessage/);
});
