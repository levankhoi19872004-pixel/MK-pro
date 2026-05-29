'use strict';

const { previewImport, commitImport } = require('../../services/importService');
const models = require('../models');

async function preview(req, res) {
  try {
    if (!req.file) return res.status(400).json({ ok: false, message: 'Chưa có file Excel để import' });
    const result = await previewImport(req.file.buffer, req.body?.type || req.query?.type);
    res.json({ ok: true, source: 'import-controller', ...result });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không đọc được file import', error: err.message });
  }
}

async function commit(req, res) {
  try {
    const result = await commitImport(req.body || {});
    res.json({ ok: true, source: 'import-controller', ...result });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không ghi được dữ liệu import', error: err.message });
  }
}

async function logs(req, res) {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 500);
    const logs = await models.importLogs.find({}).sort({ createdAt: -1 }).limit(limit).lean();
    res.json({ ok: true, source: 'mongo-controller', logs });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không lấy được lịch sử import', error: err.message });
  }
}

module.exports = { preview, commit, logs };
