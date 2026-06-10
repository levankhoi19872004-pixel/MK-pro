'use strict';

const searchService = require('../services/searchService');

function ok(res, type, items, extra = {}) {
  res.json({ ok: true, source: 'unified-search', type, items, ...extra });
}

function fail(res, message, err) {
  res.status(500).json({ ok: false, message, error: err.message });
}

async function products(req, res) {
  try {
    const items = await searchService.searchProducts(req.query || {});
    ok(res, 'products', items, { products: items });
  } catch (err) { fail(res, 'Không gợi ý được sản phẩm', err); }
}

async function customers(req, res) {
  try {
    const items = await searchService.searchCustomers(req.query || {});
    ok(res, 'customers', items, { customers: items });
  } catch (err) { fail(res, 'Không gợi ý được khách hàng', err); }
}

async function staffs(req, res) {
  try {
    const items = await searchService.searchStaffs(req.query || {});
    ok(res, 'staffs', items, { users: items, staffs: items });
  } catch (err) { fail(res, 'Không gợi ý được nhân viên', err); }
}

async function salesStaff(req, res) {
  try {
    const items = await searchService.searchStaffs({ ...(req.query || {}), role: 'sales' });
    ok(res, 'sales-staff', items, { users: items, staffs: items, salesStaff: items });
  } catch (err) { fail(res, 'Không gợi ý được NV bán hàng', err); }
}

async function deliveryStaff(req, res) {
  try {
    const items = await searchService.searchStaffs({ ...(req.query || {}), role: 'delivery' });
    ok(res, 'delivery-staff', items, { users: items, staffs: items, deliveryStaff: items });
  } catch (err) { fail(res, 'Không gợi ý được NV giao hàng', err); }
}

async function orders(req, res) {
  try {
    const items = await searchService.searchOrders(req.query || {});
    ok(res, 'orders', items, { orders: items });
  } catch (err) { fail(res, 'Không gợi ý được đơn bán', err); }
}

async function masterOrders(req, res) {
  try {
    const items = await searchService.searchMasterOrders(req.query || {});
    ok(res, 'master-orders', items, { masterOrders: items });
  } catch (err) { fail(res, 'Không gợi ý được đơn tổng', err); }
}

async function arLedger(req, res) {
  try {
    const items = await searchService.searchDebt(req.query || {});
    ok(res, 'ar-ledger', items, { debts: items, arLedger: items });
  } catch (err) { fail(res, 'Không gợi ý được công nợ AR Ledger', err); }
}

async function byType(req, res) {
  try {
    const items = await searchService.search(req.params.type, req.query || {});
    ok(res, req.params.type, items);
  } catch (err) { fail(res, 'Không gợi ý được dữ liệu', err); }
}

module.exports = { products, customers, staffs, salesStaff, deliveryStaff, orders, masterOrders, arLedger, byType };
