const flexModel = require('./_flexModel');

module.exports = flexModel('WarehouseReturnCheck', 'warehouseReturnChecks', {
  id: String,
  tenantId: String,
  date: String,
  deliveryStaffCode: String,
  deliveryStaffName: String,
  status: String,
  sourceReturnOrderIds: Array,
  returnOrderCount: Number,
  productCount: Number,
  totalReportedLines: Number,
  totalReportedItems: Number,
  totalDiscrepancyItems: Number,
  items: Array,
  note: String,
  checkedByUserId: String,
  checkedByCode: String,
  checkedByName: String,
  checkedAt: String,
  createdAt: String,
  updatedAt: String
});
