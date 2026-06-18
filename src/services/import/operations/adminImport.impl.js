'use strict';

const dateUtil = require('../../../utils/date.util');
const User = require('../../../models/User');
const PromotionProductRule = require('../../../models/PromotionProductRule');
const PromotionGroupItem = require('../../../models/PromotionGroupItem');
const PromotionGroupRule = require('../../../models/PromotionGroupRule');
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
const promotionService = require('../../promotionService');
const { isBcryptHash, hashPasswordSync } = require('../../../security/passwordPolicy');

const {
  addImportLog,
  buildUserSelectiveUpdate,
  cleanText,
  getUserUpdateInput,
  normalizeImportRole,
  pickUserImportPayload,
  pickPromotionProductRulePayload,
  pickPromotionGroupItemPayload,
  pickPromotionGroupRulePayload,
  dedupePromotionPayloads,
  preloadPromotionProductsByCode,
  promotionBulkChunks
} = require('../core/importRow.util');
const { bulkWriteInBatches } = require('../core/importPersistence.util');

async function importUsers(rows = [], options = {}) {
  const importMode = normalizeImportMode(options.importMode, 'users');
  const errors = [];
  const warnings = [];
  let imported = 0;
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  let skipped = 0;
  const seen = new Map();

  rows.forEach((raw, index) => {
    const item = pickUserImportPayload(raw);
    item.raw = raw;
    const rowNo = item.rowNo || item.__rowNo || index + 2;
    const rowErrors = [];
    if (!item.username) rowErrors.push('Thiếu tên đăng nhập');

    if (importMode === IMPORT_MODE_UPDATE) {
      const input = getUserUpdateInput(raw);
      if (input.role.hasValue && !normalizeImportRole(input.role.value)) rowErrors.push('Vai trò không hợp lệ');
    } else {
      if (!item.fullName) rowErrors.push('Thiếu họ tên');
      if (!item.staffCode) rowErrors.push('Thiếu mã nhân viên');
      if (!item.role) rowErrors.push('Vai trò không hợp lệ');
    }

    if (rowErrors.length) {
      skipped += 1;
      errors.push({ row: rowNo, username: item.username, message: rowErrors.join('; ') });
      return;
    }
    const key = item.username.toLowerCase();
    if (seen.has(key)) {
      if (importMode === IMPORT_MODE_UPDATE) {
        skipped += 1;
        errors.push({ row: rowNo, username: item.username, message: 'Trùng tên đăng nhập trong file cập nhật' });
        seen.delete(key);
        return;
      }
      warnings.push({ row: rowNo, username: item.username, warning: 'Trùng tên đăng nhập trong file, hệ thống lấy dòng cuối cùng' });
    }
    seen.set(key, item);
  });

  const validRows = [...seen.values()];
  const usernames = validRows.map((item) => item.username).filter(Boolean);
  const currentRows = usernames.length ? await User.find({ username: { $in: usernames } }).lean() : [];
  const currentMap = new Map(currentRows.map((row) => [String(row.username || '').toLowerCase(), row]));
  const ops = [];

  for (const item of validRows) {
    const current = currentMap.get(item.username.toLowerCase()) || null;

    if (importMode === IMPORT_MODE_UPDATE) {
      if (!current) {
        skipped += 1;
        errors.push({ row: item.rowNo || item.__rowNo || '', username: item.username, message: 'Không tìm thấy tài khoản để cập nhật' });
        continue;
      }
      const { patch } = buildUserSelectiveUpdate(item.raw || item, current, { hashPassword: true });
      if (!Object.keys(patch).length) {
        unchanged += 1;
        continue;
      }
      ops.push({
        updateOne: {
          filter: { username: current.username },
          update: { $set: { ...patch, updatedAt: dateUtil.nowIso() } },
          upsert: false
        }
      });
      updated += 1;
      continue;
    }

    if (!current && !item.password) {
      skipped += 1;
      errors.push({
        row: item.rowNo || item.__rowNo || '',
        username: item.username,
        message: 'Tạo tài khoản mới bắt buộc có mật khẩu'
      });
      continue;
    }

    const password = item.password
      ? (isBcryptHash(item.password) ? item.password : hashPasswordSync(item.password))
      : (current?.password || '');
    const payload = {
      username: item.username,
      password,
      fullName: item.fullName,
      name: item.name || item.fullName,
      staffCode: item.staffCode,
      code: item.code || item.staffCode,
      role: item.role,
      phone: item.phone,
      email: item.email,
      area: item.area,
      route: item.route,
      permissions: item.permissions,
      isActive: item.isActive !== false,
      isSalesman: item.role === 'sales',
      isDelivery: item.role === 'delivery',
      updatedAt: dateUtil.nowIso()
    };
    if (!current) payload.createdAt = dateUtil.nowIso();
    ops.push({
      updateOne: {
        filter: { username: item.username },
        update: { $set: payload, $setOnInsert: { id: item.staffCode || item.username } },
        upsert: true
      }
    });
    if (current) updated += 1; else created += 1;
  }

  const bulk = await bulkWriteInBatches(User, ops);
  skipped += bulk.errors.length;
  errors.push(...bulk.errors.map((e) => ({ row: '', username: '', message: e.message })));
  imported = Math.max(0, ops.length - bulk.errors.length);
  if (bulk.errors.length && importMode === IMPORT_MODE_UPDATE) updated = Math.max(0, updated - bulk.errors.length);

  await addImportLog('users', {
    imported,
    created,
    updated,
    unchanged,
    skipped,
    errors: errors.slice(0, 50),
    warnings: warnings.slice(0, 50),
    mode: importMode === IMPORT_MODE_UPDATE ? 'selective-update' : 'upsert'
  });
  return {
    imported,
    created,
    updated,
    unchanged,
    skipped,
    errors,
    warnings,
    importMode,
    message: importMode === IMPORT_MODE_UPDATE
      ? `Đã cập nhật ${updated} tài khoản${unchanged ? `, giữ nguyên ${unchanged} dòng không thay đổi` : ''}${skipped ? `, bỏ qua ${skipped} dòng lỗi` : ''}`
      : `Đã import ${imported} tài khoản: tạo mới ${created}, cập nhật ${updated}${skipped ? `, bỏ qua ${skipped} dòng lỗi` : ''}`
  };
}

async function importPromotionProductRules(rows = []) {
  let skipped = 0;
  const errors = [];
  const warnings = [];
  const now = dateUtil.nowIso();

  const rawPayloads = rows.map(pickPromotionProductRulePayload);
  const productMap = await preloadPromotionProductsByCode(rawPayloads);
  const { rows: payloads, duplicateCount } = dedupePromotionPayloads(rawPayloads, (p) => `${cleanText(p.programCode)}__${cleanText(p.productCode)}`);

  if (duplicateCount) warnings.push({ row: '', productCode: '', warning: `Có ${duplicateCount} dòng trùng mã chương trình + mã sản phẩm trong file. Hệ thống lấy dòng cuối cùng để import nhanh.` });

  const ops = [];
  for (const payload of payloads) {
    const rowNo = payload.__rowNumber || payload.rowNumber || '';
    const programCode = cleanText(payload.programCode);
    const programName = cleanText(payload.programName);
    const productCode = cleanText(payload.productCode);
    const product = productMap.get(productCode);

    if (!programCode) { skipped += 1; errors.push({ row: rowNo, productCode, error: 'Thiếu mã chương trình' }); continue; }
    if (!programName) { skipped += 1; errors.push({ row: rowNo, productCode, error: 'Thiếu nội dung chương trình' }); continue; }
    if (!productCode) { skipped += 1; errors.push({ row: rowNo, productCode, error: 'Thiếu mã sản phẩm' }); continue; }
    if (toNumber(payload.discountPercent) < 0) { skipped += 1; errors.push({ row: rowNo, productCode, error: 'Chiết khấu không được âm' }); continue; }

    const productName = cleanText(product?.name || payload.productName || '');
    if (!product) warnings.push({ row: rowNo, productCode, warning: `Mã sản phẩm ${productCode} chưa có trong danh mục` });

    const id = cleanText(payload.id) || `${programCode}__${productCode}`;
    const doc = {
      ...payload,
      id,
      programCode,
      programName,
      productCode,
      productName,
      discountPercent: promotionService.normalizeDiscountPercent(payload.discountPercent),
      productMatched: Boolean(product),
      missingProduct: !product,
      source: cleanText(payload.source || 'excel-import'),
      isActive: payload.isActive !== false && payload.isActive !== 'false',
      updatedAt: now
    };
    delete doc.errors; delete doc.warnings; delete doc.valid;
    ops.push({ updateOne: { filter: { programCode, productCode }, update: { $set: doc, $setOnInsert: { createdAt: now } }, upsert: true } });
  }

  for (const chunk of promotionBulkChunks(ops)) {
    if (chunk.length) await PromotionProductRule.bulkWrite(chunk, { ordered: false });
  }
  const imported = ops.length;
  await addImportLog('promotionProductRules', { imported, skipped, errors: errors.slice(0, 50), warnings: warnings.slice(0, 50) });
  return { imported, skipped, errors, warnings, message: `Đã import nhanh ${imported} dòng CK sản phẩm bằng bulkWrite${skipped ? `, bỏ qua ${skipped} dòng lỗi` : ''}` };
}

async function importPromotionGroupItems(rows = []) {
  let skipped = 0;
  const errors = [];
  const warnings = [];
  const now = dateUtil.nowIso();

  const rawPayloads = rows.map(pickPromotionGroupItemPayload);
  const productMap = await preloadPromotionProductsByCode(rawPayloads);
  const { rows: payloads, duplicateCount } = dedupePromotionPayloads(rawPayloads, (p) => `${cleanText(p.programCode)}__${cleanText(p.productCode)}`);

  if (duplicateCount) warnings.push({ row: '', productCode: '', warning: `Có ${duplicateCount} dòng trùng mã chương trình + mã sản phẩm trong file. Hệ thống lấy dòng cuối cùng để import nhanh.` });

  const ops = [];
  for (const payload of payloads) {
    const rowNo = payload.__rowNumber || payload.rowNumber || '';
    const programCode = cleanText(payload.programCode);
    const productCode = cleanText(payload.productCode);
    const product = productMap.get(productCode);

    if (!programCode) { skipped += 1; errors.push({ row: rowNo, productCode, error: 'Thiếu mã chương trình KM / mã nhóm' }); continue; }
    if (!productCode) { skipped += 1; errors.push({ row: rowNo, productCode, error: 'Thiếu mã sản phẩm' }); continue; }

    const productName = cleanText(product?.name || payload.productName || '');
    if (!product) warnings.push({ row: rowNo, productCode, warning: `Mã sản phẩm ${productCode} chưa có trong danh mục` });

    const id = cleanText(payload.id) || `${programCode}__${productCode}`;
    const doc = {
      ...payload,
      id,
      programCode,
      productCode,
      productName,
      productMatched: Boolean(product),
      missingProduct: !product,
      source: cleanText(payload.source || 'excel-import'),
      isActive: payload.isActive !== false && payload.isActive !== 'false',
      updatedAt: now
    };
    delete doc.errors; delete doc.warnings; delete doc.valid;
    ops.push({ updateOne: { filter: { programCode, productCode }, update: { $set: doc, $setOnInsert: { createdAt: now } }, upsert: true } });
  }

  for (const chunk of promotionBulkChunks(ops)) {
    if (chunk.length) await PromotionGroupItem.bulkWrite(chunk, { ordered: false });
  }
  const imported = ops.length;
  await addImportLog('promotionGroupItems', { imported, skipped, errors: errors.slice(0, 50), warnings: warnings.slice(0, 50) });
  return { imported, skipped, errors, warnings, message: `Đã import nhanh ${imported} dòng nhóm sản phẩm KM bằng bulkWrite${skipped ? `, bỏ qua ${skipped} dòng lỗi` : ''}` };
}

async function importPromotionGroupRules(rows = []) {
  let skipped = 0;
  const errors = [];
  const now = dateUtil.nowIso();

  const rawPayloads = rows.map(pickPromotionGroupRulePayload);
  const { rows: payloads, duplicateCount } = dedupePromotionPayloads(rawPayloads, (p) => `${cleanText(p.programCode)}__${toNumber(p.minAmount)}`);
  const warnings = duplicateCount ? [{ row: '', programCode: '', warning: `Có ${duplicateCount} dòng trùng mã chương trình + mức doanh số trong file. Hệ thống lấy dòng cuối cùng để import nhanh.` }] : [];

  const ops = [];
  for (const payload of payloads) {
    const rowNo = payload.__rowNumber || payload.rowNumber || '';
    const programCode = cleanText(payload.programCode);
    const programName = cleanText(payload.programName);
    const minAmount = toNumber(payload.minAmount);
    const discountPercent = promotionService.normalizeDiscountPercent(payload.discountPercent);

    if (!programCode) { skipped += 1; errors.push({ row: rowNo, programCode, error: 'Thiếu mã nhóm sản phẩm / mã chương trình' }); continue; }
    if (!programName) { skipped += 1; errors.push({ row: rowNo, programCode, error: 'Thiếu nội dung chương trình KM' }); continue; }
    if (minAmount <= 0) { skipped += 1; errors.push({ row: rowNo, programCode, error: 'Mức doanh số cần lấy phải lớn hơn 0' }); continue; }
    if (discountPercent < 0) { skipped += 1; errors.push({ row: rowNo, programCode, error: 'Chiết khấu không được âm' }); continue; }

    const id = cleanText(payload.id) || `${programCode}__${minAmount}`;
    const doc = {
      ...payload,
      id,
      programCode,
      programName,
      minAmount,
      discountPercent,
      source: cleanText(payload.source || 'excel-import'),
      isActive: payload.isActive !== false && payload.isActive !== 'false',
      updatedAt: now
    };
    delete doc.errors; delete doc.warnings; delete doc.valid;
    ops.push({ updateOne: { filter: { programCode, minAmount }, update: { $set: doc, $setOnInsert: { createdAt: now } }, upsert: true } });
  }

  for (const chunk of promotionBulkChunks(ops)) {
    if (chunk.length) await PromotionGroupRule.bulkWrite(chunk, { ordered: false });
  }
  const imported = ops.length;
  await addImportLog('promotionGroupRules', { imported, skipped, errors: errors.slice(0, 50), warnings: warnings.slice(0, 50) });
  return { imported, skipped, errors, warnings, message: `Đã import nhanh ${imported} dòng điều kiện nhóm KM bằng bulkWrite${skipped ? `, bỏ qua ${skipped} dòng lỗi` : ''}` };
}

module.exports = {
  importUsers,
  importPromotionProductRules,
  importPromotionGroupItems,
  importPromotionGroupRules
};