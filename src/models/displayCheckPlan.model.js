'use strict';

const flexModel = require('./_flexModel');

module.exports = flexModel('DisplayCheckPlan', 'displayCheckPlans', {
  workingDate: String,
  planCode: String,
  customerCode: String,
  customerName: String,
  targetAmount: Number,
  generatedAmount: Number,
  targetLineCount: Number,
  actualLineCount: Number,
  selectedGroups: Array,
  items: Array,
  sourceSnapshot: Object,
  status: String,
  confirmedBy: String,
  confirmedAt: String,
  cancelledBy: String,
  cancelledAt: String,
  cancelReason: String,
  createdAt: String,
  updatedAt: String
});
