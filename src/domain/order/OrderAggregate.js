'use strict';

const OrderRules = require('./OrderRules');
const OrderPolicy = require('./OrderPolicy');

class OrderAggregate {
  constructor(order = {}) {
    this.order = { ...order };
  }

  cancel(reason = '') {
    OrderRules.assertCanCancel(this.order);
    this.order.status = 'cancelled';
    this.order.cancelReason = reason;
    this.order.cancelledAt = new Date().toISOString();
    return this.order;
  }

  assignDelivery(deliveryStaff = {}) {
    OrderRules.assertCanAssignDelivery(this.order, deliveryStaff);
    this.order.deliveryStaffCode = deliveryStaff.code || deliveryStaff.staffCode || this.order.deliveryStaffCode;
    this.order.deliveryStaffName = deliveryStaff.name || deliveryStaff.fullName || this.order.deliveryStaffName;
    this.order.deliveryStatus = this.order.deliveryStatus || 'assigned';
    return this.order;
  }

  canEditDelivery() {
    return OrderPolicy.canEditDelivery(this.order);
  }
}

module.exports = OrderAggregate;
