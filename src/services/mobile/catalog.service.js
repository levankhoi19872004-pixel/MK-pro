'use strict';

const Product = require('../../models/Product');
const Customer = require('../../models/Customer');
const inventoryStockService = require('../inventoryStock.service');
const { toNumber, stripMongoFields } = require('../../utils/common.util');
const { normalizeText } = require('../../utils/search.util');

function regexFilter(q, fields = []) {
  const keyword = String(q || '').trim();
  if (!keyword) return { isActive: { $ne: false } };
  return {
    isActive: { $ne: false },
    $or: fields.map((field) => ({ [field]: { $regex: keyword, $options: 'i' } }))
  };
}

function createMobileCatalogService(ctx = {}) {
  async function customers({ query = {} } = {}) {
    const q = String(query.q || query.search || '').trim();
    const limit = Math.min(Math.max(toNumber(query.limit || (q ? 200 : 500)), 1), 1000);
    const rows = await Customer.find(regexFilter(q, ['code', 'customerCode', 'name', 'customerName', 'phone', 'address', 'area', 'route']))
      .sort({ code: 1 })
      .limit(limit)
      .lean();
    const customers = rows.map(stripMongoFields);
    return { body: { ok: true, success: true, source: 'mobile-catalog-route', customers, items: customers, total: customers.length } };
  }

  async function products({ query = {} } = {}) {
    const q = String(query.q || query.search || '').trim();
    const group = normalizeText(query.group || query.category || query.productGroup || '');
    const limit = Math.min(Math.max(toNumber(query.limit || (q ? 500 : 1000)), 1), 2000);
    const filter = regexFilter(q, ['code', 'productCode', 'sku', 'name', 'productName', 'barcode', 'brand', 'category', 'groupName', 'productGroup']);
    let rows = await Product.find(filter).sort({ code: 1 }).limit(limit).lean();
    if (group) {
      rows = rows.filter((row) => [row.category, row.categoryName, row.group, row.groupName, row.productGroup, row.productGroupName]
        .some((value) => normalizeText(value).includes(group)));
    }
    const products = rows.map(stripMongoFields);
    return { body: { ok: true, success: true, source: 'mobile-catalog-route', products, items: products, total: products.length } };
  }

  async function stock({ query = {} } = {}) {
    const productCode = String(query.productCode || query.code || query.sku || '').trim();
    const stock = productCode
      ? await inventoryStockService.getAvailableStock(productCode)
      : {};
    return { body: { ok: true, success: true, source: 'mobile-catalog-route', stock } };
  }

  return { customers, products, stock };
}

module.exports = { createMobileCatalogService };
