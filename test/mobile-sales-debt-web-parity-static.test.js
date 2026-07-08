'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const adapter = require('../src/services/mobile/mobileDebtNewAdapter.service');

test('mobile debt mapper preserves DebtNewService customer debt parity', () => {
  const mapped = adapter.mapDebtNewResultToMobileDebtResponse({
    diagnostics: { source: 'debt-new-v2-ar-debt-read-model' },
    summary: {
      customerCount: 1,
      orderCount: 1,
      totalDebt: 3500785,
      totalDebit: 4920785,
      totalCredit: 1420000,
      pendingCollectedAmount: 0,
      availableDebtAmount: 3500785
    },
    customers: [{
      customerCode: '4501426',
      customerName: 'Anh Minh Hoa',
      salesStaffCode: '42162',
      salesStaffName: 'Lương Thị Lan',
      debt: 3500785,
      debit: 4920785,
      credit: 1420000,
      orderCount: 1,
      orders: [{
        orderCode: 'B003-DEBT',
        debt: 3500785,
        debit: 4920785,
        credit: 1420000,
        pendingCollectedAmount: 0,
        availableDebtAmount: 3500785,
        salesStaffCode: '42162'
      }]
    }]
  }, { query: { page: 1, limit: 30 } });

  assert.equal(mapped.source, 'mobile-debtnew-arledgers');
  assert.equal(mapped.ledgerCollection, 'arLedgers');
  assert.equal(mapped.items.length, 1);
  assert.equal(mapped.items[0].customerCode, '4501426');
  assert.equal(mapped.items[0].debtAmount, 3500785);
  assert.equal(mapped.items[0].availableDebtAmount, 3500785);
  assert.equal(mapped.items[0].orders[0].debtAmount, 3500785);
  assert.equal(mapped.summary.totalDebt, 3500785);
  assert.equal(mapped.summary.availableDebt, 3500785);
});

test('mobile debt mapper keeps submitted collection as pending, not official debt reduction', () => {
  const mapped = adapter.mapDebtNewResultToMobileDebtResponse({
    summary: {
      customerCount: 1,
      orderCount: 1,
      totalDebt: 3500785,
      pendingCollectedAmount: 1000000,
      availableDebtAmount: 2500785
    },
    customers: [{
      customerCode: '4501426',
      customerName: 'Anh Minh Hoa',
      debt: 3500785,
      pendingCollectedAmount: 1000000,
      availableDebtAmount: 2500785,
      orders: [{
        orderCode: 'B003-DEBT',
        debt: 3500785,
        pendingCollectedAmount: 1000000,
        availableDebtAmount: 2500785
      }]
    }]
  }, { query: { page: 1, limit: 30 } });

  assert.equal(mapped.items[0].debtAmount, 3500785);
  assert.equal(mapped.items[0].pendingCollectedAmount, 1000000);
  assert.equal(mapped.items[0].availableDebtAmount, 2500785);
  assert.equal(mapped.items[0].orders[0].pendingCollectedAmount, 1000000);
  assert.equal(mapped.items[0].orders[0].availableDebtAmount, 2500785);
});

test('mobile debt query builder scopes sales mobile user by exact NVBH code', () => {
  const scoped = adapter.buildMobileDebtNewQuery({
    query: { collectorType: 'sales', salesStaffCode: '99999', page: 2, limit: 10 },
    mobileUser: { role: 'sales', staffCode: '42162', fullName: 'Lương Thị Lan' }
  });

  assert.equal(scoped.salesStaffCode, '42162');
  assert.equal(scoped.collectorType, 'sales');
  assert.equal(scoped.status, 'open');
  assert.equal(scoped.ledgerLimit, 500);
  assert.equal(Object.prototype.hasOwnProperty.call(scoped, 'page'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(scoped, 'limit'), false);
});
