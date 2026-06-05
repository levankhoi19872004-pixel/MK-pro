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

// Index được chuẩn hoá tập trung tại src/services/mongoIndexService.js
// để tránh khai báo trùng ở model và service làm chậm quá trình ghi/import đơn.

module.exports = SalesOrder;
