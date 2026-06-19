'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

test('audit service has one portable lowercase module and both APIs', () => {
  const lower = path.join(ROOT, 'src/services/auditService.js');
  const upper = path.join(ROOT, 'src/services/AuditService.js');
  assert.equal(fs.existsSync(lower), true);
  assert.equal(fs.existsSync(upper), false);

  const service = require(lower);
  assert.equal(typeof service.log, 'function');
  assert.equal(typeof service.record, 'function');
});

test('CommandPipeline imports audit service using canonical casing', () => {
  const source = fs.readFileSync(path.join(ROOT, 'src/application/CommandPipeline.js'), 'utf8');
  assert.match(source, /require\('\.\.\/services\/auditService'\)/);
  assert.doesNotMatch(source, /services\/AuditService/);
});
