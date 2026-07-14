'use strict';

const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const SalesOrder = require('../src/models/SalesOrder');
const DeliveryCloseoutVersion = require('../src/models/DeliveryCloseoutVersion');
const OrderPaymentAllocation = require('../src/models/OrderPaymentAllocation');
const fundService = require('../src/services/fundService');
const DeliveryPaymentStateReadService = require('../src/services/delivery/DeliveryPaymentStateReadService');
const dateUtil = require('../src/utils/date.util');

function valueOf(name, argv = process.argv.slice(2)) {
  const prefix = `${name}=`;
  const direct = argv.find((arg) => arg.startsWith(prefix));
  if (direct) return direct.slice(prefix.length).trim();
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? String(argv[index + 1]).trim() : '';
}

function parseArgs(argv = process.argv.slice(2)) {
  if (argv.includes('--apply')) throw new Error('This audit is read-only; --apply is not supported.');
  return {
    date: dateUtil.toDateOnly(valueOf('--date', argv) || dateUtil.todayVN()),
    delivery: valueOf('--delivery', argv),
    order: valueOf('--order', argv),
    json: argv.includes('--json')
  };
}

function compactMoney(row = {}) {
  return {
    cashAmount: Number(row.cashAmount || row.cashCollected || 0) || 0,
    bankAmount: Number(row.bankAmount || row.bankCollected || row.transferAmount || 0) || 0,
    rewardAmount: Number(row.rewardAmount || row.bonusAmount || 0) || 0
  };
}

function latestVersionPayload(row = null) {
  if (!row) return null;
  return {
    version: Number(row.closeoutVersion || row.sourceVersion || row.version || 0) || 0,
    cashAmount: Number(row.cashAmount ?? row.newCashAmount ?? row.cashCollectedAmount ?? 0) || 0,
    bankAmount: Number(row.bankAmount ?? row.newBankAmount ?? 0) || 0,
    rewardAmount: Number(row.rewardAmount ?? row.newRewardAmount ?? 0) || 0
  };
}

function allocationPayload(row = null) {
  if (!row) return null;
  return {
    sourceVersion: Number(row.sourceVersion || row.version || 0) || 0,
    cashAmount: Number(row.cashAmount || 0) || 0,
    bankAmount: Number(row.bankAmount || 0) || 0,
    rewardAmount: Number(row.rewardAmount || 0) || 0
  };
}

function buildOrderFilter(args) {
  const and = [];
  if (args.order) {
    and.push({
      $or: [
        { id: args.order },
        { code: args.order },
        { orderCode: args.order },
        { salesOrderCode: args.order },
        { documentCode: args.order },
        { invoiceCode: args.order }
      ]
    });
  }
  if (args.date) and.push({ $or: [{ deliveryDate: args.date }, { date: args.date }] });
  if (args.delivery) {
    const rx = new RegExp(args.delivery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    and.push({ $or: [{ deliveryStaffCode: rx }, { deliveryStaffName: rx }] });
  }
  return and.length ? { $and: and } : {};
}

async function main() {
  const args = parseArgs();
  await connectDB();
  const order = await SalesOrder.findOne(buildOrderFilter(args)).lean();
  if (!order) {
    const report = { ok: false, error: 'ORDER_NOT_FOUND', orderCode: args.order || '', date: args.date, delivery: args.delivery };
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const resolved = await DeliveryPaymentStateReadService.resolvePaymentStatesForOrders([order]);
  const canonicalResolved = DeliveryPaymentStateReadService.stateForOrder(order, resolved.statesByIdentity);
  const latestVersion = DeliveryPaymentStateReadService.latestVersionForOrder(order, resolved.versionsByKey);
  const currentPaymentAllocation = DeliveryPaymentStateReadService.allocationForOrder(order, resolved.allocationsByKey);

  let fundPreviewResolved = null;
  try {
    const preview = await fundService.buildDeliverySubmissionDraft({ deliveryDate: args.date, deliveryStaffCode: args.delivery });
    const previewRow = (preview.orders || []).find((row) => [row.id, row.code, row.orderCode, row.salesOrderCode].some((value) => String(value || '') === String(args.order || order.code || order.orderCode || '')));
    if (previewRow) fundPreviewResolved = { cashAmount: Number(previewRow.cashAmount || 0) || 0, bankAmount: Number(previewRow.bankAmount || 0) || 0 };
  } catch (error) {
    fundPreviewResolved = { error: error && error.message ? error.message : String(error) };
  }

  const orderCode = order.code || order.orderCode || order.salesOrderCode || args.order || '';
  const report = {
    orderCode,
    storedOrder: compactMoney(order),
    latestCloseoutVersion: latestVersionPayload(latestVersion),
    currentPaymentAllocation: allocationPayload(currentPaymentAllocation),
    canonicalResolved: {
      cashAmount: canonicalResolved.cashAmount,
      bankAmount: canonicalResolved.bankAmount,
      rewardAmount: canonicalResolved.rewardAmount,
      source: canonicalResolved.source && canonicalResolved.source.paymentState
    },
    fundPreviewResolved,
    mismatch: Boolean(
      fundPreviewResolved
      && !fundPreviewResolved.error
      && (Number(fundPreviewResolved.cashAmount || 0) !== Number(canonicalResolved.cashAmount || 0)
        || Number(fundPreviewResolved.bankAmount || 0) !== Number(canonicalResolved.bankAmount || 0))
    )
  };

  if (args.json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`Order: ${report.orderCode}`);
    console.log(`Stored cash/bank/reward: ${report.storedOrder.cashAmount}/${report.storedOrder.bankAmount}/${report.storedOrder.rewardAmount}`);
    console.log(`Canonical cash/bank/reward: ${report.canonicalResolved.cashAmount}/${report.canonicalResolved.bankAmount}/${report.canonicalResolved.rewardAmount}`);
    console.log(`Source: ${report.canonicalResolved.source}`);
    console.log(`Mismatch: ${report.mismatch}`);
  }
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error('[audit-delivery-fund-payment-state] failed:', error && error.stack ? error.stack : error);
      process.exitCode = 1;
    })
    .finally(async () => {
      try { if (mongoose.connection.readyState) await mongoose.disconnect(); } catch (_) {}
    });
}

module.exports = { parseArgs, buildOrderFilter };
