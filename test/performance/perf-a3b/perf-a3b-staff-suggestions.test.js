'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const searchServicePath = require.resolve('../../../src/services/searchService');
require.cache[searchServicePath] = {
  id: searchServicePath,
  filename: searchServicePath,
  loaded: true,
  exports: {
    async searchStaffs(query = {}) {
      const role = String(query.role || '');
      return role === 'delivery'
        ? [
          { code: 'D01', staffCode: 'D01', deliveryStaffCode: 'D01', name: 'Đỗ Văn Giao', deliveryStaffName: 'Đỗ Văn Giao' },
          { code: 'D02', staffCode: 'D02', deliveryStaffCode: 'D02', name: 'Nguyễn Giao Hai', deliveryStaffName: 'Nguyễn Giao Hai' }
        ]
        : [
          { code: 'S01', staffCode: 'S01', salesStaffCode: 'S01', name: 'Nguyễn Văn Bán', salesStaffName: 'Nguyễn Văn Bán' },
          { code: 'S02', staffCode: 'S02', salesStaffCode: 'S02', name: 'Trần Bán Hai', salesStaffName: 'Trần Bán Hai' }
        ];
    }
  }
};
const returnGuardPath = require.resolve('../../../src/domain/returns/ReturnMutationGuard');
require.cache[returnGuardPath] = {
  id: returnGuardPath,
  filename: returnGuardPath,
  loaded: true,
  exports: { RETURN_ORDER_LOCK_PROJECTION: '', resolveDeliveryAccountingLockState: () => ({ locked: false, warnings: [] }) }
};

const deliveryService = require('../../../src/services/v2/deliveryTodayNew.service');

test('normalized NVGH code and diacritic-free name search are bounded without user-input regex', async () => {
  const byCode = await deliveryService.suggestions({ type: 'delivery', q: 'D01', limit: 50 }, { suggestionsSearchV1: true });
  const byName = await deliveryService.suggestions({ type: 'delivery', q: 'do van', limit: 50 }, { suggestionsSearchV1: true });
  assert.equal(byCode.items[0].code, 'D01');
  assert.equal(byName.items[0].code, 'D01');
  assert.equal(byCode.diagnostics.candidateLimit, 50);
  assert.match(byCode.diagnostics.regexPolicy, /no user-input regex/);
});

test('normalized NVBH code search keeps canonical business code', async () => {
  const result = await deliveryService.suggestions({ type: 'salesman', q: 'S01', limit: 50 }, { suggestionsSearchV1: true });
  assert.equal(result.items[0].code, 'S01');
  assert.equal(result.items[0].salesStaffCode, 'S01');
  assert.equal(result.diagnostics.featureFlagEnabled, true);
});
