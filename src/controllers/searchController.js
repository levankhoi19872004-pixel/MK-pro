'use strict';

const searchService = require('../services/searchService');

async function products(req, res) {
  try {
    const items = await searchService.searchProducts(req.query || {});
    res.json({ ok: true, source: 'unified-search', type: 'products', items, products: items });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không gợi ý được sản phẩm', error: err.message });
  }
}

async function customers(req, res) {
  try {
    const items = await searchService.searchCustomers(req.query || {});
    res.json({ ok: true, source: 'unified-search', type: 'customers', items, customers: items });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không gợi ý được khách hàng', error: err.message });
  }
}

async function staffs(req, res) {
  try {
    const items = await searchService.searchStaffs(req.query || {});
    res.json({ ok: true, source: 'unified-search', type: 'staffs', items, users: items, staffs: items });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không gợi ý được nhân viên', error: err.message });
  }
}

async function byType(req, res) {
  try {
    const items = await searchService.search(req.params.type, req.query || {});
    res.json({ ok: true, source: 'unified-search', type: req.params.type, items });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không gợi ý được dữ liệu', error: err.message });
  }
}

module.exports = { products, customers, staffs, byType };
