'use strict';

const eventBus = require('../eventBus');
const eventTypes = require('../eventTypes');
const postingEngine = require('../../core/posting/posting.engine');

function register() {
  eventBus.on(eventTypes.PAYMENT_RECEIVED, async (payload, context = {}) => {
    const receipt = payload.receipt || payload;
    return postingEngine.postFundReceipt(receipt, context);
  });
}

module.exports = { register };
