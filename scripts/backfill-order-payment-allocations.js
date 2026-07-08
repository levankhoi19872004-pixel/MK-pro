#!/usr/bin/env node
'use strict';

try { require('dotenv').config(); } catch (_) {}

const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const SalesOrder = require('../src/models/SalesOrder');
const ArLedger = require('../src/models/ArLedger');
const FundLedger = require('../src/models/FundLedger');
const OrderPaymentAllocation = require('../src/models/OrderPaymentAllocation');
const dateUtil = require('../src/utils/date.util');
const { normalizeAccountingAmount } = require('../src/domain/ar/arLedgerValidator');
const OrderPaymentAllocationService = require('../src/services/accounting/OrderPaymentAllocationService');

const TITLE = 'ORDER_PAYMENT_ALLOCATIONS_BACKFILL_AND_DIAGNOSTIC';
const ACTIVE_EXCLUDED_STATUSES = ['reversed', 'void', 'voided', 'cancelled', 'canceled', 'deleted'];

function clean(value = '') {
  return String(value ?? '').trim();
}

function money(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function uniq(values = []) {
  return Array.from(new Set((Array.isArray(values) ? values : []).map(clean).filter(Boolean)));
}

function parseArgs(argv = process.argv.slice(2)) {
  const out = { apply: false, fixMissingRewardLedgers: false, fixMissingArLedgers: false, fixMissingFundLedgers: false, json: false, strict: false, limit: 5000 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') out.apply = true;
    else if (arg === '--fix-missing-reward-ledgers') out.fixMissingRewardLedgers = true;
    else if (arg === '--fix-missing-ar-ledgers') out.fixMissingArLedgers = true;
    else if (arg === '--fix-missing-fund-ledgers') out.fixMissingFundLedgers = true;
    else if (arg === '--json') out.json = true;
    else if (arg === '--strict') out.strict = true;
    else if (arg === '--order' || arg === '--orderCode') out.orderCode = argv[++i];
    else if (arg === '--customer' || arg === '--customerCode') out.customerCode = argv[++i];
    else if (arg === '--delivery' || arg === '--deliveryStaffCode') out.deliveryStaffCode = argv[++i];
    else if (arg === '--salesman' || arg === '--salesStaffCode') out.salesStaffCode = argv[++i];
    else if (arg === '--from' || arg === '--dateFrom') out.dateFrom = argv[++i];
    else if (arg === '--to' || arg === '--dateTo') out.dateTo = argv[++i];
    else if (arg === '--date') out.date = argv[++i];
    else if (arg === '--limit') out.limit = Math.max(1, Math.min(50000, Number(argv[++i]) || out.limit));
  }
  return out;
}

function orderCode(order = {}) {
  return clean(order.code || order.orderCode || order.salesOrderCode || order.documentCode || order.invoiceCode);
}

function orderId(order = {}) {
  return clean(order.id || order._id || order.salesOrderId || order.orderId);
}

function orderKeys(row = {}) {
  return uniq([
    row.id,
    row._id,
    row.orderId,
    row.orderCode,
    row.code,
    row.salesOrderId,
    row.salesOrderCode,
    row.sourceId,
    row.sourceCode,
    row.documentCode,
    row.invoiceCode
  ]);
}

function buildOrderFilter(options = {}) {
  const and = [
    { deliveryCloseout: { $exists: true } },
    { $or: [{ deletedAt: { $exists: false } }, { deletedAt: null }, { deletedAt: '' }] },
    { isDeleted: { $ne: true } },
    { deleted: { $ne: true } }
  ];
  if (clean(options.orderCode)) {
    const code = clean(options.orderCode);
    and.push({ $or: [{ code }, { orderCode: code }, { salesOrderCode: code }, { documentCode: code }, { invoiceCode: code }, { id: code }, { salesOrderId: code }] });
  }
  if (clean(options.customerCode)) and.push({ customerCode: clean(options.customerCode) });
  if (clean(options.deliveryStaffCode)) and.push({ deliveryStaffCode: clean(options.deliveryStaffCode) });
  if (clean(options.salesStaffCode)) and.push({ salesStaffCode: clean(options.salesStaffCode) });
  const from = dateUtil.toDateOnly(options.date || options.dateFrom || '');
  const to = dateUtil.toDateOnly(options.date || options.dateTo || '');
  if (from || to) {
    const range = {};
    if (from) range.$gte = from;
    if (to) range.$lte = to;
    and.push({ deliveryDate: range });
  }
  return { $and: and };
}

function buildLedgerMatchForKeys(keys = [], extra = {}) {
  const list = uniq(keys);
  if (!list.length) return { _id: { $exists: false } };
  return {
    ...extra,
    active: { $ne: false },
    reversed: { $ne: true },
    isDeleted: { $ne: true },
    deleted: { $ne: true },
    status: { $nin: ACTIVE_EXCLUDED_STATUSES },
    $or: [
      { sourceId: { $in: list } },
      { sourceCode: { $in: list } },
      { orderId: { $in: list } },
      { orderCode: { $in: list } },
      { salesOrderId: { $in: list } },
      { salesOrderCode: { $in: list } },
      { refId: { $in: list } },
      { refCode: { $in: list } }
    ]
  };
}

async function loadExistingAllocation(keys = []) {
  const list = uniq(keys);
  if (!list.length) return null;
  return OrderPaymentAllocation.findOne({
    status: { $nin: ACTIVE_EXCLUDED_STATUSES },
    $or: [
      { orderId: { $in: list } },
      { orderCode: { $in: list } },
      { sourceId: { $in: list } },
      { sourceCode: { $in: list } }
    ]
  }).sort({ sourceVersion: -1, postedAt: -1, updatedAt: -1, createdAt: -1 }).lean();
}

async function sumArBalance(keys = []) {
  const ledgers = await ArLedger.find(buildLedgerMatchForKeys(keys)).limit(500).lean();
  return ledgers.reduce((sum, row) => {
    const normalized = normalizeAccountingAmount(row);
    return money(sum + money(normalized.debit) - money(normalized.credit));
  }, 0);
}



function expectedFundRows(allocation = {}) {
  const rows = [];
  const push = (fundType, amount) => {
    const normalized = money(amount);
    if (normalized <= 0) return;
    rows.push({
      fundType,
      amount: normalized,
      direction: 'in',
      idempotencyKey: `FUND:OPA:${clean(allocation.idempotencyKey)}:${fundType}`
    });
  };
  push('cash', allocation.cashAmount);
  push('bank', allocation.bankAmount);
  return rows;
}

async function findActiveArLedgerByExpected(row = {}) {
  const key = clean(row.idempotencyKey);
  if (!key) return null;
  return ArLedger.findOne({
    idempotencyKey: key,
    active: { $ne: false },
    reversed: { $ne: true },
    isDeleted: { $ne: true },
    deleted: { $ne: true },
    status: { $nin: ACTIVE_EXCLUDED_STATUSES }
  }).lean();
}

async function findActiveFundLedgerByExpected(row = {}) {
  const key = clean(row.idempotencyKey);
  if (!key) return null;
  return FundLedger.findOne({
    idempotencyKey: key,
    isDeleted: { $ne: true },
    deleted: { $ne: true },
    status: { $nin: ACTIVE_EXCLUDED_STATUSES }
  }).lean();
}

function expectedArAmount(row = {}) {
  const normalized = normalizeAccountingAmount(row);
  return money(Math.max(money(normalized.debit), money(normalized.credit), money(normalized.amount)));
}

function actualArAmount(row = {}) {
  if (!row) return 0;
  const normalized = normalizeAccountingAmount(row);
  return money(Math.max(money(normalized.debit), money(normalized.credit), money(normalized.amount)));
}

async function hasRewardLedger(allocation = {}) {
  const keys = orderKeys(allocation);
  const idempotencyKey = clean(allocation.idempotencyKey) ? `OPA:${allocation.idempotencyKey}:AR-REWARD-ALLOWANCE` : '';
  const or = [];
  if (idempotencyKey) or.push({ idempotencyKey });
  if (keys.length) or.push(buildLedgerMatchForKeys(keys, { category: 'AR-REWARD-ALLOWANCE' }));
  if (!or.length) return false;
  const row = await ArLedger.findOne({ $or: or }).lean();
  return Boolean(row);
}

function diagnosticRow(order = {}, allocation = {}, extra = {}) {
  return {
    orderCode: clean(allocation.orderCode || orderCode(order)),
    customerCode: clean(allocation.customerCode || order.customerCode),
    salesStaffCode: clean(allocation.salesStaffCode || order.salesStaffCode || order.salesmanCode),
    deliveryStaffCode: clean(allocation.deliveryStaffCode || order.deliveryStaffCode || order.deliveryCode),
    deliveryDate: dateUtil.toDateOnly(allocation.deliveryDate || order.deliveryDate || order.orderDate || order.date),
    receivableAmount: money(allocation.receivableAmount),
    cashAmount: money(allocation.cashAmount),
    bankAmount: money(allocation.bankAmount),
    rewardAmount: money(allocation.rewardAmount),
    returnAmount: money(allocation.returnAmount),
    debtAmount: money(allocation.debtAmount),
    arBalance: money(extra.arBalance),
    expectedBalance: money(extra.expectedBalance ?? allocation.debtAmount),
    diff: money(extra.diff),
    connectionType: clean(extra.connectionType),
    category: clean(extra.category),
    expectedAmount: money(extra.expectedAmount),
    actualAmount: money(extra.actualAmount),
    idempotencyKey: clean(extra.idempotencyKey),
    suggestedFix: clean(extra.suggestedFix)
  };
}

async function auditAndMaybeApply(options = {}) {
  const filter = buildOrderFilter(options);
  const limit = Math.max(1, Math.min(50000, Number(options.limit || 5000)));
  const orders = await SalesOrder.find(filter).sort({ deliveryDate: -1, createdAt: -1 }).limit(limit).lean();
  const diagnostics = { missingAllocations: [], missingArLedgers: [], arLedgerAmountConflicts: [], missingFundLedgers: [], fundLedgerAmountConflicts: [], missingRewardLedgers: [], allocationDebtArDiffs: [], invalidAllocations: [] };
  const writes = { allocationsCreatedOrUpdated: 0, arLedgersFixed: 0, rewardLedgersFixed: 0, fundLedgersFixed: 0 };

  for (const order of orders) {
    const closeout = order.deliveryCloseout || {};
    let built;
    try {
      built = OrderPaymentAllocationService.buildAllocationFromCloseout(order, closeout, { actor: 'backfill-order-payment-allocations', tolerance: 0 });
    } catch (err) {
      diagnostics.invalidAllocations.push(diagnosticRow(order, {}, {
        arBalance: 0,
        expectedBalance: 0,
        diff: 0,
        suggestedFix: `Sửa dữ liệu closeout trước khi backfill: ${err.code || err.message}`
      }));
      continue;
    }

    const keys = orderKeys({ ...order, ...built });
    let allocation = await loadExistingAllocation(keys);
    if (!allocation) {
      diagnostics.missingAllocations.push(diagnosticRow(order, built, {
        arBalance: await sumArBalance(keys),
        expectedBalance: built.debtAmount,
        diff: money((await sumArBalance(keys)) - built.debtAmount),
        suggestedFix: 'Chạy --apply để tạo orderPaymentAllocation idempotent từ salesOrders.deliveryCloseout.'
      }));
      if (options.apply) {
        allocation = await OrderPaymentAllocationService.upsertAllocation(built, { actor: 'backfill-order-payment-allocations' });
        writes.allocationsCreatedOrUpdated += 1;
      } else {
        allocation = built;
      }
    }

    try {
      OrderPaymentAllocationService.validateAllocation(allocation);
    } catch (err) {
      diagnostics.invalidAllocations.push(diagnosticRow(order, allocation, {
        arBalance: await sumArBalance(keys),
        expectedBalance: allocation.debtAmount,
        diff: 0,
        suggestedFix: `Allocation sai invariant: ${err.code || err.message}`
      }));
    }

    const expectedArRows = OrderPaymentAllocationService.buildArLedgerRows(allocation);
    let missingArForAllocation = false;
    for (const expected of expectedArRows) {
      const actual = await findActiveArLedgerByExpected(expected);
      const expectedAmount = expectedArAmount(expected);
      if (!actual) {
        missingArForAllocation = true;
        diagnostics.missingArLedgers.push(diagnosticRow(order, allocation, {
          connectionType: 'allocation_to_arLedgers',
          category: clean(expected.category),
          idempotencyKey: clean(expected.idempotencyKey),
          expectedAmount,
          actualAmount: 0,
          expectedBalance: allocation.debtAmount,
          suggestedFix: expected.category === 'AR-REWARD-ALLOWANCE'
            ? 'Chạy --apply --fix-missing-reward-ledgers hoặc --apply --fix-missing-ar-ledgers để tạo AR ledger còn thiếu.'
            : 'Chạy --apply --fix-missing-ar-ledgers để tạo AR ledger còn thiếu.'
        }));
      } else {
        const actualAmount = actualArAmount(actual);
        if (actualAmount !== expectedAmount) {
          diagnostics.arLedgerAmountConflicts.push(diagnosticRow(order, allocation, {
            connectionType: 'allocation_to_arLedgers',
            category: clean(expected.category),
            idempotencyKey: clean(expected.idempotencyKey),
            expectedAmount,
            actualAmount,
            diff: money(actualAmount - expectedAmount),
            expectedBalance: allocation.debtAmount,
            suggestedFix: 'Không tự ghi đè. Kiểm tra ledger trùng/sai số tiền rồi reverse/repost bằng quy trình kế toán.'
          }));
        }
      }
    }
    if (options.apply && options.fixMissingArLedgers && missingArForAllocation) {
      const posted = await OrderPaymentAllocationService.postArLedgersFromAllocation(allocation, { actor: 'backfill-order-payment-allocations' });
      writes.arLedgersFixed += Array.isArray(posted) ? posted.length : 0;
    }

    const expectedFunds = expectedFundRows(allocation);
    let missingFundForAllocation = false;
    for (const expected of expectedFunds) {
      const actual = await findActiveFundLedgerByExpected(expected);
      if (!actual) {
        missingFundForAllocation = true;
        diagnostics.missingFundLedgers.push(diagnosticRow(order, allocation, {
          connectionType: 'allocation_to_fundLedgers',
          category: clean(expected.fundType).toUpperCase(),
          idempotencyKey: clean(expected.idempotencyKey),
          expectedAmount: expected.amount,
          actualAmount: 0,
          expectedBalance: allocation.debtAmount,
          suggestedFix: 'Chạy --apply --fix-missing-fund-ledgers để tạo fundLedger còn thiếu cho TM/CK.'
        }));
      } else if (money(actual.amount) !== money(expected.amount)) {
        diagnostics.fundLedgerAmountConflicts.push(diagnosticRow(order, allocation, {
          connectionType: 'allocation_to_fundLedgers',
          category: clean(expected.fundType).toUpperCase(),
          idempotencyKey: clean(expected.idempotencyKey),
          expectedAmount: expected.amount,
          actualAmount: money(actual.amount),
          diff: money(money(actual.amount) - expected.amount),
          expectedBalance: allocation.debtAmount,
          suggestedFix: 'Không tự ghi đè. Kiểm tra quỹ trùng/sai rồi reverse/repost theo quy trình quỹ.'
        }));
      }
    }
    if (options.apply && options.fixMissingFundLedgers && missingFundForAllocation) {
      const postedFunds = await OrderPaymentAllocationService.postFundLedgersFromAllocation(allocation, { actor: 'backfill-order-payment-allocations' });
      writes.fundLedgersFixed += Array.isArray(postedFunds) ? postedFunds.length : 0;
    }

    const arBalance = await sumArBalance(keys);
    const diff = money(arBalance - money(allocation.debtAmount));
    if (diff !== 0) {
      diagnostics.allocationDebtArDiffs.push(diagnosticRow(order, allocation, {
        arBalance,
        expectedBalance: allocation.debtAmount,
        diff,
        suggestedFix: 'Kiểm tra ledger thiếu/trùng; với lỗi trả thưởng dùng --fix-missing-reward-ledgers sau khi --apply.'
      }));
    }

    if (money(allocation.rewardAmount) > 0 && !(await hasRewardLedger(allocation))) {
      diagnostics.missingRewardLedgers.push(diagnosticRow(order, allocation, {
        arBalance,
        expectedBalance: money(allocation.debtAmount),
        diff,
        suggestedFix: 'Chạy --apply --fix-missing-reward-ledgers để tạo AR-REWARD-ALLOWANCE còn thiếu.'
      }));
      if (options.apply && options.fixMissingRewardLedgers) {
        const rows = OrderPaymentAllocationService.buildArLedgerRows(allocation).filter((row) => row.category === 'AR-REWARD-ALLOWANCE');
        for (const row of rows) {
          await require('../src/repositories/paymentRepository').upsert(row, { actor: 'backfill-order-payment-allocations' });
          writes.rewardLedgersFixed += 1;
        }
      }
    }
  }

  const issueCount = Object.values(diagnostics).reduce((sum, rows) => sum + rows.length, 0);
  return {
    title: TITLE,
    dryRun: options.apply !== true,
    apply: options.apply === true,
    fixMissingRewardLedgers: options.fixMissingRewardLedgers === true,
    fixMissingArLedgers: options.fixMissingArLedgers === true,
    fixMissingFundLedgers: options.fixMissingFundLedgers === true,
    database: mongoose.connection.name || '',
    checkedOrders: orders.length,
    issueCount,
    writes,
    diagnostics
  };
}

function printText(result = {}) {
  console.log(result.title);
  console.log(`Database: ${result.database || '<unknown>'}`);
  console.log(`Dry-run: ${result.dryRun === true}`);
  console.log(`Checked orders: ${result.checkedOrders}`);
  console.log(`Issues: ${result.issueCount}`);
  console.log(`Writes: ${JSON.stringify(result.writes)}`);
  for (const [name, rows] of Object.entries(result.diagnostics || {})) {
    console.log(`${name}: ${rows.length}`);
    if (rows.length) console.log(JSON.stringify(rows.slice(0, 50), null, 2));
  }
  console.log(result.issueCount ? 'DIAGNOSTIC_WARN' : 'DIAGNOSTIC_PASS');
}

async function main() {
  const options = parseArgs();
  await connectDB();
  const result = await auditAndMaybeApply(options);
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else printText(result);
  await mongoose.connection.close();
  if (options.strict && result.issueCount) process.exitCode = 2;
}

if (require.main === module) main().catch(async (err) => {
  console.error('[backfill-order-payment-allocations] failed:', err && err.stack ? err.stack : err);
  try { await mongoose.connection.close(); } catch (_) {}
  process.exit(1);
});

module.exports = {
  TITLE,
  parseArgs,
  auditAndMaybeApply,
  buildOrderFilter,
  diagnosticRow,
  _internal: { clean, money, uniq, orderKeys, buildLedgerMatchForKeys, sumArBalance, hasRewardLedger }
};
