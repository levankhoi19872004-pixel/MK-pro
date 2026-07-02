'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function definitionCodes() {
  const source = read('src/services/reports/ReportCenterService.js');
  const block = source.slice(source.indexOf('const REPORT_DEFINITIONS'), source.indexOf('].map((definition)'));
  return [...block.matchAll(/code:\s*'([^']+)'/g)].map((match) => match[1]);
}

test('every report source contract has mandatory source note fields', () => {
  const { REPORT_SOURCE_REGISTRY } = require('../src/services/reports/ReportSourceRegistry');
  for (const code of definitionCodes()) {
    const entry = REPORT_SOURCE_REGISTRY[code];
    assert.ok(entry, `${code} missing registry entry`);
    assert.ok(Array.isArray(entry.primaryCollections) && entry.primaryCollections.length, `${code} missing primaryCollections`);
    assert.ok(Array.isArray(entry.secondaryCollections), `${code} missing secondaryCollections`);
    assert.ok(Array.isArray(entry.forbiddenCollections), `${code} missing forbiddenCollections`);
    assert.ok(entry.service, `${code} missing service`);
    assert.ok(entry.sourceLabel, `${code} missing sourceLabel`);
    assert.ok(entry.ssotRule, `${code} missing ssotRule`);
    assert.equal(entry.exportService, 'ReportCenterService.run', `${code} must use ReportCenterService.run for export`);
  }
});

test('ReportCenterService builds sourceNote for every report result', () => {
  const service = read('src/services/reports/ReportCenterService.js');
  assert.match(service, /function buildSourceNote\(definition, query = \{\}, extra = \{\}, user = \{\}\)/);
  assert.match(service, /reportCode:\s*definition\.code/);
  assert.match(service, /runEndpoint:\s*`\/api\/reports\/run\/\$\{definition\.code\}`/);
  assert.match(service, /exportEndpoint:\s*'\/api\/excel\/export'/);
  assert.match(service, /exportMode:\s*'report-center'/);
  assert.match(service, /viewAndExportSameSource:\s*true/);
  assert.match(service, /sourceStatus/);
  const reportResultBlock = service.slice(service.indexOf('function reportResult'), service.indexOf('function aggregateSalesByDay'));
  assert.match(reportResultBlock, /const sourceNote = buildSourceNote/);
  assert.match(reportResultBlock, /sourceNote/);
});
