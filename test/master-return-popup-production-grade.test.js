'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => require('./helpers/sourceBundle.util').readSource(path.join(root, file));

function functionBlock(source, startName, nextName) {
  const start = source.indexOf(startName);
  const end = nextName ? source.indexOf(nextName, start + startName.length) : source.length;
  assert.ok(start >= 0, `Missing ${startName}`);
  assert.ok(end > start, `Missing boundary ${nextName}`);
  return source.slice(start, end);
}

test('popup keeps available, selected and checkbox state independent', () => {
  const source = read('public/js/app/debt/07d-master-return-orders.js');
  assert.match(source, /let availableReturnOrders = \[\]/);
  assert.match(source, /let selectedReturnOrders = \[\]/);
  assert.match(source, /checkedAvailableReturnIds/);
  assert.match(source, /checkedSelectedReturnIds/);
  assert.match(source, /selectedMasterReturnIdSet\(\)/);
  assert.match(source, /filter\(row=>!selectedIds\.has\(masterReturnOrderIdentity\(row\)\)\)/);
});

test('moving rows is frontend-only and validates one exact NVGH', () => {
  const source = read('public/js/app/debt/07d-master-return-orders.js');
  const move = functionBlock(source, 'function moveSelectedReturnOrdersToGrouped', 'function removeSelectedReturnOrdersFromGrouped');
  const remove = functionBlock(source, 'function removeSelectedReturnOrdersFromGrouped', 'function buildUnmergedReturnOrderParams');
  assert.doesNotMatch(move, /fetch\(/);
  assert.doesNotMatch(remove, /fetch\(/);
  assert.match(move, /masterReturnNormalizeCode\(masterReturnDeliveryCode\(row\)\)!==masterReturnNormalizeCode\(requiredCode\)/);
  assert.match(move, /selectedReturnOrders=dedupeMasterReturnRows/);
  assert.match(remove, /availableReturnOrders=dedupeMasterReturnRows/);
});

test('unmerged request uses server filters, request sequence and stable selected state', () => {
  const source = read('public/js/app/debt/07d-master-return-orders.js');
  const block = functionBlock(source, 'async function loadUnmergedReturnOrders', 'function renderMasterReturnOrders');
  assert.match(source, /params\.set\('deliveryStaffCode',deliveryStaffCode\)/);
  assert.match(source, /params\.set\('dateFrom',dateFrom\)/);
  assert.match(source, /params\.set\('dateTo',dateTo\)/);
  assert.match(block, /const requestSeq=\+\+unmergedReturnRequestSeq/);
  assert.match(block, /if\(requestSeq!==unmergedReturnRequestSeq\)return/);
  assert.doesNotMatch(block, /selectedReturnOrders=\[\]/);
});

test('submit is retired at runtime and never calls master-return write endpoint', () => {
  const source = read('public/js/app/debt/07d-master-return-orders.js');
  const block = functionBlock(source, 'async function submitMasterReturnOrder', 'async function editMasterReturnOrder');
  assert.match(block, /event\?\.preventDefault\?\.\(\)/);
  assert.match(block, /notifyMasterReturnRetired\('submit tạo đơn tổng trả'\)/);
  assert.doesNotMatch(block, /fetch\(/);
  assert.doesNotMatch(block, /\/api\/master-return-orders/);
  assert.doesNotMatch(block, /payload\.returnOrderIds|payload\.totalAmount|payload\.totalQuantity/);
});

test('backend list filters in Mongo, hydrates in batches and uses projection', () => {
  const source = read('src/services/masterReturnOrderService.js');
  const block = functionBlock(source, 'async function listUnmergedReturnOrders', 'async function listMasterReturnOrders');
  assert.match(block, /projection: unmergedReturnProjection\(\)/);
  assert.match(block, /hydrateReturnOrderDeliveryStaff\(rows\)/);
  assert.match(block, /exactCodeRegex\(deliveryCode\)/);
  assert.match(block, /deliveryStaffCode: rx/);
  assert.match(block, /limit: requestedLimit/);
});

test('backend enforces one NVGH, duplicate request guard and optimistic claim', () => {
  const source = read('src/services/masterReturnOrderService.js');
  const block = functionBlock(source, 'async function createMasterReturnOrder', 'async function updateMasterReturnOrder');
  assert.match(block, /Danh sách phiếu trả hàng có ID trùng/);
  assert.match(block, /distinctChildCodes\.length !== 1/);
  assert.match(block, /NVGH trên form/);
  assert.match(block, /children\.map\(returnOrderIdentityClause\)/);
  assert.match(source, /updatedAt: row\.updatedAt/);
  assert.match(block, /withMongoTransaction/);
  assert.match(block, /claimedCount !== children\.length/);
  assert.match(block, /maxCodeAttempts = 3/);
  assert.match(block, /isDuplicateKeyError/);
});

test('creating a master return never overwrites child NVGH fields', () => {
  const source = read('src/services/masterReturnOrderService.js');
  const block = functionBlock(source, 'async function createMasterReturnOrder', 'async function updateMasterReturnOrder');
  const setBlock = block.slice(block.indexOf('$set:'), block.indexOf('stateChangedAt'));
  assert.doesNotMatch(setBlock, /deliveryStaffCode|deliveryStaffName|deliveryStaffId/);
});

test('master return list hydrates children with one batch query instead of N+1', () => {
  const source = read('src/services/masterReturnOrderService.js');
  const batch = functionBlock(source, 'async function getChildrenForMasterRows', 'async function listUnmergedReturnOrders');
  const list = functionBlock(source, 'async function listMasterReturnOrders', 'async function getMasterReturnOrder');
  assert.match(batch, /returnOrderRepository\.findAll/);
  assert.match(batch, /childByIdentity = new Map/);
  assert.match(list, /return getChildrenForMasterRows\(rows\)/);
  assert.doesNotMatch(list, /for \(const row of rows\)/);
});
