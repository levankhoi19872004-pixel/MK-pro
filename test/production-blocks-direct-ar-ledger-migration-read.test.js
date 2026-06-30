'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const migrationService = require('../src/services/arLedgerMigrationService');

test('production blocks direct AR migration read unless explicitly approved', () => {
  const oldEnv = process.env.NODE_ENV;
  const oldAllow = process.env.ALLOW_AR_MIGRATION_DIRECT_READ;
  process.env.NODE_ENV = 'production';
  delete process.env.ALLOW_AR_MIGRATION_DIRECT_READ;
  try {
    assert.throws(
      () => migrationService.assertMigrationDirectReadAllowed({ dryRun: true }),
      /blocked in production/
    );
    process.env.ALLOW_AR_MIGRATION_DIRECT_READ = 'true';
    assert.doesNotThrow(() => migrationService.assertMigrationDirectReadAllowed({ dryRun: true }));
  } finally {
    if (oldEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = oldEnv;
    if (oldAllow === undefined) delete process.env.ALLOW_AR_MIGRATION_DIRECT_READ;
    else process.env.ALLOW_AR_MIGRATION_DIRECT_READ = oldAllow;
  }
});
