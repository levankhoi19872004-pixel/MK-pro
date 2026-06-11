'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

function tryRequire(moduleName) {
  try {
    return { value: require(moduleName) };
  } catch (err) {
    return { error: err };
  }
}

test('registerMobileRoutes throws when ctx is missing', (t) => {
  const expressResult = tryRequire('express');
  const routesResult = tryRequire('../src/routes/mobile');
  if (expressResult.error || routesResult.error) {
    t.skip('dependencies are not installed; run npm install before integration tests');
    return;
  }

  const app = expressResult.value();
  const { registerMobileRoutes } = routesResult.value;

  assert.throws(
    () => registerMobileRoutes(app),
    /Mobile routes require ctx/
  );
});

test('registerMobileRoutes mounts modular route tree with ctx', (t) => {
  const expressResult = tryRequire('express');
  const routesResult = tryRequire('../src/routes/mobile');
  if (expressResult.error || routesResult.error) {
    t.skip('dependencies are not installed; run npm install before integration tests');
    return;
  }

  const app = expressResult.value();

  const noop = (req, res, next) => next();
  const ctx = {
    authLimiter: noop,
    requireMobileLogin: noop,
    requireMobileRole: () => noop,
    validateRequest: noop,

    ROLE_LABELS: {},
    VALID_ROLES: ['sales', 'delivery'],
    ACCESS_TOKEN_EXPIRES_IN: '1d',

    normalizeText: (v) => String(v || '').trim().toLowerCase(),
    toNumber: Number,
    makeId: () => 'ID',
    stripMongoFields: (v) => v,

    buildJwtPayload: (v) => v,
    staffMongoToClient: (v) => v,

    encodeMobileToken: () => 'token',
    encodeMobileRefreshToken: () => 'refresh',
    decodeMobileRefreshToken: () => ({}),

    getPrimaryDataSnapshot: async () => ({}),
    persistPrimaryDataSnapshot: async () => {},
    saveOperationalData: async () => {},
    refreshOrderDocumentCacheFromMongo: async () => {},
    findCustomer: () => null,
    findProduct: () => null,
    writeMobileLog: () => {},
    formatCaseLooseQty: (v) => String(v),
    buildProductLineMeta: () => ({}),
    reduceStock: () => {},
    buildSalesCode: () => 'SO',
    buildCashCode: () => 'CB',
    updateSalesOrderWithRepost: (data, order, patch) => Object.assign(order, patch),
    buildMobileProduct: (v) => v
  };

  assert.doesNotThrow(() => routesResult.value.registerMobileRoutes(app, ctx));
});
