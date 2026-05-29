'use strict';

const systemService = require('../services/systemService');

async function health(req, res) {
  res.json(systemService.health());
}

async function dbHealth(req, res) {
  res.json(systemService.dbHealth());
}

async function data(req, res) {
  try {
    res.json({ ok: true, source: 'mongo-route', data: await systemService.getDataSnapshot() });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không đọc được dữ liệu MongoDB', error: err.message });
  }
}

async function dataSource(req, res) {
  try {
    res.json({ ok: true, source: 'mongo-route', ...(await systemService.getDataSourceStatus()) });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không đọc được trạng thái nguồn dữ liệu', error: err.message });
  }
}

module.exports = { health, dbHealth, data, dataSource };
