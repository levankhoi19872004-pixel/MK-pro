'use strict';

const systemService = require('../services/systemService');
const { createCommandTelemetry } = require('../utils/commandTelemetry');
const ReconciliationService = require('../domain/reconciliation/ReconciliationService');
const JobSubmissionService = require('../services/background-jobs/JobSubmissionService');
const operationsService = require('../services/operationsService');

function sendError(res, err, fallbackMessage) {
  const status = err.status || 500;
  return res.status(status).json({ ok: false, success: false, message: err.message || fallbackMessage });
}

async function health(req, res) {
  res.json(systemService.health());
}

async function dbHealth(req, res) {
  const health = systemService.dbHealth();
  res.status(health.ok ? 200 : 503).json(health);
}

async function status(req, res) {
  try {
    res.json(await systemService.status());
  } catch (err) {
    sendError(res, err, 'Không đọc được trạng thái hệ thống');
  }
}

async function data(req, res) {
  try {
    if (process.env.ALLOW_SYSTEM_DATA_EXPORT !== 'true') {
      return res.status(403).json({
        ok: false,
        success: false,
        message: 'API xuất toàn bộ dữ liệu hệ thống đang bị khóa; hãy dùng chức năng backup có kiểm soát'
      });
    }
    return res.json({ ok: true, source: 'mongo-route', data: await systemService.getDataSnapshot() });
  } catch (err) {
    return sendError(res, err, 'Không đọc được dữ liệu MongoDB');
  }
}

async function dataSource(req, res) {
  try {
    res.json({ ok: true, source: 'mongo-route', ...(await systemService.getDataSourceStatus()) });
  } catch (err) {
    sendError(res, err, 'Không đọc được trạng thái nguồn dữ liệu');
  }
}

async function listSettings(req, res) {
  try {
    res.json({ ok: true, data: await systemService.getSettings() });
  } catch (err) {
    sendError(res, err, 'Không đọc được cấu hình');
  }
}

async function getSetting(req, res) {
  try {
    const data = await systemService.getSetting(req.params.key);
    if (!data) return res.status(404).json({ ok: false, message: 'Không tìm thấy cấu hình' });
    res.json({ ok: true, data });
  } catch (err) {
    sendError(res, err, 'Không đọc được cấu hình');
  }
}

async function saveSetting(req, res) {
  try {
    const data = await systemService.saveSetting(req.params.key, req.body && req.body.value !== undefined ? req.body.value : req.body);
    res.json({ ok: true, data });
  } catch (err) {
    sendError(res, err, 'Không lưu được cấu hình');
  }
}

async function backup(req, res) {
  const telemetry = createCommandTelemetry('system.backup');
  try {
    const data = await systemService.createBackup();
    telemetry.mark('createBackup');
    res.json({ ok: true, data, performance: telemetry.finish() });
  } catch (err) {
    sendError(res, err, 'Không tạo được backup');
  }
}

async function listBackups(req, res) {
  try {
    res.json({ ok: true, data: await systemService.listBackups() });
  } catch (err) {
    sendError(res, err, 'Không đọc được danh sách backup');
  }
}

async function verifyBackup(req, res) {
  try {
    res.json({ ok: true, data: await systemService.verifyBackup(req.params.fileName) });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({
      ok: false,
      success: false,
      message: err.message || 'Không xác minh được backup',
      details: process.env.NODE_ENV === 'production' ? undefined : err.details
    });
  }
}

async function reset(req, res) {
  const telemetry = createCommandTelemetry('system.reset');
  try {
    const result = await systemService.resetOperationalData({ confirm: req.body && req.body.confirm, scope: req.body && req.body.scope });
    telemetry.mark('resetOperationalData');
    res.json({ ...result, performance: telemetry.finish() });
  } catch (err) {
    sendError(res, err, 'Không reset được dữ liệu');
  }
}


async function operations(req, res) {
  try {
    res.json(await operationsService.detailedStatus());
  } catch (err) {
    sendError(res, err, 'Không đọc được trạng thái vận hành');
  }
}

async function performanceBaseline(req, res) {
  try {
    res.json(await operationsService.performanceBaseline());
  } catch (err) {
    sendError(res, err, 'Khong doc duoc performance baseline');
  }
}

async function resetPerformanceBaseline(req, res) {
  try {
    res.json(await operationsService.resetPerformanceBaseline());
  } catch (err) {
    sendError(res, err, 'Khong reset duoc performance baseline');
  }
}

async function startPerformanceObservation(req, res) {
  try {
    res.json(await operationsService.startPerformanceObservation({
      label: req.body?.label || '',
      environment: req.body?.environment || ''
    }));
  } catch (err) {
    sendError(res, err, 'Khong bat dau duoc performance observation');
  }
}

async function performanceObservation(req, res) {
  try {
    res.json(await operationsService.performanceObservationStatus());
  } catch (err) {
    sendError(res, err, 'Khong doc duoc performance observation');
  }
}

async function stopPerformanceObservation(req, res) {
  try {
    res.json(await operationsService.stopPerformanceObservation());
  } catch (err) {
    sendError(res, err, 'Khong dung duoc performance observation');
  }
}

async function exportPerformanceObservation(req, res) {
  try {
    const exported = await operationsService.performanceObservationExport();
    if (String(req.query.format || '').toLowerCase() === 'md') {
      res.set('Content-Type', 'text/markdown; charset=utf-8');
      return res.send(exported.markdown || '');
    }
    return res.json(exported.data || exported);
  } catch (err) {
    return sendError(res, err, 'Khong export duoc performance observation');
  }
}

async function release(req, res) {
  try {
    res.json({ ok: true, data: operationsService.internalReleaseSummary() });
  } catch (err) {
    sendError(res, err, 'Không đọc được release manifest');
  }
}

async function apiMonitor(req, res) {
  try {
    res.json(await systemService.getApiMonitor({
      limit: req.query.limit,
      slowOnly: req.query.slowOnly === '1' || req.query.slowOnly === 'true',
      module: req.query.module || ''
    }));
  } catch (err) {
    sendError(res, err, 'Không đọc được API Monitor');
  }
}

async function resetApiMonitor(req, res) {
  try {
    res.json(await systemService.clearApiMonitor());
  } catch (err) {
    sendError(res, err, 'Không xóa được API Monitor');
  }
}


async function runReconciliation(req, res) {
  try {
    const type = req.body?.type || req.query?.type || 'all';
    const explicitKey = String(req.headers['x-idempotency-key'] || req.body?.idempotencyKey || '').trim();
    const submitted = await JobSubmissionService.submitReconciliation({
      type,
      source: 'manual_api',
      checkedBy: req.user?.code || req.user?.username || req.user?.name || 'admin',
      idempotencyKey: explicitKey,
      actor: req.user || {}
    });
    return res.status(202).json({
      ok: true,
      success: true,
      accepted: true,
      jobId: submitted.job.id,
      statusUrl: `/api/background-jobs/${encodeURIComponent(submitted.job.id)}`,
      data: submitted.job
    });
  } catch (err) {
    return sendError(res, err, 'Không đưa được tác vụ đối soát vào hàng đợi');
  }
}

async function listReconciliationReports(req, res) {
  try {
    const data = await ReconciliationService.listReports(req.query || {});
    res.json({
      ok: true,
      success: true,
      data
    });
  } catch (err) {
    sendError(res, err, 'Không đọc được báo cáo đối soát');
  }
}

module.exports = {
  health,
  dbHealth,
  status,
  data,
  dataSource,
  listSettings,
  getSetting,
  saveSetting,
  backup,
  listBackups,
  verifyBackup,
  reset,
  operations,
  performanceBaseline,
  resetPerformanceBaseline,
  startPerformanceObservation,
  performanceObservation,
  stopPerformanceObservation,
  exportPerformanceObservation,
  release,
  apiMonitor,
  resetApiMonitor,
  runReconciliation,
  listReconciliationReports
};
