'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const canonicalReader = require('../src/services/delivery/deliveryTodayCanonicalOrderReader');
const CloseoutContextLoader = require('../src/services/accounting/closeout/CloseoutContextLoader');
const auditScript = require('../scripts/audit-delivery-today-master-metadata-binding');

function chain(rows) {
  return {
    select() { return this; },
    sort() { return this; },
    limit() { return this; },
    session() { return this; },
    lean: async () => rows
  };
}

function modelSet(rows, masters, counters = {}) {
  counters.orders = 0;
  counters.masters = 0;
  return {
    SalesOrder: {
      find() {
        counters.orders += 1;
        return chain(rows);
      }
    },
    MasterOrder: {
      find() {
        counters.masters += 1;
        return chain(masters);
      }
    }
  };
}

function enrich(order, masters) {
  const indexes = canonicalReader.buildMasterBindingIndexes(masters);
  return canonicalReader.enrichOrderWithMasterMetadata(order, canonicalReader.resolveMasterBindingForOrder(order, indexes));
}

test('Phase256B mixed merged and unmerged orders do not leak master metadata into B0039130', async () => {
  const counters = {};
  const models = modelSet([
    {
      id: 'SO-MERGED',
      code: 'B-MERGED',
      deliveryDate: '2026-07-08',
      salesStaffCode: '42162',
      mergeStatus: 'merged',
      masterOrderId: 'MO1',
      masterOrderCode: 'DT1',
      deliveryStaffCode: 'ghtp'
    },
    {
      id: 'SO1783644686092554',
      code: 'B0039130',
      deliveryDate: '2026-07-08',
      salesStaffCode: 'BANBUON',
      mergeStatus: 'unmerged',
      masterOrderId: '',
      masterOrderCode: ''
    }
  ], [
    {
      id: 'MO1',
      code: 'DT1',
      childOrderIds: ['SO-MERGED'],
      deliveryStaffCode: 'ghtp',
      deliveryStaffName: 'Hieu Giao Hang TP',
      status: 'assigned'
    }
  ], counters);

  const result = await canonicalReader.listSalesOrders({
    date: '2026-07-08',
    delivery: 'ghtp',
    deliveryStaffCode: 'ghtp',
    deliveryDateChangedByUser: '1'
  }, models);

  assert.deepEqual(result.orders.map((row) => row.orderCode), ['B-MERGED']);
  assert.equal(result.orders.some((row) => row.orderCode === 'B0039130'), false);
  assert.equal(result.diagnostics.masterMetadataAppliedCount, 1);
  assert.equal(result.diagnostics.masterMetadataUnboundCount, 1);
  assert.equal(result.diagnostics.queryCount, 2);
  assert.equal(counters.orders, 1);
  assert.equal(counters.masters, 1);
});

test('Phase256B direct master binding enriches only the directly linked order', () => {
  const masters = [{ id: 'MO1', code: 'DT1', deliveryStaffCode: 'ghtp', deliveryStaffName: 'GH TP', status: 'assigned' }];
  const linked = enrich({ id: 'SO-LEGACY', code: 'B-LEGACY', masterOrderId: 'MO1', deliveryStaffCode: '' }, masters);
  const unrelated = enrich({ id: 'SO-OTHER', code: 'B-OTHER', masterOrderId: '', deliveryStaffCode: '' }, masters);

  assert.equal(linked._masterOrdersMetadataApplied, true);
  assert.equal(linked.masterMetadataBindingSource, 'direct-order-link');
  assert.equal(linked.deliveryStaffCode, 'ghtp');
  assert.equal(unrelated._masterOrdersMetadataApplied, false);
  assert.equal(unrelated.deliveryStaffCode || '', '');
});

test('Phase256B canonical child reference binding enriches only the referenced child order', () => {
  const masters = [{ id: 'MO1', code: 'DT1', childOrderIds: ['SO-CHILD'], deliveryStaffCode: 'ghtp', status: 'assigned' }];
  const child = enrich({ id: 'SO-CHILD', code: 'B-CHILD', deliveryStaffCode: '' }, masters);
  const sibling = enrich({ id: 'SO-SIBLING', code: 'B-SIBLING', deliveryStaffCode: '' }, masters);

  assert.equal(child._masterOrdersMetadataApplied, true);
  assert.equal(child.masterMetadataBindingSource, 'canonical-child-reference');
  assert.equal(child.deliveryStaffCode, 'ghtp');
  assert.equal(sibling._masterOrdersMetadataApplied, false);
});

test('Phase256B unmerged unbound order keeps empty master and delivery fields', () => {
  const row = enrich({
    id: 'SO1783644686092554',
    code: 'B0039130',
    mergeStatus: 'unmerged',
    masterOrderId: '',
    masterOrderCode: '',
    deliveryStaffCode: ''
  }, [{ id: 'MO1', code: 'DT1', childOrderIds: ['SO-OTHER'], deliveryStaffCode: 'ghtp', status: 'assigned' }]);

  assert.equal(row._masterOrdersMetadataApplied, false);
  assert.equal(row.deliveryStaffCode || '', '');
  assert.equal(row.masterOrderId || '', '');
  assert.equal(row.masterOrderCode || '', '');
  assert.equal(row.deliveryAssignmentVerified, false);
});

test('Phase256B multiple orders and masters are isolated per order', () => {
  const masters = [
    { id: 'MO1', code: 'DT1', childOrderIds: ['SO1'], deliveryStaffCode: 'GH1', status: 'assigned' },
    { id: 'MO2', code: 'DT2', childOrderIds: ['SO2'], deliveryStaffCode: 'GH2', status: 'assigned' }
  ];
  const rows = [
    enrich({ id: 'SO1', code: 'B001', deliveryStaffCode: '' }, masters),
    enrich({ id: 'SO2', code: 'B002', deliveryStaffCode: '' }, masters),
    enrich({ id: 'SO3', code: 'B003', deliveryStaffCode: '' }, masters)
  ];

  assert.deepEqual(rows.map((row) => row.deliveryStaffCode || ''), ['GH1', 'GH2', '']);
  assert.deepEqual(rows.map((row) => row.masterOrderId || ''), ['MO1', 'MO2', '']);
});

test('Phase256B ambiguous child binding fails closed with diagnostic', () => {
  const row = enrich({ id: 'SO-DUP', code: 'B-DUP', deliveryStaffCode: '' }, [
    { id: 'MO1', code: 'DT1', childOrderIds: ['SO-DUP'], deliveryStaffCode: 'GH1', status: 'assigned' },
    { id: 'MO2', code: 'DT2', childOrderIds: ['SO-DUP'], deliveryStaffCode: 'GH2', status: 'assigned' }
  ]);

  assert.equal(row._masterOrdersMetadataApplied, false);
  assert.equal(row.deliveryStaffCode || '', '');
  assert.equal(row.masterMetadataBindingWarning, 'MASTER_ORDER_METADATA_BINDING_AMBIGUOUS');
});

test('Phase256B direct and child identity conflict fails closed', () => {
  const row = enrich({ id: 'SO-CONFLICT', code: 'B-CONFLICT', masterOrderId: 'MO1', deliveryStaffCode: '' }, [
    { id: 'MO1', code: 'DT1', deliveryStaffCode: 'GH1', status: 'assigned' },
    { id: 'MO2', code: 'DT2', childOrderIds: ['SO-CONFLICT'], deliveryStaffCode: 'GH2', status: 'assigned' }
  ]);

  assert.equal(row._masterOrdersMetadataApplied, false);
  assert.equal(row.masterMetadataBindingWarning, 'MASTER_ORDER_METADATA_IDENTITY_CONFLICT');
});

test('Phase256B inactive masters do not enrich delivery metadata', () => {
  for (const status of ['cancelled', 'void', 'deleted']) {
    const row = enrich({ id: 'SO-INACTIVE', code: `B-${status}`, deliveryStaffCode: '' }, [
      { id: `MO-${status}`, code: `DT-${status}`, childOrderIds: ['SO-INACTIVE'], deliveryStaffCode: 'ghtp', status }
    ]);
    assert.equal(row._masterOrdersMetadataApplied, false);
    assert.equal(row.deliveryStaffCode || '', '');
  }
});

test('Phase256B closeout scope guard rejects unmerged unbound order before writer stages', async () => {
  await assert.rejects(
    () => CloseoutContextLoader.assertCloseoutDeliveryScope(
      { deliveryStaffCode: 'ghtp' },
      [{ id: 'SO1783644686092554', code: 'B0039130', mergeStatus: 'unmerged', masterOrderId: '', masterOrderCode: '', deliveryStaffCode: '' }],
      { models: { MasterOrder: { find() { return chain([]); } } } }
    ),
    (err) => {
      assert.equal(err.status, 409);
      assert.equal(err.code, 'DELIVERY_CLOSEOUT_ORDER_SCOPE_MISMATCH');
      assert.equal(err.data.mismatchedOrders[0].orderCode, 'B0039130');
      assert.equal(err.data.mismatchedOrders[0].bindingSource, 'none');
      return true;
    }
  );
});

test('Phase256B closeout scope guard accepts canonical order delivery staff', async () => {
  const result = await CloseoutContextLoader.assertCloseoutDeliveryScope(
    { deliveryStaffCode: 'GHTP' },
    [{ id: 'SO-OK', code: 'B-OK', deliveryStaffCode: 'ghtp' }],
    { models: { MasterOrder: { find() { return chain([]); } } } }
  );

  assert.equal(result.checked, true);
  assert.equal(result.checkedOrders[0].bindingSource, 'orders');
});

test('Phase256B closeout guard is before returnOrders and writer idempotency preload', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/services/accounting/closeout/CloseoutContextLoader.js'), 'utf8');
  const guardIndex = source.indexOf('assertCloseoutDeliveryScope(command, pendingConfirmOrders, options)');
  const returnOrdersIndex = source.indexOf("withCloseoutAuditStage('context.returnOrders'");
  const preloadIndex = source.indexOf('context.writerIdempotency = await preloadWriterIdempotency');
  assert.ok(guardIndex > -1, 'delivery scope guard must be called');
  assert.ok(returnOrdersIndex > guardIndex, 'returnOrders loader must remain after guard');
  assert.ok(preloadIndex > guardIndex, 'writer idempotency preload must remain after guard');
});

test('Phase256B audit script reports verified binding and delivery filter decision read-only', async () => {
  const result = await auditScript.buildAudit({
    date: '2026-07-08',
    delivery: 'ghtp',
    orderCodes: ['B0039130']
  }, modelSet([
    {
      id: 'SO1783644686092554',
      code: 'B0039130',
      deliveryDate: '2026-07-08',
      mergeStatus: 'unmerged',
      masterOrderId: '',
      masterOrderCode: '',
      deliveryStaffCode: ''
    }
  ], [
    { id: 'MO1', code: 'DT1', childOrderIds: ['SO-MERGED'], deliveryStaffCode: 'ghtp', status: 'assigned' }
  ]));

  assert.equal(result.readOnly, true);
  assert.equal(result.rows[0].orderCode, 'B0039130');
  assert.equal(result.rows[0].bindingVerified, false);
  assert.equal(result.rows[0].wouldMatchDeliveryFilter, false);
});
