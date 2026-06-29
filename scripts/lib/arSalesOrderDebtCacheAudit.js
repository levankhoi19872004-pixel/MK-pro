'use strict';

const fs = require('fs');
const path = require('path');
const { normalizeDebtAmount } = require('../../src/constants/finance.constants');
const { arEntryBalanceEffect, isActiveArEntry, orderKeysFrom } = require('../../src/utils/arLedger.util');

const DEBT_CACHE_FIELDS = ['debtAmount', 'debt', 'arBalance', 'arDebtAmount', 'remainingDebt', 'currentDebt'];
const ACCOUNTING_READ_ALLOWLIST = [
  'src/services/accounting/arBalanceService.js',
  'src/services/DebtReadService.js',
  'src/services/mobile/mobileDebtQuery.service.js',
  'src/services/reports/DebtReportService.js',
  'src/services/reports/InformationReportService.js',
  'src/services/reports/SalesReportService.js',
  'src/services/dashboard/DebtDashboardQuery.js',
  'src/services/mobile/catalog.service.js',
  'src/utils/deliveryFinance.util.js',
  'src/services/master-order/deliveryTodayList.impl.js',
  'src/services/master-order/deliveryCommon.impl.js'
];
const GET_ROUTE_HINT = /router\.get\(|app\.get\(/i;
const WRITE_HINT = /\.(?:updateOne|updateMany|findOneAndUpdate|save|create|insertMany|bulkWrite)\s*\(|\bupsert\s*\(/;
const DEBT_WRITE_HINT = /(debtAmount|currentDebt|remainingDebt|arBalance|arDebtAmount|paymentStatus|paidAmount)/i;

function text(value) {
  return String(value ?? '').trim();
}

function lower(value) {
  return text(value).toLowerCase();
}

function unique(values = []) {
  return [...new Set((values || []).map(text).filter(Boolean))];
}

function orderCacheKeys(order = {}) {
  return unique(orderKeysFrom(order));
}

function customerKeys(row = {}) {
  return unique([row.customerCode, row.customerId, row.customerName, row.code, row.id, row.name]);
}

function cacheValue(row = {}, fields = DEBT_CACHE_FIELDS) {
  for (const field of fields) {
    const n = Number(row[field]);
    if (Number.isFinite(n)) return Math.round(n);
  }
  return null;
}

function ledgerRowsForOrder(order = {}, arRows = []) {
  const keys = new Set(orderCacheKeys(order).map(lower));
  if (!keys.size) return [];
  return (arRows || []).filter((row) => orderKeysFrom(row).some((key) => keys.has(lower(key))));
}

function ledgerRowsForCustomer(customer = {}, arRows = []) {
  const keys = new Set(customerKeys(customer).map(lower));
  if (!keys.size) return [];
  return (arRows || []).filter((row) => customerKeys(row).some((key) => keys.has(lower(key))));
}

function officialDebtFromLedgers(rows = []) {
  return normalizeDebtAmount((rows || [])
    .filter(isActiveArEntry)
    .reduce((sum, row) => sum + arEntryBalanceEffect(row), 0));
}

function summarizeCacheMismatch({ salesOrders = [], customers = [], arLedgers = [], tolerance = 1000 } = {}) {
  const salesOrderMismatches = [];
  const customerMismatches = [];
  for (const order of salesOrders || []) {
    const cached = cacheValue(order, ['debtAmount', 'debt', 'arBalance', 'arDebtAmount', 'remainingDebt']);
    if (cached === null) continue;
    const officialDebt = officialDebtFromLedgers(ledgerRowsForOrder(order, arLedgers));
    if (Math.abs(cached - officialDebt) > tolerance) {
      salesOrderMismatches.push({
        issue: 'salesOrder_debt_cache_mismatch',
        severity: 'P1',
        id: text(order.id || order._id),
        code: text(order.code || order.orderCode || order.salesOrderCode),
        customerCode: text(order.customerCode),
        cachedDebt: cached,
        officialDebt,
        diff: cached - officialDebt
      });
    }
  }
  for (const customer of customers || []) {
    const cached = cacheValue(customer, ['currentDebt', 'debtAmount', 'debt', 'balance', 'openingDebt']);
    if (cached === null) continue;
    const officialDebt = officialDebtFromLedgers(ledgerRowsForCustomer(customer, arLedgers));
    if (Math.abs(cached - officialDebt) > tolerance) {
      customerMismatches.push({
        issue: 'customer_debt_cache_mismatch',
        severity: 'P1',
        id: text(customer.id || customer._id),
        code: text(customer.code || customer.customerCode),
        name: text(customer.name || customer.customerName),
        cachedDebt: cached,
        officialDebt,
        diff: cached - officialDebt
      });
    }
  }
  return { salesOrderMismatches, customerMismatches };
}

function walkJsFiles(rootDir, dir = rootDir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkJsFiles(rootDir, full, out);
    else if (entry.isFile() && entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

function relativeFromRoot(rootDir, file) {
  return path.relative(rootDir, file).replace(/\\/g, '/');
}

function scanSourceForDebtCacheRisks(rootDir = process.cwd()) {
  const risks = [];
  const files = walkJsFiles(rootDir)
    .filter((file) => /^(src|scripts)[/\\]/.test(relativeFromRoot(rootDir, file)));
  for (const file of files) {
    const rel = relativeFromRoot(rootDir, file);
    const source = fs.readFileSync(file, 'utf8');
    const mentionsCache = DEBT_CACHE_FIELDS.some((field) => new RegExp(`\\b${field}\\b`).test(source));
    if (!mentionsCache) continue;
    const isAuditTool = rel === 'scripts/audit-ar-salesorder-debt-cache.js' || rel === 'scripts/lib/arSalesOrderDebtCacheAudit.js';
    const readsSalesOrderDebtCache = !isAuditTool
      && /SalesOrder|orders|salesOrders|Customer|customers/.test(source)
      && /(debtAmount|currentDebt|remainingDebt|arBalance|arDebtAmount)/.test(source)
      && !ACCOUNTING_READ_ALLOWLIST.includes(rel);
    const isHttpBoundary = rel.startsWith('src/routes/') || rel.startsWith('src/controllers/');
    const getSideEffect = isHttpBoundary && GET_ROUTE_HINT.test(source) && WRITE_HINT.test(source) && DEBT_WRITE_HINT.test(source);
    if (readsSalesOrderDebtCache || getSideEffect) {
      risks.push({
        file: rel,
        severity: getSideEffect ? 'P0' : 'P1',
        issue: getSideEffect ? 'possible_get_debt_cache_side_effect' : 'possible_salesOrder_or_customer_debt_cache_reader',
        readsSalesOrderDebtCache,
        getSideEffect
      });
    }
  }
  return risks;
}

function summarizeArSalesOrderDebtCacheAudit(input = {}) {
  const { salesOrderMismatches, customerMismatches } = summarizeCacheMismatch(input);
  const sourceRisks = input.sourceRisks || [];
  const p0Cases = [
    ...sourceRisks.filter((risk) => risk.severity === 'P0'),
    ...salesOrderMismatches.filter((item) => Math.abs(item.diff) > (input.p0Tolerance || 10000))
  ];
  return {
    generatedAt: new Date().toISOString(),
    canonical: {
      debtSsot: 'arLedgers',
      salesOrderDebtCache: 'read-model-only',
      noGetSideEffect: true
    },
    totals: {
      salesOrdersChecked: (input.salesOrders || []).length,
      customersChecked: (input.customers || []).length,
      arLedgersChecked: (input.arLedgers || []).length,
      salesOrderCacheMismatch: salesOrderMismatches.length,
      customerCacheMismatch: customerMismatches.length,
      sourceRiskCount: sourceRisks.length,
      getDebtSideEffectRisk: sourceRisks.filter((risk) => risk.getSideEffect).length,
      p0Cases: p0Cases.length
    },
    salesOrderMismatches,
    customerMismatches,
    sourceRisks,
    p0Cases
  };
}

module.exports = {
  DEBT_CACHE_FIELDS,
  summarizeCacheMismatch,
  scanSourceForDebtCacheRisks,
  summarizeArSalesOrderDebtCacheAudit,
  _internal: {
    orderCacheKeys,
    customerKeys,
    officialDebtFromLedgers,
    ledgerRowsForOrder,
    ledgerRowsForCustomer,
    cacheValue
  }
};
