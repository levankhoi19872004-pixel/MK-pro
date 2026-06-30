#!/usr/bin/env node
'use strict';

// Phase87 closeout/debt audit: read-only, dry-run only.
// Checks that deliveryCloseout V2 opens debt from finalDebtAmount and never from original-return only.

try { require('dotenv').config(); } catch (_) {}

const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const { toNumber } = require('../src/utils/common.util');
const dateUtil = require('../src/utils/date.util');

function clean(value = '') {
  return String(value ?? '').trim();
}

function money(value) {
  const amount = Number(toNumber(value));
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount);
}

function currentCloseout(order = {}) {
  const closeout = order.deliveryCloseout || {};
  if (Array.isArray(closeout.versions) && closeout.versions.length) {
    const currentNo = Number(closeout.currentVersionNo || closeout.versionNo || closeout.version || 0);
    return closeout.versions.find((row) => Number(row.versionNo || row.version) === currentNo) || closeout.versions[closeout.versions.length - 1] || closeout;
  }
  return closeout;
}

function closeoutVersionNo(closeout = {}) {
  return Number(closeout.currentVersionNo || closeout.versionNo || closeout.version || 0) || 0;
}

function expectedFinalDebt(closeout = {}) {
  return money(closeout.originalAmount) - money(closeout.returnedAmount) - money(closeout.collectedAmount) - money(closeout.offsetAmount);
}

function isActive(row = {}) {
  return row && row.active === true && row.reversed !== true && row.deleted !== true && row.isDeleted !== true && !clean(row.deletedAt);
}

async function main() {
  const strict = process.argv.includes('--strict');
  const json = process.argv.includes('--json');
  await connectDB();
  const models = require('../src/models');
  const SalesOrder = models.salesOrders;
  const ArLedger = models.arLedgers;
  const ArDebtOrder = models.arDebtOrders;
  const ArDebtCustomer = models.arDebtCustomers;
  const orders = await SalesOrder.find({
    'deliveryCloseout.contractVersion': { $gte: 2 },
    'deliveryCloseout.status': 'accounting_confirmed'
  }).lean();

  const mismatches = [];
  let checked = 0;
  for (const order of orders) {
    checked += 1;
    const closeout = currentCloseout(order);
    const orderId = clean(order.id || order._id || order.code);
    const orderCode = clean(order.code || order.orderCode || orderId);
    const expected = expectedFinalDebt(closeout);
    const actual = money(closeout.finalDebtAmount);
    if (expected !== actual) {
      mismatches.push({ orderCode, reason: 'closeout_final_debt_mismatch', expected, actual });
    }

    const ledgers = await ArLedger.find({
      $or: [
        { sourceId: orderId },
        { sourceCode: orderCode },
        { orderId },
        { orderCode }
      ]
    }).lean();
    const activeDebtOpen = ledgers.filter((row) => isActive(row) && clean(row.category).toUpperCase() === 'AR-DEBT-OPEN');
    const legacyDeliveryRows = ledgers.filter((row) => isActive(row)
      && ['AR-SALE', 'AR-SALE-REVERSAL', 'AR-RETURN', 'AR-RECEIPT'].includes(clean(row.category).toUpperCase())
      && clean(row.sourceType).toUpperCase().includes('DELIVERY'));

    if (actual > 0) {
      if (activeDebtOpen.length !== 1) {
        mismatches.push({ orderCode, reason: 'ar_debt_open_count_invalid', expected: 1, actual: activeDebtOpen.length });
      } else {
        const row = activeDebtOpen[0];
        if (money(row.debit) !== actual || money(row.amount) !== actual) {
          mismatches.push({ orderCode, reason: 'ar_debt_open_amount_mismatch', expected: actual, actualDebit: money(row.debit), actualAmount: money(row.amount) });
        }
        const expectedKey = `AR-DEBT-OPEN:${orderId}`;
        if (clean(row.idempotencyKey) !== expectedKey) {
          mismatches.push({ orderCode, reason: 'ar_debt_open_idempotency_mismatch', expected: expectedKey, actual: clean(row.idempotencyKey) });
        }
        if (closeoutVersionNo(closeout) && money(row.deliveryCloseoutVersionNo || row.deliveryCloseoutVersion) !== closeoutVersionNo(closeout)) {
          mismatches.push({ orderCode, reason: 'ar_debt_open_closeout_version_mismatch', expected: closeoutVersionNo(closeout), actual: money(row.deliveryCloseoutVersionNo || row.deliveryCloseoutVersion) });
        }
      }
    } else if (activeDebtOpen.length > 0) {
      mismatches.push({ orderCode, reason: 'zero_or_negative_final_debt_has_ar_debt_open', expected: 0, actual: activeDebtOpen.length });
    }

    if (legacyDeliveryRows.length) {
      mismatches.push({ orderCode, reason: 'legacy_delivery_ar_category_present_for_v2_closeout', count: legacyDeliveryRows.length, categories: legacyDeliveryRows.map((row) => row.category) });
    }

    const debtOrders = await ArDebtOrder.find({ sourceId: orderId }).lean().catch(() => []);
    if (debtOrders.length) {
      const readDebt = debtOrders.reduce((sum, row) => sum + money(row.remainingDebt), 0);
      const ledgerDebt = activeDebtOpen.reduce((sum, row) => sum + money(row.debit) - money(row.credit), 0);
      if (readDebt !== ledgerDebt) mismatches.push({ orderCode, reason: 'arDebtOrders_mismatch', expected: ledgerDebt, actual: readDebt });
    }
    const debtCustomers = await ArDebtCustomer.find({ customerCode: order.customerCode }).lean().catch(() => []);
    void debtCustomers;
  }

  const result = {
    audit: 'audit-ar-debt-closeout-v2-consistency',
    dryRun: true,
    apply: false,
    checked,
    mismatchCount: mismatches.length,
    mismatches,
    generatedAt: dateUtil.nowIso()
  };
  if (json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log('AR debt closeout V2 consistency audit (dry-run, read-only)');
    console.log(`Checked orders: ${checked}`);
    console.log(`Mismatches: ${mismatches.length}`);
    for (const row of mismatches.slice(0, 50)) console.log(`- ${row.orderCode}: ${row.reason} expected=${row.expected ?? ''} actual=${row.actual ?? row.actualAmount ?? row.count ?? ''}`);
  }
  if (strict && mismatches.length) process.exitCode = 1;
  await mongoose.connection.close();
}

main().catch(async (err) => {
  console.error(err && err.stack || err);
  try { await mongoose.connection.close(); } catch (_) {}
  process.exitCode = 1;
});
