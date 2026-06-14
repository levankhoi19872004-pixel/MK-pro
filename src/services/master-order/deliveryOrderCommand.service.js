'use strict';
const legacy = require('./masterOrderLegacy.service');
module.exports = {
  updateDeliveryTodayOrder: (...args) => legacy.updateDeliveryTodayOrder(...args)
};
