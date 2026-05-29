'use strict';

const productService = require('../services/productService');

async function list(req, res) {
  try {
    const result = await productService.listProducts(req.query);
    res.json({ ok: true, source: 'mongo-route', products: result.products, meta: result.meta || undefined });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không lấy được danh sách sản phẩm từ MongoDB', error: err.message });
  }
}

async function search(req, res) {
  try {
    const products = await productService.searchProducts(req.query);
    res.json({ ok: true, source: 'mongo-search', products });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không tìm kiếm được sản phẩm từ MongoDB', error: err.message });
  }
}

async function create(req, res) {
  try {
    const result = await productService.createProduct(req.body || {});
    if (result.error) return res.status(result.status || 400).json({ ok: false, message: result.error });
    res.status(201).json({ ok: true, source: 'mongo-route', message: 'Đã tạo sản phẩm và lưu vào MongoDB', product: result.product });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không tạo được sản phẩm trên MongoDB', error: err.message });
  }
}

async function update(req, res) {
  try {
    const result = await productService.updateProduct(req.params.id, req.body || {});
    if (result.error) return res.status(result.status || 400).json({ ok: false, message: result.error });
    res.json({ ok: true, source: 'mongo-route', message: 'Đã cập nhật sản phẩm vào MongoDB', product: result.product });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không cập nhật được sản phẩm trên MongoDB', error: err.message });
  }
}

async function setStatus(req, res) {
  try {
    const result = await productService.setProductStatus(req.params.id, req.body?.isActive !== false);
    if (result.error) return res.status(result.status || 400).json({ ok: false, message: result.error });
    res.json({ ok: true, source: 'mongo-route', message: result.product.isActive ? 'Đã mở bán sản phẩm trong MongoDB' : 'Đã ngừng bán sản phẩm trong MongoDB', product: result.product });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không đổi được trạng thái sản phẩm trên MongoDB', error: err.message });
  }
}

module.exports = { list, search, create, update, setStatus };
