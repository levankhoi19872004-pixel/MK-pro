'use strict';

const flexModel = require('./_flexModel');

module.exports = flexModel('ReconciliationReport', 'reconciliation_reports', {
  id: String,
  code: String,

  type: String, // stock | ar | fund | all
  status: String, // ok | warning | critical

  startedAt: String,
  finishedAt: String,
  durationMs: Number,

  checkedAt: String,
  checkedBy: String,
  source: String, // scheduled_job | manual_api | script

  summary: Object,
  items: Array,

  error: String,
  createdAt: String,
  updatedAt: String
});
