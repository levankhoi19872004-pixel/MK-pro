'use strict';

const flexModel = require('./_flexModel');

module.exports = flexModel('SalesOrderTombstone', 'salesOrderTombstones', {
  id: String,
  code: String,

  originalOrderId: String,
  originalOrderCode: String,
  originalMongoId: String,

  deleteMode: String,
  deleteReason: String,
  deletedBy: String,
  deletedByCode: String,
  deletedFrom: String,
  deletedAt: String,

  stockWasPosted: Boolean,
  stockReversed: Boolean,
  arWasPosted: Boolean,
  arReversed: Boolean,

  masterOrderId: String,
  masterOrderCode: String,

  snapshot: Object,
  dependencySummary: Object,

  createdAt: String,
  updatedAt: String
});
