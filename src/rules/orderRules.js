'use strict';

const { ORDER_STATUS, DELIVERY_STATUS } = require('../constants/business.constants');

function canPostArSale(order = {}) {
  return [ORDER_STATUS.DELIVERED, ORDER_STATUS.ACCOUNTING_CONFIRMED, ORDER_STATUS.CLOSED].includes(order.status)
    || [DELIVERY_STATUS.DELIVERED].includes(order.deliveryStatus);
}

function isCancelled(order = {}) {
  return [ORDER_STATUS.CANCELLED, 'canceled', 'deleted', 'void'].includes(order.status);
}

module.exports = { canPostArSale, isCancelled };
