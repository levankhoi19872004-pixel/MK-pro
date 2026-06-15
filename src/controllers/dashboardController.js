'use strict';

const asyncHandler = require('../middlewares/asyncHandler');
const HomeDashboardService = require('../services/dashboard/HomeDashboardService');
const SalesTargetService = require('../services/dashboard/SalesTargetService');

function truthy(value) {
  return ['1', 'true', 'yes'].includes(String(value || '').trim().toLowerCase());
}

const home = asyncHandler(async (req, res) => {
  const startedAt = Date.now();
  if (!HomeDashboardService.dashboardEnabled()) {
    return res.json({
      ok: true,
      data: {
        enabled: false,
        message: 'Dashboard tổng quan đang tắt bằng FEATURE_HOME_DASHBOARD=false'
      },
      meta: {
        durationMs: Date.now() - startedAt,
        cacheHit: false
      }
    });
  }

  const result = await HomeDashboardService.getHomeDashboard({
    month: req.query.month,
    force: truthy(req.query.refresh)
  });
  const durationMs = Date.now() - startedAt;

  req.log?.info({
    event: 'dashboard.home.loaded',
    month: result.period?.month,
    userId: req.user?.id || req.user?._id || req.user?.userId || '',
    role: req.user?.role || '',
    salesRows: result.salesByStaff?.length || 0,
    deliveryMonthRows: result.deliveryMonth?.length || 0,
    deliveryTodayRows: result.deliveryToday?.length || 0,
    durationMs,
    cacheHit: result.cacheHit === true
  }, 'Home dashboard loaded');

  return res.json({
    ok: true,
    data: result,
    meta: {
      durationMs,
      cacheHit: result.cacheHit === true,
      generatedAt: result.generatedAt
    }
  });
});

const listTargets = asyncHandler(async (req, res) => {
  const period = SalesTargetService.assertPeriod(req.query.period);
  const targets = await SalesTargetService.listByPeriod(period);
  return res.json({
    ok: true,
    data: { period, targets }
  });
});

const saveTargets = asyncHandler(async (req, res) => {
  const result = await SalesTargetService.saveBatch(
    req.params.period,
    req.body?.targets,
    req.user || {}
  );
  HomeDashboardService.invalidateDashboardCache(result.period);

  req.log?.info({
    event: 'dashboard.sales_targets.updated',
    period: result.period,
    savedCount: result.savedCount,
    userId: req.user?.id || req.user?._id || req.user?.userId || '',
    role: req.user?.role || ''
  }, 'Sales targets updated');

  return res.json({
    ok: true,
    message: 'Đã cập nhật chỉ tiêu tháng',
    data: result
  });
});

module.exports = {
  home,
  listTargets,
  saveTargets
};
