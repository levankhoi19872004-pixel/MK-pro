'use strict';

const flexModel = require('./_flexModel');

module.exports = flexModel('InternalSaleAllocationLedger', 'internalSaleAllocationLedgers', {
  id: String,
  eventKey: String,
  allocationId: String,
  productCode: String,
  direction: String,
  type: String,
  quantity: Number,
  sourceOrderId: String,
  sourceOrderCode: String,
  sourceAllocationId: String,
  actorCode: String,
  actorName: String,
  note: String,
  createdAt: String
});
