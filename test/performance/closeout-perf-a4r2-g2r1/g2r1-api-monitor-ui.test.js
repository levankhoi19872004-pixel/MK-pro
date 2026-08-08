'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../../..');

test('G2R1 API Monitor UI keeps legacy DB Queries and exposes Physical Mongo separately', () => {
  const html = fs.readFileSync(path.join(root, 'public/fragments/index/07-index-body.html'), 'utf8');
  const js = fs.readFileSync(path.join(root, 'public/js/app/09-system.js'), 'utf8');
  const state = fs.readFileSync(path.join(root, 'public/js/app/state/00c-admin-system-state.js'), 'utf8');
  assert.match(html, /DB Query\/Aggregate \(legacy\)/);
  assert.match(html, /id="apiMonitorTotalPhysicalMongoCommands"/);
  assert.match(html, /TB Query \(legacy\)/);
  assert.match(html, /TB Physical/);
  assert.match(js, /summary\.totalDbQueries/);
  assert.match(js, /summary\.totalPhysicalMongoCommands/);
  assert.match(js, /row\.avgDbQueries/);
  assert.match(js, /row\.avgPhysicalMongoCommands/);
  assert.match(state, /apiMonitorTotalPhysicalMongoCommands/);
});
