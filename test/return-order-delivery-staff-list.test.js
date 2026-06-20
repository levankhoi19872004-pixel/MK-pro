'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const legacy = require('../src/services/returnOrderLegacy.service');
const queryService = require('../src/services/return-order/ReturnOrderQueryService');
const {
  hydrateReturnOrderDeliveryStaff,
  normalizeReturnOrderDeliveryStaff
} = require('../src/services/return-order/ReturnOrderDeliveryStaffHydrator');

function noLinkedDocuments(overrides = {}) {
  return {
    findSalesOrders: async () => [],
    findMasterOrders: async () => [],
    findUsers: async () => [],
    ...overrides
  };
}

test('returnOrders có đủ NVGH được chuẩn hóa trực tiếp, không hydrate thêm', async () => {
  let queryCount = 0;
  const rows = await hydrateReturnOrderDeliveryStaff([{
    code: 'RO-1',
    deliveryStaffCode: 'ghkx',
    deliveryStaffName: 'Nguyễn Văn An'
  }], noLinkedDocuments({
    findSalesOrders: async () => { queryCount += 1; return []; },
    findMasterOrders: async () => { queryCount += 1; return []; },
    findUsers: async () => { queryCount += 1; return []; }
  }));

  assert.equal(queryCount, 0);
  assert.equal(rows[0].deliveryStaffCode, 'ghkx');
  assert.equal(rows[0].deliveryStaffName, 'Nguyễn Văn An');
  assert.equal(rows[0].deliveryStaffDisplay, 'ghkx - Nguyễn Văn An');
});

test('có mã NVGH nhưng thiếu tên thì hydrate theo mã bằng một batch user query', async () => {
  let userCalls = 0;
  let requestedCodes = [];
  const rows = await hydrateReturnOrderDeliveryStaff([
    { code: 'RO-1', deliveryStaffCode: 'ghkx' },
    { code: 'RO-2', deliveryStaffCode: 'ghkx' }
  ], noLinkedDocuments({
    findUsers: async (codes) => {
      userCalls += 1;
      requestedCodes = codes;
      return [{ code: 'ghkx', fullName: 'Nguyễn Văn An', role: 'delivery', isActive: true }];
    }
  }));

  assert.equal(userCalls, 1);
  assert.deepEqual(requestedCodes, ['ghkx']);
  assert.deepEqual(rows.map((row) => row.deliveryStaffDisplay), [
    'ghkx - Nguyễn Văn An',
    'ghkx - Nguyễn Văn An'
  ]);
});

test('returnOrders thiếu NVGH thì lấy theo batch từ salesOrder liên kết', async () => {
  let salesCalls = 0;
  let salesKeys = [];
  let userCalls = 0;
  const rows = await hydrateReturnOrderDeliveryStaff([{
    code: 'RO-SO-1',
    salesOrderId: 'SO-ID-1',
    salesOrderCode: 'SO-1',
    salesStaffCode: 'nvbh01',
    salesStaffName: 'Nhân viên bán hàng'
  }], noLinkedDocuments({
    findSalesOrders: async (keys) => {
      salesCalls += 1;
      salesKeys = keys;
      return [{
        id: 'SO-ID-1',
        code: 'SO-1',
        deliveryStaffCode: 'gh02',
        deliveryStaffName: 'Nguyễn Văn Giao'
      }];
    },
    findUsers: async () => { userCalls += 1; return []; }
  }));

  assert.equal(salesCalls, 1);
  assert.deepEqual(salesKeys.sort(), ['SO-1', 'SO-ID-1'].sort());
  assert.equal(userCalls, 0);
  assert.equal(rows[0].deliveryStaffDisplay, 'gh02 - Nguyễn Văn Giao');
  assert.notEqual(rows[0].deliveryStaffCode, rows[0].salesStaffCode);
});

test('masterOrder liên kết là nguồn gán NVGH ưu tiên trước salesOrder', async () => {
  const rows = await hydrateReturnOrderDeliveryStaff([{
    code: 'RO-MO-1',
    masterOrderId: 'MO-ID-1',
    masterOrderCode: 'MO-1',
    salesOrderCode: 'SO-1'
  }], noLinkedDocuments({
    findSalesOrders: async () => [{
      code: 'SO-1',
      deliveryStaffCode: 'gh-sales',
      deliveryStaffName: 'NVGH trên đơn con'
    }],
    findMasterOrders: async () => [{
      identityKeys: ['MO-ID-1', 'MO-1'],
      masterOrder: {
        id: 'MO-ID-1',
        code: 'MO-1',
        deliveryStaffCode: 'gh-master',
        deliveryStaffName: 'NVGH trên đơn tổng'
      }
    }]
  }));

  assert.equal(rows[0].deliveryStaffDisplay, 'gh-master - NVGH trên đơn tổng');
});

test('không dùng NVBH, staffCode/staffName hoặc người tạo phiếu làm NVGH', async () => {
  const rows = await hydrateReturnOrderDeliveryStaff([{
    code: 'RO-AUDIT',
    salesStaffCode: 'nvbh01',
    salesStaffName: 'NVBH A',
    staffCode: 'audit01',
    staffName: 'Người thao tác',
    createdBy: 'creator01'
  }], noLinkedDocuments());

  assert.equal(rows[0].deliveryStaffCode, '');
  assert.equal(rows[0].deliveryStaffName, '');
  assert.equal(rows[0].deliveryStaffDisplay, 'Chưa xác định');
});

test('alias lịch sử deliveryCode/deliveryName được đọc và trả về field chuẩn', async () => {
  const rows = await hydrateReturnOrderDeliveryStaff([{
    code: 'RO-ALIAS',
    deliveryCode: 'gh-old',
    deliveryName: 'Nhân viên cũ'
  }], noLinkedDocuments());

  assert.equal(rows[0].deliveryStaffCode, 'gh-old');
  assert.equal(rows[0].deliveryStaffName, 'Nhân viên cũ');
  assert.equal(rows[0].deliveryStaffDisplay, 'gh-old - Nhân viên cũ');
});

test('mã trực tiếp không bị ghép nhầm với tên của NVGH khác trên chứng từ liên kết', async () => {
  const rows = await hydrateReturnOrderDeliveryStaff([{
    code: 'RO-MISMATCH',
    deliveryStaffCode: 'gh-direct',
    salesOrderCode: 'SO-1'
  }], noLinkedDocuments({
    findSalesOrders: async () => [{
      code: 'SO-1',
      deliveryStaffCode: 'gh-other',
      deliveryStaffName: 'Người khác'
    }]
  }));

  assert.equal(rows[0].deliveryStaffCode, 'gh-direct');
  assert.equal(rows[0].deliveryStaffName, '');
  assert.equal(rows[0].deliveryStaffDisplay, 'gh-direct');
});

test('QueryService chuẩn hóa contract sau khi legacy list trả dữ liệu', async () => {
  const original = legacy.listReturnOrders;
  legacy.listReturnOrders = async () => [{
    code: 'RO-CONTRACT',
    deliveryCode: 'gh-contract',
    deliveryName: 'Nguyễn Văn Contract'
  }];
  try {
    const rows = await queryService.listReturnOrders({ page: 1, limit: 50 });
    assert.deepEqual(rows[0], {
      code: 'RO-CONTRACT',
      deliveryCode: 'gh-contract',
      deliveryName: 'Nguyễn Văn Contract',
      deliveryStaffCode: 'gh-contract',
      deliveryStaffName: 'Nguyễn Văn Contract',
      deliveryStaffDisplay: 'gh-contract - Nguyễn Văn Contract'
    });
  } finally {
    legacy.listReturnOrders = original;
  }
});

test('frontend hiển thị cột NVGH, fallback an toàn và không fallback sang NVBH', () => {
  const root = path.resolve(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'public/fragments/index/04-index-body.html'), 'utf8');
  const js = fs.readFileSync(path.join(root, 'public/js/app/debt/07b-return-orders.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'public/css/overrides/10-operational-01.css'), 'utf8');

  assert.match(html, /<th>Khách<\/th>\s*<th>NVGH<\/th>\s*<th>SL<\/th>/);
  assert.match(html, /id="returnOrderTable"><tr><td colspan="8">/);
  assert.match(js, /function returnOrderDeliveryStaff\(order=\{\}\)/);
  assert.match(js, /deliveryStaffDisplay/);
  assert.match(js, /Chưa xác định/);
  assert.match(js, /class="return-order-delivery-cell"/);
  assert.match(js, /<span>NVGH phụ trách<\/span>/);
  assert.doesNotMatch(js, /canonicalDeliveryStaffLabel\(order\)\|\|canonicalSalesStaffLabel\(order\)/);
  assert.match(css, /return-order-delivery-name/);
  assert.match(css, /text-overflow:ellipsis!important/);
  assert.match(css, /@media\(max-width:760px\)/);
});

test('normalize helper không sinh null, undefined hoặc object string', () => {
  const row = normalizeReturnOrderDeliveryStaff({ deliveryStaffCode: null, deliveryStaffName: undefined });
  assert.equal(row.deliveryStaffCode, '');
  assert.equal(row.deliveryStaffName, '');
  assert.equal(row.deliveryStaffDisplay, 'Chưa xác định');
  assert.doesNotMatch(JSON.stringify(row), /\[object Object\]/);
});
