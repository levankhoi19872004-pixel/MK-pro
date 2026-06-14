'use strict';
const legacy = require('./masterOrderLegacy.service');
module.exports = {
  listDeliveryToday: (...args) => legacy.listDeliveryToday(...args),
  listDeliveryTodaySummary: (...args) => legacy.listDeliveryTodaySummary(...args),
  listDeliveryTodaySummaryFast: (...args) => legacy.listDeliveryTodaySummaryFast(...args),
  listDeliveryTodaySalesSummary: (...args) => legacy.listDeliveryTodaySalesSummary(...args),
  listDeliveryTodayOrdersCompact: (...args) => legacy.listDeliveryTodayOrdersCompact(...args)
};
