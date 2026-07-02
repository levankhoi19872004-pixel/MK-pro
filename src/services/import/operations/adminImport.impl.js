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

const { cleanText } = require('../core/importValue.util');
const { addImportLog } = require('../core/importLogging.util');
const {
  buildUserSelectiveUpdate,
  getUserUpdateInput,
  normalizeImportRole,
  pickUserImportPayload,
  pickPromotionProductRulePayload,
  pickPromotionGroupItemPayload,
  pickPromotionGroupRulePayload,
  pickPromotionQuantityGroupDiscountPayload,
  pickPromotionCustomerOrderValueDiscountPayload,
  dedupePromotionPayloads,
  preloadPromotionProductsByCode,
  preloadPromotionCustomersByCode,
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

function clampPromotionImportBatchSize(value) {
  const size = Number(value || process.env.PROMOTION_IMPORT_BATCH_SIZE || 50);
  if (!Number.isFinite(size) || size <= 0) return 50;
  return Math.max(1, Math.min(1000, Math.floor(size)));
}

function promotionBulkWriteTimeoutMs(options = {}) {
  const value = Number(options.bulkWriteTimeoutMs || process.env.PROMOTION_IMPORT_BULK_TIMEOUT_MS || 30 * 1000);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function withPromotionBulkTimeout(promise, timeoutMs, context = {}) {
  if (!timeoutMs) return promise;
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`MongoDB bulkWrite CK sản phẩm quá thời gian chờ tại lô ${context.batchIndex + 1}/${context.totalBatches}`);
      error.code = 'PROMOTION_PRODUCT_RULE_BULK_TIMEOUT';
      error.retryable = true;
      error.context = context;
      reject(error);
    }, timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function extractPromotionBulkWriteErrors(error) {
  const writeErrors = Array.isArray(error?.writeErrors) ? error.writeErrors : [];
  return writeErrors.slice(0, 20).map((item) => ({
    index: Number(item.index ?? item.err?.index ?? -1),
    code: item.code || item.err?.code || error?.code || '',
    message: cleanText(item.errmsg || item.message || item.err?.errmsg || item.err?.message || error?.message || item)
  })).filter((item) => item.message);
}

function buildPromotionBulkWriteError(error, context = {}) {
  const writeErrors = extractPromotionBulkWriteErrors(error);
  const firstMessage = writeErrors[0]?.message || error?.message || String(error || 'MongoDB bulkWrite CK sản phẩm thất bại');
  const wrapped = new Error(`Không ghi được CK sản phẩm tại lô ${Number(context.batchIndex || 0) + 1}/${context.totalBatches || 1}: ${firstMessage}`);
  wrapped.code = error?.code || 'PROMOTION_PRODUCT_RULE_BULK_WRITE_FAILED';
  wrapped.kind = 'system';
  wrapped.retryable = error?.retryable !== false;
  wrapped.details = {
    ...context,
    writeErrors,
    originalCode: error?.code || '',
    originalName: error?.name || ''
  };
  return wrapped;
}

async function notifyPromotionProductRuleProgress(options = {}, progress = {}) {
  if (typeof options.onProgress !== 'function') return;
  await options.onProgress(progress);
}

async function importPromotionProductRules(rows = [], options = {}) {
  let skipped = 0;
  const errors = [];
  const warnings = [];
  const now = dateUtil.nowIso();
  const sessionId = cleanText(options.importSessionId || options.sessionId);
  const batchSize = clampPromotionImportBatchSize(options.batchSize);
  const timeoutMs = promotionBulkWriteTimeoutMs(options);

  console.info('[IMPORT_COMMIT_STARTED]', {
    sessionId,
    type: 'promotionProductRules',
    totalRows: rows.length,
    batchSize
  });

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
    if (!product) { skipped += 1; errors.push({ row: rowNo, productCode, error: `Mã sản phẩm ${productCode} chưa có trong danh mục` }); continue; }
    if (toNumber(payload.discountPercent) < 0) { skipped += 1; errors.push({ row: rowNo, productCode, error: 'Chiết khấu không được âm' }); continue; }

    const productName = cleanText(product.name || payload.productName || '');

    const id = cleanText(payload.id) || `${programCode}__${productCode}`;
    // Không lưu nguyên raw Excel vào promotionProductRules. Raw có thể rất lớn hoặc chứa
    // key Excel không an toàn, làm bulkWrite chậm/treo ở các batch cuối. Collection này
    // chỉ cần contract nghiệp vụ đã chuẩn hóa để runtime promotion tra cứu nhanh.
    const doc = {
      id,
      programCode,
      programName,
      productCode,
      productName,
      discountPercent: promotionService.normalizeDiscountPercent(payload.discountPercent),
      productMatched: Boolean(product),
      missingProduct: false,
      source: cleanText(payload.source || 'excel-import'),
      sourceRowNo: rowNo,
      rowNo,
      sourceFile: cleanText(payload.sourceFile || payload.fileName || ''),
      isActive: payload.isActive !== false && payload.isActive !== 'false',
      updatedAt: now
    };
    ops.push({ updateOne: { filter: { programCode, productCode }, update: { $set: doc, $setOnInsert: { createdAt: now } }, upsert: true } });
  }

  const batches = promotionBulkChunks(ops, batchSize);
  let writtenOps = 0;
  for (const [batchIndex, chunk] of batches.entries()) {
    if (!chunk.length) continue;
    try {
      await withPromotionBulkTimeout(
        PromotionProductRule.bulkWrite(chunk, { ordered: false, writeConcern: { w: 1 }, maxTimeMS: timeoutMs || undefined }),
        timeoutMs,
        { sessionId, batchIndex, totalBatches: batches.length, totalOps: ops.length, writtenOps }
      );
      writtenOps += chunk.length;
    } catch (error) {
      const wrapped = buildPromotionBulkWriteError(error, {
        sessionId,
        batchIndex,
        totalBatches: batches.length,
        writtenOps,
        totalOps: ops.length,
        batchSize: chunk.length
      });
      console.error('[IMPORT_COMMIT_BULK_ERROR]', {
        sessionId,
        type: 'promotionProductRules',
        batchIndex: batchIndex + 1,
        totalBatches: batches.length,
        writtenOps,
        totalOps: ops.length,
        code: wrapped.code,
        message: wrapped.message
      });
      throw wrapped;
    }

    const progress = {
      percent: 18 + Math.floor(((batchIndex + 1) / Math.max(1, batches.length)) * 72),
      step: `committing:${batchIndex + 1}/${batches.length}`,
      completedRows: writtenOps,
      totalRows: ops.length,
      message: `Đang ghi CK sản phẩm theo lô ${batchIndex + 1}/${batches.length}`
    };
    await notifyPromotionProductRuleProgress(options, progress);
    console.info('[IMPORT_COMMIT_PROGRESS]', {
      sessionId,
      type: 'promotionProductRules',
      batchIndex: batchIndex + 1,
      totalBatches: batches.length,
      imported: writtenOps,
      skipped,
      totalCommitRows: ops.length,
      percent: progress.percent
    });
  }

  await notifyPromotionProductRuleProgress(options, {
    percent: 95,
    step: 'finalizing',
    completedRows: writtenOps,
    totalRows: ops.length,
    message: 'Đang hoàn tất import CK sản phẩm'
  });

  const imported = ops.length;
  await addImportLog('promotionProductRules', { imported, skipped, errors: errors.slice(0, 50), warnings: warnings.slice(0, 50) });
  console.info('[IMPORT_COMMIT_DONE]', {
    sessionId,
    type: 'promotionProductRules',
    imported,
    skipped,
    totalCommitRows: ops.length
  });
  return {
    imported,
    skipped,
    errors,
    warnings,
    partialImport: skipped > 0 && imported > 0,
    message: imported > 0 && skipped > 0
      ? `Đã import ${imported} dòng CK sản phẩm hợp lệ, bỏ qua ${skipped} dòng lỗi`
      : `Đã import ${imported} dòng CK sản phẩm hợp lệ${skipped ? `, bỏ qua ${skipped} dòng lỗi` : ''}`
  };
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

    if (!product) {
      skipped += 1;
      errors.push({ row: rowNo, productCode, error: `Mã sản phẩm ${productCode} chưa có trong danh mục` });
      continue;
    }

    const productName = cleanText(product.name || payload.productName || '');

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
  const { rows: payloads, duplicateCount } = dedupePromotionPayloads(rawPayloads, (p) => `${cleanText(p.programCode)}__${cleanText(p.groupCode)}__${cleanText(p.basis || 'ORDER_VALUE')}__${toNumber(p.minAmount)}`);
  const warnings = duplicateCount ? [{ row: '', programCode: '', warning: `Có ${duplicateCount} dòng trùng mã chương trình + nhóm áp dụng + cách tính + ngưỡng trong file. Hệ thống lấy dòng cuối cùng để import nhanh.` }] : [];

  const ops = [];
  for (const payload of payloads) {
    const rowNo = payload.__rowNumber || payload.rowNumber || '';
    const programCode = cleanText(payload.programCode);
    const programName = cleanText(payload.programName);
    const groupCode = cleanText(payload.groupCode || programCode);
    const basis = promotionService.normalizeGroupRuleBasis(payload.basis || payload.calculationBasis);
    const minAmount = toNumber(payload.minAmount);
    const discountPercent = promotionService.normalizeDiscountPercent(payload.discountPercent);

    if (!programCode) { skipped += 1; errors.push({ row: rowNo, programCode, error: 'Thiếu mã CTKM / mã chương trình' }); continue; }
    if (!programName) { skipped += 1; errors.push({ row: rowNo, programCode, error: 'Thiếu nội dung chương trình KM' }); continue; }
    if (!groupCode) { skipped += 1; errors.push({ row: rowNo, programCode, error: 'Thiếu nhóm áp dụng' }); continue; }
    if (!basis) { skipped += 1; errors.push({ row: rowNo, programCode, error: 'Tính theo không hợp lệ' }); continue; }
    if (minAmount <= 0) { skipped += 1; errors.push({ row: rowNo, programCode, error: basis === 'QUANTITY' ? 'Số lượng từ phải lớn hơn 0' : 'Doanh số từ phải lớn hơn 0' }); continue; }
    if (discountPercent <= 0) { skipped += 1; errors.push({ row: rowNo, programCode, error: 'Chiết khấu % phải lớn hơn 0' }); continue; }

    const id = cleanText(payload.id) || `${programCode}__${groupCode}__${basis}__${minAmount}`;
    const doc = {
      ...payload,
      id,
      programCode,
      programName,
      groupCode,
      basis,
      calculationBasis: basis,
      minAmount,
      discountPercent,
      source: cleanText(payload.source || 'excel-import'),
      isActive: payload.isActive !== false && payload.isActive !== 'false',
      updatedAt: now
    };
    delete doc.errors; delete doc.warnings; delete doc.valid;
    ops.push({ updateOne: { filter: { programCode, groupCode, basis, minAmount }, update: { $set: doc, $setOnInsert: { createdAt: now } }, upsert: true } });
  }

  for (const chunk of promotionBulkChunks(ops)) {
    if (chunk.length) await PromotionGroupRule.bulkWrite(chunk, { ordered: false });
  }
  const imported = ops.length;
  await addImportLog('promotionGroupRules', { imported, skipped, errors: errors.slice(0, 50), warnings: warnings.slice(0, 50) });
  return { imported, skipped, errors, warnings, message: `Đã import nhanh ${imported} dòng điều kiện nhóm KM/Ontop bằng bulkWrite${skipped ? `, bỏ qua ${skipped} dòng lỗi` : ''}` };
}

async function importPromotionQuantityGroupDiscounts(rows = []) {
  let skipped = 0;
  const errors = [];
  const warnings = [];
  const rawPayloads = rows.map(pickPromotionQuantityGroupDiscountPayload);
  const productMap = await preloadPromotionProductsByCode(rawPayloads);
  const grouped = new Map();
  for (const payload of rawPayloads) {
    const rowNo = payload.__rowNumber || payload.rowNumber || '';
    const programCode = cleanText(payload.programCode);
    const productCode = cleanText(payload.productCode);
    const product = productMap.get(productCode);
    if (!programCode) { skipped += 1; errors.push({ row: rowNo, error: 'Thiếu mã chương trình KM' }); continue; }
    if (!payload.programName) { skipped += 1; errors.push({ row: rowNo, programCode, error: 'Thiếu tên chương trình KM' }); continue; }
    if (!productCode) { skipped += 1; errors.push({ row: rowNo, programCode, error: 'Thiếu mã sản phẩm' }); continue; }
    if (!product) warnings.push({ row: rowNo, productCode, warning: `Mã sản phẩm ${productCode} chưa có trong danh mục` });
    if (toNumber(payload.minQty) <= 0) { skipped += 1; errors.push({ row: rowNo, programCode, error: 'Số lượng tối thiểu phải lớn hơn 0' }); continue; }
    if (toNumber(payload.discountPercent) <= 0 || toNumber(payload.discountPercent) > 100) { skipped += 1; errors.push({ row: rowNo, programCode, error: 'Chiết khấu % phải trong khoảng 0-100' }); continue; }
    if (!grouped.has(programCode)) grouped.set(programCode, { ...payload, productCodes: [], productNames: [] });
    const group = grouped.get(programCode);
    if (!group.productCodes.includes(productCode)) group.productCodes.push(productCode);
    if (product?.name) group.productNames.push(cleanText(product.name));
  }
  let imported = 0;
  for (const payload of grouped.values()) {
    const result = await promotionService.saveQuantityGroupDiscount(payload);
    if (result.error) { skipped += 1; errors.push({ row: payload.rowNo || '', programCode: payload.programCode, error: result.error }); continue; }
    imported += 1;
  }
  await addImportLog('promotionQuantityGroupDiscounts', { imported, skipped, errors: errors.slice(0, 50), warnings: warnings.slice(0, 50) });
  return { imported, skipped, errors, warnings, message: `Đã import ${imported} chương trình CK theo số lượng nhóm SP${skipped ? `, bỏ qua ${skipped} dòng lỗi` : ''}` };
}

async function importPromotionCustomerOrderValueDiscounts(rows = []) {
  let skipped = 0;
  const errors = [];
  const warnings = [];
  const rawPayloads = rows.map(pickPromotionCustomerOrderValueDiscountPayload);
  const customerMap = await preloadPromotionCustomersByCode(rawPayloads);
  const grouped = new Map();
  for (const payload of rawPayloads) {
    const rowNo = payload.__rowNumber || payload.rowNumber || '';
    const programCode = cleanText(payload.programCode);
    const customerCode = cleanText(payload.customerCode);
    const customer = customerMap.get(customerCode);
    if (!programCode) { skipped += 1; errors.push({ row: rowNo, error: 'Thiếu mã chương trình KM' }); continue; }
    if (!payload.programName) { skipped += 1; errors.push({ row: rowNo, programCode, error: 'Thiếu tên chương trình KM' }); continue; }
    if (!customerCode) { skipped += 1; errors.push({ row: rowNo, programCode, error: 'Thiếu mã khách hàng' }); continue; }
    if (!customer) { skipped += 1; errors.push({ row: rowNo, customerCode, error: `Mã khách hàng ${customerCode} chưa có trong danh mục` }); continue; }
    if (toNumber(payload.minOrderAmount) <= 0) { skipped += 1; errors.push({ row: rowNo, programCode, error: 'Doanh số đơn tối thiểu phải lớn hơn 0' }); continue; }
    if (toNumber(payload.discountPercent) <= 0 || toNumber(payload.discountPercent) > 100) { skipped += 1; errors.push({ row: rowNo, programCode, error: 'Chiết khấu % phải trong khoảng 0-100' }); continue; }
    if (!grouped.has(programCode)) grouped.set(programCode, { ...payload, customerCodes: [] });
    const group = grouped.get(programCode);
    if (!group.customerCodes.includes(customerCode)) group.customerCodes.push(customerCode);
  }
  let imported = 0;
  for (const payload of grouped.values()) {
    const result = await promotionService.saveCustomerOrderValueDiscount(payload);
    if (result.error) { skipped += 1; errors.push({ row: payload.rowNo || '', programCode: payload.programCode, error: result.error }); continue; }
    imported += 1;
  }
  await addImportLog('promotionCustomerOrderValueDiscounts', { imported, skipped, errors: errors.slice(0, 50), warnings: warnings.slice(0, 50) });
  return { imported, skipped, errors, warnings, message: `Đã import ${imported} chương trình CK thêm theo doanh số KH${skipped ? `, bỏ qua ${skipped} dòng lỗi` : ''}` };
}

module.exports = {
  importUsers,
  importPromotionProductRules,
  importPromotionGroupItems,
  importPromotionGroupRules,
  importPromotionQuantityGroupDiscounts,
  importPromotionCustomerOrderValueDiscounts
};