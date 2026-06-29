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
  return [...new Set([
    order.id,
    order._id,
    order.code,
    order.orderCode,
    order.salesOrderCode,
    order.documentCode,
    order.invoiceCode,
    order.externalOrderCode,
    order.sourceOrderId,
    order.sourceOrderCode,
    order.deliveryOrderId,
    order.deliveryOrderCode,
    order.orderNo
  ].map((v) => String(v || '').trim()).filter(Boolean))];
}

const DELETION_CONTEXT_PROJECTIONS = Object.freeze({
  returnOrder: 'id code salesOrderId salesOrderCode orderId orderCode sourceOrderId sourceOrderCode status returnStatus accountingStatus warehouseReceiveStatus accountingConfirmed arPosted amount totalAmount returnAmount debtReduction items',
  masterOrder: 'id code childOrderIds children.id children.code status accountingStatus deliveryStatus',
  stockTransaction: 'id code orderId orderCode salesOrderId salesOrderCode refId refCode sourceId sourceCode type movementType status reversedAt reversedFrom quantity qty productCode createdAt',
  ledgerRef: 'id code orderId orderCode salesOrderId salesOrderCode refId refCode sourceId sourceCode type status amount debit credit createdAt'
});

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

function firstWithProjection(query, projection, session) {
  if (!query) return null;
  const scoped = withSession(query.select(projection), session);
  return scoped.lean();
}

async function loadSalesOrderDeletionContext(order = {}, options = {}) {
  const session = options.session || null;
  const keys = orderKeys(order);
  const refFilter = orderRefFilter(order);
  const retFilter = activeReturnFilter(order);

  const masterFilter = {
    status: ACTIVE_STATUS_FILTER,
    $or: [
      { childOrderIds: { $in: keys } },
      { 'children.id': { $in: keys } },
      { 'children.code': { $in: keys } },
      ...(order.masterOrderId ? [{ id: order.masterOrderId }] : []),
      ...(order.masterOrderCode ? [{ code: order.masterOrderCode }] : [])
    ]
  };

  const [
    activeReturn,
    masterOrder,
    stockRow,
    arRow,
    paymentRow,
    cashbookRow,
    bankbookRow,
    fundRow
  ] = await Promise.all([
    retFilter ? firstWithProjection(ReturnOrder.findOne(retFilter), DELETION_CONTEXT_PROJECTIONS.returnOrder, session) : null,
    firstWithProjection(MasterOrder.findOne(masterFilter), DELETION_CONTEXT_PROJECTIONS.masterOrder, session),
    refFilter ? firstWithProjection(StockTransaction.findOne(refFilter), DELETION_CONTEXT_PROJECTIONS.stockTransaction, session) : null,
    refFilter ? firstWithProjection(ArLedger.findOne(refFilter), DELETION_CONTEXT_PROJECTIONS.ledgerRef, session) : null,
    refFilter ? firstWithProjection(Payment.findOne(refFilter), DELETION_CONTEXT_PROJECTIONS.ledgerRef, session) : null,
    refFilter ? firstWithProjection(Cashbook.findOne(refFilter), DELETION_CONTEXT_PROJECTIONS.ledgerRef, session) : null,
    refFilter ? firstWithProjection(Bankbook.findOne(refFilter), DELETION_CONTEXT_PROJECTIONS.ledgerRef, session) : null,
    refFilter ? firstWithProjection(FundLedger.findOne(refFilter), DELETION_CONTEXT_PROJECTIONS.ledgerRef, session) : null
  ]);

  return {
    masterOrder,
    hasMasterOrder: Boolean(masterOrder),

    activeReturn,
    hasReturnDraft: Boolean(activeReturn),
    activeReturnLocked: activeReturn ? returnOrderIsLocked(activeReturn) : false,
    activeReturnHasValue: activeReturn ? returnOrderHasValue(activeReturn) : false,

    hasStockTransaction: Boolean(stockRow),
    hasArLedger: Boolean(arRow),
    hasReceipt: Boolean(paymentRow && String(paymentRow.type || '').toLowerCase().includes('receipt')),
    hasCashbook: Boolean(cashbookRow),
    hasBankbook: Boolean(bankbookRow),
    hasFundLedger: Boolean(fundRow),

    counts: {
      stockTransactions: stockRow ? 1 : 0,
      arLedgers: arRow ? 1 : 0,
      payments: paymentRow ? 1 : 0,
      cashbooks: cashbookRow ? 1 : 0,
      bankbooks: bankbookRow ? 1 : 0,
      fundLedgers: fundRow ? 1 : 0
    }
  };
}

module.exports = {
  loadSalesOrderDeletionContext,
  orderKeys,
  orderRefFilter
};
