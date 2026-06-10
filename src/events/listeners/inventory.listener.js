'use strict';

const eventBus = require('../eventBus');
const eventTypes = require('../eventTypes');
const postingEngine = require('../../core/posting/posting.engine');

function register() {
  eventBus.on(eventTypes.SALE_CONFIRMED, (payload, context) => postingEngine.postInventorySale(payload.order || payload, context));
  eventBus.on(eventTypes.SALE_CANCELLED, (payload, context) => postingEngine.postInventoryMovement({
    document: payload.order || payload,
    type: 'SALE_REVERSAL',
    direction: 'IN',
    sourceType: 'SALE_ORDER_CANCEL'
  }, context));
  eventBus.on(eventTypes.RETURN_CONFIRMED, (payload, context) => postingEngine.postInventoryReturn(payload.returnOrder || payload, context));
}

module.exports = { register };
