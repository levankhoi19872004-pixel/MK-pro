'use strict';

const assert = require('assert');
const fs = require('fs');
const test = require('node:test');
const { scanSourceForDebtCacheRisks } = require('../scripts/lib/arSalesOrderDebtCacheAudit');

test('financialService no longer writes SalesOrder debt cache in syncOrderDebtCacheFromAR', () => {
  const source = fs.readFileSync('src/services/financialService.js', 'utf8');
  const start = source.indexOf('async function syncOrderDebtCacheFromAR');
  const end = source.indexOf('\nfunction buildRunningCode', start);
  const body = source.slice(start, end);
  assert.match(body, /skippedSalesOrderCacheWrite:\s*true/);
  assert.doesNotMatch(body, /orderRepository\.upsert\s*\(/);
  assert.doesNotMatch(body, /patchByIdentity\s*\(/);
});

test('legacy mobile customer list reads debt from DebtReadService/arLedgers, not Customer cache', () => {
  const source = fs.readFileSync('src/services/mobileService.js', 'utf8');
  const start = source.indexOf('async function customers');
  const end = source.indexOf('\n  async function products', start);
  const body = source.slice(start, end);
  assert.match(body, /DebtReadService\.loadDebtBalancesForCustomers/);
  assert.match(body, /debtSource:\s*'arLedgers'/);
  assert.doesNotMatch(body, /customer\.debtAmount\s*\|\|\s*customer\.currentDebt/);
});



test('unified customer search reads debt from DebtReadService/arLedgers, not Customer cache', () => {
  const source = fs.readFileSync('src/services/searchService.js', 'utf8');
  const start = source.indexOf('async function searchCustomers');
  const end = source.indexOf('\nfunction toStaffSuggestion', start);
  const body = source.slice(start, end);
  assert.match(source, /DebtReadService\.loadDebtBalancesForCustomers/);
  assert.match(source, /debtSource:\s*'arLedgers'/);
  assert.doesNotMatch(body, /customer\.debtAmount\s*\?\?/);
  assert.doesNotMatch(body, /customer\.currentDebt\s*\?\?/);
});

test('delivery accounting legacy customer debt hook is read-only', () => {
  const source = fs.readFileSync('src/services/master-order/deliveryAccountingCore.impl.js', 'utf8');
  const start = source.indexOf('async function addDebtToCustomerIfNeeded');
  const end = source.indexOf('\nfunction orderKey', start);
  const body = source.slice(start, end);
  assert.match(body, /skippedCustomerDebtCacheWrite:\s*true/);
  assert.doesNotMatch(body, /customerRepository\.save\s*\(/);
});

test('official debt report remains arLedgers-based and not SalesOrder-cache-based', () => {
  const source = fs.readFileSync('src/services/reports/DebtReportService.js', 'utf8');
  assert.match(source, /const ArLedger = require/);
  assert.match(source, /source:\s*'mongo_ar_ledgers_period'/);
  assert.doesNotMatch(source, /SalesOrder/);
});

test('GET route/controller scan has no debt-cache write side-effect risk', () => {
  const risks = scanSourceForDebtCacheRisks(process.cwd());
  assert.deepEqual(risks.filter((risk) => risk.getSideEffect), []);
});
