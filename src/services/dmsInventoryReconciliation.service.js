'use strict';

const crypto = require('node:crypto');
const readXlsxFile = require('read-excel-file/node');

const DmsInventoryImport = require('../models/DmsInventoryImport');
const DmsInventorySnapshot = require('../models/DmsInventorySnapshot');
const InternalSaleAllocation = require('../models/InternalSaleAllocation');
const Product = require('../models/Product');
const inventoryStockService = require('./inventoryStock.service');
const auditService = require('./auditService');
const { withMongoTransaction } = require('../utils/transaction.util');
const { makeId, toNumber, formatCaseLooseQty } = require('../utils/common.util');
const dateUtil = require('../utils/date.util');

const REQUIRED_HEADERS = {
  productCode: ['so hieu hang hoa', 'ma hang hoa', 'ma san pham'],
  productName: ['mo ta mat hang', 'ten mat hang', 'ten san pham'],
  conversionRate: ['qui cach dong goi', 'quy cach dong goi'],
  caseLoose: ['ton cuoi cs su', 'ton cuoi case su'],
  baseQty: ['ton kho cuoi ky su', 'ton cuoi ky su']
};

function cleanText(value = '') {
  return String(value ?? '').trim();
}

function normalizeHeader(value = '') {
  return cleanText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeProductCode(value = '') {
  return inventoryStockService.normalizeProductCode(value);
}


function normalizeWorkbookSheets(workbook) {
  if (Array.isArray(workbook) && workbook.some((entry) => entry && Array.isArray(entry.data))) {
    return workbook.map((entry) => ({ name: cleanText(entry.sheet || ''), rows: entry.data }));
  }
  return [{ name: '', rows: workbook }];
}

function hashBuffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function parseCaseLoose(value = '', conversionRate = 1) {
  const text = cleanText(value);
  const match = text.match(/^(-?\d+)\s*\/\s*(-?\d+)$/);
  if (!match) return { valid: false, cases: 0, loose: 0, total: 0, display: text };
  const cases = Number(match[1]);
  const loose = Number(match[2]);
  const rate = Math.max(1, toNumber(conversionRate));
  return {
    valid: Number.isFinite(cases) && Number.isFinite(loose) && cases >= 0 && loose >= 0,
    cases,
    loose,
    total: cases * rate + loose,
    display: `${cases}/${loose}`
  };
}

function findHeaderIndexes(rows = []) {
  const firstRows = rows.slice(0, 15);
  for (let rowIndex = 0; rowIndex < firstRows.length; rowIndex += 1) {
    const normalized = (firstRows[rowIndex] || []).map(normalizeHeader);
    const indexes = {};
    for (const [field, aliases] of Object.entries(REQUIRED_HEADERS)) {
      indexes[field] = normalized.findIndex((header) => aliases.some((alias) => header === alias || header.includes(alias)));
    }
    if (Object.values(indexes).every((index) => index >= 0)) return { rowIndex, indexes };
  }
  const err = new Error('Không tìm thấy đủ các cột DMS: Số hiệu hàng hóa, Mô tả mặt hàng, Qui cách đóng gói, Tồn cuối (CS/SU), Tồn kho cuối kỳ (SU)');
  err.status = 400;
  err.code = 'DMS_HEADERS_NOT_FOUND';
  throw err;
}

async function parseDmsInventoryFile(buffer) {
  const workbook = await readXlsxFile(buffer);
  const sheets = normalizeWorkbookSheets(workbook);

  let selectedSheet = null;
  let headerMeta = null;
  for (const sheet of sheets) {
    if (!Array.isArray(sheet.rows) || sheet.rows.length < 2) continue;
    try {
      headerMeta = findHeaderIndexes(sheet.rows);
      selectedSheet = sheet;
      break;
    } catch (err) {
      if (err?.code !== 'DMS_HEADERS_NOT_FOUND') throw err;
    }
  }

  if (!selectedSheet || !headerMeta) {
    const err = new Error('File tồn DMS không có sheet dữ liệu hợp lệ hoặc thiếu các cột bắt buộc');
    err.status = 400;
    err.code = 'DMS_SHEET_NOT_FOUND';
    throw err;
  }

  const rows = selectedSheet.rows;
  const { rowIndex, indexes } = headerMeta;
  const grouped = new Map();
  let sourceRowCount = 0;
  let invalidRowCount = 0;

  for (let index = rowIndex + 1; index < rows.length; index += 1) {
    const source = rows[index] || [];
    const productCode = normalizeProductCode(source[indexes.productCode]);
    const productName = cleanText(source[indexes.productName]);
    const conversionRate = Math.max(1, toNumber(source[indexes.conversionRate]));
    const dmsCaseLoose = cleanText(source[indexes.caseLoose]);
    const dmsBaseQty = toNumber(source[indexes.baseQty]);

    if (!productCode && !productName && !dmsCaseLoose && !dmsBaseQty) continue;
    sourceRowCount += 1;
    if (!productCode || dmsBaseQty < 0) {
      invalidRowCount += 1;
      continue;
    }

    const parsed = parseCaseLoose(dmsCaseLoose, conversionRate);
    const formulaValid = parsed.valid && Math.abs(parsed.total - dmsBaseQty) < 0.0001;
    const current = grouped.get(productCode) || {
      productCode,
      productName,
      dmsConversionRate: conversionRate,
      dmsCaseLoose: '0/0',
      dmsBaseQty: 0,
      formulaValid: true,
      sourceRows: 0,
      warning: ''
    };

    current.productName = current.productName || productName;
    if (current.dmsConversionRate !== conversionRate) {
      current.warning = `Mã ${productCode} có nhiều quy cách trong cùng file`;
      current.formulaValid = false;
    }
    current.dmsBaseQty += dmsBaseQty;
    current.formulaValid = current.formulaValid && formulaValid;
    current.sourceRows += 1;
    grouped.set(productCode, current);
  }

  const items = Array.from(grouped.values()).map((row) => ({
    ...row,
    dmsCaseLoose: formatCaseLooseQty(row.dmsBaseQty, row.dmsConversionRate),
    warning: row.warning || (row.formulaValid ? '' : 'Tồn CS/SU không khớp tồn SU; hệ thống dùng cột Tồn kho cuối kỳ (SU) làm chuẩn')
  }));

  if (!items.length) {
    const err = new Error('Không đọc được dòng tồn kho hợp lệ trong file DMS');
    err.status = 400;
    throw err;
  }

  return {
    sheetName: selectedSheet.name,
    headerRow: rowIndex + 1,
    sourceRowCount,
    invalidRowCount,
    items
  };
}

function productCodeOf(product = {}) {
  return normalizeProductCode(product.code || product.productCode || product.sku || product.id || product._id);
}

function productConversionRate(product = {}) {
  return Math.max(1, toNumber(product.conversionRate || product.packingQty || product.unitsPerCase || 1));
}

function buildSummary(rows = []) {
  return (rows || []).reduce((summary, row) => {
    summary.totalRows += 1;
    summary.totalDmsQty += toNumber(row.dmsBaseQty);
    summary.totalInternalQty += toNumber(row.internalBaseQty);
    summary.totalDmsExcessQty += toNumber(row.dmsExcessQty);
    summary.totalInternalExcessQty += toNumber(row.internalExcessQty);
    if (row.comparisonType === 'matched') summary.matchedRows += 1;
    if (row.comparisonType === 'dms_greater') summary.dmsGreaterRows += 1;
    if (row.comparisonType === 'internal_greater') summary.internalGreaterRows += 1;
    if (row.comparisonType === 'unmapped') summary.unmappedRows += 1;
    if (row.comparisonType === 'conversion_mismatch') summary.conversionMismatchRows += 1;
    return summary;
  }, {
    totalRows: 0,
    matchedRows: 0,
    dmsGreaterRows: 0,
    internalGreaterRows: 0,
    unmappedRows: 0,
    conversionMismatchRows: 0,
    totalDmsQty: 0,
    totalInternalQty: 0,
    totalDmsExcessQty: 0,
    totalInternalExcessQty: 0
  });
}

async function buildComparisonRows(dmsItems = [], options = {}) {
  const session = options.session || null;
  let productQuery = Product.find({ isActive: { $ne: false } })
    .select('id code productCode sku name productName conversionRate packingQty unitsPerCase costPrice isActive');
  if (session) productQuery = productQuery.session(session);
  const [inventoryResult, products] = await Promise.all([
    inventoryStockService.getInventorySummary({}, { session }),
    productQuery.lean()
  ]);

  const productMap = new Map();
  for (const product of products || []) {
    const code = productCodeOf(product);
    if (code) productMap.set(code, product);
  }

  const inventoryMap = new Map();
  for (const stock of inventoryResult.stock || []) {
    const code = normalizeProductCode(stock.productCode);
    if (code) inventoryMap.set(code, stock);
  }

  const dmsMap = new Map((dmsItems || []).map((row) => [normalizeProductCode(row.productCode), row]));
  const codes = new Set([...dmsMap.keys(), ...Array.from(inventoryMap.entries())
    .filter(([, stock]) => toNumber(stock.availableQty) > 0)
    .map(([code]) => code)]);

  const now = dateUtil.nowIso();
  return Array.from(codes).sort().map((productCode) => {
    const dms = dmsMap.get(productCode);
    const stock = inventoryMap.get(productCode) || {};
    const product = productMap.get(productCode) || {};
    const dmsBaseQty = Math.max(0, toNumber(dms?.dmsBaseQty));
    const internalBaseQty = Math.max(0, toNumber(stock.availableQty));
    const differenceQty = internalBaseQty - dmsBaseQty;
    const dmsExcessQty = Math.max(0, -differenceQty);
    const internalExcessQty = Math.max(0, differenceQty);
    const dmsConversionRate = Math.max(1, toNumber(dms?.dmsConversionRate || 1));
    const internalConversionRate = productConversionRate(product || stock);
    const isMapped = Boolean(productCodeOf(product));
    const conversionMismatch = Boolean(dms && isMapped && dmsConversionRate !== internalConversionRate);
    const formulaMismatch = Boolean(dms && dms.formulaValid === false);

    let comparisonType = 'matched';
    if (!isMapped && dms) comparisonType = 'unmapped';
    else if (conversionMismatch || formulaMismatch) comparisonType = 'conversion_mismatch';
    else if (differenceQty > 0) comparisonType = 'internal_greater';
    else if (differenceQty < 0) comparisonType = 'dms_greater';

    return {
      productId: String(product.id || product._id || stock.productId || ''),
      productCode,
      productName: cleanText(product.name || product.productName || stock.productName || dms?.productName || ''),
      dmsProductName: cleanText(dms?.productName || ''),
      dmsConversionRate,
      internalConversionRate,
      dmsCaseLoose: dms ? cleanText(dms.dmsCaseLoose || formatCaseLooseQty(dmsBaseQty, dmsConversionRate)) : '0/0',
      dmsBaseQty,
      internalBaseQty,
      differenceQty,
      dmsExcessQty,
      internalExcessQty,
      comparisonType,
      sourcePresentInDms: Boolean(dms),
      formulaValid: dms ? dms.formulaValid !== false : true,
      warning: cleanText(dms?.warning || (conversionMismatch ? 'Quy cách DMS khác quy cách sản phẩm trong phần mềm' : '')),
      status: 'previewed',
      createdAt: now,
      updatedAt: now
    };
  });
}

function importActor(user = {}) {
  return {
    code: cleanText(user.staffCode || user.code || user.username || user.id || ''),
    name: cleanText(user.fullName || user.name || user.username || '')
  };
}

function applySummary(target = {}, summary = {}) {
  return {
    ...target,
    totalRows: summary.totalRows,
    validRows: summary.totalRows - summary.unmappedRows,
    matchedRows: summary.matchedRows,
    dmsGreaterRows: summary.dmsGreaterRows,
    internalGreaterRows: summary.internalGreaterRows,
    unmappedRows: summary.unmappedRows,
    conversionMismatchRows: summary.conversionMismatchRows,
    totalDmsQty: summary.totalDmsQty,
    totalInternalQty: summary.totalInternalQty,
    totalDmsExcessQty: summary.totalDmsExcessQty,
    totalInternalExcessQty: summary.totalInternalExcessQty
  };
}

async function previewImport({ buffer, fileName = '', fileSize = 0, snapshotDate = '', note = '', user = {} } = {}) {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    const err = new Error('Chưa chọn file tồn DMS');
    err.status = 400;
    throw err;
  }

  const fileHash = hashBuffer(buffer);
  const duplicate = await DmsInventoryImport.findOne({ fileHash, status: 'completed' }).lean();
  if (duplicate) {
    const err = new Error(`File này đã được lưu đối chiếu lúc ${duplicate.committedAt || duplicate.createdAt || ''}`);
    err.status = 409;
    err.code = 'DMS_FILE_DUPLICATE';
    throw err;
  }

  const parsed = await parseDmsInventoryFile(buffer);
  const rows = await buildComparisonRows(parsed.items);
  const summary = buildSummary(rows);
  const actor = importActor(user);
  const now = dateUtil.nowIso();
  const importId = makeId('DMSI');
  const importCode = makeId('DMSINV');
  const effectiveDate = dateUtil.toDateOnly(snapshotDate, dateUtil.todayVN());
  const previewExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const importDoc = applySummary({
    id: importId,
    code: importCode,
    previewToken: crypto.randomUUID(),
    fileHash,
    originalFilename: cleanText(fileName || 'DMS_INVENTORY.xlsx'),
    fileSize: toNumber(fileSize || buffer.length),
    source: 'UNILEVER_DMS_EXCEL',
    snapshotDate: effectiveDate,
    snapshotAt: now,
    status: 'previewed',
    importedByCode: actor.code,
    importedByName: actor.name,
    importedAt: now,
    committedAt: '',
    note: cleanText(note),
    expiresAt: previewExpiresAt,
    createdAt: now,
    updatedAt: now
  }, summary);

  await DmsInventoryImport.create(importDoc);
  await DmsInventorySnapshot.insertMany(rows.map((row) => ({
    ...row,
    id: makeId('DMSS'),
    importId,
    importCode,
    snapshotDate: effectiveDate,
    snapshotAt: now,
    expiresAt: previewExpiresAt
  })), { ordered: false });

  return {
    importId,
    previewToken: importDoc.previewToken,
    import: importDoc,
    summary,
    parser: {
      sheetName: parsed.sheetName,
      headerRow: parsed.headerRow,
      sourceRowCount: parsed.sourceRowCount,
      invalidRowCount: parsed.invalidRowCount
    },
    rows: rows.slice(0, 100)
  };
}

async function commitImport({ importId, previewToken = '', user = {} } = {}) {
  const cleanImportId = cleanText(importId);
  if (!cleanImportId) {
    const err = new Error('Thiếu mã phiên xem trước DMS');
    err.status = 400;
    throw err;
  }

  const preview = await DmsInventoryImport.findOne({ id: cleanImportId, status: 'previewed' }).lean();
  if (!preview) {
    const err = new Error('Phiên xem trước không tồn tại hoặc đã được xử lý');
    err.status = 404;
    throw err;
  }
  if (previewToken && preview.previewToken !== previewToken) {
    const err = new Error('Mã xác nhận phiên DMS không hợp lệ');
    err.status = 403;
    throw err;
  }
  const duplicate = await DmsInventoryImport.findOne({
    fileHash: preview.fileHash,
    status: 'completed',
    id: { $ne: cleanImportId }
  }).lean();
  if (duplicate) {
    const err = new Error('File DMS đã được commit trước đó');
    err.status = 409;
    throw err;
  }

  const previewRows = await DmsInventorySnapshot.find({ importId: cleanImportId }).lean();
  const dmsItems = previewRows.filter((row) => row.sourcePresentInDms).map((row) => ({
    productCode: row.productCode,
    productName: row.dmsProductName || row.productName,
    dmsConversionRate: row.dmsConversionRate,
    dmsCaseLoose: row.dmsCaseLoose,
    dmsBaseQty: row.dmsBaseQty,
    formulaValid: row.formulaValid !== false,
    warning: row.warning || ''
  }));
  const actor = importActor(user);
  const now = dateUtil.nowIso();

  const result = await withMongoTransaction(async (session) => {
    const current = await DmsInventoryImport.findOne({ id: cleanImportId, status: 'previewed' }).session(session).lean();
    if (!current) {
      const err = new Error('Phiên DMS đã được xử lý bởi yêu cầu khác');
      err.status = 409;
      throw err;
    }

    // Recompute actual inventory inside the same transaction that supersedes the old quota.
    // This prevents a mobile order concurrent with the morning upload from creating a stale allowance.
    const finalRows = await buildComparisonRows(dmsItems, { session });
    const summary = buildSummary(finalRows);

    const previousActive = await InternalSaleAllocation.find({ status: 'active' })
      .select('id importId productCode')
      .session(session)
      .lean();
    const previousImportId = cleanText(previousActive[0]?.importId || '');

    await InternalSaleAllocation.updateMany(
      { status: 'active' },
      {
        $set: {
          status: 'superseded',
          supersededAt: now,
          supersededByImportId: cleanImportId,
          updatedAt: now
        }
      },
      { session }
    );

    await DmsInventorySnapshot.deleteMany({ importId: cleanImportId }, { session });
    const snapshotDocs = finalRows.map((row) => ({
      ...row,
      id: makeId('DMSS'),
      importId: cleanImportId,
      importCode: current.code,
      snapshotDate: current.snapshotDate,
      snapshotAt: now,
      status: 'committed',
      createdAt: now,
      updatedAt: now
    }));
    const insertedSnapshots = snapshotDocs.length
      ? await DmsInventorySnapshot.insertMany(snapshotDocs, { ordered: false, session })
      : [];
    const snapshotIdByCode = new Map(insertedSnapshots.map((row) => [normalizeProductCode(row.productCode), String(row.id || row._id || '')]));

    const allocationDocs = finalRows
      .filter((row) => row.comparisonType === 'internal_greater' && toNumber(row.internalExcessQty) > 0)
      .map((row) => ({
        id: makeId('ISA'),
        code: makeId('ISA'),
        importId: cleanImportId,
        importCode: current.code,
        snapshotId: snapshotIdByCode.get(normalizeProductCode(row.productCode)) || '',
        snapshotDate: current.snapshotDate,
        snapshotAt: now,
        productId: row.productId,
        productCode: normalizeProductCode(row.productCode),
        productName: row.productName,
        dmsSnapshotQty: row.dmsBaseQty,
        internalSnapshotQty: row.internalBaseQty,
        openingQty: row.internalExcessQty,
        consumedQty: 0,
        releasedQty: 0,
        remainingQty: row.internalExcessQty,
        status: 'active',
        source: 'LATEST_DMS_DIFFERENCE',
        activatedAt: now,
        supersededAt: '',
        supersededByImportId: '',
        createdAt: now,
        updatedAt: now
      }));
    if (allocationDocs.length) await InternalSaleAllocation.insertMany(allocationDocs, { ordered: false, session });

    const update = applySummary({
      status: 'completed',
      snapshotAt: now,
      committedAt: now,
      importedByCode: actor.code || current.importedByCode,
      importedByName: actor.name || current.importedByName,
      supersedesImportId: previousImportId,
      expiresAt: null,
      updatedAt: now
    }, summary);

    const committed = await DmsInventoryImport.findOneAndUpdate(
      { id: cleanImportId, status: 'previewed' },
      { $set: update },
      { new: true, session, lean: true }
    );
    if (!committed) {
      const err = new Error('Không thể commit phiên DMS');
      err.status = 409;
      throw err;
    }

    return { import: committed, summary, allocationCount: allocationDocs.length };
  });

  try {
    const catalog = require('./mobile/catalog.service');
    catalog.invalidateMobileCatalogProductsCache?.();
  } catch (_) { }

  await auditService.log('DMS_INVENTORY_COMMIT', {
    refType: 'DMS_INVENTORY_IMPORT',
    refId: cleanImportId,
    refCode: result.import?.code || preview.code || cleanImportId,
    userName: actor.name || actor.code,
    summary: {
      snapshotDate: result.import?.snapshotDate || preview.snapshotDate,
      originalFilename: result.import?.originalFilename || preview.originalFilename,
      allocationCount: result.allocationCount,
      ...result.summary
    },
    note: 'Cập nhật tồn DMS và thay thế hạn mức bán App theo chênh lệch mới nhất'
  });

  return result;
}

function comparisonFilter(type = '') {
  const normalized = cleanText(type).toLowerCase();
  if (!normalized || normalized === 'all') return {};
  const supported = ['matched', 'dms_greater', 'internal_greater', 'unmapped', 'conversion_mismatch'];
  return supported.includes(normalized) ? { comparisonType: normalized } : {};
}

async function getLatest({ type = '', search = '', page = 1, limit = 100 } = {}) {
  const latest = await DmsInventoryImport.findOne({ status: 'completed' })
    .sort({ committedAt: -1, createdAt: -1 })
    .lean();
  if (!latest) return { import: null, summary: buildSummary([]), rows: [], total: 0, page: 1, limit };

  const safePage = Math.max(1, Math.trunc(toNumber(page) || 1));
  const safeLimit = Math.min(500, Math.max(1, Math.trunc(toNumber(limit) || 100)));
  const filter = {
    importId: String(latest.id || latest._id || ''),
    ...comparisonFilter(type)
  };
  const keyword = cleanText(search);
  if (keyword) {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { productCode: { $regex: escaped, $options: 'i' } },
      { productName: { $regex: escaped, $options: 'i' } },
      { dmsProductName: { $regex: escaped, $options: 'i' } }
    ];
  }

  const [rows, total] = await Promise.all([
    DmsInventorySnapshot.find(filter)
      .sort({ internalExcessQty: -1, dmsExcessQty: -1, productCode: 1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .lean(),
    DmsInventorySnapshot.countDocuments(filter)
  ]);

  const allocations = await InternalSaleAllocation.find({
    status: 'active',
    productCode: { $in: rows.map((row) => normalizeProductCode(row.productCode)) }
  }).lean();
  const allocationMap = new Map(allocations.map((row) => [normalizeProductCode(row.productCode), row]));

  return {
    import: latest,
    summary: {
      totalRows: toNumber(latest.totalRows),
      matchedRows: toNumber(latest.matchedRows),
      dmsGreaterRows: toNumber(latest.dmsGreaterRows),
      internalGreaterRows: toNumber(latest.internalGreaterRows),
      unmappedRows: toNumber(latest.unmappedRows),
      conversionMismatchRows: toNumber(latest.conversionMismatchRows),
      totalDmsQty: toNumber(latest.totalDmsQty),
      totalInternalQty: toNumber(latest.totalInternalQty),
      totalDmsExcessQty: toNumber(latest.totalDmsExcessQty),
      totalInternalExcessQty: toNumber(latest.totalInternalExcessQty)
    },
    rows: rows.map((row) => ({
      ...row,
      allocation: allocationMap.get(normalizeProductCode(row.productCode)) || null
    })),
    total,
    page: safePage,
    limit: safeLimit,
    hasMore: safePage * safeLimit < total
  };
}

async function getHistory({ page = 1, limit = 30 } = {}) {
  const safePage = Math.max(1, Math.trunc(toNumber(page) || 1));
  const safeLimit = Math.min(100, Math.max(1, Math.trunc(toNumber(limit) || 30)));
  const filter = { status: 'completed' };
  const [items, total] = await Promise.all([
    DmsInventoryImport.find(filter)
      .sort({ committedAt: -1, createdAt: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .lean(),
    DmsInventoryImport.countDocuments(filter)
  ]);
  return { items, total, page: safePage, limit: safeLimit, hasMore: safePage * safeLimit < total };
}

module.exports = {
  normalizeHeader,
  normalizeWorkbookSheets,
  parseCaseLoose,
  parseDmsInventoryFile,
  buildComparisonRows,
  buildSummary,
  previewImport,
  commitImport,
  getLatest,
  getHistory
};
