'use strict';

const MasterOrder = require('../models/MasterOrder');
const ReturnOrder = require('../models/ReturnOrder');
const StockTransaction = require('../models/StockTransaction');
const Payment = require('../models/Payment');
const ArLedger = require('../models/ArLedger');
const Cashbook = require('../models/Cashbook');
const Bankbook = require('../models/Bankbook');
const FundLedger = require('../models/FundLedger');
const { toNumber } = require('../utils/common.util');

const ACTIVE_STATUS_FILTER = {
  $nin: ['void', 'deleted', 'removed', 'cancelled', 'canceled', 'reversed']
};

function orderKeys(order = {}) {
  return [
    order.id,
    order._id,
    order.code,
    order.orderCode,
    order.salesOrderCode,
    order.documentCode,
    order.invoiceCode
  ].map((v) => String(v || '').trim()).filter(Boolean);
}

function activeReturnFilter(order = {}) {
  const keys = orderKeys(order);
  if (!keys.length) return null;

  return {
    status: ACTIVE_STATUS_FILTER,
    $or: [
      { salesOrderId: { $in: keys } },
      { salesOrderCode: { $in: keys } },
      { orderId: { $in: keys } },
      { orderCode: { $in: keys } },
      { sourceOrderId: { $in: keys } },
      { sourceOrderCode: { $in: keys } }
    ]
  };
}

function orderRefFilter(order = {}) {
  const keys = orderKeys(order);
  if (!keys.length) return null;

  return {
    $or: [
      { orderId: { $in: keys } },
      { orderCode: { $in: keys } },
      { salesOrderId: { $in: keys } },
      { salesOrderCode: { $in: keys } },
      { refId: { $in: keys } },
      { refCode: { $in: keys } },
      { sourceId: { $in: keys } },
      { sourceCode: { $in: keys } }
    ]
  };
}

function returnOrderHasValue(row = {}) {
  const items = Array.isArray(row.items) ? row.items : [];
  return toNumber(row.amount || row.totalAmount || row.returnAmount || row.debtReduction) > 0
    || items.some((item) => toNumber(item.returnQty || item.quantity || item.qty) > 0);
}

function returnOrderIsLocked(row = {}) {
  const status = String(row.status || row.returnStatus || row.accountingStatus || '').toLowerCase();
  return ['received', 'accounting_confirmed', 'posted_to_ar', 'locked', 'confirmed'].includes(status)
    || Boolean(row.accountingConfirmed || row.arPosted);
}

function withSession(query, session) {
  return session && query && typeof query.session === 'function' ? query.session(session) : query;
}

async function loadSalesOrderDeletionContext(order = {}, options = {}) {
  const session = options.session || null;
  const keys = orderKeys(order);
  const refFilter = orderRefFilter(order);
  const retFilter = activeReturnFilter(order);

  const [
    activeReturn,
    masterOrder,
    stockRows,
    arRows,
    paymentRows,
    cashbookRows,
    bankbookRows,
    fundRows
  ] = await Promise.all([
    retFilter ? withSession(ReturnOrder.findOne(retFilter), session).lean() : null,
    withSession(MasterOrder.findOne({
      status: ACTIVE_STATUS_FILTER,
      $or: [
        { childOrderIds: { $in: keys } },
        { 'children.id': { $in: keys } },
        { 'children.code': { $in: keys } },
        { id: order.masterOrderId },
        { code: order.masterOrderCode }
      ]
    }), session).lean(),
    refFilter ? withSession(StockTransaction.find(refFilter).limit(20), session).lean() : [],
    refFilter ? withSession(ArLedger.find(refFilter).limit(20), session).lean() : [],
    refFilter ? withSession(Payment.find(refFilter).limit(20), session).lean() : [],
    refFilter ? withSession(Cashbook.find(refFilter).limit(20), session).lean() : [],
    refFilter ? withSession(Bankbook.find(refFilter).limit(20), session).lean() : [],
    refFilter ? withSession(FundLedger.find(refFilter).limit(20), session).lean() : []
  ]);

  return {
    masterOrder,
    hasMasterOrder: Boolean(masterOrder),

    activeReturn,
    hasReturnDraft: Boolean(activeReturn),
    activeReturnLocked: activeReturn ? returnOrderIsLocked(activeReturn) : false,
    activeReturnHasValue: activeReturn ? returnOrderHasValue(activeReturn) : false,

    hasStockTransaction: stockRows.length > 0,
    hasArLedger: arRows.length > 0,
    hasReceipt: paymentRows.some((r) => String(r.type || '').toLowerCase().includes('receipt')),
    hasCashbook: cashbookRows.length > 0,
    hasBankbook: bankbookRows.length > 0,
    hasFundLedger: fundRows.length > 0,

    counts: {
      stockTransactions: stockRows.length,
      arLedgers: arRows.length,
      payments: paymentRows.length,
      cashbooks: cashbookRows.length,
      bankbooks: bankbookRows.length,
      fundLedgers: fundRows.length
    }
  };
}

module.exports = {
  loadSalesOrderDeletionContext,
  orderKeys,
  orderRefFilter
};
