'use strict';

/**
 * OUT-OF-FLOW DMS GAP SIMULATOR ONLY.
 * This module reads uploaded customer Excel plus MK-Pro DMS/promotion read models,
 * runs in-memory calculations and exports Excel. It must not call order/accounting/inventory/delivery write services.
 */

const ExcelJS = require('exceljs');
const Product = require('../../models/Product');
const PromotionGroupItem = require('../../models/PromotionGroupItem');
const PromotionGroupRule = require('../../models/PromotionGroupRule');
const dmsInventoryService = require('../dmsInventoryReconciliation.service');
const dateUtil = require('../../utils/date.util');

const SHEET_ROLE_NAMES = {
  products: 'Sheet 1 - DMS lệch',
  groups: 'Sheet 2 - Nhóm KM/Ontop',
  customers: 'File khách cần chấm'
};

const HEADER_ALIASES = {
  productCode: ['mã sản phẩm', 'ma san pham', 'mã sp', 'ma sp', 'product code', 'productcode', 'số hiệu hàng hóa', 'so hieu hang hoa', 'mã hàng', 'ma hang'],
  productName: ['tên sản phẩm', 'ten san pham', 'tên sp', 'ten sp', 'mô tả mặt hàng', 'mo ta mat hang', 'product name', 'productname', 'tên hàng', 'ten hang'],
  diffQty: ['số lượng lệch', 'so luong lech', 'sl lệch', 'sl lech', 'dms nhiều hơn thực tế', 'dms nhieu hon thuc te', 'chênh lệch', 'chenh lech', 'số lượng', 'so luong', 'sl', 'quantity', 'qty'],
  price: ['giá bán', 'gia ban', 'giá sản phẩm', 'gia san pham', 'đơn giá', 'don gia', 'giá', 'gia', 'price', 'unit price', 'unitprice'],
  amount: ['tổng tiền', 'tong tien', 'thành tiền', 'thanh tien', 'giá trị lệch', 'gia tri lech', 'amount', 'total amount', 'totalamount'],
  groupCode: ['mã nhóm', 'ma nhom', 'mã nhóm km', 'ma nhom km', 'group code', 'groupcode'],
  groupName: ['tên nhóm', 'ten nhom', 'tên nhóm km', 'ten nhom km', 'nhóm', 'nhom', 'group name', 'groupname'],
  targetAmount: ['doanh số/chỉ tiêu nhóm', 'doanh so/chi tieu nhom', 'doanh số nhóm', 'doanh so nhom', 'chỉ tiêu nhóm', 'chi tieu nhom', 'chỉ tiêu cần chấm', 'chi tieu can cham', 'target', 'target amount', 'targetamount', 'chỉ tiêu', 'chi tieu', 'doanh số', 'doanh so'],
  discountInfo: ['thông tin chiết khấu/ontop', 'thong tin chiet khau/ontop', 'ontop', 'chiết khấu', 'chiet khau', 'mức ontop', 'muc ontop'],
  customerCode: ['mã khách hàng', 'ma khach hang', 'mã kh', 'ma kh', 'customer code', 'customercode', 'mã khách', 'ma khach'],
  customerName: ['tên khách hàng', 'ten khach hang', 'tên kh', 'ten kh', 'customer name', 'customername', 'tên khách', 'ten khach']
};

const DEFAULT_OPTIONS = {
  scenarioCount: 300,
  maxScenarioCount: 1000,
  toleranceAmount: 10000,
  globalToleranceAmount: 50000,
  temperature: 0.35,
  weights: {
    promotion: 0.45,
    customerFit: 0.25,
    dmsGap: 0.15,
    priceFit: 0.10,
    duplicatePenalty: 0.05
  },
  lineStrategy: {
    minLinesPerOrder: 3,
    maxLinesPerOrder: 8,
    targetAmountPerLine: 900000,
    maxSkuValueRatio: 0.65,
    promotionThresholdAware: true
  }
};

function normalizeText(value) {
  return String(value == null ? '' : value)
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeKey(value) {
  return normalizeText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9/ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value && typeof value === 'object' && value.result != null) return toNumber(value.result);
  if (value && typeof value === 'object' && value.text != null) return toNumber(value.text);
  if (value == null) return 0;
  let raw = String(value).trim();
  if (!raw) return 0;
  raw = raw.replace(/\s/g, '').replace(/₫|đ/gi, '');
  const commaCount = (raw.match(/,/g) || []).length;
  const dotCount = (raw.match(/\./g) || []).length;
  if (commaCount && dotCount) raw = raw.replace(/\./g, '').replace(/,/g, '.');
  else if (commaCount === 1 && !dotCount) raw = raw.replace(/,/g, '.');
  else raw = raw.replace(/,/g, '');
  const number = Number(raw);
  return Number.isFinite(number) ? number : 0;
}

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function cellValue(row, col) {
  if (!col) return '';
  const value = row.getCell(col).value;
  if (value && typeof value === 'object' && value.text != null) return normalizeText(value.text);
  if (value && typeof value === 'object' && value.result != null) return normalizeText(value.result);
  return normalizeText(value);
}

function cellNumber(row, col) {
  if (!col) return 0;
  return toNumber(row.getCell(col).value);
}

function buildHeaderMap(sheet) {
  let bestRow = 1;
  let bestCount = 0;
  for (let rowNumber = 1; rowNumber <= Math.min(sheet.rowCount || 1, 10); rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    let count = 0;
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (normalizeText(cell.value)) count += 1;
    });
    if (count > bestCount) {
      bestCount = count;
      bestRow = rowNumber;
    }
  }
  const headerRow = sheet.getRow(bestRow);
  const byHeader = new Map();
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const key = normalizeKey(cell.value);
    if (key && !byHeader.has(key)) byHeader.set(key, colNumber);
  });
  return { headerRowNumber: bestRow, byHeader };
}

function aliasColumn(headerMap, field) {
  const aliases = HEADER_ALIASES[field] || [];
  for (const alias of aliases) {
    const col = headerMap.byHeader.get(normalizeKey(alias));
    if (col) return col;
  }
  return null;
}

function getWorksheetByRole(workbook, role, index) {
  const candidates = {
    products: ['dms lech', 'dms gap', 'chenh lech', 'sheet 1', 'san pham', 'products'],
    groups: ['nhom', 'khuyen mai', 'ontop', 'sheet 2', 'groups'],
    customers: ['khach', 'khach hang', 'sheet 3', 'customers']
  }[role] || [];
  for (const sheet of workbook.worksheets) {
    const name = normalizeKey(sheet.name);
    if (candidates.some((candidate) => name.includes(candidate))) return sheet;
  }
  return workbook.worksheets[index] || null;
}

function pushWarning(warnings, type, message, rowNumber, level = 'WARN') {
  warnings.push({ type, message, rowNumber: rowNumber || '', level });
}

function pushError(errors, type, message, rowNumber) {
  errors.push({ type, message, rowNumber: rowNumber || '', level: 'ERROR' });
}

function readProducts(sheet, warnings, errors) {
  const { headerRowNumber, byHeader } = buildHeaderMap(sheet);
  const headerMap = { headerRowNumber, byHeader };
  const colCode = aliasColumn(headerMap, 'productCode');
  const colName = aliasColumn(headerMap, 'productName');
  const colQty = aliasColumn(headerMap, 'diffQty');
  const colPrice = aliasColumn(headerMap, 'price');
  const colAmount = aliasColumn(headerMap, 'amount');
  ['productCode', 'diffQty', 'price'].forEach((field) => {
    if (!aliasColumn(headerMap, field)) pushError(errors, 'MISSING_COLUMN', `${SHEET_ROLE_NAMES.products} thiếu cột bắt buộc: ${field}`);
  });
  if (errors.length) return [];
  const map = new Map();
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRowNumber) return;
    const productCode = cellValue(row, colCode);
    const productName = cellValue(row, colName);
    const diffQty = Math.trunc(cellNumber(row, colQty));
    const price = cellNumber(row, colPrice);
    const inputAmount = cellNumber(row, colAmount);
    if (!productCode && !productName && !diffQty && !price && !inputAmount) return;
    if (!productCode) {
      pushError(errors, 'MISSING_PRODUCT_CODE', `Dòng ${rowNumber} thiếu mã sản phẩm.`, rowNumber);
      return;
    }
    if (diffQty <= 0) {
      pushWarning(warnings, 'INVALID_DIFF_QTY', `Sản phẩm ${productCode} có số lượng lệch <= 0, bỏ qua.`, rowNumber);
      return;
    }
    if (price <= 0) {
      pushError(errors, 'INVALID_PRICE', `Sản phẩm ${productCode} có giá bán <= 0.`, rowNumber);
      return;
    }
    const key = productCode;
    const current = map.get(key);
    if (current) {
      if (Math.abs(current.price - price) > 1) {
        pushWarning(warnings, 'DUPLICATE_PRODUCT_PRICE_DIFF', `Mã SP ${productCode} bị trùng và giá khác nhau. Hệ thống giữ giá đầu tiên ${current.price.toLocaleString('vi-VN')}.`, rowNumber);
      }
      current.diffQty += diffQty;
      current.remainingQty += diffQty;
      current.inputRows.push(rowNumber);
      if (!current.productName && productName) current.productName = productName;
    } else {
      map.set(key, {
        productCode,
        productName,
        diffQty,
        remainingQty: diffQty,
        price,
        totalAmount: roundMoney(diffQty * price),
        groupCodes: [],
        inputRows: [rowNumber]
      });
    }
    if (inputAmount > 0 && Math.abs(inputAmount - diffQty * price) > 1) {
      pushWarning(warnings, 'PRODUCT_AMOUNT_MISMATCH', `SP ${productCode}: Tổng tiền lệch với SL × Giá. Hệ thống dùng SL × Giá.`, rowNumber);
    }
  });
  const products = Array.from(map.values());
  products.forEach((product) => { product.totalAmount = roundMoney(product.diffQty * product.price); });
  if (!products.length) pushError(errors, 'NO_VALID_PRODUCTS', `${SHEET_ROLE_NAMES.products} không có sản phẩm hợp lệ.`);
  return products;
}

function readGroups(sheet, products, warnings, errors) {
  if (!sheet) {
    pushWarning(warnings, 'MISSING_GROUP_SHEET', 'Không có Sheet 2 nhóm khuyến mại/ontop. Hệ thống vẫn sinh đơn theo khách và DMS lệch.');
    return [];
  }
  const productMap = new Map(products.map((product) => [product.productCode, product]));
  const { headerRowNumber, byHeader } = buildHeaderMap(sheet);
  const headerMap = { headerRowNumber, byHeader };
  const colGroupCode = aliasColumn(headerMap, 'groupCode');
  const colGroupName = aliasColumn(headerMap, 'groupName');
  const colProductCode = aliasColumn(headerMap, 'productCode');
  const colProductName = aliasColumn(headerMap, 'productName');
  const colTarget = aliasColumn(headerMap, 'targetAmount');
  const colDiscount = aliasColumn(headerMap, 'discountInfo');
  if (!colProductCode) {
    pushWarning(warnings, 'MISSING_GROUP_PRODUCT_CODE', `${SHEET_ROLE_NAMES.groups} thiếu cột mã sản phẩm. Bỏ qua nhóm KM/Ontop.`);
    return [];
  }
  const groupMap = new Map();
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRowNumber) return;
    const productCode = cellValue(row, colProductCode);
    const productName = cellValue(row, colProductName);
    const groupName = cellValue(row, colGroupName) || 'NHOM_KM';
    const groupCode = cellValue(row, colGroupCode) || groupName || 'NHOM_KM';
    const targetAmount = cellNumber(row, colTarget);
    const discountInfo = cellValue(row, colDiscount);
    if (!productCode && !groupCode && !groupName && !targetAmount) return;
    if (!productCode) {
      pushWarning(warnings, 'GROUP_ROW_MISSING_PRODUCT', `Dòng ${rowNumber} thiếu mã sản phẩm trong nhóm, bỏ qua.`, rowNumber);
      return;
    }
    if (!productMap.has(productCode)) {
      pushWarning(warnings, 'GROUP_PRODUCT_NOT_IN_DMS_GAP', `SP ${productCode} thuộc nhóm KM nhưng không có trong Sheet 1 DMS lệch.`, rowNumber);
    }
    const key = groupCode;
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        groupCode: key,
        groupName,
        targetAmount: targetAmount > 0 ? targetAmount : 0,
        discountInfo,
        productCodes: [],
        currentAmount: 0
      });
    }
    const group = groupMap.get(key);
    if (targetAmount > 0 && group.targetAmount > 0 && Math.abs(group.targetAmount - targetAmount) > 1) {
      pushWarning(warnings, 'GROUP_TARGET_DIFF', `Nhóm ${key} có nhiều target khác nhau. Hệ thống dùng target lớn nhất.`, rowNumber);
      group.targetAmount = Math.max(group.targetAmount, targetAmount);
    } else if (targetAmount > group.targetAmount) {
      group.targetAmount = targetAmount;
    }
    if (discountInfo && !group.discountInfo) group.discountInfo = discountInfo;
    if (productCode && !group.productCodes.includes(productCode)) group.productCodes.push(productCode);
    const product = productMap.get(productCode);
    if (product && !product.groupCodes.includes(key)) product.groupCodes.push(key);
    if (product && !product.productName && productName) product.productName = productName;
  });
  const groups = Array.from(groupMap.values());
  groups.forEach((group) => {
    if (group.targetAmount <= 0) pushWarning(warnings, 'GROUP_TARGET_ZERO', `Nhóm ${group.groupCode} không có chỉ tiêu nhóm, chỉ dùng để gắn nhãn.`, '');
    const available = group.productCodes.some((code) => productMap.has(code) && productMap.get(code).diffQty > 0);
    if (group.targetAmount > 0 && !available) pushWarning(warnings, 'GROUP_NO_AVAILABLE_PRODUCT', `Nhóm ${group.groupCode} có target nhưng không có sản phẩm khả dụng trong Sheet 1.`, '');
  });
  return groups;
}

function readCustomers(sheet, warnings, errors) {
  const { headerRowNumber, byHeader } = buildHeaderMap(sheet);
  const headerMap = { headerRowNumber, byHeader };
  const colCode = aliasColumn(headerMap, 'customerCode');
  const colName = aliasColumn(headerMap, 'customerName');
  const colTarget = aliasColumn(headerMap, 'targetAmount');
  if (!colCode) pushError(errors, 'MISSING_CUSTOMER_CODE_COLUMN', `${SHEET_ROLE_NAMES.customers} thiếu cột mã khách hàng.`);
  if (!colTarget) pushError(errors, 'MISSING_CUSTOMER_TARGET_COLUMN', `${SHEET_ROLE_NAMES.customers} thiếu cột chỉ tiêu cần chấm.`);
  if (errors.length) return [];
  const map = new Map();
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRowNumber) return;
    const customerCode = cellValue(row, colCode);
    const customerName = cellValue(row, colName);
    const targetAmount = cellNumber(row, colTarget);
    if (!customerCode && !customerName && !targetAmount) return;
    if (!customerCode) {
      pushWarning(warnings, 'MISSING_CUSTOMER_CODE', `Dòng ${rowNumber} thiếu mã khách hàng, bỏ qua.`, rowNumber);
      return;
    }
    if (targetAmount <= 0) {
      pushWarning(warnings, 'INVALID_CUSTOMER_TARGET', `Khách ${customerCode} có chỉ tiêu <= 0, bỏ qua.`, rowNumber);
      return;
    }
    const current = map.get(customerCode);
    if (current) {
      current.targetAmount = roundMoney(current.targetAmount + targetAmount);
      if (!current.customerName && customerName) current.customerName = customerName;
      pushWarning(warnings, 'DUPLICATE_CUSTOMER', `Mã KH ${customerCode} bị trùng. Hệ thống gộp chỉ tiêu.`, rowNumber);
    } else {
      map.set(customerCode, { customerCode, customerName, targetAmount: roundMoney(targetAmount), inputOrder: map.size });
    }
  });
  const customers = Array.from(map.values());
  if (!customers.length) pushError(errors, 'NO_VALID_CUSTOMERS', `${SHEET_ROLE_NAMES.customers} không có khách hợp lệ.`);
  return customers;
}


function normalizeDmsComparisonType(value) {
  const raw = normalizeKey(value || 'dms_greater');
  if (raw === 'internal_greater' || raw.includes('thuc te') || raw.includes('noi bo') || raw.includes('internal')) return 'internal_greater';
  return 'dms_greater';
}

function dmsComparisonTypeLabel(type) {
  return normalizeDmsComparisonType(type) === 'internal_greater' ? 'Thực tế nhiều hơn DMS' : 'DMS nhiều hơn thực tế';
}

function normalizeProductCode(value) {
  return normalizeText(value).toUpperCase();
}

function isActiveByDate(row = {}, targetDate = '') {
  if (row.isActive === false || row.active === false || row.cancelledAt) return false;
  const date = dateUtil.toDateOnly(targetDate || dateUtil.todayVN());
  const startDate = dateUtil.toDateOnly(row.startDate || '');
  const endDate = dateUtil.toDateOnly(row.endDate || '');
  if (startDate && date && date < startDate) return false;
  if (endDate && date && date > endDate) return false;
  return true;
}

function normalizeBasis(value) {
  const raw = normalizeKey(value || 'ORDER_VALUE').replace(/\s+/g, '');
  if (['quantity', 'qty', 'sl', 'soluong'].includes(raw)) return 'QUANTITY';
  return 'ORDER_VALUE';
}

async function parseCustomerTargetWorkbook(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const warnings = [];
  const errors = [];
  const customerSheet = getWorksheetByRole(workbook, 'customers', 0) || workbook.worksheets[0] || null;
  if (!customerSheet) pushError(errors, 'MISSING_CUSTOMER_SHEET', 'Không tìm thấy sheet danh sách khách hàng cần chấm.');
  if (errors.length) return { customers: [], warnings, errors };
  const customers = readCustomers(customerSheet, warnings, errors);
  return { customers, warnings, errors };
}

async function loadAllLatestDmsRows({ dmsComparisonType = 'dms_greater', forceRefresh = false } = {}) {
  const type = normalizeDmsComparisonType(dmsComparisonType);
  const rows = [];
  let latestImport = null;
  let page = 1;
  const limit = 500;
  const maxPages = 20;
  while (page <= maxPages) {
    const result = await dmsInventoryService.getLatest({ type, page, limit, forceRefresh: forceRefresh === true });
    if (!latestImport) latestImport = result.import || null;
    rows.push(...(result.rows || []));
    if (!result.hasMore) break;
    page += 1;
  }
  return { rows, latestImport, type, truncated: page > maxPages };
}

async function loadProductsFromMkProDmsGap(options = {}, warnings = [], errors = []) {
  const dmsComparisonType = normalizeDmsComparisonType(options.dmsComparisonType || options.dmsGapType);
  const loaded = await loadAllLatestDmsRows({ dmsComparisonType, forceRefresh: options.forceRefresh === true });
  if (!loaded.latestImport) {
    pushError(errors, 'NO_DMS_INVENTORY_IMPORT', 'MK-Pro chưa có dữ liệu đối chiếu tồn DMS đã chốt. Hãy vào Kho → Đối chiếu tồn DMS và tải/chốt file DMS trước.');
    return [];
  }
  if (loaded.truncated) {
    pushWarning(warnings, 'DMS_GAP_ROWS_TRUNCATED', 'Số dòng sản phẩm lệch DMS vượt giới hạn đọc 10.000 dòng. Hệ thống chỉ dùng phần đã tải được.', '', 'WARN');
  }
  const productCodes = Array.from(new Set((loaded.rows || []).map((row) => normalizeProductCode(row.productCode)).filter(Boolean)));
  const catalogRows = productCodes.length ? await Product.find({
    $or: [
      { code: { $in: productCodes } },
      { productCode: { $in: productCodes } },
      { sku: { $in: productCodes } }
    ],
    isActive: { $ne: false }
  }).select('code productCode sku name productName salePrice price').lean() : [];
  const catalogMap = new Map();
  for (const product of catalogRows || []) {
    [product.code, product.productCode, product.sku].map(normalizeProductCode).filter(Boolean).forEach((code) => catalogMap.set(code, product));
  }
  const products = [];
  for (const row of loaded.rows || []) {
    const productCode = normalizeProductCode(row.productCode);
    if (!productCode) continue;
    const diffQty = Math.trunc(Math.max(0, dmsComparisonType === 'internal_greater'
      ? toNumber(row.allocation?.remainingQty ?? row.internalExcessQty)
      : toNumber(row.dmsExcessQty)));
    if (diffQty <= 0) continue;
    const catalog = catalogMap.get(productCode) || {};
    const price = toNumber(catalog.salePrice ?? catalog.price ?? row.salePrice ?? row.price);
    if (price <= 0) {
      pushWarning(warnings, 'DMS_GAP_PRODUCT_NO_PRICE', `Sản phẩm ${productCode} có lệch DMS nhưng thiếu giá bán danh mục, bỏ qua.`, '', 'WARN');
      continue;
    }
    products.push({
      productCode,
      productName: normalizeText(catalog.name || catalog.productName || row.productName || row.dmsProductName || ''),
      diffQty,
      remainingQty: diffQty,
      price,
      totalAmount: roundMoney(diffQty * price),
      groupCodes: [],
      source: 'MK_PRO_DMS_INVENTORY',
      dmsComparisonType
    });
  }
  if (!products.length) {
    pushError(errors, 'NO_VALID_DMS_GAP_PRODUCTS', `Không có sản phẩm lệch DMS hợp lệ từ MK-Pro cho loại: ${dmsComparisonTypeLabel(dmsComparisonType)}.`);
  }
  pushWarning(warnings, 'DMS_GAP_SOURCE', `Sản phẩm lệch lấy từ MK-Pro: ${dmsComparisonTypeLabel(dmsComparisonType)} · File DMS chốt: ${loaded.latestImport.originalFilename || loaded.latestImport.code || loaded.latestImport.id || ''}`, '', 'INFO');
  return products;
}

async function loadPromotionGroupsFromMkPro(products = [], options = {}, warnings = []) {
  const targetDate = dateUtil.toDateOnly(options.promotionDate || options.targetDate || dateUtil.todayVN());
  const productMap = new Map((products || []).map((product) => [normalizeProductCode(product.productCode), product]));
  const [itemRows, ruleRows] = await Promise.all([
    PromotionGroupItem.find({ isActive: { $ne: false } }).select('programCode programName groupCode productCode productName startDate endDate isActive cancelledAt source').lean().catch(() => []),
    PromotionGroupRule.find({ isActive: { $ne: false } }).select('programCode programName groupCode basis calculationBasis minAmount discountPercent startDate endDate isActive cancelledAt source').lean().catch(() => [])
  ]);
  const activeItems = (itemRows || []).filter((row) => isActiveByDate(row, targetDate));
  const activeRules = (ruleRows || []).filter((row) => isActiveByDate(row, targetDate));
  const itemsByGroup = new Map();
  for (const item of activeItems) {
    const groupCode = normalizeProductCode(item.programCode || item.groupCode);
    const productCode = normalizeProductCode(item.productCode);
    if (!groupCode || !productCode) continue;
    if (!itemsByGroup.has(groupCode)) itemsByGroup.set(groupCode, []);
    itemsByGroup.get(groupCode).push({ ...item, groupCode, productCode });
  }
  const groupMap = new Map();
  for (const rule of activeRules) {
    const basis = normalizeBasis(rule.basis || rule.calculationBasis);
    if (basis !== 'ORDER_VALUE') {
      pushWarning(warnings, 'PROMOTION_GROUP_QUANTITY_BASIS_SKIPPED', `Nhóm ${rule.groupCode || rule.programCode || ''} đang tính theo số lượng, module mô phỏng doanh số nên bỏ qua target này.`, '', 'INFO');
      continue;
    }
    const groupCode = normalizeProductCode(rule.groupCode || rule.programCode);
    const targetAmount = toNumber(rule.minAmount);
    if (!groupCode || targetAmount <= 0) continue;
    const current = groupMap.get(groupCode) || {
      groupCode,
      groupName: normalizeText(rule.programName || groupCode),
      targetAmount: 0,
      discountInfo: '',
      productCodes: [],
      currentAmount: 0,
      source: 'MK_PRO_PROMOTION_GROUP_RULES'
    };
    current.groupName = current.groupName || normalizeText(rule.programName || groupCode);
    current.targetAmount = Math.max(current.targetAmount, targetAmount);
    const discountPercent = toNumber(rule.discountPercent);
    if (discountPercent > 0) current.discountInfo = `${discountPercent}%`;
    groupMap.set(groupCode, current);
  }
  for (const [groupCode, group] of groupMap.entries()) {
    const itemList = itemsByGroup.get(groupCode) || [];
    for (const item of itemList) {
      const productCode = normalizeProductCode(item.productCode);
      if (!productCode) continue;
      if (!group.productCodes.includes(productCode)) group.productCodes.push(productCode);
      const product = productMap.get(productCode);
      if (product && !product.groupCodes.includes(groupCode)) product.groupCodes.push(groupCode);
    }
    const available = group.productCodes.some((code) => productMap.has(code) && productMap.get(code).diffQty > 0);
    if (!group.productCodes.length) pushWarning(warnings, 'PROMOTION_GROUP_NO_PRODUCTS', `Nhóm KM ${groupCode} có target nhưng chưa có sản phẩm trong tab phân nhóm.`, '', 'WARN');
    else if (!available) pushWarning(warnings, 'PROMOTION_GROUP_NO_DMS_GAP_PRODUCT', `Nhóm KM ${groupCode} có target nhưng không có sản phẩm nào nằm trong danh sách lệch DMS hiện tại.`, '', 'INFO');
  }
  const groups = Array.from(groupMap.values()).filter((group) => group.productCodes.length > 0);
  pushWarning(warnings, 'PROMOTION_GROUP_SOURCE', `Nhóm KM/Ontop lấy từ MK-Pro: ${groups.length} nhóm đang có hiệu lực ngày ${targetDate}.`, '', 'INFO');
  return groups;
}

async function buildDmsGapSimulationInputFromMkPro(buffer, rawOptions = {}) {
  const warnings = [];
  const errors = [];
  const customerParsed = await parseCustomerTargetWorkbook(buffer);
  warnings.push(...(customerParsed.warnings || []));
  errors.push(...(customerParsed.errors || []));
  if (errors.length) return { products: [], promotionGroups: [], customers: customerParsed.customers || [], warnings, errors };
  const products = await loadProductsFromMkProDmsGap(rawOptions, warnings, errors);
  if (errors.length) return { products, promotionGroups: [], customers: customerParsed.customers || [], warnings, errors };
  const promotionGroups = await loadPromotionGroupsFromMkPro(products, rawOptions, warnings);
  return {
    products,
    promotionGroups,
    customers: customerParsed.customers || [],
    warnings,
    errors,
    sourceMode: 'MK_PRO_INTERNAL_SOURCES'
  };
}

async function parseDmsGapWorkbook(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const warnings = [];
  const errors = [];
  const productSheet = getWorksheetByRole(workbook, 'products', 0);
  const groupSheet = getWorksheetByRole(workbook, 'groups', 1);
  const customerSheet = getWorksheetByRole(workbook, 'customers', 2);
  if (!productSheet) pushError(errors, 'MISSING_PRODUCT_SHEET', 'Không tìm thấy Sheet 1 - DMS lệch.');
  if (!customerSheet) pushError(errors, 'MISSING_CUSTOMER_SHEET', 'Không tìm thấy Sheet 3 - khách cần chấm.');
  if (errors.length) return { products: [], promotionGroups: [], customers: [], warnings, errors };
  const products = readProducts(productSheet, warnings, errors);
  if (errors.length) return { products, promotionGroups: [], customers: [], warnings, errors };
  const promotionGroups = readGroups(groupSheet, products, warnings, errors);
  const customers = readCustomers(customerSheet, warnings, errors);
  return { products, promotionGroups, customers, warnings, errors };
}

function normalizeOptions(input = {}) {
  const scenarioCount = Math.min(DEFAULT_OPTIONS.maxScenarioCount, Math.max(1, Math.trunc(Number(input.scenarioCount) || DEFAULT_OPTIONS.scenarioCount)));
  const weights = {
    promotion: Number(input.weightPromotion ?? input.promotionWeight ?? DEFAULT_OPTIONS.weights.promotion),
    customerFit: Number(input.weightCustomerFit ?? input.customerFitWeight ?? DEFAULT_OPTIONS.weights.customerFit),
    dmsGap: Number(input.weightDmsGap ?? input.dmsGapWeight ?? DEFAULT_OPTIONS.weights.dmsGap),
    priceFit: Number(input.weightPriceFit ?? input.priceFitWeight ?? DEFAULT_OPTIONS.weights.priceFit),
    duplicatePenalty: Number(input.weightDuplicatePenalty ?? input.duplicatePenaltyWeight ?? DEFAULT_OPTIONS.weights.duplicatePenalty)
  };
  Object.keys(weights).forEach((key) => {
    if (!Number.isFinite(weights[key]) || weights[key] < 0) weights[key] = DEFAULT_OPTIONS.weights[key];
  });
  const minLinesPerOrder = Math.max(1, Math.min(12, Math.trunc(Number(input.minLinesPerOrder) || DEFAULT_OPTIONS.lineStrategy.minLinesPerOrder)));
  const maxLinesPerOrder = Math.max(minLinesPerOrder, Math.min(20, Math.trunc(Number(input.maxLinesPerOrder) || DEFAULT_OPTIONS.lineStrategy.maxLinesPerOrder)));
  const targetAmountPerLine = Math.max(100000, Number(input.targetAmountPerLine) || DEFAULT_OPTIONS.lineStrategy.targetAmountPerLine);
  const maxSkuValueRatio = Math.max(0.20, Math.min(1, Number(input.maxSkuValueRatio) || DEFAULT_OPTIONS.lineStrategy.maxSkuValueRatio));
  return {
    scenarioCount,
    maxScenarioCount: DEFAULT_OPTIONS.maxScenarioCount,
    toleranceAmount: Math.max(0, Number(input.toleranceAmount) || DEFAULT_OPTIONS.toleranceAmount),
    globalToleranceAmount: Math.max(0, Number(input.globalToleranceAmount) || DEFAULT_OPTIONS.globalToleranceAmount),
    temperature: Math.max(0.05, Math.min(2, Number(input.temperature) || DEFAULT_OPTIONS.temperature)),
    weights,
    lineStrategy: {
      minLinesPerOrder,
      maxLinesPerOrder,
      targetAmountPerLine,
      maxSkuValueRatio,
      promotionThresholdAware: input.promotionThresholdAware !== false && input.promotionThresholdAware !== 'false'
    }
  };
}

function resolveGenerationMode(totalDmsGapAmount, totalCustomerTargetAmount, globalToleranceAmount) {
  if (totalDmsGapAmount > totalCustomerTargetAmount + globalToleranceAmount) return 'DMS_MORE_THAN_CUSTOMER_TARGET';
  if (totalDmsGapAmount < totalCustomerTargetAmount - globalToleranceAmount) return 'DMS_LESS_THAN_CUSTOMER_TARGET';
  return 'BALANCED';
}

function generationModeLabel(mode) {
  if (mode === 'DMS_MORE_THAN_CUSTOMER_TARGET') return 'DMS lệch lớn hơn nhu cầu - sinh vừa đủ theo khách';
  if (mode === 'DMS_LESS_THAN_CUSTOMER_TARGET') return 'DMS lệch nhỏ hơn nhu cầu - ưu tiên khách chỉ tiêu thấp trước';
  return 'DMS lệch cân bằng với nhu cầu - sinh theo thuật toán mặc định';
}

function makeSeededRandom(seed) {
  let value = (Number(seed) || 1) % 2147483647;
  if (value <= 0) value += 2147483646;
  return function random() {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

function cloneState(parsed) {
  const groups = parsed.promotionGroups.map((group) => ({ ...group, productCodes: [...group.productCodes], currentAmount: 0 }));
  const groupMap = new Map(groups.map((group) => [group.groupCode, group]));
  const products = parsed.products.map((product) => ({
    ...product,
    remainingQty: product.diffQty,
    groupCodes: [...(product.groupCodes || [])]
  }));
  return { products, groups, groupMap };
}

function groupNeedScore(product, groupMap) {
  let best = 0;
  (product.groupCodes || []).forEach((groupCode) => {
    const group = groupMap.get(groupCode);
    if (!group || group.targetAmount <= 0) return;
    const remain = Math.max(0, group.targetAmount - group.currentAmount);
    best = Math.max(best, remain / group.targetAmount);
  });
  return clamp(best);
}

function desiredLineCount(targetAmount, options) {
  const strategy = options.lineStrategy || DEFAULT_OPTIONS.lineStrategy;
  const amountBased = Math.ceil((Number(targetAmount) || 0) / Math.max(1, strategy.targetAmountPerLine || 900000));
  return Math.max(strategy.minLinesPerOrder || 1, Math.min(strategy.maxLinesPerOrder || 8, amountBased || 1));
}

function orderGroupAmount(order, groupCode) {
  if (!order || !order.groupAmounts) return 0;
  return Number(order.groupAmounts.get(groupCode) || 0);
}

function orderProductAmount(order, productCode) {
  const existing = order?.itemMap?.get(productCode);
  return existing ? Number(existing.amount || 0) : 0;
}

function bestOrderGroupTopUpNeed(order, product, groupMap) {
  let best = 0;
  (product.groupCodes || []).forEach((groupCode) => {
    const group = groupMap.get(groupCode);
    if (!group || group.targetAmount <= 0) return;
    const current = orderGroupAmount(order, groupCode);
    if (current > 0 && current < group.targetAmount) {
      best = Math.max(best, (group.targetAmount - current) / group.targetAmount);
    }
  });
  return clamp(best);
}

function startsUnreachablePromotionGroup(order, customer, product, groupMap, options) {
  if (!options.lineStrategy?.promotionThresholdAware) return false;
  const orderUpperRoom = Math.max(0, customer.targetAmount + options.toleranceAmount - order.actualAmount);
  return (product.groupCodes || []).some((groupCode) => {
    const group = groupMap.get(groupCode);
    if (!group || group.targetAmount <= 0) return false;
    const current = orderGroupAmount(order, groupCode);
    if (current > 0) return false;
    return group.targetAmount > orderUpperRoom + options.toleranceAmount;
  });
}

function promotionTopUpQty(order, product, groupMap) {
  let requiredAmount = 0;
  (product.groupCodes || []).forEach((groupCode) => {
    const group = groupMap.get(groupCode);
    if (!group || group.targetAmount <= 0) return;
    const current = orderGroupAmount(order, groupCode);
    if (current > 0 && current < group.targetAmount) {
      requiredAmount = Math.max(requiredAmount, group.targetAmount - current);
    }
  });
  if (requiredAmount <= 0 || product.price <= 0) return 0;
  return Math.max(1, Math.ceil(requiredAmount / product.price));
}

function calculateQtyToAdd({ customer, order, selected, options, mode, totals, globalGenerated }) {
  const strategy = options.lineStrategy || DEFAULT_OPTIONS.lineStrategy;
  const desiredLines = desiredLineCount(customer.targetAmount, options);
  const currentLines = order.itemMap.size;
  const orderUpper = customer.targetAmount + options.toleranceAmount;
  const orderRoomAmount = Math.max(0, orderUpper - order.actualAmount);
  const orderRoomQty = selected.price > 0 ? Math.floor(orderRoomAmount / selected.price) : 0;
  const remain = Math.max(0, customer.targetAmount - order.actualAmount);
  const remainingLineSlots = Math.max(1, desiredLines - currentLines);
  const lineBudget = Math.max(selected.price, remain / remainingLineSlots);
  let qtyToAdd = Math.max(1, Math.floor(lineBudget / selected.price));

  const topUpQty = promotionTopUpQty(order, selected, totals.groupMap || new Map());
  if (topUpQty > 0) qtyToAdd = Math.max(qtyToAdd, topUpQty);

  const maxSkuAmount = Math.max(selected.price, customer.targetAmount * (strategy.maxSkuValueRatio || 1));
  const currentSkuAmount = orderProductAmount(order, selected.productCode);
  const dominanceRoomQty = Math.floor(Math.max(0, maxSkuAmount - currentSkuAmount) / selected.price);
  if (dominanceRoomQty > 0) qtyToAdd = Math.min(qtyToAdd, dominanceRoomQty);

  if (orderRoomQty > 0) qtyToAdd = Math.min(qtyToAdd, orderRoomQty);
  else if (order.actualAmount >= customer.targetAmount - options.toleranceAmount) qtyToAdd = 0;

  if (mode === 'DMS_MORE_THAN_CUSTOMER_TARGET') {
    const globalLimit = totals.totalCustomerTargetAmount + options.globalToleranceAmount;
    const globalRoomQty = Math.floor(Math.max(0, globalLimit - globalGenerated) / selected.price);
    qtyToAdd = Math.min(qtyToAdd, globalRoomQty);
  }
  return Math.max(0, Math.min(Math.trunc(qtyToAdd), selected.remainingQty));
}

function productScore(customer, order, product, groupMap, options) {
  const remain = Math.max(0, customer.targetAmount - order.actualAmount);
  const upperRoom = Math.max(0, customer.targetAmount + options.toleranceAmount - order.actualAmount);
  if ((remain <= 0 && upperRoom < product.price) || product.remainingQty <= 0) return -Infinity;
  const safeRemain = Math.max(product.price, remain || upperRoom || product.price);
  const customerTargetFit = clamp(Math.min(product.price, safeRemain) / safeRemain);
  const promotionGroupNeed = groupNeedScore(product, groupMap);
  const orderGroupTopUpNeed = bestOrderGroupTopUpNeed(order, product, groupMap);
  const dmsGapPressure = product.diffQty > 0 ? clamp(product.remainingQty / product.diffQty) : 0;
  const priceFit = clamp(1 - Math.abs(safeRemain - product.price) / safeRemain);
  const duplicatePenalty = order.itemMap.has(product.productCode) ? 1 : 0;
  const desiredLines = desiredLineCount(customer.targetAmount, options);
  const lineDiversityNeed = order.itemMap.has(product.productCode) ? 0 : clamp((desiredLines - order.itemMap.size) / desiredLines);
  const maxSkuAmount = Math.max(product.price, customer.targetAmount * (options.lineStrategy?.maxSkuValueRatio || 1));
  const dominancePenalty = clamp((orderProductAmount(order, product.productCode) + product.price - maxSkuAmount) / Math.max(product.price, maxSkuAmount));
  const unreachablePromotionPenalty = startsUnreachablePromotionGroup(order, customer, product, groupMap, options) ? 1 : 0;
  const w = options.weights;
  return (
    w.promotion * promotionGroupNeed +
    w.customerFit * customerTargetFit +
    w.dmsGap * dmsGapPressure +
    w.priceFit * priceFit +
    0.85 * orderGroupTopUpNeed +
    0.20 * lineDiversityNeed -
    w.duplicatePenalty * duplicatePenalty -
    0.35 * dominancePenalty -
    0.75 * unreachablePromotionPenalty
  );
}

function weightedChoice(products, scores, random, temperature) {
  const weights = scores.map((score) => (Number.isFinite(score) ? Math.exp(score / temperature) : 0));
  const total = weights.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return null;
  let cursor = random() * total;
  for (let i = 0; i < products.length; i += 1) {
    cursor -= weights[i];
    if (cursor <= 0) return products[i];
  }
  return products[products.length - 1] || null;
}

function addProductToOrder(order, product, qty, groupMap) {
  const safeQty = Math.max(0, Math.min(Math.trunc(qty), product.remainingQty));
  if (!safeQty) return 0;
  product.remainingQty -= safeQty;
  const amount = roundMoney(safeQty * product.price);
  order.actualAmount = roundMoney(order.actualAmount + amount);
  const existing = order.itemMap.get(product.productCode);
  if (existing) {
    existing.quantity += safeQty;
    existing.amount = roundMoney(existing.quantity * existing.price);
  } else {
    const item = {
      customerCode: order.customerCode,
      customerName: order.customerName,
      productCode: product.productCode,
      productName: product.productName,
      quantity: safeQty,
      price: product.price,
      amount,
      groupCodes: [...(product.groupCodes || [])],
      groupNames: []
    };
    order.itemMap.set(product.productCode, item);
  }
  (product.groupCodes || []).forEach((groupCode) => {
    const group = groupMap.get(groupCode);
    if (group) group.currentAmount = roundMoney(group.currentAmount + amount);
    if (order.groupAmounts) order.groupAmounts.set(groupCode, roundMoney((order.groupAmounts.get(groupCode) || 0) + amount));
  });
  return safeQty;
}

function candidateProducts(products, customer, order, options, mode, globalGenerated, totalCustomerTargetAmount) {
  const remain = Math.max(0, customer.targetAmount - order.actualAmount);
  let candidates = products.filter((product) => product.remainingQty > 0);
  if (mode === 'DMS_MORE_THAN_CUSTOMER_TARGET') {
    const globalLimit = totalCustomerTargetAmount + options.globalToleranceAmount;
    candidates = candidates.filter((product) => globalGenerated + product.price <= globalLimit);
  }
  const underTarget = candidates.filter((product) => product.price <= remain + options.toleranceAmount);
  return underTarget.length ? underTarget : candidates;
}

function finalizeOrderStatus(order, options) {
  const diff = roundMoney(order.actualAmount - order.targetAmount);
  const absDiff = Math.abs(diff);
  let status = 'Đạt';
  if (order.actualAmount <= 0) status = 'Chưa sinh do thiếu ngân sách DMS lệch';
  else if (order.actualAmount < order.targetAmount - options.toleranceAmount) status = 'Thiếu';
  else if (order.actualAmount > order.targetAmount + options.toleranceAmount) status = 'Vượt ngưỡng';
  return { ...order, diff, status, lineCount: order.items.length, isAchieved: status === 'Đạt' };
}

function buildCustomerOrder(customer) {
  return {
    customerCode: customer.customerCode,
    customerName: customer.customerName,
    targetAmount: customer.targetAmount,
    actualAmount: 0,
    itemMap: new Map(),
    groupAmounts: new Map(),
    items: []
  };
}

function orderCustomers(customers, mode) {
  const cloned = customers.map((customer) => ({ ...customer }));
  if (mode === 'DMS_LESS_THAN_CUSTOMER_TARGET') {
    cloned.sort((a, b) => {
      if (a.targetAmount !== b.targetAmount) return a.targetAmount - b.targetAmount;
      return String(a.customerCode || '').localeCompare(String(b.customerCode || ''));
    });
  }
  return cloned;
}

function repairOrderPromotionThresholds(orders, products, groupMap, options, mode, totalCustomerTargetAmount) {
  if (!options.lineStrategy?.promotionThresholdAware) return;
  const globalLimit = totalCustomerTargetAmount + options.globalToleranceAmount;
  let generatedAmount = roundMoney(orders.reduce((sum, order) => sum + order.actualAmount, 0));
  for (const order of orders) {
    let safety = 0;
    while (safety < 200) {
      safety += 1;
      const deadGroups = Array.from(order.groupAmounts.entries())
        .map(([groupCode, amount]) => ({ group: groupMap.get(groupCode), amount }))
        .filter((row) => row.group && row.group.targetAmount > 0 && row.amount > 0 && row.amount < row.group.targetAmount)
        .sort((a, b) => (b.group.targetAmount - b.amount) - (a.group.targetAmount - a.amount));
      if (!deadGroups.length) break;
      let repaired = false;
      for (const dead of deadGroups) {
        const needed = dead.group.targetAmount - dead.amount;
        const orderRoom = order.targetAmount + options.toleranceAmount - order.actualAmount;
        if (orderRoom <= 0) continue;
        const groupProducts = products
          .filter((product) => product.remainingQty > 0 && (product.groupCodes || []).includes(dead.group.groupCode))
          .sort((a, b) => a.price - b.price);
        for (const product of groupProducts) {
          if (product.remainingQty <= 0) continue;
          if (mode === 'DMS_MORE_THAN_CUSTOMER_TARGET' && generatedAmount + product.price > globalLimit) continue;
          const maxByRoom = Math.floor(Math.max(0, order.targetAmount + options.toleranceAmount - order.actualAmount) / product.price);
          if (maxByRoom <= 0) continue;
          const qty = Math.min(product.remainingQty, maxByRoom, Math.max(1, Math.ceil(needed / product.price)));
          const added = addProductToOrder(order, product, qty, groupMap);
          if (added) {
            generatedAmount = roundMoney(generatedAmount + added * product.price);
            repaired = true;
            break;
          }
        }
        if (repaired) break;
      }
      if (!repaired) break;
    }
  }
}

function repairGroups(orders, products, groupMap, options, mode, totalCustomerTargetAmount) {
  const globalLimit = totalCustomerTargetAmount + options.globalToleranceAmount;
  let generatedAmount = roundMoney(orders.reduce((sum, order) => sum + order.actualAmount, 0));
  for (const group of groupMap.values()) {
    if (group.targetAmount <= 0 || group.currentAmount >= group.targetAmount) continue;
    const groupProducts = products.filter((product) => product.remainingQty > 0 && (product.groupCodes || []).includes(group.groupCode));
    if (!groupProducts.length) continue;
    for (const product of groupProducts) {
      if (group.currentAmount >= group.targetAmount) break;
      for (const order of orders) {
        if (group.currentAmount >= group.targetAmount || product.remainingQty <= 0) break;
        const orderRoom = order.targetAmount + options.toleranceAmount - order.actualAmount;
        if (orderRoom < product.price) continue;
        if (mode === 'DMS_MORE_THAN_CUSTOMER_TARGET' && generatedAmount + product.price > globalLimit) continue;
        const before = product.remainingQty;
        const added = addProductToOrder(order, product, 1, groupMap);
        if (added) generatedAmount = roundMoney(generatedAmount + product.price);
        if (before === product.remainingQty) break;
      }
    }
  }
}

function generateScenario(parsed, options, scenarioIndex, totals, mode) {
  const random = makeSeededRandom(7919 + scenarioIndex * 104729);
  const { products, groups, groupMap } = cloneState(parsed);
  const customers = orderCustomers(parsed.customers, mode);
  const orders = [];
  let globalGenerated = 0;
  let depleted = false;
  for (const customer of customers) {
    const order = buildCustomerOrder(customer);
    if (depleted) {
      order.items = [];
      orders.push(order);
      continue;
    }
    let safety = 0;
    while ((order.actualAmount < customer.targetAmount - options.toleranceAmount || order.itemMap.size < desiredLineCount(customer.targetAmount, options)) && safety < 5000) {
      safety += 1;
      const candidates = candidateProducts(products, customer, order, options, mode, globalGenerated, totals.totalCustomerTargetAmount);
      if (!candidates.length) {
        depleted = true;
        break;
      }
      const scores = candidates.map((product) => productScore(customer, order, product, groupMap, options));
      const selected = weightedChoice(candidates, scores, random, options.temperature);
      if (!selected) {
        depleted = true;
        break;
      }
      const qtyToAdd = calculateQtyToAdd({ customer, order, selected, options, mode, totals: { ...totals, groupMap }, globalGenerated });
      if (qtyToAdd <= 0) {
        selected.remainingQty = 0;
        continue;
      }
      const added = addProductToOrder(order, selected, qtyToAdd, groupMap);
      if (!added) continue;
      globalGenerated = roundMoney(globalGenerated + added * selected.price);
    }
    order.items = Array.from(order.itemMap.values());
    orders.push(order);
  }
  repairOrderPromotionThresholds(orders, products, groupMap, options, mode, totals.totalCustomerTargetAmount);
  repairGroups(orders, products, groupMap, options, mode, totals.totalCustomerTargetAmount);
  orders.forEach((order) => { order.items = Array.from(order.itemMap.values()); });
  return buildScenarioResult({ products, groups, groupMap, orders, parsed, options, totals, mode, scenarioIndex });
}

function customerStatusRows(orders, options) {
  return orders.map((order) => {
    const finalized = finalizeOrderStatus(order, options);
    return {
      customerCode: finalized.customerCode,
      customerName: finalized.customerName,
      targetAmount: finalized.targetAmount,
      actualAmount: finalized.actualAmount,
      diff: finalized.diff,
      lineCount: finalized.lineCount,
      status: finalized.status,
      isAchieved: finalized.isAchieved
    };
  });
}

function buildPromotionOrderSummary(orders, groups) {
  const groupMap = new Map((groups || []).map((group) => [group.groupCode, group]));
  const rows = [];
  for (const order of orders || []) {
    for (const [groupCode, amount] of (order.groupAmounts || new Map()).entries()) {
      const group = groupMap.get(groupCode);
      if (!group || group.targetAmount <= 0 || amount <= 0) continue;
      const missingAmount = roundMoney(Math.max(0, group.targetAmount - amount));
      rows.push({
        customerCode: order.customerCode,
        customerName: order.customerName,
        groupCode,
        groupName: group.groupName,
        targetAmount: group.targetAmount,
        actualAmount: roundMoney(amount),
        missingAmount,
        status: missingAmount <= 0 ? 'Đạt điều kiện Ontop' : 'Chưa đủ điều kiện Ontop'
      });
    }
  }
  return rows;
}

function buildScenarioResult({ products, groups, orders, options, totals, mode, scenarioIndex, parsed }) {
  const customerOrders = customerStatusRows(orders, options);
  const orderItems = [];
  const groupNameMap = new Map(groups.map((group) => [group.groupCode, group.groupName]));
  orders.forEach((order) => {
    order.items.forEach((item) => {
      const groupNames = item.groupCodes.map((code) => groupNameMap.get(code) || code);
      orderItems.push({
        customerCode: order.customerCode,
        customerName: order.customerName,
        productCode: item.productCode,
        productName: item.productName,
        quantity: item.quantity,
        price: item.price,
        amount: item.amount,
        groupCodes: item.groupCodes,
        groupNames,
        groupLabel: groupNames.join(', ')
      });
    });
  });
  const promotionOrderSummary = buildPromotionOrderSummary(orders, groups);
  const groupSummary = groups.map((group) => {
    const rows = promotionOrderSummary.filter((row) => row.groupCode === group.groupCode);
    const qualifiedRows = rows.filter((row) => row.status === 'Đạt điều kiện Ontop');
    const unqualifiedRows = rows.filter((row) => row.status !== 'Đạt điều kiện Ontop');
    const actualAmount = roundMoney(rows.reduce((sum, row) => sum + row.actualAmount, 0));
    const qualifiedAmount = roundMoney(qualifiedRows.reduce((sum, row) => sum + row.actualAmount, 0));
    const unqualifiedAmount = roundMoney(unqualifiedRows.reduce((sum, row) => sum + row.actualAmount, 0));
    let status = 'Chưa dùng';
    if (group.targetAmount <= 0) status = 'Không có chỉ tiêu';
    else if (!rows.length) {
      const hasAvailable = products.some((product) => product.remainingQty > 0 && (product.groupCodes || []).includes(group.groupCode));
      status = hasAvailable ? 'Chưa dùng' : 'Không thể đạt do thiếu sản phẩm khả dụng';
    } else if (unqualifiedRows.length) status = 'Có đơn chưa đủ Ontop';
    else status = 'Đạt theo từng đơn';
    return {
      groupCode: group.groupCode,
      groupName: group.groupName,
      targetAmount: group.targetAmount || 0,
      actualAmount,
      missingAmount: roundMoney(unqualifiedRows.reduce((sum, row) => sum + row.missingAmount, 0)),
      status,
      qualifiedOrderCount: qualifiedRows.length,
      unqualifiedOrderCount: unqualifiedRows.length,
      qualifiedAmount,
      unqualifiedAmount,
      usedProductCount: orderItems.filter((item) => (item.groupCodes || []).includes(group.groupCode)).length
    };
  });
  const itemUsedQty = new Map();
  orderItems.forEach((item) => itemUsedQty.set(item.productCode, (itemUsedQty.get(item.productCode) || 0) + item.quantity));
  const productUsageSummary = products.map((product) => {
    const usedQty = itemUsedQty.get(product.productCode) || 0;
    const remainingQty = Math.max(0, product.diffQty - usedQty);
    return {
      productCode: product.productCode,
      productName: product.productName,
      diffQty: product.diffQty,
      usedQty,
      remainingQty,
      price: product.price,
      remainingAmount: roundMoney(remainingQty * product.price)
    };
  });
  const generatedAmount = roundMoney(customerOrders.reduce((sum, row) => sum + row.actualAmount, 0));
  const unmetCustomerAmount = roundMoney(customerOrders.reduce((sum, row) => sum + Math.max(0, row.targetAmount - row.actualAmount), 0));
  const dmsRemainingAmount = roundMoney(productUsageSummary.reduce((sum, row) => sum + row.remainingAmount, 0));
  const achievedCustomerCount = customerOrders.filter((row) => row.status === 'Đạt').length;
  const achievedGroupCount = groupSummary.filter((row) => row.status === 'Đạt theo từng đơn').length;
  const promotionQualifiedOrderCount = promotionOrderSummary.filter((row) => row.status === 'Đạt điều kiện Ontop').length;
  const promotionUnqualifiedOrderCount = promotionOrderSummary.filter((row) => row.status !== 'Đạt điều kiện Ontop').length;
  const summary = {
    scenarioIndex,
    generationMode: mode,
    generationModeLabel: generationModeLabel(mode),
    dmsGapSourceLabel: parsed.products?.[0]?.dmsComparisonType ? `MK-Pro đối chiếu DMS: ${dmsComparisonTypeLabel(parsed.products[0].dmsComparisonType)}` : 'MK-Pro đối chiếu DMS',
    promotionSourceLabel: parsed.sourceMode === 'MK_PRO_INTERNAL_SOURCES' ? 'MK-Pro: phân nhóm + khuyến mại nhóm/Ontop' : 'Excel',
    totalCustomerCount: parsed.customers.length,
    totalCustomerTargetAmount: totals.totalCustomerTargetAmount,
    totalDmsGapAmount: totals.totalDmsGapAmount,
    dmsVsCustomerDiff: roundMoney(totals.totalDmsGapAmount - totals.totalCustomerTargetAmount),
    generatedAmount,
    dmsRemainingAmount,
    unmetCustomerAmount,
    achievedCustomerCount,
    notAchievedCustomerCount: customerOrders.length - achievedCustomerCount,
    achievedGroupCount,
    notAchievedGroupCount: groupSummary.filter((row) => row.status !== 'Đạt theo từng đơn').length,
    promotionQualifiedOrderCount,
    promotionUnqualifiedOrderCount,
    usedUpProductCount: productUsageSummary.filter((row) => row.remainingQty <= 0).length,
    remainingProductCount: productUsageSummary.filter((row) => row.remainingQty > 0).length,
    totalLineCount: orderItems.length,
    toleranceAmount: options.toleranceAmount,
    globalToleranceAmount: options.globalToleranceAmount,
    scenarioCount: options.scenarioCount
  };
  const warnings = Array.isArray(parsed.warnings) ? [...parsed.warnings] : [];
  if (totals.totalDmsGapAmount < totals.totalCustomerTargetAmount - options.globalToleranceAmount) {
    warnings.push({ type: 'DMS_LESS_THAN_TARGET', message: 'Tổng DMS lệch nhỏ hơn tổng chỉ tiêu khách. Hệ thống ưu tiên khách chỉ tiêu thấp trước.', level: 'WARN' });
  }
  if (totals.totalDmsGapAmount > totals.totalCustomerTargetAmount + options.globalToleranceAmount) {
    warnings.push({ type: 'DMS_MORE_THAN_TARGET', message: 'Tổng DMS lệch lớn hơn tổng chỉ tiêu khách. Hệ thống chỉ sinh vừa đủ theo khách, không cố dùng hết DMS lệch.', level: 'INFO' });
  }
  return { summary, customerOrders, orderItems, groupSummary, promotionOrderSummary, productUsageSummary, warnings, options };
}

function scoreScenario(result) {
  const s = result.summary;
  let score = 0;
  score += 1000 * s.achievedGroupCount;
  score += 500 * s.achievedCustomerCount;
  score += 220 * (s.promotionQualifiedOrderCount || 0);
  score -= 380 * (s.promotionUnqualifiedOrderCount || 0);
  score -= 10 * Math.round(Math.abs(result.customerOrders.reduce((sum, row) => sum + Math.abs(row.diff || 0), 0)) / 10000);
  score -= 35 * result.customerOrders.reduce((sum, row) => sum + Math.max(0, (DEFAULT_OPTIONS.lineStrategy.minLinesPerOrder || 3) - (row.lineCount || 0)), 0);
  score -= 5 * Math.max(0, s.totalLineCount - s.totalCustomerCount * 10);
  if (s.generationMode === 'DMS_MORE_THAN_CUSTOMER_TARGET') {
    const overGeneratedAmount = Math.max(0, s.generatedAmount - s.totalCustomerTargetAmount);
    score -= (overGeneratedAmount / 10000) * 100;
  }
  if (s.generationMode === 'DMS_LESS_THAN_CUSTOMER_TARGET') {
    const ordered = [...result.customerOrders].sort((a, b) => a.targetAmount - b.targetAmount || String(a.customerCode).localeCompare(String(b.customerCode)));
    let foundSkippedLow = false;
    ordered.forEach((row) => {
      if (!row.actualAmount || row.status !== 'Đạt') foundSkippedLow = true;
      else if (foundSkippedLow && row.status === 'Đạt') score -= 750;
    });
  } else {
    score -= 2 * s.remainingProductCount;
  }
  return score;
}

function validateInvariants(result) {
  const violations = result.productUsageSummary.filter((row) => row.usedQty > row.diffQty);
  if (violations.length) {
    throw new Error(`Lỗi invariant: có ${violations.length} sản phẩm dùng vượt số lượng lệch DMS.`);
  }
}

function runSimulation(parsed, rawOptions = {}) {
  if (parsed.errors && parsed.errors.length) {
    const message = parsed.errors.slice(0, 5).map((err) => err.message).join(' ');
    const error = new Error(message || 'File Excel có lỗi dữ liệu.');
    error.details = parsed.errors;
    throw error;
  }
  const options = normalizeOptions(rawOptions);
  const totalDmsGapAmount = roundMoney(parsed.products.reduce((sum, product) => sum + product.diffQty * product.price, 0));
  const totalCustomerTargetAmount = roundMoney(parsed.customers.reduce((sum, customer) => sum + customer.targetAmount, 0));
  const mode = resolveGenerationMode(totalDmsGapAmount, totalCustomerTargetAmount, options.globalToleranceAmount);
  const totals = { totalDmsGapAmount, totalCustomerTargetAmount };
  let best = null;
  let bestScore = -Infinity;
  for (let scenarioIndex = 0; scenarioIndex < options.scenarioCount; scenarioIndex += 1) {
    const result = generateScenario(parsed, options, scenarioIndex, totals, mode);
    validateInvariants(result);
    const score = scoreScenario(result);
    if (score > bestScore) {
      best = result;
      bestScore = score;
    }
  }
  best.summary.scenarioScore = roundMoney(bestScore);
  return best;
}

function addRows(sheet, rows) {
  rows.forEach((row) => sheet.addRow(row));
  sheet.getRow(1).font = { bold: true };
  sheet.columns.forEach((column) => {
    column.width = Math.max(14, String(column.header || '').length + 4);
  });
}

async function createResultWorkbook(result) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'MK-Pro DMS Gap Simulator';
  const summary = workbook.addWorksheet('TONG_QUAN');
  summary.columns = [{ header: 'Chỉ tiêu', key: 'label', width: 36 }, { header: 'Giá trị', key: 'value', width: 34 }];
  const s = result.summary || {};
  addRows(summary, [
    ['Tổng khách', s.totalCustomerCount || 0],
    ['Tổng chỉ tiêu cần chấm', s.totalCustomerTargetAmount || 0],
    ['Nguồn sản phẩm lệch', s.dmsGapSourceLabel || 'MK-Pro đối chiếu DMS'],
    ['Nguồn nhóm KM/Ontop', s.promotionSourceLabel || 'MK-Pro'],
    ['Tổng giá trị DMS lệch', s.totalDmsGapAmount || 0],
    ['Chênh lệch', s.dmsVsCustomerDiff || 0],
    ['Chế độ sinh đơn', s.generationModeLabel || s.generationMode || ''],
    ['Tổng giá trị đơn tham khảo đã sinh', s.generatedAmount || 0],
    ['Giá trị DMS còn dư', s.dmsRemainingAmount || 0],
    ['Giá trị chỉ tiêu khách chưa đáp ứng', s.unmetCustomerAmount || 0],
    ['Khách đạt', s.achievedCustomerCount || 0],
    ['Khách chưa đạt', s.notAchievedCustomerCount || 0],
    ['Nhóm KM đạt theo từng đơn', s.achievedGroupCount || 0],
    ['Nhóm KM chưa đạt theo từng đơn', s.notAchievedGroupCount || 0],
    ['Lượt đơn đủ điều kiện Ontop', s.promotionQualifiedOrderCount || 0],
    ['Lượt đơn chưa đủ điều kiện Ontop', s.promotionUnqualifiedOrderCount || 0],
    ['Ghi chú', 'File chỉ để tham khảo. Sản phẩm lệch và nhóm KM/Ontop đọc từ MK-Pro, chỉ upload danh sách khách. Không ghi đơn thật/công nợ/tồn kho.']
  ]);

  const orders = workbook.addWorksheet('DON_THAM_KHAO');
  orders.columns = [
    { header: 'Mã KH', key: 'customerCode', width: 18 },
    { header: 'Tên KH', key: 'customerName', width: 28 },
    { header: 'Chỉ tiêu', key: 'targetAmount', width: 16 },
    { header: 'Giá trị đơn gợi ý', key: 'actualAmount', width: 20 },
    { header: 'Lệch', key: 'diff', width: 16 },
    { header: 'Số dòng SP', key: 'lineCount', width: 12 },
    { header: 'Trạng thái', key: 'status', width: 34 }
  ];
  addRows(orders, (result.customerOrders || []).map((row) => [row.customerCode, row.customerName, row.targetAmount, row.actualAmount, row.diff, row.lineCount, row.status]));

  const items = workbook.addWorksheet('CHI_TIET_SAN_PHAM');
  items.columns = [
    { header: 'Mã KH', key: 'customerCode', width: 18 },
    { header: 'Tên KH', key: 'customerName', width: 28 },
    { header: 'Mã SP', key: 'productCode', width: 18 },
    { header: 'Tên SP', key: 'productName', width: 30 },
    { header: 'SL', key: 'quantity', width: 10 },
    { header: 'Giá', key: 'price', width: 16 },
    { header: 'Thành tiền', key: 'amount', width: 18 },
    { header: 'Nhóm KM', key: 'groupLabel', width: 28 }
  ];
  addRows(items, (result.orderItems || []).map((row) => [row.customerCode, row.customerName, row.productCode, row.productName, row.quantity, row.price, row.amount, row.groupLabel]));

  const groups = workbook.addWorksheet('NHOM_KHUYEN_MAI');
  groups.columns = [
    { header: 'Mã nhóm', key: 'groupCode', width: 18 },
    { header: 'Tên nhóm', key: 'groupName', width: 36 },
    { header: 'Ngưỡng/đơn', key: 'targetAmount', width: 18 },
    { header: 'DS gợi ý', key: 'actualAmount', width: 18 },
    { header: 'Số đơn đạt', key: 'qualifiedOrderCount', width: 14 },
    { header: 'Số đơn chưa đủ', key: 'unqualifiedOrderCount', width: 16 },
    { header: 'DS đủ điều kiện', key: 'qualifiedAmount', width: 18 },
    { header: 'DS chưa đủ', key: 'unqualifiedAmount', width: 18 },
    { header: 'Còn thiếu theo đơn', key: 'missingAmount', width: 18 },
    { header: 'Trạng thái', key: 'status', width: 34 }
  ];
  addRows(groups, (result.groupSummary || []).map((row) => [row.groupCode, row.groupName, row.targetAmount, row.actualAmount, row.qualifiedOrderCount || 0, row.unqualifiedOrderCount || 0, row.qualifiedAmount || 0, row.unqualifiedAmount || 0, row.missingAmount, row.status]));

  const ontopByOrder = workbook.addWorksheet('ONTOP_THEO_DON');
  ontopByOrder.columns = [
    { header: 'Mã KH', key: 'customerCode', width: 18 },
    { header: 'Tên KH', key: 'customerName', width: 28 },
    { header: 'Mã nhóm', key: 'groupCode', width: 18 },
    { header: 'Tên nhóm', key: 'groupName', width: 36 },
    { header: 'Ngưỡng Ontop/đơn', key: 'targetAmount', width: 20 },
    { header: 'Đã gợi ý trong đơn', key: 'actualAmount', width: 20 },
    { header: 'Còn thiếu để ăn Ontop', key: 'missingAmount', width: 22 },
    { header: 'Trạng thái', key: 'status', width: 28 }
  ];
  addRows(ontopByOrder, (result.promotionOrderSummary || []).map((row) => [row.customerCode, row.customerName, row.groupCode, row.groupName, row.targetAmount, row.actualAmount, row.missingAmount, row.status]));

  const products = workbook.addWorksheet('SAN_PHAM_DMS_LECH');
  products.columns = [
    { header: 'Mã SP', key: 'productCode', width: 18 },
    { header: 'Tên SP', key: 'productName', width: 30 },
    { header: 'SL lệch ban đầu', key: 'diffQty', width: 18 },
    { header: 'SL đã gợi ý', key: 'usedQty', width: 16 },
    { header: 'SL còn lại', key: 'remainingQty', width: 16 },
    { header: 'Giá', key: 'price', width: 16 },
    { header: 'Giá trị còn lại', key: 'remainingAmount', width: 18 }
  ];
  addRows(products, (result.productUsageSummary || []).map((row) => [row.productCode, row.productName, row.diffQty, row.usedQty, row.remainingQty, row.price, row.remainingAmount]));

  const warnings = workbook.addWorksheet('CANH_BAO');
  warnings.columns = [
    { header: 'Loại', key: 'type', width: 28 },
    { header: 'Nội dung', key: 'message', width: 90 },
    { header: 'Dòng', key: 'rowNumber', width: 10 },
    { header: 'Mức độ', key: 'level', width: 12 }
  ];
  addRows(warnings, (result.warnings || []).map((row) => [row.type, row.message, row.rowNumber || '', row.level || 'WARN']));
  return workbook.xlsx.writeBuffer();
}

module.exports = {
  parseDmsGapWorkbook,
  parseCustomerTargetWorkbook,
  buildDmsGapSimulationInputFromMkPro,
  runSimulation,
  createResultWorkbook,
  resolveGenerationMode,
  generationModeLabel,
  normalizeDmsComparisonType,
  dmsComparisonTypeLabel,
  normalizeOptions,
  toNumber,
  roundMoney
};
