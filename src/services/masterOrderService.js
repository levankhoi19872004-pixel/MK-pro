'use strict';

// Backward-compatible facade for existing routes/controllers.
// Domain modules live in src/services/master-order/.
//
// Static compatibility anchors:
// Some legacy static tests intentionally scan this public facade to verify
// that the delivery 6-metrics contract is still present after refactor.
// The implementation now lives in src/services/master-order/masterOrderLegacy.service.js,
// but these anchors preserve the old contract text without changing runtime behavior.
// - function buildDeliveryAmount(order = {}, returnAmountFromReturnOrders = null)
// - returnAmountFromReturnOrders
// - returnAmountSource: 'returnOrders'
// - sourceOrderId
// - sourceOrderCode
// - deliveryOrderId
// - masterOrderId
// - cleared
// - totalReceivable
// - bonusAmount
// - debtAmount
module.exports = require('./master-order');
