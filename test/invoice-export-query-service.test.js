'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const service = require('../src/services/invoiceExportQuery.service');

test('export filters validate date format and range while supporting one-sided ranges', () => {
  assert.deepEqual(
    service.normalizeExportQuery({ dateFrom: '2026-06-01', salesStaffCode: '35128' }, { invoiceGroup: 'ALL' }),
    { dateFrom: '2026-06-01', dateTo: '', salesStaffCode: '35128', deliveryStaffCode: '', customerCode: '', invoiceGroup: 'ALL', limit: 20000, summaryBy: '' }
  );
  assert.equal(service.normalizeExportQuery({ dateTo: '2026-06-30' }, { invoiceGroup: 'VAT' }).dateTo, '2026-06-30');
  assert.throws(
    () => service.normalizeExportQuery({ dateFrom: '2026-06-30', dateTo: '2026-06-01' }, { invoiceGroup: 'ALL' }),
    (error) => error.code === 'INVALID_EXPORT_DATE_RANGE' && error.statusCode === 400
  );
  assert.throws(
    () => service.normalizeExportQuery({ dateFrom: '{$ne:null}' }, { invoiceGroup: 'ALL' }),
    (error) => error.code === 'INVALID_EXPORT_DATE'
  );
});

test('business date filter prioritizes orderDate and only falls back when the preferred field is missing', () => {
  const filters = service.normalizeExportQuery({ dateFrom: '2026-06-01', dateTo: '2026-06-30' }, { invoiceGroup: 'ALL' });
  const clause = service.buildBusinessDateMongoClause(filters);
  const text = JSON.stringify(clause);
  assert.match(text, /orderDate/);
  assert.match(text, /documentDate/);
  assert.match(text, /createdAt/);
  assert.match(text, /2026-05-31T17:00:00\.000Z/);
  assert.match(text, /2026-06-30T16:59:59\.999Z/);

  assert.equal(service.matchesInvoiceExportFilters({ orderDate: '2026-05-31', createdAt: '2026-06-15T00:00:00.000Z' }, { dateFrom: '2026-06-01' }, { invoiceGroup: 'ALL' }), false);
  assert.equal(service.matchesInvoiceExportFilters({ orderDate: '', createdAt: '2026-06-15T00:00:00.000Z' }, { dateFrom: '2026-06-01', dateTo: '2026-06-30' }, { invoiceGroup: 'ALL' }), true);
});

test('sales staff filter matches canonical code first and legacy code aliases only when canonical code is missing', () => {
  const clause = service.buildSalesStaffMongoClause('35128');
  const text = JSON.stringify(clause);
  assert.match(text, /salesStaffCode/);
  assert.match(text, /salesPersonCode/);
  assert.match(text, /salesmanCode/);
  assert.match(text, /nvbhCode/);
  assert.doesNotMatch(text, /salesStaffName|salesmanName|staffCode|staffName/);

  assert.equal(service.matchesInvoiceExportFilters({ salesStaffCode: '35128', salesmanCode: 'OLD' }, { salesStaffCode: '35128' }, { invoiceGroup: 'ALL' }), true);
  assert.equal(service.matchesInvoiceExportFilters({ salesStaffCode: 'OTHER', salesmanCode: '35128' }, { salesStaffCode: '35128' }, { invoiceGroup: 'ALL' }), false);
  assert.equal(service.matchesInvoiceExportFilters({ salesmanCode: '35128' }, { salesStaffCode: '35128' }, { invoiceGroup: 'ALL' }), true);
});

test('operational returnOrders shown by delivery reduce VAT/SSE unless draft or cancelled', () => {
  assert.equal(service.isEligibleReturnOrder({ returnState: 'draft' }), false);
  assert.equal(service.isEligibleReturnOrder({ returnStatus: 'active', accountingStatus: 'pending' }), true);
  assert.equal(service.isEligibleReturnOrder({ returnState: 'waiting_receive', accountingStatus: 'pending' }), true);
  assert.equal(service.isEligibleReturnOrder({ returnState: 'received' }), true);
  assert.equal(service.isEligibleReturnOrder({ status: 'confirmed' }), true);
  assert.equal(service.isEligibleReturnOrder({ returnState: 'accounting_confirmed' }), true);
  assert.equal(service.isEligibleReturnOrder({ returnState: 'posted_to_ar' }), true);
  assert.equal(service.isEligibleReturnOrder({ arPosted: true }), true);
  assert.equal(service.isEligibleReturnOrder({ returnState: 'cancelled', accountingConfirmedAt: '2026-06-01T00:00:00.000Z' }), false);
  assert.equal(service.isEligibleReturnOrder({ returnStatus: 'active', accountingStatus: 'cancelled' }), false);
  assert.equal(service.isEligibleReturnOrder({ returnState: 'accounting_confirmed', deleted: true }), false);
});

test('return query includes operational documents and master links without requiring accounting confirmation', () => {
  const filter = service.buildReturnLinkFilter([{
    id: 'SO-ID-1',
    code: 'B0037855',
    masterOrderId: 'MO-ID-1',
    masterOrderCode: 'MO-CODE-1'
  }]);
  const text = JSON.stringify(filter);
  assert.match(text, /salesOrderId/);
  assert.match(text, /orderCode/);
  assert.match(text, /masterOrderId/);
  assert.match(text, /masterOrderCode/);
  assert.doesNotMatch(text, /accountingConfirmed|posted_to_ar|arPosted/);
});

test('customer filter normalizes to customerCode and supports canonical-first legacy aliases', () => {
  const filters = service.normalizeExportQuery({ customerCode: 'BBHOASON' }, { invoiceGroup: 'ALL' });
  assert.equal(filters.customerCode, 'BBHOASON');

  const clause = service.buildCustomerMongoClause('BBHOASON');
  const text = JSON.stringify(clause);
  assert.match(text, /customerCode/);
  assert.match(text, /customer\.code/);
  assert.match(text, /customerId/);

  assert.equal(service.matchesInvoiceExportFilters({ customerCode: 'BBHOASON', customer: { code: 'OTHER' } }, { customerCode: 'BBHOASON' }, { invoiceGroup: 'ALL' }), true);
  assert.equal(service.matchesInvoiceExportFilters({ customerCode: 'OTHER', customer: { code: 'BBHOASON' } }, { customerCode: 'BBHOASON' }, { invoiceGroup: 'ALL' }), false);
  assert.equal(service.matchesInvoiceExportFilters({ customer: { code: 'BBHOASON' } }, { customerCode: 'BBHOASON' }, { invoiceGroup: 'ALL' }), true);
});

test('order Mongo filter applies date, exact staff/customer code and invoice group server-side', () => {
  const previous = process.env.TENANT_MODE;
  try {
    process.env.TENANT_MODE = 'multi';
    const filter = service.buildInvoiceOrderMongoFilter(
      { dateFrom: '2026-06-01', dateTo: '2026-06-30', salesStaffCode: '35128', customerCode: 'BBHOASON' },
      { invoiceGroup: 'VAT', currentUser: { tenantId: 'tenant-a' } }
    );
    const text = JSON.stringify(filter);
    assert.match(text, /vatInvoiceRequired/);
    assert.match(text, /salesStaffCode/);
    assert.match(text, /customerCode/);
    assert.match(text, /BBHOASON/);
    assert.match(text, /orderDate/);
    assert.match(text, /tenant-a/);
    assert.doesNotMatch(text, /salesStaffName|staffName/);
  } finally {
    if (previous === undefined) delete process.env.TENANT_MODE;
    else process.env.TENANT_MODE = previous;
  }
});
