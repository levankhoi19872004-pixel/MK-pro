'use strict';

const asyncHandler = require('../middlewares/asyncHandler');
const HomeDashboardService = require('../services/dashboard/HomeDashboardService');
const DashboardOverviewService = require('../services/dashboard/DashboardOverviewService');
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
    cacheHit: result.cacheHit === true,
    cacheEnabled: result.cacheEnabled === true,
    sources: result.sources || {},
    dataQualityWarningCount: result.dataQuality?.warnings?.length || 0,
    queryDurationMs: result.metrics?.queryDurationMs || {}
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


const overview = asyncHandler(async (req, res) => {
  const startedAt = Date.now();
  if (!HomeDashboardService.dashboardEnabled()) {
    return res.json({ ok: true, data: { enabled: false, message: 'Dashboard tổng quan đang tắt bằng FEATURE_HOME_DASHBOARD=false' }, meta: { durationMs: Date.now() - startedAt, cacheHit: false } });
  }
  const result = await DashboardOverviewService.getOverview({
    month: req.query.month,
    force: truthy(req.query.refresh)
  });
  return res.json({
    ok: true,
    data: result,
    meta: {
      durationMs: Date.now() - startedAt,
      cacheHit: result.cacheHit === true,
      generatedAt: result.generatedAt,
      strategy: 'phase38-read-model-first', source: result.meta?.source || result.sources?.dashboardStats || 'unknown'
    }
  });
});

const salesStaff = asyncHandler(async (req, res) => {
  const startedAt = Date.now();
  const result = await HomeDashboardService.getSalesStaffDashboard({
    month: req.query.month,
    force: truthy(req.query.refresh)
  });
  return res.json({
    ok: true,
    data: result,
    meta: {
      durationMs: Date.now() - startedAt,
      cacheHit: result.cacheHit === true,
      generatedAt: result.generatedAt,
      strategy: 'phase38-read-model-first-sales-staff', source: result.meta?.source || result.sources?.dashboardStats || 'unknown'
    }
  });
});

const deliverySummary = asyncHandler(async (req, res) => {
  const startedAt = Date.now();
  const result = await HomeDashboardService.getDeliveryDashboard({
    month: req.query.month,
    force: truthy(req.query.refresh)
  });
  return res.json({
    ok: true,
    data: result,
    meta: {
      durationMs: Date.now() - startedAt,
      cacheHit: result.cacheHit === true,
      generatedAt: result.generatedAt,
      strategy: 'phase38-read-model-first-delivery-summary', source: result.meta?.source || result.sources?.dashboardStats || 'unknown'
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


const downloadTargetTemplate = asyncHandler(async (req, res) => {
  const result = await SalesTargetService.buildImportTemplate(req.query.period);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(result.fileName)}"`);
  return res.send(result.buffer);
});

const importTargets = asyncHandler(async (req, res) => {
  const file = req.file || req.importFiles?.[0];
  const result = await SalesTargetService.importFromExcel(
    req.params.period,
    file?.buffer,
    req.user || {}
  );
  HomeDashboardService.invalidateDashboardCache(result.period);

  req.log?.info({
    event: 'dashboard.sales_targets.imported',
    period: result.period,
    importedRows: result.importedRows,
    savedCount: result.savedCount,
    fileName: file?.originalname || '',
    userId: req.user?.id || req.user?._id || req.user?.userId || '',
    role: req.user?.role || ''
  }, 'Sales targets imported');

  return res.json({
    ok: true,
    message: `Đã upload ${result.savedCount} chỉ tiêu tháng`,
    data: result
  });
});

module.exports = {
  home,
  overview,
  salesStaff,
  deliverySummary,
  listTargets,
  saveTargets,
  downloadTargetTemplate,
  importTargets
};
