'use strict';

const { eventBus, eventTypes, registerDefaultListeners } = require('../events');

function ensureListeners() {
  registerDefaultListeners();
}

async function emitBusinessEvent(eventType, payload = {}, context = {}) {
  ensureListeners();
  return eventBus.emitAsync(eventType, payload, context);
}

function saleConfirmed(order, context = {}) {
  return emitBusinessEvent(eventTypes.SALE_CONFIRMED, { order, sourceType: 'SALE_ORDER', sourceId: order?.id || order?._id, sourceCode: order?.code }, context);
}

function saleCancelled(order, context = {}) {
  return emitBusinessEvent(eventTypes.SALE_CANCELLED, { order, sourceType: 'SALE_ORDER', sourceId: order?.id || order?._id, sourceCode: order?.code }, context);
}

function returnConfirmed(returnOrder, context = {}) {
  return emitBusinessEvent(eventTypes.RETURN_CONFIRMED, { returnOrder, sourceType: 'RETURN_ORDER', sourceId: returnOrder?.id || returnOrder?._id, sourceCode: returnOrder?.code }, context);
}

function paymentReceived(receipt, context = {}) {
  return emitBusinessEvent(eventTypes.PAYMENT_RECEIVED, { receipt, sourceType: 'RECEIPT', sourceId: receipt?.id || receipt?._id, sourceCode: receipt?.code }, context);
}

module.exports = {
  eventTypes,
  emitBusinessEvent,
  saleConfirmed,
  saleCancelled,
  returnConfirmed,
  paymentReceived
};
