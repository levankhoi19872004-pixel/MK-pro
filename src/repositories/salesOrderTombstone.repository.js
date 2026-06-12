'use strict';

const SalesOrderTombstone = require('../models/SalesOrderTombstone');
const { makeId } = require('../utils/common.util');
const dateUtil = require('../utils/date.util');

async function createSalesOrderTombstone(order = {}, decision = {}, command = {}, related = {}, options = {}) {
  const now = dateUtil.nowIso();

  const doc = {
    id: makeId('SOT'),
    code: `SOT-${order.code || order.id || Date.now()}`,

    originalOrderId: String(order.id || order._id || '').trim(),
    originalOrderCode: String(order.code || order.orderCode || order.salesOrderCode || '').trim(),
    originalMongoId: String(order._id || '').trim(),

    deleteMode: decision.mode,
    deleteReason: String(command.reason || command.deleteReason || '').trim(),
    deletedBy: String(command.actorName || command.userName || '').trim(),
    deletedByCode: String(command.actorCode || '').trim(),
    deletedFrom: String(command.source || 'web').trim(),
    deletedAt: now,

    stockWasPosted: Boolean(order.stockPosted),
    stockReversed: Boolean(decision.reverseStock),
    arWasPosted: Boolean(related.hasArLedger),
    arReversed: Boolean(decision.reverseAr),

    masterOrderId: String(order.masterOrderId || '').trim(),
    masterOrderCode: String(order.masterOrderCode || '').trim(),

    snapshot: order,
    dependencySummary: related.counts || {},

    createdAt: now,
    updatedAt: now
  };

  const rows = await SalesOrderTombstone.create([doc], options.session ? { session: options.session } : {});
  return rows[0];
}

module.exports = {
  createSalesOrderTombstone
};
