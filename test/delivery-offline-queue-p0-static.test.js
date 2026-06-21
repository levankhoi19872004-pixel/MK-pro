'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const OFFLINE_MESSAGE = 'Mất kết nối. Vui lòng thử lại khi có mạng. Giao dịch chưa được ghi nhận.';

function methodBlock(source, methodName, nextMethodName) {
  const start = source.indexOf(`async ${methodName}(`);
  assert.notEqual(start, -1, `${methodName} must exist`);
  const end = nextMethodName ? source.indexOf(`\n    async ${nextMethodName}(`, start + 1) : -1;
  return source.slice(start, end === -1 ? source.length : end);
}

test('mobile delivery offline queue defaults are fail-closed in env/runtime config', () => {
  const envExample = read('.env.example');
  const prodExample = read('.env.production.example');
  const config = read('public/mobile/js/config.js');
  const featureFlags = read('src/config/featureFlags.js');

  assert.match(envExample, /ENABLE_MOBILE_OFFLINE_SYNC=false/);
  assert.match(envExample, /ENABLE_MOBILE_OFFLINE_QUEUE=false/);
  assert.match(prodExample, /ENABLE_MOBILE_OFFLINE_SYNC=false/);
  assert.match(prodExample, /ENABLE_MOBILE_OFFLINE_QUEUE=false/);
  const runtimeService = read('src/services/mobile/runtimeConfig.service.js');
  assert.match(config, /offlineQueueEnabled:\s*false/);
  assert.match(featureFlags, /mobileOfflineSync:\s*\(\)\s*=>\s*readBoolean\('ENABLE_MOBILE_OFFLINE_SYNC', false\)/);
  assert.match(featureFlags, /mobileOfflineQueue:\s*\(\)\s*=>\s*readBoolean\('ENABLE_MOBILE_OFFLINE_QUEUE', false\)/);
  assert.match(runtimeService, /FLAGS\.mobileOfflineSync\(\)\s*&&\s*FLAGS\.mobileOfflineQueue\(\)/);
});

test('saveReturn and savePayment do not queue delivery transactions when offline', () => {
  const deliveryCore = read('public/js/delivery/delivery-core.js');
  const saveReturn = methodBlock(deliveryCore, 'saveReturn', 'savePayment');
  const savePayment = methodBlock(deliveryCore, 'savePayment', 'loadReconciliation');

  for (const block of [saveReturn, savePayment]) {
    assert.match(block, new RegExp(OFFLINE_MESSAGE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(block, /DELIVERY_OFFLINE_TRANSACTION_NOT_RECORDED/);
    assert.doesNotMatch(block, /queueOperation\s*\(/);
    assert.doesNotMatch(block, /offlineQueued:\s*true/);
    assert.doesNotMatch(block, /sẽ tự đồng bộ khi có mạng/);
  }
});

test('browser offline sync refuses financial and stock-affecting queue operations', () => {
  const offlineSync = read('public/mobile/js/offline-sync.js');
  assert.match(offlineSync, /FINANCIAL_OR_STOCK_OPERATION_TYPES/);
  for (const type of ['debt_collection_submit', 'delivery_return_save', 'delivery_payment_save', 'delivery_confirm']) {
    assert.match(offlineSync, new RegExp(`'${type}'`));
  }
  assert.match(offlineSync, /isFinancialOrStockOperation\(type\)/);
  assert.match(offlineSync, /OFFLINE_FINANCIAL_STOCK_QUEUE_DISABLED/);
  assert.match(offlineSync, new RegExp(OFFLINE_MESSAGE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('server legacy sync drain cannot post queued delivery money or return transactions', () => {
  const syncService = read('src/services/mobile/MobileSyncService.js');
  assert.match(syncService, /FINANCIAL_OR_STOCK_OFFLINE_OPERATION_TYPES/);
  assert.match(syncService, /assertOfflineOperationAllowed\(operationType\)/);
  assert.match(syncService, /MOBILE_OFFLINE_FINANCIAL_STOCK_QUEUE_DISABLED/);
  assert.ok(syncService.includes(OFFLINE_MESSAGE));
  for (const type of ['debt_collection_submit', 'delivery_return_save', 'delivery_payment_save', 'delivery_confirm']) {
    assert.match(syncService, new RegExp(`'${type}'`));
  }
  assert.match(syncService, /isFinancialOrStockOfflineOperation/);
});

test('deployment documentation warns not to enable mobile offline queue in production', () => {
  const envDoc = read('ENVIRONMENT_VARIABLES.md');
  const deploy = read('DEPLOYMENT_CHECKLIST.md');
  const mobileDeploy = read('MOBILE_PRODUCTION_DEPLOYMENT_CHECKLIST.md');
  for (const doc of [envDoc, deploy, mobileDeploy]) {
    assert.match(doc, /ENABLE_MOBILE_OFFLINE_SYNC/);
    assert.match(doc, /ENABLE_MOBILE_OFFLINE_QUEUE/);
    assert.match(doc, /false/);
    assert.match(doc, /đối soát|reconciliation/i);
  }
  assert.match(mobileDeploy, new RegExp(OFFLINE_MESSAGE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});
