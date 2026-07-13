#!/usr/bin/env node
'use strict';

try { require('dotenv').config(); } catch (_) {}

const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const orderRepository = require('../src/repositories/orderRepository');
const { findReturnOrdersForDeliveryChildren } = require('../src/services/master-order/masterOrderReturn.impl');
const DeliveryCloseoutService = require('../src/services/accounting/DeliveryCloseoutService');
const auditService = require('../src/services/auditService');
const dateUtil = require('../src/utils/date.util');
const { withMongoTransaction } = require('../src/utils/transaction.util');

const LEGACY_REPAIR_REASONS = new Set([
  'legacy_negative_closeout_value',
  'invalid_legacy_closeout_money',
  'missing_required_closeout_field'
]);

function clean(value = '') {
  return String(value ?? '').trim();
}

function money(value) {
  return DeliveryCloseoutService._internal.money(value);
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = { apply: false, json: false, actor: 'system', orderCodes: [] };
  for (const item of argv) {
    if (item === '--apply') args.apply = true;
    else if (item === '--json') args.json = true;
    else if (item.startsWith('--actor=')) args.actor = clean(item.slice('--actor='.length)) || 'system';
    else if (item.startsWith('--order-codes=')) {
      args.orderCodes.push(...item.slice('--order-codes='.length).split(',').map(clean).filter(Boolean));
    } else if (item.startsWith('--order-code=')) {
      args.orderCodes.push(clean(item.slice('--order-code='.length)));
    }
  }
  args.orderCodes = [...new Set(args.orderCodes.filter(Boolean))];
  return args;
}

function compactCloseout(closeout = {}) {
  return {
    id: clean(closeout.id || closeout.closeoutId),
    code: clean(closeout.code || closeout.closeoutCode),
    status: clean(closeout.status),
    version: Number(closeout.version || closeout.closeoutVersion || 0) || 0,
    originalAmount: money(closeout.originalAmount),
    returnedAmount: money(closeout.returnedAmount ?? closeout.returnAmount),
    returnAmount: money(closeout.returnAmount ?? closeout.returnedAmount),
    cashAmount: money(closeout.cashAmount),
    bankAmount: money(closeout.bankAmount),
    rewardAmount: money(closeout.rewardAmount),
    finalDebtAmount: money(closeout.finalDebtAmount),
    rawFinalDebtAmount: money(closeout.rawFinalDebtAmount),
    returnOrderIds: Array.isArray(closeout.returnOrderIds) ? closeout.returnOrderIds.map(clean).filter(Boolean) : [],
    calculationHash: clean(closeout.calculationHash),
    sourceHash: clean(closeout.sourceHash),
    updatedAt: clean(closeout.updatedAt),
    updatedBy: clean(closeout.updatedBy),
    repairReason: clean(closeout.repairReason),
    repairFields: Array.isArray(closeout.repairFields) ? closeout.repairFields.map(clean).filter(Boolean) : []
  };
}

function calculationHashOf(closeout = {}) {
  return clean(closeout.calculationHash || closeout.sourceHash || DeliveryCloseoutService._internal.stableHash(compactCloseout(closeout)));
}

function mismatchReasons(compare = {}) {
  return [...new Set((compare.mismatches || []).map((row) => clean(row.reason || 'amount_mismatch')).filter(Boolean))];
}

function hasLegacyRepairReason(compare = {}) {
  return (compare.mismatches || []).some((row) => LEGACY_REPAIR_REASONS.has(row.reason));
}

function buildRepairCloseout(existing = {}, canonical = {}, actor = 'system', now = dateUtil.nowIso(), compare = {}) {
  return {
    ...existing,
    originalAmount: money(canonical.originalAmount),
    deliveredAmount: money(canonical.deliveredAmount),
    returnedAmount: money(canonical.returnedAmount),
    returnAmount: money(canonical.returnedAmount),
    cashAmount: money(canonical.cashAmount),
    bankAmount: money(canonical.bankAmount),
    collectedAmount: money(canonical.collectedAmount),
    offsetAmount: money(canonical.offsetAmount),
    rewardAmount: money(canonical.rewardAmount),
    finalDebtAmount: money(canonical.finalDebtAmount),
    rawFinalDebtAmount: money(canonical.rawFinalDebtAmount),
    returnOrderIds: Array.isArray(canonical.returnOrderIds) ? canonical.returnOrderIds : [],
    paymentIds: Array.isArray(canonical.paymentIds) ? canonical.paymentIds : [],
    calculationHash: clean(canonical.calculationHash),
    sourceHash: clean(canonical.sourceHash),
    repairReason: hasLegacyRepairReason(compare) ? 'legacy_negative_returned_amount' : clean(existing.repairReason),
    repairFields: [...new Set((compare.mismatches || []).map((row) => row.field).filter(Boolean))],
    updatedAt: now,
    updatedBy: actor
  };
}

async function loadOrderByCode(orderCode, options = {}) {
  const rows = await orderRepository.findManyByIdentity([orderCode], {
    ...options,
    limit: 1,
    projection: [
      'id', 'code', 'orderCode', 'salesOrderId', 'salesOrderCode', 'documentCode', 'invoiceCode',
      'customerCode', 'customerName', 'totalAmount', 'deliveryDate', 'date', 'orderDate',
      'salesStaffCode', 'salesStaffName', 'deliveryStaffCode', 'deliveryStaffName',
      'status', 'deliveryStatus', 'accountingStatus', 'accountingConfirmed',
      'deliveryCloseout', 'updatedAt', 'version'
    ].join(' ')
  });
  return rows[0] || null;
}

async function buildPlanForOrder(order = {}, options = {}) {
  const returnOrders = Array.isArray(options.returnOrders)
    ? options.returnOrders
    : await findReturnOrdersForDeliveryChildren([order], options);
  const existingCloseout = order.deliveryCloseout || {};
  const canonical = DeliveryCloseoutService.buildCloseout(order, returnOrders, [], {
    actor: options.actor || 'system',
    status: existingCloseout.status || 'pending_accounting',
    reason: existingCloseout.reason || ''
  });
  DeliveryCloseoutService.validateCanonicalCloseout(canonical, { order });
  const compare = DeliveryCloseoutService.compareCloseout(canonical, existingCloseout, { order });
  const wouldRepair = compare.ok === false && hasLegacyRepairReason(compare);
  return {
    orderId: DeliveryCloseoutService.orderId(order),
    orderCode: DeliveryCloseoutService.orderCode(order),
    currentStatus: clean(order.accountingStatus || order.status || order.deliveryStatus),
    accountingConfirmed: order.accountingConfirmed === true,
    existingReturnedAmount: money(existingCloseout.returnedAmount ?? existingCloseout.returnAmount),
    canonicalReturnedAmount: money(canonical.returnedAmount),
    existingFinalDebtAmount: money(existingCloseout.finalDebtAmount),
    canonicalFinalDebtAmount: money(canonical.finalDebtAmount),
    returnOrderIds: Array.isArray(canonical.returnOrderIds) ? canonical.returnOrderIds : [],
    mismatchReasons: mismatchReasons(compare),
    mismatches: compare.mismatches || [],
    beforeCalculationHash: calculationHashOf(existingCloseout),
    afterCalculationHash: calculationHashOf(canonical),
    before: compactCloseout(existingCloseout),
    after: compactCloseout(buildRepairCloseout(existingCloseout, canonical, options.actor || 'system', options.now || dateUtil.nowIso(), compare)),
    wouldRepair,
    applied: false
  };
}

async function inspectOrderCode(orderCode, options = {}) {
  const order = await loadOrderByCode(orderCode, options);
  if (!order) {
    return {
      orderCode,
      error: 'ORDER_NOT_FOUND',
      wouldRepair: false,
      applied: false
    };
  }
  return buildPlanForOrder(order, options);
}

async function applyOrderCode(orderCode, options = {}) {
  return withMongoTransaction(async (session) => {
    const now = options.now || dateUtil.nowIso();
    const actor = clean(options.actor || 'system');
    const order = await loadOrderByCode(orderCode, { ...options, session });
    if (!order) return { orderCode, error: 'ORDER_NOT_FOUND', wouldRepair: false, applied: false };
    const plan = await buildPlanForOrder(order, { ...options, session, actor, now });
    if (!plan.wouldRepair) return plan;

    const latest = await loadOrderByCode(orderCode, { ...options, session });
    const latestPlan = await buildPlanForOrder(latest, { ...options, session, actor, now });
    if (!latestPlan.wouldRepair) return latestPlan;

    const patch = {
      deliveryCloseout: {
        ...latest.deliveryCloseout,
        ...latestPlan.after,
        updatedAt: now,
        updatedBy: actor
      },
      updatedAt: now
    };
    const guard = { updatedAt: latest.updatedAt };
    const calculationHash = clean(latest.deliveryCloseout?.calculationHash);
    const sourceHash = clean(latest.deliveryCloseout?.sourceHash);
    if (calculationHash) guard.calculationHash = calculationHash;
    if (sourceHash) guard.sourceHash = sourceHash;
    const result = await orderRepository.patchDeliveryCloseoutSnapshotById(
      DeliveryCloseoutService.orderId(latest),
      patch,
      guard,
      { session }
    );
    if (!result || Number(result.matchedCount || 0) === 0) {
      const err = new Error('Delivery closeout snapshot changed before repair could be applied.');
      err.code = 'DELIVERY_CLOSEOUT_REPAIR_CONCURRENT_UPDATE';
      err.orderCode = orderCode;
      throw err;
    }

    await auditService.log('DELIVERY_CLOSEOUT_LEGACY_SNAPSHOT_REPAIRED', {
      refType: 'SALES_ORDER',
      refId: latestPlan.orderId,
      refCode: latestPlan.orderCode,
      user: actor,
      before: { deliveryCloseout: latestPlan.before },
      after: { deliveryCloseout: latestPlan.after },
      mismatchReasons: latestPlan.mismatchReasons,
      canonicalReturnOrderIds: latestPlan.returnOrderIds
    }, { session });

    return {
      ...latestPlan,
      applied: true,
      patchResult: result
    };
  });
}

async function run(options = {}) {
  if (!Array.isArray(options.orderCodes) || !options.orderCodes.length) {
    const err = new Error('Missing --order-codes. This script never scans the whole database.');
    err.code = 'ORDER_CODES_REQUIRED';
    throw err;
  }
  await connectDB();
  const results = [];
  for (const orderCode of options.orderCodes) {
    if (options.apply) results.push(await applyOrderCode(orderCode, options));
    else results.push(await inspectOrderCode(orderCode, options));
  }
  return {
    ok: true,
    mode: options.apply ? 'apply' : 'dry-run',
    orderCodes: options.orderCodes,
    results
  };
}

async function main() {
  const options = parseArgs();
  const report = await run(options);
  console.log(JSON.stringify(report, null, 2));
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error(JSON.stringify({
        ok: false,
        code: err.code || 'DELIVERY_CLOSEOUT_NEGATIVE_RETURN_REPAIR_FAILED',
        message: err.message
      }, null, 2));
      process.exitCode = 1;
    })
    .finally(async () => {
      await mongoose.connection.close().catch(() => {});
    });
}

module.exports = {
  parseArgs,
  compactCloseout,
  buildRepairCloseout,
  buildPlanForOrder,
  inspectOrderCode,
  applyOrderCode,
  run,
  _internal: { mismatchReasons, hasLegacyRepairReason, calculationHashOf }
};
