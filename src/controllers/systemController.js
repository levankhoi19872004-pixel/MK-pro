'use strict';

const systemService = require('../services/systemService');
const ReconciliationService = require('../domain/reconciliation/ReconciliationService');

function sendError(res, err, fallbackMessage) {
  const status = err.status || 500;
  return res.status(status).json({ ok: false, success: false, message: err.message || fallbackMessage });
}

async function health(req, res) {
  res.json(systemService.health());
}

async function dbHealth(req, res) {
  res.json(systemService.dbHealth());
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
    res.json({ ok: true, source: 'mongo-route', data: await systemService.getDataSnapshot() });
  } catch (err) {
    sendError(res, err, 'Không đọc được dữ liệu MongoDB');
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
  try {
    res.json({ ok: true, data: await systemService.createBackup() });
  } catch (err) {
    sendError(res, err, 'Không tạo được backup');
  }
}

async function reset(req, res) {
  try {
    res.json(await systemService.resetOperationalData({ confirm: req.body && req.body.confirm, scope: req.body && req.body.scope }));
  } catch (err) {
    sendError(res, err, 'Không reset được dữ liệu');
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
    const report = await ReconciliationService.runReconciliation(type, {
      source: 'manual_api',
      checkedBy: req.user?.code || req.user?.username || req.user?.name || 'admin'
    });

    res.json({
      ok: true,
      success: true,
      data: report
    });
  } catch (err) {
    sendError(res, err, 'Không chạy được đối soát ledger');
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
  reset,
  apiMonitor,
  resetApiMonitor,
  runReconciliation,
  listReconciliationReports
};
