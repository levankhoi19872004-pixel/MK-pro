'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const migrationService = require('../src/services/arLedgerMigrationService');

test('arLedgerMigrationService is explicitly marked migration/audit only', () => {
  assert.equal(migrationService.MIGRATION_ONLY_SERVICE, true);
  assert.equal(migrationService.DIRECT_READ_SOURCE, 'AR_MIGRATION_AUDIT_DRY_RUN_ONLY');
  assert.throws(() => migrationService.assertMigrationDirectReadAllowed({}), /migration\/audit only|migration\/audit/);
});
