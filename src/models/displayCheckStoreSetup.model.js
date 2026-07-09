'use strict';

const flexModel = require('./_flexModel');

module.exports = flexModel('DisplayCheckStoreSetup', 'displayCheckStoreSetups', {
  workingDate: String,
  customerCode: String,
  customerName: String,
  targetAmount: Number,
  targetLineCount: Number,
  selectedGroupCodes: Array,
  note: String,
  status: String,
  createdBy: String,
  updatedBy: String,
  createdAt: String,
  updatedAt: String
});
