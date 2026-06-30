'use strict';

const dateUtil = require('../../utils/date.util');
const { toNumber } = require('../../utils/common.util');
const { buildArSaleLedger, assertValidArLedgerContract } = require('./arLedgerContract');

function clean(value = '') {
  return String(value ?? '').trim();
}

function sourceIdOf(order = {}) {
  return clean(order.salesOrderId || order.sourceId || order.orderId || order.id || order._id || order.code || order.orderCode);
}

function displayDate(order = {}, extra = {}) {
  return extra.date || order.deliveryDate || order.date || order.orderDate || dateUtil.todayVN();
}

function buildDeliveryReAccountingArSaleLedger(order = {}, extra = {}) {
  const sourceId = sourceIdOf(order);
  const accountingBatchId = clean(extra.accountingBatchId || extra.batchId || '');
  const amount = Math.max(0, toNumber(extra.amount ?? extra.debit ?? 0));
  const idempotencyKey = clean(extra.idempotencyKey)
    || (accountingBatchId ? `AR-SALE:salesOrder:${sourceId}:${accountingBatchId}` : `AR-SALE:salesOrder:${sourceId}`);
  const ledger = buildArSaleLedger(order, {
    id: extra.id,
    code: extra.code,
    date: displayDate(order, extra),
    amount,
    accountant: extra.createdBy || extra.accountingConfirmedBy || extra.confirmedBy || order.accountingConfirmedBy || 'accountant',
    accountingBatchId,
    idempotencyKey,
    note: extra.note,
    now: extra.createdAt || dateUtil.nowIso()
  });
  return assertValidArLedgerContract({
    ...ledger,
    reAccountingBatchId: clean(extra.reAccountingBatchId || accountingBatchId),
    source: extra.source || ledger.source || 'delivery_accounting_confirm_repost'
  });
}

module.exports = { buildDeliveryReAccountingArSaleLedger };
