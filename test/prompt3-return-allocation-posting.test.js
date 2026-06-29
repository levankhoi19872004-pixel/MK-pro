'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

function loadArPostingService({ returnOrders = {}, postImpl } = {}) {
  const servicePath = path.join(ROOT, 'src/domain/posting/ArPostingService.js');
  const returnArPath = path.join(ROOT, 'src/services/accounting/returnArPostingService.js');
  const returnRepoPath = path.join(ROOT, 'src/repositories/returnOrderRepository.js');
  const paymentRepoPath = path.join(ROOT, 'src/repositories/paymentRepository.js');
  const postingEnginePath = path.join(ROOT, 'src/engines/posting.engine.js');

  for (const file of [servicePath, returnArPath, returnRepoPath, paymentRepoPath, postingEnginePath]) {
    delete require.cache[require.resolve(file)];
  }

  const calls = [];
  require.cache[require.resolve(returnArPath)] = {
    id: returnArPath,
    filename: returnArPath,
    loaded: true,
    exports: {
      postReturnOrderToAR: async (returnOrder, options) => {
        calls.push({ returnOrder, options });
        if (postImpl) return postImpl(returnOrder, options, calls);
        return {
          posted: true,
          reason: 'created_ar_return',
          entry: { id: `AR-RETURN-${returnOrder.id || returnOrder.code}`, code: `AR-RETURN-${returnOrder.code || returnOrder.id}` }
        };
      }
    }
  };
  require.cache[require.resolve(returnRepoPath)] = {
    id: returnRepoPath,
    filename: returnRepoPath,
    loaded: true,
    exports: {
      findByIdOrCode: async (key) => returnOrders[key] || null
    }
  };
  require.cache[require.resolve(paymentRepoPath)] = {
    id: paymentRepoPath,
    filename: paymentRepoPath,
    loaded: true,
    exports: { upsert: async (row) => row, findAll: async () => [] }
  };
  require.cache[require.resolve(postingEnginePath)] = {
    id: postingEnginePath,
    filename: postingEnginePath,
    loaded: true,
    exports: {
      postSalesOrderAR: async () => null,
      postReceiptAR: async () => null,
      postReturnOrderAR: async () => { throw new Error('postReturnAllocations must not call postingEngine.postReturnOrderAR'); },
      reverseReceiptAR: async () => null,
      reverseSalesOrderAR: async () => null,
      reverseReturnOrderAR: async () => null,
      postBonusAllowanceAR: async () => null
    }
  };

  const service = require(servicePath);
  return { service, calls };
}

test('3 allocations cùng returnOrder chỉ gọi returnArPostingService một lần', async () => {
  const { service, calls } = loadArPostingService();
  const result = await service.postReturnAllocations({
    id: 'RO1',
    code: 'RO-001',
    amount: 300,
    debtReduction: 300,
    accountingConfirmed: true,
    customerCode: 'C001',
    items: []
  }, [
    { orderId: 'SO1', amount: 100 },
    { orderId: 'SO2', amount: 100 },
    { orderId: 'SO3', amount: 100 }
  ], { returnResult: true });

  assert.equal(calls.length, 1);
  assert.equal(result.posted, 1);
  assert.equal(result.entries.length, 1);
  assert.equal(calls[0].returnOrder.id, 'RO1');
  assert.equal(calls[0].returnOrder.code, 'RO-001');
  assert.equal(calls[0].returnOrder.allocationDetails.length, 3);
  assert.equal(calls[0].returnOrder.metadata.allocationPostingMode, 'single_ar_return_per_return_order');
});

test('2 returnOrders khác nhau trong allocations tạo đúng 2 AR-RETURN theo returnOrder duy nhất', async () => {
  const { service, calls } = loadArPostingService({
    returnOrders: {
      RO1: { id: 'RO1', code: 'RO-001', amount: 100, debtReduction: 100, accountingConfirmed: true, customerCode: 'C001', items: [] },
      RO2: { id: 'RO2', code: 'RO-002', amount: 200, debtReduction: 200, accountingConfirmed: true, customerCode: 'C001', items: [] }
    }
  });

  const result = await service.postReturnAllocations({}, [
    { returnOrderId: 'RO1', orderId: 'SO1', amount: 50 },
    { returnOrderId: 'RO1', orderId: 'SO2', amount: 50 },
    { returnOrderId: 'RO2', orderId: 'SO3', amount: 200 }
  ], { returnResult: true });

  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map((row) => row.returnOrder.id).sort(), ['RO1', 'RO2']);
  assert.equal(result.posted, 2);
});

test('allocation thiếu returnOrderId và không có returnOrder gốc thì không tạo AR-RETURN', async () => {
  const { service, calls } = loadArPostingService();
  const result = await service.postReturnAllocations({}, [
    { orderId: 'SO1', amount: 100 }
  ], { returnResult: true });

  assert.equal(calls.length, 0);
  assert.equal(result.posted, 0);
  assert.equal(result.skipped, 1);
  assert.equal(result.results[0].reason, 'missing_return_order_id');
});

test('chạy lại allocation khi đã có AR-RETURN existing không sinh duplicate created entry', async () => {
  const postedKeys = new Set();
  const { service, calls } = loadArPostingService({
    postImpl: async (returnOrder) => {
      const key = returnOrder.id || returnOrder.code;
      if (postedKeys.has(key)) {
        return { posted: false, reason: 'active_ar_return_exists', entry: { id: `AR-RETURN-${key}` } };
      }
      postedKeys.add(key);
      return { posted: true, reason: 'created_ar_return', entry: { id: `AR-RETURN-${key}` } };
    }
  });

  const ro = { id: 'RO1', code: 'RO-001', amount: 300, debtReduction: 300, accountingConfirmed: true, customerCode: 'C001', items: [] };
  const allocations = [{ orderId: 'SO1', amount: 100 }, { orderId: 'SO2', amount: 200 }];
  const first = await service.postReturnAllocations(ro, allocations, { returnResult: true });
  const second = await service.postReturnAllocations(ro, allocations, { returnResult: true });

  assert.equal(calls.length, 2);
  assert.equal(first.posted, 1);
  assert.equal(second.posted, 0);
  assert.equal(second.results[0].reason, 'active_ar_return_exists');
});
