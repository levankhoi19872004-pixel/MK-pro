'use strict';

const SalesOrder = require('../models/SalesOrder');

async function buildDeliveryTodayView({ deliveryDate, deliveryStaffCode } = {}) {
  const match = {};
  if (deliveryDate) match.deliveryDate = deliveryDate;
  if (deliveryStaffCode) match.deliveryStaffCode = deliveryStaffCode;
  return SalesOrder.aggregate([
    { $match: match },
    {
      $group: {
        _id: { deliveryDate: '$deliveryDate', deliveryStaffCode: '$deliveryStaffCode' },
        deliveryStaffName: { $last: '$deliveryStaffName' },
        orderCount: { $sum: 1 },
        totalAmount: { $sum: { $ifNull: ['$totalAmount', 0] } },
        deliveredCount: { $sum: { $cond: [{ $eq: ['$deliveryStatus', 'delivered'] }, 1, 0] } },
        pendingCount: { $sum: { $cond: [{ $ne: ['$deliveryStatus', 'delivered'] }, 1, 0] } }
      }
    },
    { $sort: { '_id.deliveryStaffCode': 1 } }
  ]);
}

module.exports = { buildDeliveryTodayView };
