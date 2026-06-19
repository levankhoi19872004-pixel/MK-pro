'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const masterOrderRepository = require('../src/repositories/masterOrderRepository');
const orderRepository = require('../src/repositories/orderRepository');
const masterOrderQuery = require('../src/services/master-order/masterOrderQuery.impl');
const masterOrderService = require('../src/services/masterOrderService');
const excelService = require('../src/services/excel/ExcelInteractionService');

test('master order batch read preserves selected order and batches master/child queries', async () => {
  const originalFindMasters = masterOrderRepository.findManyByIdentityMatches;
  const originalFindChildren = orderRepository.findManyByIdentity;
  const masterBatches = [];
  const childBatches = [];
  const masters = {
    MO1: { id: 'MO1', code: 'DT001', childOrderIds: ['SO1'] },
    MO2: { id: 'MO2', code: 'DT002', childOrderIds: ['SO2'] }
  };
  const children = {
    SO1: { id: 'SO1', code: 'B001', status: 'pending', totalAmount: 100, items: [] },
    SO2: { id: 'SO2', code: 'B002', status: 'pending', totalAmount: 200, items: [] }
  };

  masterOrderRepository.findManyByIdentityMatches = async (ids) => {
    masterBatches.push([...ids]);
    return ids.filter((id) => masters[id]).map((id) => ({
      identityKeys: [masters[id].id, masters[id].code],
      masterOrder: masters[id]
    }));
  };
  orderRepository.findManyByIdentity = async (ids) => {
    childBatches.push([...ids]);
    return ids.map((id) => children[id]).filter(Boolean);
  };

  try {
    const result = await masterOrderQuery.getMasterOrders(['MO2', 'MO1', 'MISSING'], {
      batchSize: 1,
      childBatchSize: 1
    });
    assert.deepEqual(masterBatches, [['MO2'], ['MO1'], ['MISSING']]);
    assert.deepEqual(childBatches, [['SO2'], ['SO1']]);
    assert.deepEqual(result.map((row) => row.id), ['MO2', 'MO1']);
    assert.deepEqual(result.map((row) => row.children.map((child) => child.id)), [['SO2'], ['SO1']]);
    assert.deepEqual(result.map((row) => row.totalAmount), [200, 100]);
  } finally {
    masterOrderRepository.findManyByIdentityMatches = originalFindMasters;
    orderRepository.findManyByIdentity = originalFindChildren;
  }
});

test('Excel selected/page master load calls one batch service instead of per-id get', async () => {
  const originalBatch = masterOrderService.getMasterOrders;
  const originalSingle = masterOrderService.getMasterOrder;
  const calls = [];
  masterOrderService.getMasterOrders = async (ids, options) => {
    calls.push({ ids: [...ids], options: { ...options } });
    return ids.map((id) => ({ id, code: id, children: [] }));
  };
  masterOrderService.getMasterOrder = async () => {
    throw new Error('single-item query must not be used by batch export');
  };

  try {
    const result = await excelService._internal.loadMasterOrders({
      scope: 'SELECTED',
      selectedIds: ['MO2', 'MO1', 'MO2', '']
    });
    assert.deepEqual(result.map((row) => row.id), ['MO2', 'MO1']);
    assert.deepEqual(calls, [{
      ids: ['MO2', 'MO1'],
      options: { batchSize: 250, childBatchSize: 250 }
    }]);
  } finally {
    masterOrderService.getMasterOrders = originalBatch;
    masterOrderService.getMasterOrder = originalSingle;
  }
});

test('2,000 selected masters use bounded query batches instead of 4,000 per-id queries', async () => {
  const originalFindMasters = masterOrderRepository.findManyByIdentityMatches;
  const originalFindChildren = orderRepository.findManyByIdentity;
  let masterQueryCount = 0;
  let childQueryCount = 0;
  masterOrderRepository.findManyByIdentityMatches = async (ids) => {
    masterQueryCount += 1;
    return ids.map((id) => ({
      identityKeys: [id],
      masterOrder: { id, code: id, childOrderIds: [`SO${id.slice(2)}A`, `SO${id.slice(2)}B`] }
    }));
  };
  orderRepository.findManyByIdentity = async (ids) => {
    childQueryCount += 1;
    return ids.map((id) => ({ id, code: id, status: 'pending', totalAmount: 1, items: [] }));
  };

  try {
    const ids = Array.from({ length: 2000 }, (_, index) => `MO${index + 1}`);
    const result = await masterOrderQuery.getMasterOrders(ids, { batchSize: 250, childBatchSize: 250 });
    assert.equal(result.length, 2000);
    assert.equal(masterQueryCount, 8);
    assert.equal(childQueryCount, 16);
    assert.equal(masterQueryCount + childQueryCount, 24);
  } finally {
    masterOrderRepository.findManyByIdentityMatches = originalFindMasters;
    orderRepository.findManyByIdentity = originalFindChildren;
  }
});

test('Excel master export source has no unbounded per-id Promise.all', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/services/excel/ExcelInteractionService.js'), 'utf8');
  assert.doesNotMatch(source, /Promise\.all\(ids\.map\(\(id\)\s*=>\s*masterOrderService\.getMasterOrder/);
  assert.match(source, /masterOrderService\.getMasterOrders\(ids,\s*\{\s*batchSize:\s*250,\s*childBatchSize:\s*250\s*\}\)/);
});
