'use strict';

const flexModel = require('./_flexModel');

module.exports = flexModel('DisplayCheckGroup', 'displayCheckGroups', {
  groupCode: String,
  groupName: String,
  sourceType: String,
  sourceCode: String,
  sourceName: String,
  conditionType: String,
  thresholdAmount: Number,
  thresholdQty: Number,
  productCodes: Array,
  isActive: Boolean,
  note: String,
  createdBy: String,
  updatedBy: String,
  createdAt: String,
  updatedAt: String
});
