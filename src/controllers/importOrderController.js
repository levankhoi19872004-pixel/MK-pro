'use strict';

const importOrderService = require('../services/importOrderService');

async function list(req, res) {
  try {
    const importOrders = await importOrderService.listImportOrders(req.query || {});
    res.json({ ok: true, source: 'mongo-route', importOrders });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không tải được phiếu nhập từ MongoDB', error: process.env.NODE_ENV === 'production' ? undefined : err.message });
  }
}

async function create(req, res) {
  try {
    const result = await importOrderService.createImportOrder(req.body || {});
    if (result.error) return res.status(result.status || 400).json({ ok: false, message: result.error });
    res.status(201).json({ ok: true, source: 'mongo-route', message: `Đã tạo phiếu nhập ${result.importOrder.code}`, importOrder: result.importOrder });
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message || 'Không tạo được phiếu nhập' });
  }
}

async function update(req, res) {
  try {
    const result = await importOrderService.updateImportOrder(req.params.id, req.body || {});
    if (result.error) return res.status(result.status || 400).json({ ok: false, message: result.error });
    res.json({ ok: true, source: 'mongo-route', message: `Đã cập nhật phiếu nhập ${result.importOrder.code}`, importOrder: result.importOrder });
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message || 'Không sửa được phiếu nhập' });
  }
}

async function post(req, res) {
  try {
    const result = await importOrderService.postImportOrder(req.params.id, req.user || req.headers || {});
    if (result.error) return res.status(result.status || 400).json({ ok: false, message: result.error });
    res.json({ ok: true, source: 'mongo-route', message: `Đã nhập kho phiếu ${result.importOrder.code}`, importOrder: result.importOrder });
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message || 'Không nhập kho được phiếu nhập' });
  }
}

async function cancel(req, res) {
  try {
    const result = await importOrderService.cancelImportOrder(req.params.id, req.user || req.headers || {});
    if (result.error) return res.status(result.status || 400).json({ ok: false, message: result.error });
    res.json({ ok: true, source: 'mongo-route', message: `Đã huỷ phiếu nhập ${result.importOrder.code}`, importOrder: result.importOrder });
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message || 'Không huỷ được phiếu nhập' });
  }
}

module.exports = { list, create, update, post, cancel };
