'use strict';

const dateUtil = require('../../../utils/date.util');
const Product = require('../../../models/Product');
const Customer = require('../../../models/Customer');
const { toNumber, makeId, normalizeText, normalizePacking } = require('../../../utils/common.util');
const {
  IMPORT_MODE_CREATE,
  IMPORT_MODE_UPDATE,
  normalizeImportMode,
  getProvidedField,
  parseImportBoolean,
  buildChanges,
  omitUnchanged
} = require('../selectiveUpdate.util');
const IMPORT_BATCH_SIZE = Number(process.env.IMPORT_BATCH_SIZE || 1000);
const { addImportLog } = require('../core/importLogging.util');

const {
  buildProductSelectiveUpdate,
  buildCustomerSelectiveUpdate,
  cleanText,
  pickProductPayload,
  pickCustomerPayload,
  productSearchText,
  customerSearchText
} = require('../core/importValue.util');
const {
  bulkWriteInBatches
} = require('../core/importPersistence.util');
const {
  preloadSalesStaffUsersByCode,
  resolveSalesStaffForImportRow
} = require('../core/importRow.util');

async function upsertProducts(rows = [], options = {}) {
  const importMode = normalizeImportMode(options.importMode, 'products');
  if (importMode === IMPORT_MODE_UPDATE) {
    let skipped = 0;
    let unchanged = 0;
    const errors = [];
    const ops = [];
    const seen = new Set();
    const codes = Array.from(new Set(rows.map((row) => cleanText(row.code || row.productCode || row['Mã sản phẩm'] || row['Ma san pham'])).filter(Boolean)));
    const existingRows = codes.length ? await Product.find({ code: { $in: codes } }).lean() : [];
    const existingMap = new Map(existingRows.map((row) => [normalizeText(row.code), row]));

    for (const row of rows) {
      const code = cleanText(row.code || row.productCode || row['Mã sản phẩm'] || row['Ma san pham']);
      const codeKey = normalizeText(code);
      if (!code) {
        skipped += 1;
        errors.push({ code, message: 'Thiếu mã sản phẩm' });
        continue;
      }
      if (seen.has(codeKey)) {
        skipped += 1;
        errors.push({ code, message: 'Mã sản phẩm bị trùng trong file cập nhật' });
        continue;
      }
      seen.add(codeKey);
      const current = existingMap.get(codeKey);
      if (!current) {
        skipped += 1;
        errors.push({ code, message: 'Không tìm thấy sản phẩm để cập nhật' });
        continue;
      }

      const conversion = getProvidedField(row, ['conversionRate', 'Quy đổi', 'Quy doi', 'Tỷ lệ', 'Ty le']);
      const costPrice = getProvidedField(row, ['costPrice', 'importPrice', 'Giá nhập', 'Gia nhap']);
      const salePrice = getProvidedField(row, ['salePrice', 'price', 'Giá bán', 'Gia ban']);
      if (conversion.hasValue && toNumber(conversion.value) < 1) {
        skipped += 1;
        errors.push({ code, message: 'Quy đổi phải lớn hơn hoặc bằng 1' });
        continue;
      }
      if ((costPrice.hasValue && toNumber(costPrice.value) < 0) || (salePrice.hasValue && toNumber(salePrice.value) < 0)) {
        skipped += 1;
        errors.push({ code, message: 'Giá không được âm' });
        continue;
      }

      const { patch } = buildProductSelectiveUpdate(row, current);
      if (!Object.keys(patch).length) {
        unchanged += 1;
        continue;
      }
      ops.push({
        updateOne: {
          filter: { code: current.code },
          update: { $set: { ...patch, updatedAt: dateUtil.nowIso() } },
          upsert: false
        }
      });
    }

    const bulk = await bulkWriteInBatches(Product, ops);
    skipped += bulk.errors.length;
    errors.push(...bulk.errors.map((e) => ({ code: '', message: e.message })));
    const updated = Math.max(0, ops.length - bulk.errors.length);
    await addImportLog('products', { imported: updated, updated, unchanged, skipped, errors: errors.slice(0, 30), mode: 'selective-update', batchSize: IMPORT_BATCH_SIZE });
    return {
      imported: updated,
      updated,
      unchanged,
      skipped,
      errors,
      importMode,
      message: `Đã cập nhật ${updated} sản phẩm${unchanged ? `, giữ nguyên ${unchanged} dòng không thay đổi` : ''}${skipped ? `, bỏ qua ${skipped} dòng lỗi` : ''}`
    };
  }

  let skipped = 0;
  const errors = [];
  const ops = [];
  const seen = new Set();

  for (const row of rows) {
    const payload = pickProductPayload(row);
    if (!payload.code || !payload.name) {
      skipped += 1;
      errors.push({ code: payload.code, message: 'Thiếu mã hoặc tên sản phẩm' });
      continue;
    }
    const codeKey = normalizeText(payload.code);
    if (seen.has(codeKey)) continue;
    seen.add(codeKey);
    payload.searchText = productSearchText(payload);
    ops.push({
      updateOne: {
        filter: { code: payload.code },
        update: {
          $set: payload,
          $unset: {
            openingStock: 1,
            stockQuantity: 1,
            availableStock: 1,
            availableQty: 1,
            stock: 1,
            quantity: 1,
            qty: 1,
            tonKho: 1,
            tonDau: 1
          }
        },
        upsert: true
      }
    });
  }

  const bulk = await bulkWriteInBatches(Product, ops);
  skipped += bulk.errors.length;
  errors.push(...bulk.errors.map((e) => ({ code: '', message: e.message })));
  const imported = Math.max(0, ops.length - bulk.errors.length);
  await addImportLog('products', { imported, skipped, errors: errors.slice(0, 30), mode: 'bulkWrite', batchSize: IMPORT_BATCH_SIZE });
  return { imported, skipped, errors, importMode };
}

async function upsertCustomers(rows = [], options = {}) {
  const importMode = normalizeImportMode(options.importMode, 'customers');
  if (importMode === IMPORT_MODE_UPDATE) {
    let skipped = 0;
    let unchanged = 0;
    const errors = [];
    const ops = [];
    const seen = new Set();
    const salesStaffUserMap = await preloadSalesStaffUsersByCode(rows);
    const codes = Array.from(new Set(rows.map((row) => cleanText(row.code || row.customerCode || row['Mã khách hàng'] || row['Ma khach hang'])).filter(Boolean)));
    const existingRows = codes.length ? await Customer.find({ code: { $in: codes } }).lean() : [];
    const existingMap = new Map(existingRows.map((row) => [normalizeText(row.code), row]));

    for (const row of rows) {
      const code = cleanText(row.code || row.customerCode || row['Mã khách hàng'] || row['Ma khach hang']);
      const codeKey = normalizeText(code);
      if (!code) {
        skipped += 1;
        errors.push({ code, message: 'Thiếu mã khách hàng' });
        continue;
      }
      if (seen.has(codeKey)) {
        skipped += 1;
        errors.push({ code, message: 'Mã khách hàng bị trùng trong file cập nhật' });
        continue;
      }
      seen.add(codeKey);
      const current = existingMap.get(codeKey);
      if (!current) {
        skipped += 1;
        errors.push({ code, message: 'Không tìm thấy khách hàng để cập nhật' });
        continue;
      }

      let resolvedStaff = null;
      const staffField = getProvidedField(row, ['legacyStaffCode', 'staffCode', 'Mã NVBH', 'Ma NVBH', 'Mã nhân viên', 'Ma nhan vien', 'Mã nhân viên']);
      if (staffField.hasValue) {
        resolvedStaff = resolveSalesStaffForImportRow(row, salesStaffUserMap);
        if (!resolvedStaff.found) {
          skipped += 1;
          errors.push({ code, message: `Không tìm thấy mã NVBH ${cleanText(staffField.value)} trong tài khoản hệ thống` });
          continue;
        }
        if (!resolvedStaff.validRole) {
          skipped += 1;
          errors.push({ code, message: `Mã ${cleanText(staffField.value)} không phải nhân viên bán hàng` });
          continue;
        }
      }

      const { patch } = buildCustomerSelectiveUpdate(row, current, resolvedStaff);
      if (!Object.keys(patch).length) {
        unchanged += 1;
        continue;
      }
      ops.push({
        updateOne: {
          filter: { code: current.code },
          update: { $set: { ...patch, updatedAt: dateUtil.nowIso() } },
          upsert: false
        }
      });
    }

    const bulk = await bulkWriteInBatches(Customer, ops);
    skipped += bulk.errors.length;
    errors.push(...bulk.errors.map((e) => ({ code: '', message: e.message })));
    const updated = Math.max(0, ops.length - bulk.errors.length);
    await addImportLog('customers', { imported: updated, updated, unchanged, skipped, errors: errors.slice(0, 30), mode: 'selective-update', batchSize: IMPORT_BATCH_SIZE });
    return {
      imported: updated,
      updated,
      unchanged,
      skipped,
      errors,
      importMode,
      message: `Đã cập nhật ${updated} khách hàng${unchanged ? `, giữ nguyên ${unchanged} dòng không thay đổi` : ''}${skipped ? `, bỏ qua ${skipped} dòng lỗi` : ''}`
    };
  }

  let skipped = 0;
  const errors = [];
  const ops = [];
  const seen = new Set();
  const salesStaffUserMap = await preloadSalesStaffUsersByCode(rows);

  for (const row of rows) {
    const payload = pickCustomerPayload(row);
    if (!payload.code || !payload.name) {
      skipped += 1;
      errors.push({ code: payload.code, message: 'Thiếu mã hoặc tên khách hàng' });
      continue;
    }
    if (payload.staffCode) {
      const resolvedStaff = resolveSalesStaffForImportRow(row, salesStaffUserMap);
      if (!resolvedStaff.found) {
        skipped += 1;
        errors.push({ code: payload.code, message: `Không tìm thấy mã NVBH ${payload.staffCode} trong tài khoản hệ thống` });
        continue;
      }
      if (!resolvedStaff.validRole) {
        skipped += 1;
        errors.push({ code: payload.code, message: `Mã ${payload.staffCode} không phải nhân viên bán hàng` });
        continue;
      }
      payload.staffCode = resolvedStaff.staffCode;
      payload.staffName = resolvedStaff.staffName;
    }
    const codeKey = normalizeText(payload.code);
    if (seen.has(codeKey)) continue;
    seen.add(codeKey);
    payload.searchText = customerSearchText(payload);
    ops.push({
      updateOne: {
        filter: { code: payload.code },
        update: { $set: payload },
        upsert: true
      }
    });
  }

  const bulk = await bulkWriteInBatches(Customer, ops);
  skipped += bulk.errors.length;
  errors.push(...bulk.errors.map((e) => ({ code: '', message: e.message })));
  const imported = Math.max(0, ops.length - bulk.errors.length);
  await addImportLog('customers', { imported, skipped, errors: errors.slice(0, 30), mode: 'bulkWrite', batchSize: IMPORT_BATCH_SIZE });
  return { imported, skipped, errors, importMode };
}

module.exports = {
  upsertProducts,
  upsertCustomers
};