'use strict';

const eventBus = require('../eventBus');
const eventTypes = require('../eventTypes');

function register() {
  // Placeholder có kiểm soát: không gửi notification thật trong phase này.
  eventBus.on(eventTypes.DELIVERY_CONFIRMED, async () => null);
  eventBus.on(eventTypes.MASTER_ORDER_ASSIGNED, async () => null);
}

module.exports = { register };
