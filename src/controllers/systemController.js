'use strict';

const systemService = require('../services/systemService');

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
    res.json(await systemService.resetOperationalData({
      confirm: req.body && req.body.confirm,
      mode: req.body && req.body.mode,
      backupBeforeReset: req.body && req.body.backupBeforeReset !== false
    }));
  } catch (err) {
    sendError(res, err, 'Không reset được dữ liệu');
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
  reset
};
