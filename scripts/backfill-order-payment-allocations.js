#!/usr/bin/env node
'use strict';

try { require('dotenv').config(); } catch (_) {}

const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const SalesOrder = require('../src/models/SalesOrder');
const DeliveryCloseoutVersion = require('../src/models/DeliveryCloseoutVersion');
const ArLedger = require('../src/models/ArLedger');
const FundLedger = require('../src/models/FundLedger');
const OrderPaymentAllocation = require('../src/models/OrderPaymentAllocation');
const OrderPaymentRepairRun = require('../src/models/OrderPaymentRepairRun');
const dateUtil = require('../src/utils/date.util');
const { normalizeAccountingAmount } = require('../src/domain/ar/arLedgerValidator');
const paymentRepository = require('../src/repositories/paymentRepository');
const OrderPaymentAllocationService = require('../src/services/accounting/OrderPaymentAllocationService');
const OrderPaymentDebtReconcileService = require('../src/services/accounting/OrderPaymentDebtReconcileService');

const TITLE = 'ORDER_PAYMENT_ALLOCATIONS_BATCH_RECONCILE_AND_REPAIR';
const ACTIVE_EXCLUDED_STATUSES = ['reversed', 'void', 'voided', 'cancelled', 'canceled', 'deleted', 'removed', 'superseded'];
const ACTIVE_ORDER_STATUSES = ['delivered', 'delivery_confirmed', 'delivery_closed', 'closeout', 'closeout_confirmed', 'closed', 'completed', 'accounting_confirmed', 'posted'];
const ISSUE_GROUPS = ['missingAllocations', 'missingRewardLedgers', 'missingArLedgers', 'missingFundLedgers', 'amountConflicts', 'invalidAllocations', 'manualReviewRequired', 'debtDiffs', 'errors'];

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

function toDateOnly(value = '') {
  return dateUtil.toDateOnly(value || '') || '';
}

function safeToken(value = '') {
  return clean(value).replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'UNKNOWN';
}

function parsePositiveInt(value, fallback, min = 1, max = 50000) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function parseArgs(argv = process.argv.slice(2)) {
  const out = {
    apply: false,
    fixMissingRewardLedgers: false,
    fixMissingArLedgers: false,
    fixMissingFundLedgers: false,
    json: false,
    strict: false,
    onlyMissingAllocations: false,
    onlyMissingRewardLedgers: false,
    onlyInvalid: false,
    onlyDebtDiff: false,
    fixDebtBalance: false,
    zeroTolerance: 1000,
    limit: 5000,
    batchSize: 200
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') out.apply = true;
    else if (arg === '--fix-missing-reward-ledgers') out.fixMissingRewardLedgers = true;
    else if (arg === '--fix-missing-ar-ledgers') out.fixMissingArLedgers = true;
    else if (arg === '--fix-missing-fund-ledgers') out.fixMissingFundLedgers = true;
    else if (arg === '--json') out.json = true;
    else if (arg === '--strict') out.strict = true;
    else if (arg === '--only-missing-allocations') out.onlyMissingAllocations = true;
    else if (arg === '--only-missing-reward-ledgers') out.onlyMissingRewardLedgers = true;
    else if (arg === '--only-invalid') out.onlyInvalid = true;
    else if (arg === '--only-debt-diff') out.onlyDebtDiff = true;
    else if (arg === '--fix-debt-balance') out.fixDebtBalance = true;
    else if (arg === '--zero-tolerance' || arg === '--zeroTolerance') out.zeroTolerance = parsePositiveInt(argv[++i], out.zeroTolerance, 0, 1000000);
    else if (arg === '--order' || arg === '--orderCode') out.orderCode = argv[++i];
    else if (arg === '--customer' || arg === '--customerCode') out.customerCode = argv[++i];
    else if (arg === '--delivery' || arg === '--deliveryStaffCode') out.deliveryStaffCode = argv[++i];
    else if (arg === '--salesman' || arg === '--salesStaffCode') out.salesStaffCode = argv[++i];
    else if (arg === '--from' || arg === '--dateFrom') out.dateFrom = argv[++i];
    else if (arg === '--to' || arg === '--dateTo') out.dateTo = argv[++i];
    else if (arg === '--date') out.date = argv[++i];
    else if (arg === '--limit') out.limit = parsePositiveInt(argv[++i], out.limit, 1, 100000);
    else if (arg === '--batch-size' || arg === '--batchSize') out.batchSize = parsePositiveInt(argv[++i], out.batchSize, 1, 5000);
  }
  if (out.date) {
    out.dateFrom = out.date;
    out.dateTo = out.date;
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
    row.invoiceCode,
    row.originalCloseoutId,
    row.originalCloseoutCode,
    row.closeoutCode
  ]);
}

function buildDateRangeFilter(options = {}) {
  const from = toDateOnly(options.dateFrom || options.date || '');
  const to = toDateOnly(options.dateTo || options.date || '');
  if (!from && !to) return null;
  const range = {};
  if (from) range.$gte = from;
  if (to) range.$lte = to;
  return {
    $or: [
      { deliveryDate: range },
      { orderDate: range },
      { date: range },
      { 'deliveryCloseout.deliveryDate': range },
      { 'deliveryCloseout.date': range }
    ]
  };
}

function buildOrderFilter(options = {}) {
  const and = [
    { $or: [{ deletedAt: { $exists: false } }, { deletedAt: null }, { deletedAt: '' }] },
    { isDeleted: { $ne: true } },
    { deleted: { $ne: true } },
    { status: { $nin: ACTIVE_EXCLUDED_STATUSES } }
  ];

  const code = clean(options.orderCode);
  if (code) {
    and.push({ $or: [{ code }, { orderCode: code }, { salesOrderCode: code }, { documentCode: code }, { invoiceCode: code }, { id: code }, { salesOrderId: code }] });
  } else {
    and.push({
      $or: [
        { deliveryCloseout: { $exists: true, $ne: null } },
        { closeout: { $exists: true, $ne: null } },
        { accountingConfirmed: true },
        { accountingStatus: 'confirmed' },
        { status: { $in: ACTIVE_ORDER_STATUSES } },
        { deliveryStatus: { $in: ACTIVE_ORDER_STATUSES } },
        { closeoutStatus: { $in: ACTIVE_ORDER_STATUSES } }
      ]
    });
  }

  if (clean(options.customerCode)) and.push({ customerCode: clean(options.customerCode) });
  if (clean(options.deliveryStaffCode)) and.push({ $or: [{ deliveryStaffCode: clean(options.deliveryStaffCode) }, { deliveryCode: clean(options.deliveryStaffCode) }, { nvghCode: clean(options.deliveryStaffCode) }] });
  if (clean(options.salesStaffCode)) and.push({ $or: [{ salesStaffCode: clean(options.salesStaffCode) }, { salesmanCode: clean(options.salesStaffCode) }, { nvbhCode: clean(options.salesStaffCode) }] });
  const dateFilter = buildDateRangeFilter(options);
  if (dateFilter) and.push(dateFilter);
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
      { refCode: { $in: list } },
      { referenceId: { $in: list } },
      { referenceCode: { $in: list } }
    ]
  };
}

function activeFilter(extra = {}) {
  return {
    ...extra,
    active: { $ne: false },
    reversed: { $ne: true },
    isDeleted: { $ne: true },
    deleted: { $ne: true },
    status: { $nin: ACTIVE_EXCLUDED_STATUSES }
  };
}

async function loadExistingAllocation(keys = [], options = {}) {
  const list = uniq(keys);
  if (!list.length) return null;
  let query = OrderPaymentAllocation.findOne({
    status: { $nin: ACTIVE_EXCLUDED_STATUSES },
    $or: [
      { orderId: { $in: list } },
      { orderCode: { $in: list } },
      { sourceId: { $in: list } },
      { sourceCode: { $in: list } }
    ]
  }).sort({ sourceVersion: -1, postedAt: -1, updatedAt: -1, createdAt: -1 }).lean();
  if (options.session && typeof query.session === 'function') query = query.session(options.session);
  return query;
}

async function sumArBalance(keys = [], options = {}) {
  let query = ArLedger.find(buildLedgerMatchForKeys(keys)).limit(1000).lean();
  if (options.session && typeof query.session === 'function') query = query.session(options.session);
  const ledgers = await query;
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

async function findActiveArLedgerByExpected(row = {}, options = {}) {
  const key = clean(row.idempotencyKey);
  if (!key) return null;
  let query = ArLedger.findOne(activeFilter({ idempotencyKey: key })).lean();
  if (options.session && typeof query.session === 'function') query = query.session(options.session);
  return query;
}

async function findActiveFundLedgerByExpected(row = {}, options = {}) {
  const key = clean(row.idempotencyKey);
  if (!key) return null;
  let query = FundLedger.findOne({
    idempotencyKey: key,
    isDeleted: { $ne: true },
    deleted: { $ne: true },
    status: { $nin: ACTIVE_EXCLUDED_STATUSES }
  }).lean();
  if (options.session && typeof query.session === 'function') query = query.session(options.session);
  return query;
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

function isRewardRow(row = {}) {
  return clean(row.category).toUpperCase() === 'AR-REWARD-ALLOWANCE';
}

async function hasRewardLedger(allocation = {}, options = {}) {
  const keys = orderKeys(allocation);
  const expectedRows = OrderPaymentAllocationService.buildArLedgerRows(allocation).filter(isRewardRow);
  const or = [];
  for (const row of expectedRows) if (clean(row.idempotencyKey)) or.push({ idempotencyKey: clean(row.idempotencyKey) });
  if (keys.length) or.push(buildLedgerMatchForKeys(keys, { category: 'AR-REWARD-ALLOWANCE' }));
  if (!or.length) return false;
  let query = ArLedger.findOne({ $or: or }).lean();
  if (options.session && typeof query.session === 'function') query = query.session(options.session);
  const row = await query;
  return Boolean(row);
}

function diagnosticRow(order = {}, allocation = {}, extra = {}) {
  return {
    orderCode: clean(allocation.orderCode || orderCode(order)),
    customerCode: clean(allocation.customerCode || order.customerCode),
    salesStaffCode: clean(allocation.salesStaffCode || order.salesStaffCode || order.salesmanCode),
    deliveryStaffCode: clean(allocation.deliveryStaffCode || order.deliveryStaffCode || order.deliveryCode),
    deliveryDate: toDateOnly(allocation.deliveryDate || order.deliveryDate || order.orderDate || order.date),
    receivableAmount: money(allocation.receivableAmount),
    cashAmount: money(allocation.cashAmount),
    bankAmount: money(allocation.bankAmount),
    rewardAmount: money(allocation.rewardAmount),
    returnAmount: money(allocation.returnAmount),
    rawDebtAmount: money(allocation.rawDebtAmount),
    normalizedDebtAmount: money(allocation.normalizedDebtAmount),
    debtAmount: money(allocation.debtAmount),
    zeroTolerance: Number(allocation.zeroTolerance || extra.zeroTolerance || 0),
    zeroToleranceApplied: Boolean(allocation.zeroToleranceApplied),
    zeroToleranceAdjustmentAmount: money(allocation.zeroToleranceAdjustmentAmount),
    arBalance: money(extra.arBalance),
    expectedBalance: money(extra.expectedBalance ?? allocation.debtAmount),
    diff: money(extra.diff),
    connectionType: clean(extra.connectionType),
    category: clean(extra.category),
    issueType: clean(extra.issueType),
    expectedAmount: money(extra.expectedAmount),
    actualAmount: money(extra.actualAmount),
    idempotencyKey: clean(extra.idempotencyKey),
    sourceType: clean(allocation.sourceType || extra.sourceType),
    sourceId: clean(allocation.sourceId || extra.sourceId),
    sourceVersion: Number(allocation.sourceVersion || extra.sourceVersion || 0),
    suggestedFix: clean(extra.suggestedFix)
  };
}

function emptyDiagnostics() {
  return ISSUE_GROUPS.reduce((acc, key) => {
    acc[key] = [];
    return acc;
  }, {});
}

function shouldReport(group, options = {}) {
  if (options.onlyMissingAllocations) return group === 'missingAllocations';
  if (options.onlyMissingRewardLedgers) return group === 'missingRewardLedgers';
  if (options.onlyInvalid) return group === 'invalidAllocations' || group === 'manualReviewRequired' || group === 'errors';
  if (options.onlyDebtDiff) return group === 'debtDiffs' || group === 'manualReviewRequired' || group === 'errors';
  return true;
}

function pushIssue(diagnostics, group, row, options = {}) {
  if (!diagnostics[group]) diagnostics[group] = [];
  if (shouldReport(group, options)) diagnostics[group].push(row);
}

function activeOrderForRepair(order = {}) {
  const status = clean(order.status || order.deliveryStatus || order.closeoutStatus).toLowerCase();
  if (ACTIVE_EXCLUDED_STATUSES.includes(status)) return false;
  if (order.isDeleted === true || order.deleted === true || clean(order.deletedAt)) return false;
  return true;
}

function versionKeys(version = {}) {
  return orderKeys(version);
}

async function loadLatestVersionsForOrders(orders = [], options = {}) {
  const ids = uniq((orders || []).flatMap(orderKeys));
  if (!ids.length) return new Map();
  const match = {
    status: { $nin: ACTIVE_EXCLUDED_STATUSES },
    $or: [
      { salesOrderId: { $in: ids } },
      { salesOrderCode: { $in: ids } },
      { orderId: { $in: ids } },
      { orderCode: { $in: ids } },
      { originalCloseoutId: { $in: ids } },
      { originalCloseoutCode: { $in: ids } },
      { closeoutCode: { $in: ids } }
    ]
  };
  let query = DeliveryCloseoutVersion.find(match).sort({ closeoutVersion: -1, sourceVersion: -1, updatedAt: -1, createdAt: -1 }).lean();
  if (options.session && typeof query.session === 'function') query = query.session(options.session);
  const rows = await query;
  const map = new Map();
  for (const row of rows || []) {
    for (const key of versionKeys(row)) {
      const current = map.get(key);
      const rowVersion = Number(row.closeoutVersion || row.sourceVersion || row.version || 0) || 0;
      const currentVersion = Number(current && (current.closeoutVersion || current.sourceVersion || current.version || 0)) || 0;
      if (!current || rowVersion > currentVersion) map.set(key, row);
    }
  }
  return map;
}

function latestVersionForOrder(order = {}, versionsByKey = new Map()) {
  for (const key of orderKeys(order)) {
    const version = versionsByKey.get(key);
    if (version) return version;
  }
  return null;
}

function resolveCloseoutSource(order = {}, versionsByKey = new Map()) {
  const latestVersion = latestVersionForOrder(order, versionsByKey);
  if (latestVersion) {
    const oCode = orderCode(order) || clean(latestVersion.orderCode || latestVersion.salesOrderCode || latestVersion.originalCloseoutCode);
    const sourceId = clean(latestVersion.id || latestVersion.code || latestVersion.closeoutCode || latestVersion.correctionId || latestVersion.originalCloseoutId || orderId(order) || oCode);
    const sourceVersion = Number(latestVersion.closeoutVersion || latestVersion.sourceVersion || latestVersion.version || 1) || 1;
    return {
      closeout: latestVersion,
      sourceLabel: 'deliveryCloseoutVersions/latest',
      buildOptions: {
        sourceType: 'delivery_closeout_version',
        sourceId,
        sourceCode: clean(latestVersion.code || latestVersion.closeoutCode || oCode),
        sourceVersion,
        closeoutScopeHash: clean(latestVersion.idempotencyKey || latestVersion.correctionId || latestVersion.code || latestVersion.closeoutCode || sourceId),
        idempotencyKey: `OPA:${safeToken(oCode || sourceId)}:delivery_closeout_version:${safeToken(sourceId)}:v${sourceVersion}`
      }
    };
  }
  const closeout = order.deliveryCloseout || order.closeout || order;
  const oCode = orderCode(order) || clean(closeout.orderCode || closeout.salesOrderCode);
  const sourceId = clean(closeout.id || closeout.code || closeout.closeoutCode || orderId(order) || oCode);
  const sourceVersion = Number(closeout.version || closeout.closeoutVersion || 1) || 1;
  return {
    closeout,
    sourceLabel: order.deliveryCloseout || order.closeout ? 'salesOrders.deliveryCloseout' : 'salesOrders/fallback',
    buildOptions: {
      sourceType: order.deliveryCloseout || order.closeout ? 'delivery_closeout' : 'sales_order_fallback',
      sourceId,
      sourceCode: clean(closeout.code || closeout.closeoutCode || oCode),
      sourceVersion,
      closeoutScopeHash: clean(closeout.closeoutScopeHash || closeout.scopeHash || closeout.idempotencyKey || sourceId),
      idempotencyKey: `OPA:${safeToken(oCode || sourceId)}:${order.deliveryCloseout || order.closeout ? 'delivery_closeout' : 'sales_order_fallback'}:${safeToken(sourceId)}:v${sourceVersion}`
    }
  };
}

async function postSelectedArRows(allocation = {}, expectedRows = [], options = {}) {
  const posted = [];
  for (const row of expectedRows || []) {
    const existed = await findActiveArLedgerByExpected(row, options);
    if (existed) {
      const actualAmount = actualArAmount(existed);
      const expectedAmount = expectedArAmount(row);
      if (actualAmount !== expectedAmount) {
        const err = new Error('AR ledger đã tồn tại nhưng sai số tiền, không tự cập nhật đè.');
        err.code = 'ORDER_PAYMENT_AR_AMOUNT_CONFLICT';
        err.row = row;
        err.existed = existed;
        throw err;
      }
      posted.push(existed);
      continue;
    }
    const saved = await paymentRepository.upsert(row, options);
    posted.push(saved || row);
  }
  return posted;
}

async function runOrderWork(options = {}, work) {
  if (typeof work !== 'function') throw new Error('runOrderWork cần function');
  if (!options.apply) return work({});
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await work({ session });
    });
    return result;
  } catch (err) {
    const message = clean(err && err.message).toLowerCase();
    const unsupported = message.includes('transaction numbers are only allowed') || message.includes('replica set') || message.includes('standalone servers');
    if (!unsupported) throw err;
    return work({});
  } finally {
    await session.endSession();
  }
}

function createRunCode() {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  return `OPR-${stamp}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function runFilterPayload(options = {}) {
  return {
    mode: options.apply ? 'apply' : 'dry-run',
    fromDate: toDateOnly(options.dateFrom || options.date || ''),
    toDate: toDateOnly(options.dateTo || options.date || ''),
    deliveryStaffCode: clean(options.deliveryStaffCode),
    salesStaffCode: clean(options.salesStaffCode),
    customerCode: clean(options.customerCode),
    orderCode: clean(options.orderCode),
    onlyDebtDiff: Boolean(options.onlyDebtDiff),
    fixDebtBalance: Boolean(options.fixDebtBalance),
    zeroTolerance: Number(options.zeroTolerance || 1000)
  };
}

async function createRunLog(options = {}) {
  const now = dateUtil.nowIso();
  const row = {
    runCode: createRunCode(),
    ...runFilterPayload(options),
    scannedOrders: 0,
    createdAllocations: 0,
    createdArLedgers: 0,
    createdFundLedgers: 0,
    createdDebtAdjustments: 0,
    skippedAlreadyFixed: 0,
    skippedDebtAlreadyReconciled: 0,
    zeroToleranceApplied: 0,
    debtAdjustmentDebitAmount: 0,
    debtAdjustmentCreditAmount: 0,
    invalidAllocations: 0,
    manualReviewRequired: 0,
    errors: [],
    status: 'running',
    startedAt: now,
    createdAt: now,
    updatedAt: now,
    createdBy: clean(options.actor || 'backfill-order-payment-allocations')
  };
  try {
    await OrderPaymentRepairRun.findOneAndUpdate({ runCode: row.runCode }, { $set: row }, { upsert: true, new: true });
  } catch (_) {}
  return row;
}

async function finishRunLog(run = {}, result = {}, status = 'completed') {
  if (!run || !run.runCode) return;
  const now = dateUtil.nowIso();
  const summary = result.summary || {};
  try {
    await OrderPaymentRepairRun.findOneAndUpdate(
      { runCode: run.runCode },
      {
        $set: {
          scannedOrders: Number(summary.scannedOrders || 0),
          createdAllocations: Number(summary.createdAllocations || 0),
          createdArLedgers: Number(summary.createdArLedgers || 0),
          createdFundLedgers: Number(summary.createdFundLedgers || 0),
          createdDebtAdjustments: Number(summary.createdDebtAdjustments || 0),
          skippedAlreadyFixed: Number(summary.skippedAlreadyFixed || 0),
          skippedDebtAlreadyReconciled: Number(summary.skippedDebtAlreadyReconciled || 0),
          zeroToleranceApplied: Number(summary.zeroToleranceApplied || 0),
          debtAdjustmentDebitAmount: Number(summary.debtAdjustmentDebitAmount || 0),
          debtAdjustmentCreditAmount: Number(summary.debtAdjustmentCreditAmount || 0),
          invalidAllocations: Number(summary.invalidAllocations || 0),
          manualReviewRequired: Number(summary.manualReviewRequired || 0),
          errors: (result.diagnostics && result.diagnostics.errors ? result.diagnostics.errors : []).slice(0, 100),
          status,
          finishedAt: now,
          updatedAt: now
        }
      },
      { new: true }
    );
  } catch (_) {}
}

async function processOneOrder(order = {}, context = {}) {
  const { options, versionsByKey, diagnostics, writes } = context;
  if (!activeOrderForRepair(order)) {
    writes.skippedAlreadyFixed += 1;
    return;
  }

  const resolved = resolveCloseoutSource(order, versionsByKey);
  let built;
  try {
    built = OrderPaymentAllocationService.buildAllocationFromCloseout(order, resolved.closeout, {
      ...resolved.buildOptions,
      actor: 'backfill-order-payment-allocations',
      zeroTolerance: options.zeroTolerance,
      metadata: { batchSource: resolved.sourceLabel }
    });
  } catch (err) {
    const row = diagnosticRow(order, {}, {
      issueType: 'invalid_source_data',
      suggestedFix: `Sửa dữ liệu closeout/version trước khi backfill: ${err.code || err.message}`,
      sourceType: resolved.buildOptions.sourceType,
      sourceId: resolved.buildOptions.sourceId,
      sourceVersion: resolved.buildOptions.sourceVersion
    });
    pushIssue(diagnostics, 'invalidAllocations', row, options);
    pushIssue(diagnostics, 'manualReviewRequired', { ...row, issueType: 'manual_invalid_source_data' }, options);
    writes.manualReviewRequired += 1;
    return;
  }

  await runOrderWork(options, async (tx = {}) => {
    const keys = orderKeys({ ...order, ...built });
    let allocation = await loadExistingAllocation(keys, tx);
    const arBalanceBefore = await sumArBalance(keys, tx);

    if (!allocation) {
      pushIssue(diagnostics, 'missingAllocations', diagnosticRow(order, built, {
        issueType: 'missing_allocation',
        arBalance: arBalanceBefore,
        expectedBalance: built.debtAmount,
        diff: money(arBalanceBefore - built.debtAmount),
        suggestedFix: 'Chạy --apply để tạo orderPaymentAllocation idempotent theo batch filter hiện tại.'
      }), options);
      if (options.apply) {
        allocation = await OrderPaymentAllocationService.upsertAllocation(built, { ...tx, actor: 'backfill-order-payment-allocations' });
        writes.createdAllocations += 1;
      } else {
        allocation = built;
      }
    }

    try {
      OrderPaymentAllocationService.validateAllocation(allocation);
    } catch (err) {
      const row = diagnosticRow(order, allocation, {
        issueType: 'invalid_allocation',
        arBalance: arBalanceBefore,
        expectedBalance: allocation.debtAmount,
        diff: 0,
        suggestedFix: `Allocation sai invariant: ${err.code || err.message}`
      });
      pushIssue(diagnostics, 'invalidAllocations', row, options);
      pushIssue(diagnostics, 'manualReviewRequired', { ...row, issueType: 'manual_invalid_allocation' }, options);
      writes.manualReviewRequired += 1;
      return;
    }

    const expectedArRows = OrderPaymentAllocationService.buildArLedgerRows(allocation);
    const missingArRows = [];
    for (const expected of expectedArRows) {
      const actual = await findActiveArLedgerByExpected(expected, tx);
      const expectedAmount = expectedArAmount(expected);
      if (!actual) {
        missingArRows.push(expected);
        pushIssue(diagnostics, 'missingArLedgers', diagnosticRow(order, allocation, {
          issueType: 'missing_ar_ledger',
          connectionType: 'allocation_to_arLedgers',
          category: clean(expected.category),
          idempotencyKey: clean(expected.idempotencyKey),
          expectedAmount,
          actualAmount: 0,
          expectedBalance: allocation.debtAmount,
          suggestedFix: isRewardRow(expected)
            ? 'Chạy --apply --fix-missing-reward-ledgers hoặc --apply --fix-missing-ar-ledgers để tạo AR ledger còn thiếu.'
            : 'Chạy --apply --fix-missing-ar-ledgers để tạo AR ledger còn thiếu.'
        }), options);
        if (isRewardRow(expected)) {
          pushIssue(diagnostics, 'missingRewardLedgers', diagnosticRow(order, allocation, {
            issueType: 'missing_reward_ledger',
            connectionType: 'allocation_to_arLedgers',
            category: clean(expected.category),
            idempotencyKey: clean(expected.idempotencyKey),
            expectedAmount,
            actualAmount: 0,
            expectedBalance: allocation.debtAmount,
            suggestedFix: 'Chạy --apply --fix-missing-reward-ledgers để tạo AR-REWARD-ALLOWANCE còn thiếu.'
          }), options);
        }
      } else {
        const actualAmount = actualArAmount(actual);
        if (actualAmount !== expectedAmount) {
          const row = diagnosticRow(order, allocation, {
            issueType: 'ar_ledger_amount_conflict',
            connectionType: 'allocation_to_arLedgers',
            category: clean(expected.category),
            idempotencyKey: clean(expected.idempotencyKey),
            expectedAmount,
            actualAmount,
            diff: money(actualAmount - expectedAmount),
            expectedBalance: allocation.debtAmount,
            suggestedFix: 'Không tự ghi đè. Kiểm tra ledger trùng/sai số tiền rồi reverse/repost bằng quy trình kế toán.'
          });
          pushIssue(diagnostics, 'amountConflicts', row, options);
          pushIssue(diagnostics, 'manualReviewRequired', { ...row, issueType: 'manual_ar_amount_conflict' }, options);
          writes.manualReviewRequired += 1;
        }
      }
    }

    const selectedArRows = missingArRows.filter((row) => {
      if (options.fixMissingArLedgers) return true;
      if (options.fixMissingRewardLedgers && isRewardRow(row)) return true;
      return false;
    });
    if (options.apply && selectedArRows.length) {
      const posted = await postSelectedArRows(allocation, selectedArRows, { ...tx, actor: 'backfill-order-payment-allocations' });
      const rewardCount = selectedArRows.filter(isRewardRow).length;
      writes.createdArLedgers += Array.isArray(posted) ? posted.length : 0;
      writes.createdRewardLedgers += rewardCount;
    }

    const expectedFunds = expectedFundRows(allocation);
    const missingFundRows = [];
    for (const expected of expectedFunds) {
      const actual = await findActiveFundLedgerByExpected(expected, tx);
      if (!actual) {
        missingFundRows.push(expected);
        pushIssue(diagnostics, 'missingFundLedgers', diagnosticRow(order, allocation, {
          issueType: 'missing_fund_ledger',
          connectionType: 'allocation_to_fundLedgers',
          category: clean(expected.fundType).toUpperCase(),
          idempotencyKey: clean(expected.idempotencyKey),
          expectedAmount: expected.amount,
          actualAmount: 0,
          expectedBalance: allocation.debtAmount,
          suggestedFix: 'Chạy --apply --fix-missing-fund-ledgers để tạo fundLedger còn thiếu cho TM/CK.'
        }), options);
      } else if (money(actual.amount) !== money(expected.amount)) {
        const row = diagnosticRow(order, allocation, {
          issueType: 'fund_ledger_amount_conflict',
          connectionType: 'allocation_to_fundLedgers',
          category: clean(expected.fundType).toUpperCase(),
          idempotencyKey: clean(expected.idempotencyKey),
          expectedAmount: expected.amount,
          actualAmount: money(actual.amount),
          diff: money(money(actual.amount) - expected.amount),
          expectedBalance: allocation.debtAmount,
          suggestedFix: 'Không tự ghi đè. Kiểm tra quỹ trùng/sai rồi reverse/repost theo quy trình quỹ.'
        });
        pushIssue(diagnostics, 'amountConflicts', row, options);
        pushIssue(diagnostics, 'manualReviewRequired', { ...row, issueType: 'manual_fund_amount_conflict' }, options);
        writes.manualReviewRequired += 1;
      }
    }
    if (options.apply && options.fixMissingFundLedgers && missingFundRows.length) {
      const postedFunds = await OrderPaymentAllocationService.postFundLedgersFromAllocation(allocation, { ...tx, actor: 'backfill-order-payment-allocations' });
      writes.createdFundLedgers += Array.isArray(postedFunds) ? postedFunds.length : 0;
    }

    const shouldReconcileDebt = options.onlyDebtDiff || options.fixDebtBalance;
    let finalDebtDiff = 0;
    let debtAlreadyHandled = false;
    if (shouldReconcileDebt) {
      const reconcile = await OrderPaymentDebtReconcileService.reconcileOrderDebt({
        order,
        allocation,
        apply: Boolean(options.apply && options.fixDebtBalance),
        session: tx.session,
        zeroTolerance: options.zeroTolerance,
        actor: 'backfill-order-payment-allocations'
      });
      finalDebtDiff = money(reconcile.diff);
      if (reconcile.zeroToleranceApplied) writes.zeroToleranceApplied += 1;
      if (reconcile.needsAdjustment || reconcile.skippedAlreadyReconciled || reconcile.manualReviewRequired) {
        const row = {
          ...(reconcile.diagnostic || {}),
          skipReason: reconcile.skipReason || '',
          issueType: reconcile.manualReviewRequired
            ? 'debt_reconcile_manual_review'
            : (reconcile.skippedAlreadyReconciled ? 'debt_already_reconciled' : 'debt_balance_diff'),
          suggestedFix: reconcile.manualReviewRequired
            ? ((reconcile.diagnostic && reconcile.diagnostic.suggestedFix) || 'Debt reconcile cần kiểm tra thủ công.')
            : (reconcile.skippedAlreadyReconciled
              ? 'Đã có AR-DEBT-ADJUSTMENT reconcile idempotent và AR balance đã khớp expectedDebtAmount.'
              : 'Chạy --apply --fix-debt-balance để tạo AR-DEBT-ADJUSTMENT debit/credit theo diff.')
        };
        pushIssue(diagnostics, reconcile.manualReviewRequired ? 'manualReviewRequired' : 'debtDiffs', row, options);
        if (reconcile.manualReviewRequired) writes.manualReviewRequired += 1;
      }
      if (reconcile.skippedAlreadyReconciled) {
        writes.skippedDebtAlreadyReconciled += 1;
        debtAlreadyHandled = true;
      }
      if (reconcile.posted) {
        writes.createdDebtAdjustments += 1;
        if (reconcile.action === 'create-credit') writes.debtAdjustmentCreditAmount += Math.abs(finalDebtDiff);
        if (reconcile.action === 'create-debit') writes.debtAdjustmentDebitAmount += Math.abs(finalDebtDiff);
      }
    } else {
      const arBalance = await sumArBalance(keys, tx);
      const diff = money(arBalance - money(allocation.debtAmount));
      finalDebtDiff = diff;
      if (diff !== 0) {
        pushIssue(diagnostics, 'manualReviewRequired', diagnosticRow(order, allocation, {
          issueType: 'allocation_debt_ar_diff',
          arBalance,
          expectedBalance: allocation.debtAmount,
          diff,
          suggestedFix: 'Kiểm tra ledger thiếu/trùng; với lỗi trả thưởng dùng --apply --fix-missing-reward-ledgers hoặc dùng --apply --fix-debt-balance để tự tạo AR-DEBT-ADJUSTMENT.'
        }), options);
        writes.manualReviewRequired += 1;
      }
    }

    if (!missingArRows.length && !missingFundRows.length && finalDebtDiff === 0 && !debtAlreadyHandled) {
      writes.skippedAlreadyFixed += 1;
    }
  });
}

function countIssues(diagnostics = {}) {
  return ISSUE_GROUPS.reduce((sum, key) => sum + ((diagnostics[key] || []).length), 0);
}

function buildSummary(orders = [], diagnostics = {}, writes = {}, options = {}) {
  return {
    scannedOrders: orders.length,
    missingAllocations: (diagnostics.missingAllocations || []).length,
    missingRewardLedgers: (diagnostics.missingRewardLedgers || []).length,
    missingArLedgers: (diagnostics.missingArLedgers || []).length,
    missingFundLedgers: (diagnostics.missingFundLedgers || []).length,
    amountConflicts: (diagnostics.amountConflicts || []).length,
    invalidAllocations: (diagnostics.invalidAllocations || []).length,
    manualReviewRequired: (diagnostics.manualReviewRequired || []).length,
    debtDiffs: (diagnostics.debtDiffs || []).length,
    createdAllocations: Number(writes.createdAllocations || 0),
    createdArLedgers: Number(writes.createdArLedgers || 0),
    createdFundLedgers: Number(writes.createdFundLedgers || 0),
    createdRewardLedgers: Number(writes.createdRewardLedgers || 0),
    createdDebtAdjustments: Number(writes.createdDebtAdjustments || 0),
    skippedAlreadyFixed: Number(writes.skippedAlreadyFixed || 0),
    skippedDebtAlreadyReconciled: Number(writes.skippedDebtAlreadyReconciled || 0),
    zeroToleranceApplied: Number(writes.zeroToleranceApplied || 0),
    debtAdjustmentDebitAmount: Number(writes.debtAdjustmentDebitAmount || 0),
    debtAdjustmentCreditAmount: Number(writes.debtAdjustmentCreditAmount || 0),
    errors: (diagnostics.errors || []).length,
    mode: options.apply ? 'apply' : 'dry-run'
  };
}

async function auditAndMaybeApply(options = {}) {
  const filter = buildOrderFilter(options);
  const limit = parsePositiveInt(options.limit, 5000, 1, 100000);
  const batchSize = parsePositiveInt(options.batchSize, 200, 1, 5000);
  let orderQuery = SalesOrder.find(filter).sort({ deliveryDate: -1, orderDate: -1, createdAt: -1 }).limit(limit).lean();
  const orders = await orderQuery;
  const versionsByKey = await loadLatestVersionsForOrders(orders);
  const diagnostics = emptyDiagnostics();
  const writes = { createdAllocations: 0, createdArLedgers: 0, createdRewardLedgers: 0, createdFundLedgers: 0, createdDebtAdjustments: 0, skippedAlreadyFixed: 0, skippedDebtAlreadyReconciled: 0, zeroToleranceApplied: 0, debtAdjustmentDebitAmount: 0, debtAdjustmentCreditAmount: 0, manualReviewRequired: 0 };
  const run = await createRunLog(options);

  for (let i = 0; i < orders.length; i += batchSize) {
    const batch = orders.slice(i, i + batchSize);
    for (const order of batch) {
      try {
        await processOneOrder(order, { options, versionsByKey, diagnostics, writes });
      } catch (err) {
        const row = diagnosticRow(order, {}, {
          issueType: 'processing_error',
          suggestedFix: err && err.message ? err.message : String(err || 'unknown error')
        });
        pushIssue(diagnostics, 'errors', row, options);
        pushIssue(diagnostics, 'manualReviewRequired', { ...row, issueType: 'manual_processing_error' }, options);
        writes.manualReviewRequired += 1;
      }
    }
  }

  const summary = buildSummary(orders, diagnostics, writes, options);
  const result = {
    title: TITLE,
    runCode: run.runCode,
    dryRun: options.apply !== true,
    apply: options.apply === true,
    database: mongoose.connection.name || '',
    filters: runFilterPayload(options),
    limit,
    batchSize,
    summary,
    issueCount: countIssues(diagnostics),
    diagnostics
  };
  await finishRunLog(run, result, 'completed');
  return result;
}

function printText(result = {}) {
  const summary = result.summary || {};
  console.log(result.title);
  console.log(`Run: ${result.runCode || '<not-logged>'}`);
  console.log(`Database: ${result.database || '<unknown>'}`);
  console.log(`Mode: ${result.apply ? 'apply' : 'dry-run'}`);
  console.log(`Filters: ${JSON.stringify(result.filters || {})}`);
  console.log('Summary:');
  for (const key of ['scannedOrders', 'missingAllocations', 'missingRewardLedgers', 'missingArLedgers', 'missingFundLedgers', 'amountConflicts', 'invalidAllocations', 'manualReviewRequired', 'debtDiffs', 'createdAllocations', 'createdArLedgers', 'createdFundLedgers', 'createdRewardLedgers', 'createdDebtAdjustments', 'skippedAlreadyFixed', 'skippedDebtAlreadyReconciled', 'zeroToleranceApplied', 'debtAdjustmentDebitAmount', 'debtAdjustmentCreditAmount', 'errors']) {
    console.log(`- ${key}: ${summary[key] || 0}`);
  }
  for (const [name, rows] of Object.entries(result.diagnostics || {})) {
    console.log(`${name}: ${rows.length}`);
    if (rows.length) console.log(JSON.stringify(rows.slice(0, 50), null, 2));
  }
  console.log(result.issueCount ? 'DIAGNOSTIC_WARN' : 'DIAGNOSTIC_PASS');
}

async function main() {
  const options = parseArgs();
  await connectDB();
  let result;
  try {
    result = await auditAndMaybeApply(options);
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else printText(result);
  } catch (err) {
    if (options.json) console.log(JSON.stringify({ title: TITLE, error: err && err.message ? err.message : String(err || 'unknown error') }, null, 2));
    else console.error('[backfill-order-payment-allocations] failed:', err && err.stack ? err.stack : err);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
  if (options.strict && result && result.issueCount) process.exitCode = 2;
}

if (require.main === module) main();

module.exports = {
  TITLE,
  parseArgs,
  auditAndMaybeApply,
  buildOrderFilter,
  diagnosticRow,
  resolveCloseoutSource,
  expectedFundRows,
  _internal: {
    clean,
    money,
    uniq,
    orderKeys,
    buildLedgerMatchForKeys,
    sumArBalance,
    hasRewardLedger,
    buildSummary,
    shouldReport,
    safeToken
  }
};
