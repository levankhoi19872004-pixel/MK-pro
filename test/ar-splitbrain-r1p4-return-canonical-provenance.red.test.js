'use strict';

const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request.endsWith('/repositories/paymentRepository') || request === '../../repositories/paymentRepository') {
    return { findAll: async () => [], upsert: async (entry) => entry };
  }
  if (request.endsWith('/repositories/returnOrderRepository') || request === '../../repositories/returnOrderRepository') {
    return { findByIdOrCode: async () => null, upsert: async (entry) => entry };
  }
  if (request.endsWith('/services/auditService') || request === '../auditService') return { record: async (row) => row };
  if (request.endsWith('/utils/date.util') || request === '../../utils/date.util') {
    return {
      nowIso: () => '2026-08-10T00:00:00.000Z',
      todayVN: () => '2026-08-10',
      toDateOnly: (value) => String(value || '2026-08-10').slice(0, 10)
    };
  }
  if (request.endsWith('/utils/common.util') || request === '../../utils/common.util') {
    return { toNumber: (value) => Number(value || 0), makeId: (prefix) => `${prefix}-R1P4` };
  }
  if (request.endsWith('/domain/staff/staffIdentity') || request === '../../domain/staff/staffIdentity') {
    return {
      pickSalesStaffCode: (row = {}) => row.salesStaffCode || row.salesmanCode || '',
      pickSalesStaffName: (row = {}) => row.salesStaffName || row.salesmanName || '',
      pickDeliveryStaffCode: (row = {}) => row.deliveryStaffCode || '',
      pickDeliveryStaffName: (row = {}) => row.deliveryStaffName || ''
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const returnArPostingService = require('../src/services/accounting/returnArPostingService');
Module._load = originalLoad;
const { canProjectCanonicalAccountingLedgerToDebtReadModel, validateArLedgerContract } = require('../src/domain/ar/arLedgerValidator');

test('R1.4 RED: actual AR-RETURN writer output must be canonical Debt New projectable', () => {
  const entry = returnArPostingService.buildReturnARLedgerEntry({
    id: 'RO-R1P4-1',
    code: 'RO-R1P4-1',
    sourceModel: 'returnOrders',
    sourceType: 'returnOrder',
    customerId: 'C-R1P4',
    customerCode: 'C-R1P4',
    customerName: 'Khach R1P4',
    salesOrderId: 'SO-R1P4',
    salesOrderCode: 'B-R1P4',
    amount: 2000000,
    accountingConfirmed: true,
    accountingStatus: 'confirmed',
    status: 'accounting_confirmed'
  }, { audit: false });

  assert.equal(entry.category, 'AR-RETURN');
  assert.equal(entry.sourceType, 'returnOrder', 'preserve writer sourceType compatibility');
  assert.equal(entry.entryType, 'normal');
  assert.equal(entry.active, true);
  assert.equal(entry.reversed, false);

  const validation = validateArLedgerContract(entry);
  assert.equal(validation.ok, true, JSON.stringify(validation.errors));
  assert.equal(canProjectCanonicalAccountingLedgerToDebtReadModel(entry), true,
    'AR-RETURN emitted by actual writer must participate in canonical AR/Debt New');
});
