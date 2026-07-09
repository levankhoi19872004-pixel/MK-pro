'use strict';

const dateUtil = require('../utils/date.util');
const { toNumber } = require('../utils/common.util');
const {
  buildArSaleLedger,
  buildArSaleReversalLedger,
  assertValidArLedgerContract,
  isCanonicalArDebtLedger,
  validateArLedgerContract
} = require('../domain/ar/arLedgerContract');
const arDebtReadModel = require('./arDebtReadModel.service');

let models = null;
function getModels() {
  if (models) return models;
  models = {
    SalesOrder: require('../models/SalesOrder'),
    ArLedger: require('../models/ArLedger'),
    AuditLog: require('../models/AuditLog')
  };
  return models;
}

function setModelsForTest(nextModels) {
  models = nextModels || null;
}

const localLocks = new Map();

function clean(value = '') {
  return String(value ?? '').trim();
}

function actorName(accountant) {
  if (typeof accountant === 'string') return clean(accountant) || 'system';
  return clean(accountant?.code || accountant?.id || accountant?.name || accountant?.email || 'system') || 'system';
}

function orderSourceId(order = {}) {
  return clean(order.salesOrderId || order.sourceId || order.orderId || order.id || order._id || order.code || order.orderCode);
}

function orderSourceCode(order = {}) {
  return clean(order.salesOrderCode || order.sourceCode || order.orderCode || order.code || order.id || order._id || orderSourceId(order));
}

function confirmableAmount(order = {}) {
  return Math.max(0, Math.round(toNumber(
    order.debtBeforeCollection
    ?? order.totalAmount
    ?? order.amount
    ?? order.grandTotal
    ?? order.payableAmount
    ?? order.debtAmount
    ?? order.debt
    ?? 0
  )));
}

async function execQuery(query) {
  if (!query) return query;
  if (typeof query.exec === 'function') return query.exec();
  return query;
}

async function findOneLean(Model, filter, options = {}) {
  let query = Model.findOne(filter);
  if (options.session && typeof query.session === 'function') query = query.session(options.session);
  if (typeof query.lean === 'function') query = query.lean();
  return execQuery(query);
}

async function findLean(Model, filter, options = {}) {
  let query = Model.find(filter);
  if (options.session && typeof query.session === 'function') query = query.session(options.session);
  if (typeof query.lean === 'function') query = query.lean();
  return execQuery(query);
}

async function updateOne(Model, filter, update, options = {}) {
  if (typeof Model.updateOne === 'function') return Model.updateOne(filter, update, { session: options.session });
  if (typeof Model.findOneAndUpdate === 'function') return Model.findOneAndUpdate(filter, update, { new: true, session: options.session });
  return null;
}

async function findOneAndUpdateLean(Model, filter, update, opts = {}) {
  let query = Model.findOneAndUpdate(filter, update, {
    upsert: Boolean(opts.upsert),
    new: true,
    setDefaultsOnInsert: true,
    session: opts.session
  });
  if (typeof query.lean === 'function') query = query.lean();
  return execQuery(query);
}

function orderLookupFilter({ orderId, orderCode, order }) {
  if (order && typeof order === 'object' && Object.keys(order).length) return null;
  const keys = [orderId, orderCode].map(clean).filter(Boolean);
  if (!keys.length) throw new Error('Thiếu orderId/orderCode để confirm/reverse AR-SALE');
  return {
    $or: [
      { id: { $in: keys } },
      { _id: { $in: keys } },
      { code: { $in: keys } },
      { orderId: { $in: keys } },
      { orderCode: { $in: keys } },
      { salesOrderId: { $in: keys } },
      { salesOrderCode: { $in: keys } },
      { sourceId: { $in: keys } },
      { sourceCode: { $in: keys } }
    ]
  };
}

async function resolveSalesOrder(input = {}, options = {}) {
  if (input.order && typeof input.order === 'object') return input.order;
  const filter = orderLookupFilter(input);
  const { SalesOrder } = getModels();
  const order = await findOneLean(SalesOrder, filter, options);
  if (!order) {
    const err = new Error(`Không tìm thấy salesOrder để post AR: ${clean(input.orderId || input.orderCode)}`);
    err.code = 'SALES_ORDER_NOT_FOUND';
    throw err;
  }
  return order;
}

function validateOrderConfirmable(order = {}, options = {}) {
  const sourceId = orderSourceId(order);
  const amount = confirmableAmount(order);
  if (!sourceId) {
    const err = new Error('SalesOrder thiếu sourceId/id để tạo idempotencyKey AR-SALE');
    err.code = 'AR_SALE_SOURCE_ID_REQUIRED';
    throw err;
  }
  if (!clean(order.customerCode || order.customerId)) {
    const err = new Error(`SalesOrder ${sourceId} thiếu customerCode`);
    err.code = 'AR_SALE_CUSTOMER_REQUIRED';
    throw err;
  }
  if (amount <= 0 && !options.postZero) {
    const err = new Error(`SalesOrder ${sourceId} không có amount dương để tạo AR-SALE`);
    err.code = 'AR_SALE_AMOUNT_REQUIRED';
    throw err;
  }
  return { sourceId, sourceCode: orderSourceCode(order), amount };
}

async function auditIssue(issue = {}, options = {}) {
  const { AuditLog } = getModels();
  if (!AuditLog || typeof AuditLog.create !== 'function') return null;
  try {
    return AuditLog.create([{
      type: 'AR_LEDGER_CONTRACT_ISSUE',
      action: 'phase79_ar_sale_dirty_ledger_detected',
      severity: issue.severity || 'P0',
      source: 'arPosting.service',
      payload: issue,
      createdAt: dateUtil.nowIso()
    }], { session: options.session });
  } catch (_) {
    return null;
  }
}

async function withSourceLock(sourceId, fn) {
  const key = `AR-SALE:${sourceId}`;
  while (localLocks.has(key)) await localLocks.get(key);
  let release;
  const waiter = new Promise((resolve) => { release = resolve; });
  localLocks.set(key, waiter);
  try {
    return await fn();
  } finally {
    localLocks.delete(key);
    release();
  }
}

async function findDirtySaleLedgers(sourceId, options = {}) {
  const { ArLedger } = getModels();
  const rows = await findLean(ArLedger, {
    account: 'AR',
    accountingConfirmed: true,
    $or: [
      { sourceId },
      { salesOrderId: sourceId },
      { orderId: sourceId },
      { idempotencyKey: `AR-SALE:salesOrder:${sourceId}` }
    ]
  }, options);
  return (rows || []).filter((row) => {
    const category = clean(row.category).toUpperCase();
    const ledgerType = clean(row.ledgerType).toUpperCase();
    const sourceType = clean(row.sourceType).toLowerCase();
    const idempotencyKey = clean(row.idempotencyKey);
    const legacyCode = clean(row.code || row.id).toUpperCase();
    return category === 'AR-SALE'
      || ledgerType === 'AR-SALE'
      || idempotencyKey === `AR-SALE:salesOrder:${sourceId}`
      || legacyCode.startsWith('AR-SALE')
      || (sourceType === 'salesorder' && clean(row.sourceId) === clean(sourceId));
  }).filter((row) => !isCanonicalArDebtLedger(row));
}

async function confirmSalesOrderAR(input = {}) {
  const options = { session: input.session, postZero: input.postZero };
  const order = await resolveSalesOrder(input, options);
  const { sourceId, sourceCode, amount } = validateOrderConfirmable(order, options);
  const actor = actorName(input.accountant || input.user || order.accountingConfirmedBy);
  const { ArLedger, SalesOrder } = getModels();

  return withSourceLock(sourceId, async () => {
    const idempotencyKey = `AR-SALE:salesOrder:${sourceId}`;
    const existing = await findOneLean(ArLedger, {
      idempotencyKey,
      account: 'AR',
      category: 'AR-SALE',
      accountingConfirmed: true,
      accountingStatus: 'confirmed',
      active: true,
      reversed: { $ne: true }
    }, options);
    if (existing && isCanonicalArDebtLedger(existing)) {
      return { ok: true, created: false, existing: true, sourceId, sourceCode, ledger: existing };
    }

    const dirtyRows = await findDirtySaleLedgers(sourceId, options);
    if (dirtyRows.length) {
      await auditIssue({
        severity: 'P0',
        code: 'DIRTY_AR_SALE_LEDGER_IGNORED_AS_CANONICAL',
        sourceId,
        sourceCode,
        dirtyLedgers: dirtyRows.map((row) => ({ ledgerId: clean(row.id || row.code || row._id), validation: validateArLedgerContract(row) }))
      }, options);
    }

    const ledger = buildArSaleLedger(order, {
      accountant: actor,
      reason: input.reason || 'accounting confirm',
      amount,
      session: input.session
    });
    assertValidArLedgerContract(ledger);
    const saved = await findOneAndUpdateLean(ArLedger, { idempotencyKey: ledger.idempotencyKey }, { $setOnInsert: ledger }, { ...options, upsert: true });
    if (!isCanonicalArDebtLedger(saved)) assertValidArLedgerContract(saved);

    await updateOne(SalesOrder, {
      $or: [
        { id: sourceId },
        { _id: sourceId },
        { code: sourceCode },
        { orderId: sourceId },
        { orderCode: sourceCode },
        { salesOrderId: sourceId },
        { salesOrderCode: sourceCode }
      ]
    }, {
      $set: {
        accountingConfirmed: true,
        accountingStatus: 'confirmed',
        arPostedAt: dateUtil.nowIso(),
        arPostingService: 'phase79_arPosting.service',
        arSaleIdempotencyKey: ledger.idempotencyKey
      }
    }, options);

    await auditIssue({ severity: 'INFO', code: 'AR_SALE_CANONICAL_POSTED', sourceId, sourceCode, ledgerId: saved.id || saved.code }, options);
    return { ok: true, created: true, existing: false, sourceId, sourceCode, ledger: saved, dirtyRowsIgnored: dirtyRows.length };
  });
}

async function findActiveCanonicalSale(sourceId, options = {}) {
  const { ArLedger } = getModels();
  const row = await findOneLean(ArLedger, {
    idempotencyKey: `AR-SALE:salesOrder:${sourceId}`,
    account: 'AR',
    category: 'AR-SALE',
    accountingConfirmed: true,
    accountingStatus: 'confirmed',
    active: true,
    reversed: { $ne: true }
  }, options);
  if (!row || !isCanonicalArDebtLedger(row)) return null;
  return row;
}


async function postArLedgerEntry(entry = {}, options = {}) {
  if (!entry || typeof entry !== 'object') return null;
  const idempotencyKey = clean(entry.idempotencyKey);
  if (!idempotencyKey) {
    const err = new Error('AR ledger entry thiếu idempotencyKey.');
    err.code = 'AR_LEDGER_IDEMPOTENCY_REQUIRED';
    err.severity = 'P0';
    throw err;
  }
  const result = validateArLedgerContract(entry);
  if (!result.ok) {
    const err = new Error(`Invalid canonical AR ledger ${result.ledgerId}: ${result.errors.map((item) => item.code).join(', ')}`);
    err.code = 'INVALID_AR_LEDGER_CONTRACT';
    err.severity = 'P0';
    err.validation = result;
    throw err;
  }
  const { ArLedger } = getModels();
  return findOneAndUpdateLean(ArLedger, { idempotencyKey }, { $setOnInsert: entry }, { ...options, upsert: true });
}

async function reverseSalesOrderAR(input = {}) {
  const options = { session: input.session };
  const order = await resolveSalesOrder(input, options);
  const { sourceId, sourceCode } = validateOrderConfirmable(order, { ...options, postZero: true });
  const actor = actorName(input.accountant || input.user || order.accountingConfirmedBy);
  const { ArLedger, SalesOrder } = getModels();

  return withSourceLock(sourceId, async () => {
    const alreadyReversed = await findOneLean(ArLedger, {
      account: 'AR',
      category: 'AR-SALE-REVERSAL',
      sourceType: 'salesOrder',
      sourceId,
      accountingConfirmed: true,
      accountingStatus: 'confirmed',
      active: true
    }, options);
    if (alreadyReversed && isCanonicalArDebtLedger(alreadyReversed)) {
      await arDebtReadModel.rebuildDebtForSource(sourceId, { ...options, dryRun: input.dryRunReadModel === true });
      return { ok: true, created: false, existing: true, sourceId, sourceCode, reversal: alreadyReversed };
    }

    const original = await findActiveCanonicalSale(sourceId, options);
    if (!original) {
      const err = new Error(`Không tìm thấy active canonical AR-SALE để reverse: ${sourceId}`);
      err.code = 'AR_SALE_CANONICAL_NOT_FOUND';
      throw err;
    }
    assertValidArLedgerContract(original);

    const originalLedgerId = clean(original.id || original._id || original.code);
    const idempotencyKey = `AR-SALE-REVERSAL:salesOrder:${sourceId}:${originalLedgerId}`;
    const existingReversal = await findOneLean(ArLedger, {
      idempotencyKey,
      account: 'AR',
      category: 'AR-SALE-REVERSAL',
      accountingConfirmed: true,
      accountingStatus: 'confirmed',
      active: true
    }, options);
    if (existingReversal && isCanonicalArDebtLedger(existingReversal)) {
      await arDebtReadModel.rebuildDebtForSource(sourceId, { ...options, dryRun: input.dryRunReadModel === true });
      return { ok: true, created: false, existing: true, sourceId, sourceCode, reversal: existingReversal, original };
    }

    const reversal = buildArSaleReversalLedger(original, { accountant: actor, reason: input.reason || 'reverse AR-SALE' });
    assertValidArLedgerContract(reversal);
    const savedReversal = await findOneAndUpdateLean(ArLedger, { idempotencyKey: reversal.idempotencyKey }, { $setOnInsert: reversal }, { ...options, upsert: true });

    await updateOne(ArLedger, { idempotencyKey: original.idempotencyKey }, {
      $set: {
        accountingStatus: 'reversed',
        reversed: true,
        active: false,
        reversedAt: dateUtil.nowIso(),
        reversedBy: actor,
        reversalLedgerId: clean(savedReversal.id || savedReversal.code || savedReversal._id),
        reversalBatchId: savedReversal.accountingBatchId,
        reversalReason: input.reason || 'reverse AR-SALE',
        updatedAt: dateUtil.nowIso()
      },
      $push: {
        auditTrail: {
          action: 'mark_ar_sale_reversed_phase79',
          at: dateUtil.nowIso(),
          by: actor,
          reversalLedgerId: clean(savedReversal.id || savedReversal.code || savedReversal._id),
          reversalBatchId: savedReversal.accountingBatchId
        }
      }
    }, options);

    await updateOne(SalesOrder, {
      $or: [
        { id: sourceId },
        { _id: sourceId },
        { code: sourceCode },
        { orderId: sourceId },
        { orderCode: sourceCode },
        { salesOrderId: sourceId },
        { salesOrderCode: sourceCode }
      ]
    }, {
      $set: {
        accountingStatus: 'reversed',
        arReversedAt: dateUtil.nowIso(),
        arReversalIdempotencyKey: savedReversal.idempotencyKey
      }
    }, options);

    await arDebtReadModel.rebuildDebtForSource(sourceId, { ...options, dryRun: input.dryRunReadModel === true });
    await auditIssue({ severity: 'INFO', code: 'AR_SALE_CANONICAL_REVERSED', sourceId, sourceCode, ledgerId: originalLedgerId, reversalLedgerId: clean(savedReversal.id || savedReversal.code) }, options);
    return { ok: true, created: true, existing: false, sourceId, sourceCode, reversal: savedReversal, originalLedgerId };
  });
}

module.exports = {
  confirmSalesOrderAR,
  reverseSalesOrderAR,
  postArLedgerEntry,
  setModelsForTest
};
