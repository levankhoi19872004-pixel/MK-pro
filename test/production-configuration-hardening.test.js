'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildRuntimeConfig,
  validateRuntimeConfig,
  publicConfigSummary
} = require('../src/config/app.config');
const { getCompanyProfile, DEFAULT_COMPANY_PROFILE } = require('../src/config/company-profile.config');

function validEnvironment(nodeEnv = 'production') {
  return {
    NODE_ENV: nodeEnv,
    MONGO_URI: 'mongodb://localhost:27017/mk_pro_test',
    JWT_SECRET: 'a'.repeat(64),
    JWT_REFRESH_SECRET: 'b'.repeat(64),
    APP_URL: nodeEnv === 'production' ? 'https://erp.example.com' : 'http://localhost:5000',
    CORS_ORIGIN: nodeEnv === 'production' ? 'https://erp.example.com' : 'http://localhost:5000',
    CORS_ALLOW_ALL: 'false',
    CORS_ALLOW_CREDENTIALS: 'true',
    PORT: '5000',
    TRUST_PROXY: '1'
  };
}

function assertInvalid(env, variable, profile = 'server') {
  assert.throws(
    () => validateRuntimeConfig(env, { profile }),
    (error) => error?.code === 'INVALID_CONFIGURATION' && error.issues.some((issue) => issue.variable === variable)
  );
}

test('missing mandatory database and JWT variables fail fast for server startup', () => {
  assertInvalid({ NODE_ENV: 'development', JWT_SECRET: 'test-secret' }, 'MONGO_URI');
  assertInvalid({ NODE_ENV: 'development', MONGO_URI: 'mongodb://localhost/test' }, 'JWT_SECRET');
});

test('numeric configuration rejects invalid, zero and negative values', () => {
  assertInvalid({ ...validEnvironment(), PORT: 'abc' }, 'PORT');
  assertInvalid({ ...validEnvironment(), IMPORT_PREVIEW_MAX_CONCURRENCY: '0' }, 'IMPORT_PREVIEW_MAX_CONCURRENCY');
  assertInvalid({ ...validEnvironment(), SALES_IMPORT_TX_CHUNK_SIZE: '-1' }, 'SALES_IMPORT_TX_CHUNK_SIZE');
});

test('boolean configuration is parsed explicitly and rejects unknown text', () => {
  assertInvalid({ ...validEnvironment(), CORS_ALLOW_ALL: 'sometimes' }, 'CORS_ALLOW_ALL');
  const config = validateRuntimeConfig({ ...validEnvironment('test'), CORS_ALLOW_ALL: 'off' });
  assert.equal(config.http.corsAllowAll, false);
});

test('production rejects placeholder or shared JWT secrets', () => {
  assertInvalid({
    ...validEnvironment(),
    JWT_SECRET: 'change_me_generate_64_bytes_hex_access_secret'
  }, 'JWT_SECRET');

  const shared = 'c'.repeat(64);
  assertInvalid({ ...validEnvironment(), JWT_SECRET: shared, JWT_REFRESH_SECRET: shared }, 'JWT_REFRESH_SECRET');
});

test('production rejects unsafe CORS origins', () => {
  assertInvalid({ ...validEnvironment(), CORS_ORIGIN: 'http://localhost:5000' }, 'CORS_ORIGIN');
  assertInvalid({ ...validEnvironment(), CORS_ORIGIN: 'https://erp.example.com/api' }, 'CORS_ORIGIN');
  assertInvalid({ ...validEnvironment(), CORS_ALLOW_ALL: 'true' }, 'CORS_ALLOW_ALL');
});

test('timeouts outside bounded operating range fail validation', () => {
  assertInvalid({ ...validEnvironment(), STARTUP_DB_TIMEOUT_MS: '999999999' }, 'STARTUP_DB_TIMEOUT_MS');
  assertInvalid({ ...validEnvironment(), EXPORT_JOB_TIMEOUT_MS: '0' }, 'EXPORT_JOB_TIMEOUT_MS');
});

test('development, test, staging and production-like configurations validate', () => {
  for (const nodeEnv of ['development', 'test', 'staging', 'production']) {
    const config = validateRuntimeConfig(validEnvironment(nodeEnv));
    assert.equal(config.app.nodeEnv, nodeEnv);
    assert.equal(config.database.mongoUri, 'mongodb://localhost:27017/mk_pro_test');
  }
});

test('background worker profile requires database but does not require HTTP secrets', () => {
  const config = validateRuntimeConfig({
    NODE_ENV: 'production',
    MONGO_URI: 'mongodb://localhost:27017/mk_pro_worker'
  }, { profile: 'worker' });
  assert.equal(config.database.mongoUri, 'mongodb://localhost:27017/mk_pro_worker');
});

test('public configuration summary never exposes secrets or Mongo URI', () => {
  const config = buildRuntimeConfig(validEnvironment());
  const serialized = JSON.stringify(publicConfigSummary(config));
  assert.doesNotMatch(serialized, /mongodb:\/\//);
  assert.doesNotMatch(serialized, /"accessSecret"|"refreshSecret"|JWT_SECRET/);
});

test('company profile preserves existing print defaults and allows environment override', () => {
  assert.deepEqual(getCompanyProfile({}), DEFAULT_COMPANY_PROFILE);
  assert.deepEqual(getCompanyProfile({
    PRINT_COMPANY_CODE: 'NPP-01',
    PRINT_COMPANY_NAME: 'Nhà phân phối kiểm thử',
    PRINT_COMPANY_ADDRESS: 'Địa chỉ kiểm thử',
    PRINT_COMPANY_PHONE: '0123456789',
    PRINT_COMPANY_TAX: '0101010101'
  }), {
    code: 'NPP-01',
    name: 'Nhà phân phối kiểm thử',
    address: 'Địa chỉ kiểm thử',
    phone: '0123456789',
    taxCode: '0101010101'
  });
});
