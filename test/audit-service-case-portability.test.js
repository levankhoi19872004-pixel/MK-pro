'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

test('audit service has one portable lowercase module and both APIs', () => {
  const servicesDir = path.join(ROOT, 'src/services');
  const lower = path.join(servicesDir, 'auditService.js');
  const entries = fs.readdirSync(servicesDir);
  assert.equal(entries.includes('auditService.js'), true);
  assert.equal(entries.includes('AuditService.js'), false);
  assert.equal(entries.filter((name) => name.toLowerCase() === 'auditservice.js').length, 1);

  const service = require(lower);
  assert.equal(typeof service.log, 'function');
  assert.equal(typeof service.record, 'function');
});

test('CommandPipeline imports audit service using canonical casing', () => {
  const source = fs.readFileSync(path.join(ROOT, 'src/application/CommandPipeline.js'), 'utf8');
  assert.match(source, /require\('\.\.\/services\/auditService'\)/);
  assert.doesNotMatch(source, /services\/AuditService/);
});
