'use strict';

const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const ROUTE_FILE = path.join(ROOT, 'src/routes/newOperationsRoutes.js');

function serviceStub() {
  return new Proxy({}, {
    get(target, prop) {
      if (!(prop in target)) target[prop] = async () => ({ success: true, ok: true, items: [], rows: [] });
      return target[prop];
    }
  });
}

function loadRoutes({ commitOneAdjustment }) {
  const registrations = [];
  const router = {};
  for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
    router[method] = (routePath, ...handlers) => {
      registrations.push({ method, path: routePath, handlers });
      return router;
    };
  }

  const requireAuth = function requireAuth(req, res, next) { return next && next(); };
  requireAuth.__kind = 'requireAuth';
  const requireRole = (roles) => {
    const middleware = function requireRoleMiddleware(req, res, next) { return next && next(); };
    middleware.__kind = 'requireRole';
    middleware.__roles = [...roles];
    return middleware;
  };

  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'express') return { Router: () => router };
    if (request.endsWith('/middlewares/auth.middleware') || request === '../middlewares/auth.middleware') {
      return { requireAuth, requireRole };
    }
    if (request === '../services/delivery/DeliveryAdjustmentCommitService') {
      return { commitOneAdjustment };
    }
    if (request === '../observability/closeoutQueryAudit') {
      return { withCloseoutAuditRequest: (req, res, work) => work() };
    }
    if (request === '../services/source-contracts/SourceNoteBuilder') {
      return { buildSourceNote: () => ({ source: 'test' }) };
    }
    if (request.startsWith('../services/')) return serviceStub();
    return originalLoad(request, parent, isMain);
  };

  try {
    delete require.cache[require.resolve(ROUTE_FILE)];
    require(ROUTE_FILE);
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve(ROUTE_FILE)];
  }
  return registrations;
}

function responseHarness() {
  const state = { statusCode: 200, body: null };
  return {
    state,
    res: {
      status(code) { state.statusCode = code; return this; },
      json(body) { state.body = body; return body; }
    }
  };
}

test('A4 correction route keeps admin/manager/accountant authorization and excludes sales/delivery roles', () => {
  const routes = loadRoutes({ commitOneAdjustment: async () => ({ success: true }) });
  const route = routes.find((row) => row.method === 'post' && row.path === '/delivery-today/closeouts/:id/corrections');
  assert.ok(route, 'correction route must exist');
  assert.equal(route.handlers[0].__kind, 'requireAuth');
  assert.equal(route.handlers[1].__kind, 'requireRole');
  assert.deepEqual(route.handlers[1].__roles, ['admin', 'manager', 'accountant']);
  assert.equal(route.handlers[1].__roles.includes('sales'), false);
  assert.equal(route.handlers[1].__roles.includes('delivery'), false);
  assert.equal(route.handlers[1].__roles.includes('warehouse'), false);
});

test('A4 B0040961 minimal PAYMENT_ONLY request reaches the correction command and returns HTTP 200', async () => {
  let captured = null;
  const routes = loadRoutes({
    commitOneAdjustment: async (input, options) => {
      captured = { input, options };
      const body = input.passthroughInput;
      assert.equal(body.orderCode, 'B0040961');
      assert.equal(body.originalCloseoutId, 'SO-B0040961');
      assert.equal(body.changeType, 'PAYMENT_ONLY');
      assert.deepEqual(body.paymentCorrection, {
        correctedCashAmount: 0,
        correctedBankAmount: 0,
        correctedRewardAmount: 0
      });
      assert.equal(body.returnAdjustmentAmount, undefined);
      assert.equal(body.returnAdjustmentItems, undefined);
      return {
        success: true,
        message: 'Đã cập nhật trạng thái tiền trước chốt sổ; không thay đổi hàng trả và chưa sinh AR ledger.',
        correction: {
          orderCode: 'B0040961',
          changeType: 'PAYMENT_ONLY',
          cashDeltaAmount: -1932000,
          returnAdjustmentAmount: 0,
          newDebtAmount: 0,
          metadata: { doesNotPostArReceipt: true }
        },
        returnOrderAdjustment: { returnUpdated: false, skipped: true, reason: 'payment_only_command' },
        returnUpdated: false,
        arDebtAdjustmentLedger: null
      };
    }
  });
  const route = routes.find((row) => row.method === 'post' && row.path === '/delivery-today/closeouts/:id/corrections');
  const handler = route.handlers.at(-1);
  const { state, res } = responseHarness();
  const req = {
    params: { id: 'SO-B0040961' },
    body: {
      orderCode: 'B0040961',
      changeType: 'PAYMENT_ONLY',
      expectedVersion: '7',
      paymentCorrection: {
        correctedCashAmount: 0,
        correctedBankAmount: 0,
        correctedRewardAmount: 0
      },
      reason: '',
      note: 'A4 acceptance verification'
    },
    user: { username: 'accountant-test', role: 'accountant' }
  };

  await handler(req, res);

  assert.ok(captured);
  assert.equal(captured.options.actor, 'accountant-test');
  assert.equal(state.statusCode, 200);
  assert.equal(state.body.ok, true);
  assert.equal(state.body.success, true);
  assert.equal(state.body.correction.cashDeltaAmount, -1932000);
  assert.equal(state.body.correction.returnAdjustmentAmount, 0);
  assert.equal(state.body.correction.newDebtAmount, 0);
  assert.equal(state.body.returnUpdated, false);
  assert.equal(state.body.arDebtAdjustmentLedger, null);
  assert.equal(state.body.canonicalRoute, '/api/new/delivery-today/closeouts/:id/corrections');
});
