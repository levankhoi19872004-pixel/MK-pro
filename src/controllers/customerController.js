'use strict';

const customerService = require('../services/customerService');

async function list(req, res) {
  try {
    const result = await customerService.listCustomers(req.query);
    res.json({ ok: true, source: 'mongo-route', customers: result.customers, meta: result.meta || undefined });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không lấy được danh sách khách hàng từ MongoDB', error: process.env.NODE_ENV === 'production' ? undefined : err.message });
  }
}

async function search(req, res) {
  try {
    const customers = await customerService.searchCustomers(req.query);
    res.json({ ok: true, source: 'mongo-search', items: customers, customers });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không tìm kiếm được khách hàng từ MongoDB', error: process.env.NODE_ENV === 'production' ? undefined : err.message });
  }
}

async function create(req, res) {
  try {
    const result = await customerService.createCustomer(req.body || {});
    if (result.error) return res.status(result.status || 400).json({ ok: false, message: result.error });
    res.status(201).json({ ok: true, source: 'mongo-route', message: 'Đã tạo khách hàng và lưu vào MongoDB', customer: result.customer });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không tạo được khách hàng trên MongoDB', error: process.env.NODE_ENV === 'production' ? undefined : err.message });
  }
}

async function update(req, res) {
  try {
    const result = await customerService.updateCustomer(req.params.id, req.body || {});
    if (result.error) return res.status(result.status || 400).json({ ok: false, message: result.error });
    res.json({ ok: true, source: 'mongo-route', message: 'Đã cập nhật khách hàng vào MongoDB', customer: result.customer });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không cập nhật được khách hàng trên MongoDB', error: process.env.NODE_ENV === 'production' ? undefined : err.message });
  }
}

async function setStatus(req, res) {
  try {
    const result = await customerService.setCustomerStatus(req.params.id, req.body?.isActive !== false);
    if (result.error) return res.status(result.status || 400).json({ ok: false, message: result.error });
    res.json({ ok: true, source: 'mongo-route', message: result.customer.isActive ? 'Đã kích hoạt khách hàng trong MongoDB' : 'Đã ngừng hoạt động khách hàng trong MongoDB', customer: result.customer });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không đổi được trạng thái khách hàng trên MongoDB', error: process.env.NODE_ENV === 'production' ? undefined : err.message });
  }
}

async function remove(req, res) {
  try {
    const result = await customerService.deleteCustomer(req.params.id, { actor: req.user || {}, reason: req.body?.reason });
    if (result.error) return res.status(result.status || 400).json({ ok: false, message: result.error });
    res.json({ ok: true, source: 'mongo-route', message: 'Đã ngừng hoạt động khách hàng; lịch sử giao dịch được giữ nguyên', deactivated: true, customer: result.customer });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không ngừng hoạt động được khách hàng trên MongoDB', error: process.env.NODE_ENV === 'production' ? undefined : err.message });
  }
}

async function bulkDelete(req, res) {
  try {
    const result = await customerService.bulkDeleteCustomers(req.body?.ids, { actor: req.user || {}, reason: req.body?.reason });
    if (result.error) return res.status(result.status || 400).json({ ok: false, message: result.error });
    res.json({ ok: true, source: 'mongo-route', message: `Đã ngừng hoạt động ${result.deactivated} khách hàng`, deactivated: result.deactivated, deleted: result.deleted });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không ngừng hoạt động được nhiều khách hàng trên MongoDB', error: process.env.NODE_ENV === 'production' ? undefined : err.message });
  }
}

module.exports = { list, search, create, update, setStatus, remove, bulkDelete };
