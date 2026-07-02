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

test('every Report Center definition has a source registry contract', () => {
  const registry = require('../src/services/reports/ReportSourceRegistry');
  for (const code of definitionCodes()) {
    const contract = registry.REPORT_SOURCE_REGISTRY[code];
    assert.ok(contract, `missing registry entry for ${code}`);
    assert.ok(Array.isArray(contract.primaryCollections) && contract.primaryCollections.length, `${code} missing primaryCollections`);
    assert.ok(contract.service, `${code} missing service`);
    assert.equal(contract.exportService, 'ReportCenterService.run', `${code} must export via ReportCenterService.run`);
    assert.ok(contract.sourceLabel, `${code} missing sourceLabel`);
    assert.ok(contract.ssotRule, `${code} missing ssotRule`);
    assert.ok(Array.isArray(contract.secondaryCollections), `${code} missing secondaryCollections array`);
    assert.ok(Array.isArray(contract.forbiddenCollections), `${code} missing forbiddenCollections array`);
  }
});

test('report result exposes sourceContract and catalog no longer publics legacy exportType', () => {
  const source = read('src/services/reports/ReportCenterService.js');
  const reportResultBlock = source.slice(source.indexOf('function reportResult'), source.indexOf('function aggregateSalesByDay'));
  assert.match(reportResultBlock, /sourceContract/);
  assert.match(reportResultBlock, /sourceNote/);
  const publicDefinitionBlock = source.slice(source.indexOf('function publicDefinition'), source.indexOf('function visibleDefinitions'));
  assert.equal(/exportType\s*:/.test(publicDefinitionBlock), false);
  assert.match(publicDefinitionBlock, /exportMode:\s*'report-center'/);
  assert.match(publicDefinitionBlock, /canonicalExportCode:\s*definition\.code/);
});
