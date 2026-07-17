'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const {
  resolveDeliveryAccountingLockState,
  resolveReturnWarehouseLockState,
  assertReturnMutationAllowed
} = require('../src/domain/returns/ReturnMutationGuard');

test('Phase260B accounting lock resolver blocks return mutation after closeout confirmation', () => {
  const lock = resolveDeliveryAccountingLockState({
    order: {
      id: 'SO1',
      code: 'B001',
      accountingConfirmed: true,
      accountingStatus: 'confirmed',
      accountingConfirmedAt: '2026-07-15T10:00:00.000Z',
      accountingConfirmedBy: 'acc'
    },
    latestCloseoutVersion: { id: 'DCOV1', status: 'corrected_confirmed' }
  });
  assert.equal(lock.locked, true);
  assert.equal(lock.accountingConfirmed, true);
  assert.equal(lock.closeoutStatus, 'corrected_confirmed');

  assert.throws(() => assertReturnMutationAllowed({
    order: { id: 'SO1', code: 'B001', accountingConfirmed: true },
    returnOrder: { id: 'RO1', code: 'RO-B001' },
    source: 'test',
    operation: 'delivery_save_return'
  }), (error) => {
    assert.equal(error.status, 409);
    assert.equal(error.code, 'DELIVERY_RETURN_LOCKED_AFTER_ACCOUNTING_CLOSEOUT');
    assert.equal(error.data.code, 'DELIVERY_RETURN_LOCKED_AFTER_ACCOUNTING_CLOSEOUT');
    assert.equal(error.data.orderId, 'SO1');
    assert.equal(error.data.returnOrderCode, 'RO-B001');
    return true;
  });
});

test('Phase260B warehouse verification lock blocks direct return item mutation', () => {
  const warehouseLock = resolveReturnWarehouseLockState({
    id: 'RO2',
    code: 'RO-B002',
    warehouseCheckStatus: 'matched',
    stockInStatus: 'ready_to_stock_in'
  });
  assert.equal(warehouseLock.locked, true);

  assert.throws(() => assertReturnMutationAllowed({
    order: { id: 'SO2', code: 'B002' },
    returnOrder: { id: 'RO2', code: 'RO-B002', warehouseCheckStatus: 'matched', stockInStatus: 'ready_to_stock_in' },
    source: 'test',
    operation: 'update_return_items'
  }), /Phiếu trả đã được thủ kho kiểm/);
});

test('Phase260B DeliveryEngine deep guard is before createPendingReturn write', () => {
  const source = read('src/engines/delivery.legacy.engine.source/part-02.jsfrag');
  const guardIndex = source.indexOf('assertEngineReturnMutationAllowed(this, order, body, options, returnMatchesOrder)');
  const writeIndex = source.indexOf('createPendingReturn(patch');
  assert.ok(guardIndex > 0, 'DeliveryEngine.saveReturn must call assertEngineReturnMutationAllowed');
  assert.ok(writeIndex > guardIndex, 'guard must run before createPendingReturn');
  assert.match(read('src/services/returns/DeliveryReturnMutationGuard.js'), /assertReturnMutationAllowed\(\{/);
});

test('Phase260B return legacy service guards direct upsert and cancel paths', () => {
  const part02 = read('src/services/returnOrderLegacy.service.source/part-02.jsfrag');
  const part03 = read('src/services/returnOrderLegacy.service.source/part-03.jsfrag');
  for (const marker of [
    "guardLegacyReturnWrite(salesOrder, existing || returnOrder, {}, 'c')",
    "guardLegacyReturnWrite(salesOrder, existing || {}, options, 'l')",
    "guardLegacyReturnWrite(salesOrder, existing || returnOrder, options, pendingQty > 0 ? 'c' : 'z')"
  ]) assert.match(part02, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  for (const marker of [
    'guardLegacyReturnWrite(order, existing',
    'guardLegacyReturnWrite(salesOrder, current',
    'guardLegacyReturnWrite({}, current'
  ]) assert.match(part03, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  const guard = read('src/services/returns/ReturnOrderLegacyMutationGuard.js');
  assert.match(guard, /c: 'create_return'/);
  assert.match(guard, /l: 'legacy_delivery_save_return'/);
  assert.match(guard, /z: 'clear_return'/);
  assert.match(guard, /assertReturnMutationAllowed/);
});

test('Phase260B closeout correction rejects post-closeout return aliases before adjustment apply', () => {
  const source = read('src/services/deliveryCloseoutCorrection.service.js');
  assert.match(source, /correctedReturnedItems/);
  assert.match(source, /returnedItems/);
  const guardIndex = source.indexOf('hasPostCloseoutReturnMutationPayload(input, returnAdjustmentItems)');
  const applyIndex = source.indexOf('applyReturnOrderAdjustment({', guardIndex);
  assert.ok(guardIndex > 0, 'post-closeout return payload guard must exist');
  assert.ok(applyIndex > guardIndex, 'guard must happen before applyReturnOrderAdjustment');
  assert.match(source, /materialReturnItems\.length/);
  assert.match(source, /payment_only_correction/);
});

test('Phase260B controlled correction request route is role-gated and non-mutating', () => {
  const route = read('src/routes/newOperationsRoutes.js');
  const service = read('src/services/returns/ReturnCorrectionRequestService.js');
  assert.match(route, /delivery-today\/returns\/:returnOrderId\/correction-requests/);
  assert.match(route, /requireAuth, writeRoles/);
  assert.match(service, /STALE_RETURN_CORRECTION_REQUEST/);
  assert.match(service, /function canonicalize\(value\)/);
  assert.doesNotMatch(service, /JSON\.stringify\(value \|\| \{\}, Object\.keys/);
  assert.match(service, /immutableSourceReturnOrder: true/);
  assert.match(service, /createdFromCorrection: true/);
  assert.match(service, /previousVersionId/);
  assert.match(service, /warehouseCheckStatus: 'pending'/);
});

test('Phase260B desktop popup omits return fields when the order is locked', () => {
  const source = read('public/js/app/new/91-delivery-today-new.js');
  assert.match(source, /function isReturnMutationLocked\(row\)/);
  assert.match(source, /if \(returnLocked\) \{/);
  assert.match(source, /payload\.correctedReturnItems = correctedReturnItems/);
  assert.match(source, /if \(!returnLocked\) \{/);
  assert.match(source, /body: JSON\.stringify\(payload\)/);
});

test('Phase260B offline delivery_return_save remains disabled and 409 maps to conflict', () => {
  const source = read('src/services/mobile/MobileSyncService.js');
  assert.match(source, /'delivery_return_save'/);
  assert.match(source, /MOBILE_OFFLINE_FINANCIAL_STOCK_QUEUE_DISABLED/);
  assert.match(source, /const status = error\.status === 409 \? 'conflict' : 'failed'/);
});

test('Phase260B audit and planner scripts are read-only by contract', () => {
  const audit = read('scripts/audit-post-closeout-return-mutations.js');
  const plan = read('scripts/plan-post-closeout-return-repair.js');
  assert.match(audit, /mode: 'read_only'/);
  assert.match(audit, /RETURN_CLOSEOUT_SNAPSHOT_MISMATCH/);
  assert.doesNotMatch(audit, /\.updateOne\(/);
  assert.doesNotMatch(audit, /deleteOne/);
  assert.match(plan, /mode: 'read_only_plan'/);
  assert.match(plan, /REVERSAL_REQUIRED/);
  assert.match(plan, /NO_AUTO_REPAIR/);
});
