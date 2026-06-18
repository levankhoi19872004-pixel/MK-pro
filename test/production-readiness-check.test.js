'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { evaluateProductionReadiness } = require('../scripts/production-readiness-check');

function validEnv(overrides = {}) {
  return {
    NODE_ENV: 'production',
    MONGO_URI: 'mongodb+srv://u:p@cluster/db',
    JWT_SECRET: 'a'.repeat(64),
    JWT_REFRESH_SECRET: 'b'.repeat(64),
    CORS_ALLOW_ALL: 'false',
    CORS_ALLOW_CREDENTIALS: 'true',
    CORS_ORIGIN: 'https://erp.example',
    PUBLIC_APP_ORIGIN: 'https://erp.example',
    ACCESS_TOKEN_COOKIE_SECURE: 'true',
    REFRESH_TOKEN_COOKIE_SECURE: 'true',
    ALLOW_SYSTEM_RESET: 'false',
    ALLOW_SYSTEM_DATA_EXPORT: 'false',
    ALLOW_REFRESH_TOKEN_IN_BODY: 'false',
    ALLOW_LEGACY_UNTYPED_TOKENS: 'false',
    AUTO_BACKFILL_ARLEDGERS: 'false',
    AUTO_RECONCILIATION_JOB: 'true',
    AUTO_ENSURE_MONGO_INDEXES: 'true',
    TRUST_PROXY: '1',
    BACKUP_DIR: '/backup',
    ...overrides
  };
}

test('production readiness gate accepts hardened configuration', () => {
  const result = evaluateProductionReadiness(validEnv());
  assert.equal(result.ok, true, result.errors.join('; '));
});

test('production readiness gate rejects unsafe secrets, shared token keys and dangerous flags', () => {
  const result = evaluateProductionReadiness(validEnv({
    JWT_SECRET: 'change-me',
    JWT_REFRESH_SECRET: 'change-me',
    CORS_ALLOW_ALL: 'true',
    ALLOW_SYSTEM_DATA_EXPORT: 'true',
    AUTO_RECONCILIATION_JOB: 'false'
  }));
  assert.equal(result.ok, false);
  assert.ok(result.errors.length >= 5);
});

test('production readiness gate requires integration allowlist and confirmed tenant migration', () => {
  const result = evaluateProductionReadiness(validEnv({
    ENABLE_ENTERPRISE_CORE: 'true',
    ENABLE_INTEGRATIONS: 'true',
    INTEGRATION_ALLOWED_HOSTS: '',
    TENANT_MODE: 'multi',
    TENANT_MIGRATION_CONFIRMED: 'false'
  }));
  assert.equal(result.ok, false);
  assert.match(result.errors.join('; '), /INTEGRATION_ALLOWED_HOSTS/);
  assert.match(result.errors.join('; '), /TENANT_MIGRATION_CONFIRMED/);
});
