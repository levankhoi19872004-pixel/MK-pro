const flexModel = require('./_flexModel');
const SalesOrder = flexModel('SalesOrder', 'orders', {
  id: String,
  code: String,
  customerId: String,
  customerCode: String,
  customerName: String,
  staffName: String,
  deliveryStaffName: String,
  orderDate: String,
  deliveryDate: String,
  source: String,
  orderSource: String,
  externalOrderCode: String,
  status: String,
  lifecycleStatus: String,
  deliveryStatus: String,
  mergeStatus: String,
  masterOrderId: String,
  masterOrderCode: String,
  accountingStatus: String,
  accountingConfirmed: Boolean,
  cancelledAt: String,
  cancelReason: String,
  items: Array,
  totalAmount: Number,
  paidAmount: Number,
  debtAmount: Number,
  createdAt: String,
  updatedAt: String
});

// V45 tốc độ danh sách đơn: index theo đúng các bộ lọc thường dùng.
SalesOrder.schema.index({ orderDate: -1, createdAt: -1 });
SalesOrder.schema.index({ date: -1, createdAt: -1 });
SalesOrder.schema.index({ deliveryDate: -1, deliveryStaffCode: 1, deliveryStatus: 1 });
SalesOrder.schema.index({ salesStaffCode: 1, orderDate: -1 });
SalesOrder.schema.index({ staffCode: 1, orderDate: -1 });
SalesOrder.schema.index({ customerCode: 1, orderDate: -1 });
SalesOrder.schema.index({ status: 1, orderDate: -1 });
SalesOrder.schema.index({ source: 1, orderDate: -1 });
SalesOrder.schema.index({ orderSource: 1, orderDate: -1 });
SalesOrder.schema.index({ masterOrderId: 1 });
SalesOrder.schema.index({ masterOrderCode: 1 });

module.exports = SalesOrder;
