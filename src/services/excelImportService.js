'use strict';

const { parseExcelBuffer } = require('../../utils/excelParser');
const { previewImport, commitImport } = require('../../services/importService');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const systemService = require('./systemService');
const { toNumber } = require('../utils/common.util');

function cleanText(value) {
  return String(value ?? '').trim();
}

function pickProductPayload(row = {}) {
  const code = cleanText(row.code || row.productCode || row['Mã sản phẩm'] || row['Ma san pham']);
  return {
    code,
    name: cleanText(row.name || row.productName || row['Tên sản phẩm'] || row['Ten san pham']),
    unit: cleanText(row.unit || row['Đơn vị'] || row['Don vi']),
    packing: cleanText(row.packing || row.package || row['Quy cách'] || row['Quy cach']),
    barcode: cleanText(row.barcode || row['Mã vạch'] || row['Ma vach']),
    category: cleanText(row.category || row['Nhóm hàng'] || row['Nhom hang']),
    price: toNumber(row.price || row.salePrice || row['Giá bán'] || row['Gia ban']),
    costPrice: toNumber(row.costPrice || row.importPrice || row['Giá nhập'] || row['Gia nhap']),
    minStock: toNumber(row.minStock || row['Tồn tối thiểu'] || row['Ton toi thieu']),
    isActive: row.isActive !== false
  };
}

function pickCustomerPayload(row = {}) {
  const code = cleanText(row.code || row.customerCode || row['Mã khách hàng'] || row['Ma khach hang']);
  return {
    code,
    name: cleanText(row.name || row.customerName || row['Tên khách hàng'] || row['Ten khach hang']),
    phone: cleanText(row.phone || row.customerPhone || row['Số điện thoại'] || row['So dien thoai']),
    address: cleanText(row.address || row.customerAddress || row['Địa chỉ'] || row['Dia chi']),
    area: cleanText(row.area || row['Khu vực'] || row['Khu vuc']),
    route: cleanText(row.route || row['Tuyến'] || row['Tuyen']),
    staffCode: cleanText(row.staffCode || row.salesmanCode || row['Mã NVBH'] || row['Ma NVBH']),
    staffName: cleanText(row.staffName || row.salesmanName || row['Tên NVBH'] || row['Ten NVBH']),
    openingDebt: toNumber(row.openingDebt || row['Công nợ đầu kỳ'] || row['Cong no dau ky']),
    debtLimit: toNumber(row.debtLimit || row['Hạn mức nợ'] || row['Han muc no']),
    isActive: row.isActive !== false
  };
}

async function upsertProducts(rows = []) {
  let imported = 0;
  let skipped = 0;
  const errors = [];
  for (const row of rows) {
    const payload = pickProductPayload(row);
    if (!payload.code || !payload.name) {
      skipped += 1;
      errors.push({ code: payload.code, message: 'Thiếu mã hoặc tên sản phẩm' });
      continue;
    }
    try {
      await Product.findOneAndUpdate(
        { code: payload.code },
        { $set: payload },
        { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
      );
      imported += 1;
    } catch (err) {
      skipped += 1;
      errors.push({ code: payload.code, message: err.message });
    }
  }
  return { imported, skipped, errors };
}

async function upsertCustomers(rows = []) {
  let imported = 0;
  let skipped = 0;
  const errors = [];
  for (const row of rows) {
    const payload = pickCustomerPayload(row);
    if (!payload.code || !payload.name) {
      skipped += 1;
      errors.push({ code: payload.code, message: 'Thiếu mã hoặc tên khách hàng' });
      continue;
    }
    try {
      await Customer.findOneAndUpdate(
        { code: payload.code },
        { $set: payload },
        { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
      );
      imported += 1;
    } catch (err) {
      skipped += 1;
      errors.push({ code: payload.code, message: err.message });
    }
  }
  return { imported, skipped, errors };
}

async function preview({ type, buffer }) {
  if (!type) return { error: 'Thiếu loại import', status: 400 };
  if (!buffer) return { error: 'Chưa chọn file Excel', status: 400 };
  const rows = parseExcelBuffer(buffer);
  if (!rows.length) return { error: 'File Excel không có dữ liệu', status: 400 };
  const data = await systemService.getDataSnapshot();
  return previewImport(type, rows, data);
}

async function commit({ type, rows }) {
  if (!type) return { error: 'Thiếu loại import', status: 400 };
  if (!Array.isArray(rows) || !rows.length) return { error: 'Chưa có dòng nào để import', status: 400 };

  if (type === 'products') {
    const result = await upsertProducts(rows);
    return { source: 'mongo-route', message: `Đã import ${result.imported} sản phẩm vào MongoDB`, ...result };
  }
  if (type === 'customers') {
    const result = await upsertCustomers(rows);
    return { source: 'mongo-route', message: `Đã import ${result.imported} khách hàng vào MongoDB`, ...result };
  }

  const data = await systemService.getDataSnapshot();
  const result = commitImport(type, rows, data);
  if (!result.ok) return { error: result.message || 'Không commit được import', status: 400, ...result };
  await systemService.persistDataSnapshot(data);
  return { source: 'mongo-route', ...result };
}

async function logs() {
  const data = await systemService.getDataSnapshot();
  return data.importLogs || [];
}

module.exports = { preview, commit, logs };
