'use strict';

const eventBus = require('../eventBus');
const eventTypes = require('../eventTypes');
const postingEngine = require('../../core/posting/posting.engine');

function register() {
  eventBus.on(eventTypes.SALE_CONFIRMED, (payload, context) => postingEngine.postSale(payload.order || payload, context));
  eventBus.on(eventTypes.SALE_CANCELLED, (payload, context) => postingEngine.postCancelOrder(payload.order || payload, context));
  eventBus.on(eventTypes.RETURN_CONFIRMED, (payload, context) => postingEngine.postReturn(payload.returnOrder || payload, context));
  eventBus.on(eventTypes.PAYMENT_RECEIVED, (payload, context) => postingEngine.postReceipt(payload.receipt || payload, context));
}

module.exports = { register };
