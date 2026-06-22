'use strict';

const mongoose = require('mongoose');
const strictModel = require('./_strictModel');

const Mixed = mongoose.Schema.Types.Mixed;

module.exports = strictModel('DashboardDailyStat', 'dashboardDailyStats', {
  tenantId: { type: String, default: '' },
  date: { type: String, required: true },
  month: { type: String, required: true },
  sales: { type: Mixed, default: {} },
  delivery: { type: Mixed, default: {} },
  cash: { type: Mixed, default: {} },
  returns: { type: Mixed, default: {} },
  staff: { type: Mixed, default: () => ({ sales: [], delivery: [] }) },
  dataQuality: { type: Mixed, default: {} },
  source: { type: String, default: 'rebuild' },
  generatedAt: { type: String, default: '' },
  updatedAt: { type: String, default: '' }
});
