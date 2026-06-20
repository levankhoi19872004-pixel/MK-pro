
'use strict';

const dateUtil = require('../utils/date.util');
const defaultConfig = require('../../config/sse-export.json');
const {
  INVOICE_TYPES,
  normalizeInvoiceType,
  resolveInvoiceType,
  isActiveInvoiceOrder
} = require('./invoiceExportClassifier');
const { createWorkbook, appendAoaSheet, writeWorkbook, excelDate, excelText } = require('../utils/excelWriter.util');
const invoiceExportQueryService = require('./invoiceExportQuery.service');

const SSE_HEADERS = Object.freeze([
  'Mã khách', 'Tên khách hàng', 'Ngày', 'Số hóa đơn', 'Loại hóa đơn', 'Ký hiệu', 'Diễn giải',
  'Mã hàng', 'Tên mặt hàng', 'Đvt', 'Mã kho', 'Mã vị trí', 'Mã lô', 'tl_ck', 'Số lượng',
  'Giá bán', 'Tiền hàng', 'Tỉ lệ CK', 'Tổng CK', 'Mã nt', 'Tỷ giá', 'Mã thuế', 'Tk nợ',
  'Tk doanh thu', 'Tk giá vốn', 'Tk thuế có', 'Khách hàng', 'Tk chiết khấu', 'Vụ việc',
  'Bộ phận', 'Lsx', 'Sản phẩm', 'Hợp đồng', 'Phí', 'Khế ước', 'Mã NVBH'
]);

const ERROR_HEADERS = Object.freeze([
  'Mã đơn', 'Khách hàng', 'Mã sản phẩm', 'Tên sản phẩm', 'Trường bị thiếu', 'Nguyên nhân', 'Hướng xử lý'
]);

function cleanText(value) { return String(value ?? '').trim(); }
function toNumber(value, fallback = 0) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  const normalized = cleanText(value).replace(/\\s/g, '').replace(/,/g, '');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : fallback;
}
function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((toNumber(value) + Number.EPSILON) * factor) / factor;
}
function firstText(...values) {
  for (const value of values) { const text = cleanText(value); if (text) return text; }
  return '';
}
function normalizeDateOnly(value) { return dateUtil.toDateOnly(value || '') || cleanText(value).slice(0, 10); }
function asBool(value, fallback = false) {
  if (value === true || value === false) return value;
  const text = cleanText(value).toLowerCase();
  if (['1','true','yes','y'].includes(text)) return true;
  if (['0','false','no','n'].includes(text)) return false;
  return fallback;
}
function envValue(name, fallback) {
  return process.env[name] === undefined || process.env[name] === '' ? fallback : process.env[name];
}
function loadConfig(invoiceType) {
  const type = normalizeInvoiceType(invoiceType);
  const prefix = type === INVOICE_TYPES.NON_VAT ? 'SSE_NON_VAT_' : 'SSE_VAT_';
  const common = (name, fallback) => envValue(`SSE_${name}`, fallback);
  const group = (name, fallback) => envValue(`${prefix}${name}`, common(name, fallback));
  return {
    sheetName: common('SHEET_NAME', defaultConfig.sheetName),
    invoiceType: group('INVOICE_TYPE', defaultConfig.invoiceType),
    invoiceSymbol: group('INVOICE_SYMBOL', defaultConfig.invoiceSymbol),
    warehouseCode: common('WAREHOUSE_CODE', defaultConfig.warehouseCode),
    currencyCode: common('CURRENCY_CODE', defaultConfig.currencyCode),
    exchangeRate: toNumber(common('EXCHANGE_RATE', defaultConfig.exchangeRate), NaN),
    taxCode: group('TAX_CODE', defaultConfig.taxCode),
    debitAccount: common('DEBIT_ACCOUNT', defaultConfig.debitAccount),
    revenueAccount: common('REVENUE_ACCOUNT', defaultConfig.revenueAccount),
    cogsAccount: common('COGS_ACCOUNT', defaultConfig.cogsAccount),
    outputTaxAccount: common('OUTPUT_TAX_ACCOUNT', defaultConfig.outputTaxAccount),
    discountAccount: common('DISCOUNT_ACCOUNT', defaultConfig.discountAccount),
    defaultSalesmanCode: common('SALESMAN_CODE', defaultConfig.defaultSalesmanCode),
    vatRate: toNumber(common('VAT_RATE', defaultConfig.vatRate), NaN),
    allowCanonicalCustomerCodeFallback: asBool(common('ALLOW_CANONICAL_CUSTOMER_CODE_FALLBACK', defaultConfig.allowCanonicalCustomerCodeFallback), true),
    allowCanonicalProductCodeFallback: asBool(common('ALLOW_CANONICAL_PRODUCT_CODE_FALLBACK', defaultConfig.allowCanonicalProductCodeFallback), true),
    maxOrders: Math.min(Math.max(toNumber(common('MAX_ORDERS', defaultConfig.maxOrders), defaultConfig.maxOrders), 1), 100000),
    maxRows: Math.min(Math.max(toNumber(common('MAX_ROWS', defaultConfig.maxRows), defaultConfig.maxRows), 1), 500000)
  };
}
function validateConfig(config) {
  const required = [
    ['Loại hóa đơn', config.invoiceType], ['Ký hiệu', config.invoiceSymbol], ['Mã kho', config.warehouseCode],
    ['Mã nt', config.currencyCode], ['Mã thuế', config.taxCode], ['Tk nợ', config.debitAccount],
    ['Tk doanh thu', config.revenueAccount], ['Tk giá vốn', config.cogsAccount],
    ['Tk thuế có', config.outputTaxAccount], ['Tk chiết khấu', config.discountAccount]
  ];
  const missing = required.filter(([, value]) => !cleanText(value)).map(([label]) => label);
  if (!Number.isFinite(config.exchangeRate) || config.exchangeRate <= 0) missing.push('Tỷ giá');
  if (!Number.isFinite(config.vatRate) || config.vatRate < 0 || config.vatRate >= 1) missing.push('Tỷ lệ VAT');
  return missing;
}
function orderCode(order = {}) { return firstText(order.invoiceCode, order.documentCode, order.code, order.orderCode, order.salesOrderCode, order.id, order._id); }
function orderDate(order = {}) { return invoiceExportQueryService.businessDateOf(order); }
function orderIdentity(order = {}) { return firstText(order._id, order.id, order.code, order.orderCode, order.salesOrderCode); }
function customerKeyValues(order = {}) { return [order.customerCode, order.customerId].map(cleanText).filter(Boolean); }
function productCodeOf(item = {}) { return firstText(item.productCode, item.code, item.sku, item.barcode, item.productId, item.id); }
function productIdOf(item = {}) { return firstText(item.productId, item._id); }
function productNameOf(item = {}, product = {}) { return firstText(product.name, product.productName, item.productName, item.name, item.itemName); }
function qtyOf(item = {}) { return toNumber(item.quantity ?? item.qty ?? item.totalQty ?? item.qtySale ?? item.saleQty ?? 0); }
function returnQtyOf(item = {}) { return toNumber(item.returnQty ?? item.qtyReturn ?? item.returnQuantity ?? item.returnedQty ?? 0); }
function priceAfterPromotionOf(item = {}) {
  return toNumber(item.finalPrice ?? item.priceAfterPromotion ?? item.promoPrice ?? item.price ?? item.salePrice ?? item.unitPrice ?? item.sellPrice ?? 0);
}
function lineKeyOf(item = {}) { return firstText(item.lineKey, item.orderLineId, item.salesOrderItemId, item.itemId, item._id); }
function priceKeyOf(item = {}) { const p = priceAfterPromotionOf(item); return p ? String(round(p, 6)) : ''; }
function returnOrderActive(row = {}) { return invoiceExportQueryService.isEligibleReturnOrder(row); }
function returnOrderKeys(row = {}) {
  return [row.salesOrderId,row.orderId,row.sourceOrderId,row.deliveryOrderId,row.salesOrderCode,row.orderCode,row.sourceOrderCode,row.deliveryOrderCode,row.originalOrderCode].map(cleanText).filter(Boolean);
}
function buildReturnMap(returnOrders = []) {
  const map = new Map();
  const newest = new Map();
  for (const ro of returnOrders || []) {
    if (!returnOrderActive(ro)) continue;
    const keys = returnOrderKeys(ro);
    if (!keys.length) continue;
    const roCode = firstText(ro.code, ro.id, ro.returnOrderCode, ro.documentCode, ro._id);
    const updated = new Date(ro.updatedAt || ro.createdAt || ro.date || 0).getTime() || 0;
    for (const item of Array.isArray(ro.items) ? ro.items : []) {
      const productCode = productCodeOf(item);
      const qty = returnQtyOf(item);
      if (!productCode || qty <= 0) continue;
      const lineKey = lineKeyOf(item);
      const priceKey = priceKeyOf(item);
      const dedupe = [roCode, keys[0], productCode, lineKey, priceKey].join('@@');
      const old = newest.get(dedupe);
      if (!old || updated >= old.updated) newest.set(dedupe, { keys, productCode, qty, lineKey, priceKey, updated });
    }
  }
  for (const rec of newest.values()) {
    for (const orderKey of rec.keys) {
      const variants = [
        rec.lineKey && rec.priceKey ? `${orderKey}@@${rec.productCode}@@${rec.lineKey}@@${rec.priceKey}` : '',
        rec.lineKey ? `${orderKey}@@${rec.productCode}@@${rec.lineKey}@@` : '',
        rec.priceKey ? `${orderKey}@@${rec.productCode}@@@@${rec.priceKey}` : '',
        `${orderKey}@@${rec.productCode}`
      ].filter(Boolean);
      map.set(variants[0], toNumber(map.get(variants[0])) + rec.qty);
    }
  }
  return map;
}
function returnedQtyForLine(returnMap, order = {}, item = {}) {
  const productCode = productCodeOf(item);
  const lineKey = lineKeyOf(item);
  const priceKey = priceKeyOf(item);
  const orderKeys = [order._id,order.id,order.code,order.orderCode,order.salesOrderCode,order.documentCode].map(cleanText).filter(Boolean);
  let best = 0;
  for (const orderKey of orderKeys) {
    const keys = [
      lineKey && priceKey ? `${orderKey}@@${productCode}@@${lineKey}@@${priceKey}` : '',
      lineKey ? `${orderKey}@@${productCode}@@${lineKey}@@` : '',
      priceKey ? `${orderKey}@@${productCode}@@@@${priceKey}` : '',
      `${orderKey}@@${productCode}`
    ].filter(Boolean);
    for (const key of keys) { const qty = toNumber(returnMap.get(key)); if (qty > best) best = qty; if (qty) break; }
  }
  return best;
}
function buildCatalogMap(rows = [], keyFields = []) {
  const map = new Map();
  for (const row of rows || []) {
    for (const field of keyFields) { const key = cleanText(row[field]); if (key) map.set(key, row); }
  }
  return map;
}
function resolveCustomer(order = {}, customer = {}, config = {}) {
  const mapped = firstText(
    order.sseCustomerCode, order.customerSseCode, order.accountingCustomerCode, order.customerAccountingCode, order.customerErpCode,
    customer.sseCustomerCode, customer.customerSseCode, customer.accountingCode, customer.accountingCustomerCode, customer.erpCode
  );
  const fallback = config.allowCanonicalCustomerCodeFallback ? firstText(order.customerCode, customer.code, customer.customerCode) : '';
  return { code: mapped || fallback, name: firstText(customer.name, customer.businessName, customer.customerName, order.customerName) };
}
function resolveProduct(item = {}, product = {}, config = {}) {
  const mapped = firstText(
    item.sseProductCode, item.productSseCode, item.accountingProductCode, item.productAccountingCode, item.erpProductCode,
    product.sseProductCode, product.productSseCode, product.accountingCode, product.accountingProductCode, product.erpCode
  );
  const fallback = config.allowCanonicalProductCodeFallback ? firstText(product.code, product.productCode, product.sku, item.productCode, item.code, item.sku) : '';
  const unit = firstText(item.baseUnitAtOrder, item.baseUnit, product.baseUnit, item.unit, item.dvt, item.uom, product.unit);
  return { code: mapped || fallback, name: productNameOf(item, product), unit };
}
function resolveSalesmanCode(order = {}, config = {}) {
  return firstText(order.sseSalesmanCode, order.accountingSalesmanCode, order.salesStaffSseCode, order.salesStaffAccountingCode, config.defaultSalesmanCode);
}
function errorRow(order, item, field, reason, action) {
  return {
    'Mã đơn': orderCode(order), 'Khách hàng': firstText(order.customerName, order.customerCode),
    'Mã sản phẩm': productCodeOf(item), 'Tên sản phẩm': productNameOf(item),
    'Trường bị thiếu': field, 'Nguyên nhân': reason, 'Hướng xử lý': action
  };
}
function validateLine({ order, item, customer, product, quantity, unitPrice, hasPrice, config }) {
  const errors = [];
  const invoiceNo = orderCode(order);
  const date = orderDate(order);
  if (!customer.code) errors.push(errorRow(order,item,'Mã khách','Khách hàng chưa có mã SSE/kế toán hợp lệ','Cập nhật mã SSE hoặc bật fallback mã khách chuẩn sau khi đối chiếu'));
  if (!customer.name) errors.push(errorRow(order,item,'Tên khách hàng','Thiếu tên khách hàng','Cập nhật danh mục khách hàng'));
  if (!date) errors.push(errorRow(order,item,'Ngày','Đơn không có ngày hợp lệ','Cập nhật ngày chứng từ/đơn hàng'));
  if (!invoiceNo) errors.push(errorRow(order,item,'Số hóa đơn','Đơn không có mã chứng từ','Cập nhật mã đơn/hóa đơn'));
  if (!product.code) errors.push(errorRow(order,item,'Mã hàng','Sản phẩm chưa có mã SSE/kế toán hợp lệ','Cập nhật mã SSE hoặc bật fallback mã sản phẩm chuẩn sau khi đối chiếu'));
  if (!product.name) errors.push(errorRow(order,item,'Tên mặt hàng','Thiếu tên sản phẩm chuẩn','Cập nhật danh mục sản phẩm'));
  if (!product.unit) errors.push(errorRow(order,item,'Đvt','Thiếu đơn vị tính tương ứng số lượng cơ sở','Cập nhật baseUnit/đơn vị tính sản phẩm'));
  if (!Number.isFinite(quantity) || quantity <= 0) errors.push(errorRow(order,item,'Số lượng','Số lượng sau khi trừ trả hàng không hợp lệ','Đối chiếu số lượng bán/trả'));
  if (!hasPrice || !Number.isFinite(unitPrice) || unitPrice < 0) errors.push(errorRow(order,item,'Giá bán','Dòng đơn thiếu giá hoặc giá sau khuyến mại không hợp lệ','Đối chiếu giá dòng đơn hàng'));
  if (!cleanText(config.defaultSalesmanCode) && !resolveSalesmanCode(order, config)) errors.push(errorRow(order,item,'Mã NVBH','Không xác định được mã NVBH SSE','Cấu hình SSE_SALESMAN_CODE hoặc mapping NVBH'));
  return errors;
}
function makeSseRow({ order, customer, product, quantity, unitPrice, config }) {
  const amount = round(quantity * unitPrice, 2);
  const values = [
    excelText(customer.code), customer.name, excelDate(orderDate(order)), excelText(orderCode(order)), excelText(config.invoiceType),
    excelText(config.invoiceSymbol), '', excelText(product.code), product.name, product.unit, excelText(config.warehouseCode),
    '', '', '', quantity, unitPrice, amount, '', '', excelText(config.currencyCode), config.exchangeRate,
    excelText(config.taxCode), excelText(config.debitAccount), excelText(config.revenueAccount), excelText(config.cogsAccount),
    excelText(config.outputTaxAccount), '', excelText(config.discountAccount), '', '', '', '', '', '', '', excelText(resolveSalesmanCode(order, config))
  ];
  return values;
}
function buildSseRows({ orders = [], returnOrders = [], customers = [], products = [], invoiceType = invoiceExportQueryService.INVOICE_GROUPS.ALL, config, configByType = {} }) {
  const requestedType = invoiceExportQueryService.normalizeInvoiceGroup(invoiceType, invoiceExportQueryService.INVOICE_GROUPS.ALL);
  const customerMap = buildCatalogMap(customers, ['_id','id','code','customerCode']);
  const productMap = buildCatalogMap(products, ['_id','id','code','productCode','sku','barcode']);
  const returnMap = buildReturnMap(returnOrders);
  const rows = [];
  const errors = [];
  const warnings = [];
  const seenOrders = new Set();
  const exportedOrders = new Set();
  const seenLines = new Set();
  for (const order of orders || []) {
    const orderType = resolveInvoiceType(order);
    if (!isActiveInvoiceOrder(order)) continue;
    if (requestedType !== invoiceExportQueryService.INVOICE_GROUPS.ALL && orderType !== requestedType) continue;
    const orderKey = orderIdentity(order);
    if (!orderKey || seenOrders.has(orderKey)) continue;
    seenOrders.add(orderKey);
    const rowConfig = configByType[orderType] || config;
    const customerDoc = customerMap.get(cleanText(order.customerCode)) || customerMap.get(cleanText(order.customerId)) || {};
    const customer = resolveCustomer(order, customerDoc, rowConfig);
    for (const [itemIndex, item] of (Array.isArray(order.items) ? order.items : []).entries()) {
      const soldQty = qtyOf(item);
      if (soldQty <= 0) continue;
      const productKey = productCodeOf(item);
      const catalogProduct = productMap.get(productKey) || productMap.get(productIdOf(item)) || {};
      const product = resolveProduct(item, catalogProduct, rowConfig);
      const rawReturned = returnedQtyForLine(returnMap, order, item);
      if (rawReturned > soldQty) {
        warnings.push(errorRow(
          order,
          item,
          'Số lượng trả vượt bán',
          `Số lượng bán ${soldQty}, tổng trả hợp lệ ${rawReturned}`,
          'Đối chiếu phiếu trả; file SSE đã giới hạn số lượng còn lại về 0'
        ));
      }
      const returned = Math.min(soldQty, rawReturned);
      const quantity = round(Math.max(0, soldQty - returned), 6);
      if (quantity <= 0) continue;
      const directPriceValue = item.finalPrice ?? item.priceAfterPromotion ?? item.promoPrice ?? item.price ?? item.salePrice ?? item.unitPrice ?? item.sellPrice;
      const amountValue = item.amount ?? item.totalAmount ?? item.lineAmount;
      const hasDirectPrice = directPriceValue !== null && directPriceValue !== undefined && cleanText(directPriceValue) !== '' && Number.isFinite(toNumber(directPriceValue, NaN));
      const hasAmountPrice = soldQty > 0 && amountValue !== null && amountValue !== undefined && cleanText(amountValue) !== '' && Number.isFinite(toNumber(amountValue, NaN));
      const sourcePrice = hasDirectPrice ? toNumber(directPriceValue) : (hasAmountPrice ? toNumber(amountValue) / soldQty : NaN);
      const unitPrice = round(orderType === INVOICE_TYPES.VAT ? sourcePrice / (1 + rowConfig.vatRate) : sourcePrice, 6);
      const lineIdentity = [orderKey, lineKeyOf(item) || itemIndex, productKey].join('@@');
      if (seenLines.has(lineIdentity)) continue;
      seenLines.add(lineIdentity);
      const lineErrors = validateLine({ order, item, customer, product, quantity, unitPrice, hasPrice: hasDirectPrice || hasAmountPrice, config: rowConfig });
      if (lineErrors.length) { errors.push(...lineErrors); continue; }
      rows.push(makeSseRow({ order, customer, product, quantity, unitPrice, config: rowConfig }));
      exportedOrders.add(orderKey);
      if (rows.length > rowConfig.maxRows) {
        errors.push(errorRow(order,item,'Giới hạn dòng',`Số dòng vượt giới hạn ${rowConfig.maxRows}`,'Thu hẹp khoảng ngày và xuất lại'));
        break;
      }
    }
  }
  return { rows, errors, warnings, orderCount: exportedOrders.size };
}
function sseFileName(invoiceType, query = {}) {
  const normalized = invoiceExportQueryService.normalizeInvoiceGroup(invoiceType, invoiceExportQueryService.INVOICE_GROUPS.ALL);
  const typeLabel = normalized === INVOICE_TYPES.NON_VAT ? 'khong_VAT' : normalized === INVOICE_TYPES.VAT ? 'VAT' : 'tat_ca';
  const from = normalizeDateOnly(query.dateFrom || query.from || query.fromDate || '') || 'all';
  const to = normalizeDateOnly(query.dateTo || query.to || query.toDate || '') || dateUtil.todayVN();
  const fmt = (d) => d === 'all' ? d : d.split('-').reverse().join('-');
  return `SSE_Hoa_don_${typeLabel}_tu_${fmt(from)}_den_${fmt(to)}.xlsx`;
}
function buildUploadWorkbook(rows, config) {
  const workbook = createWorkbook();
  appendAoaSheet(workbook, config.sheetName || 'TỔNG', [[], [], [], [], [...SSE_HEADERS], ...rows], {
    widths: [14,28,12,18,14,16,24,16,32,10,12,12,12,10,12,14,16,12,14,10,10,12,12,14,12,12,16,14,12,12,10,12,12,10,12,14]
  });
  return writeWorkbook(workbook);
}
function buildErrorWorkbook(errors = [], invoiceType, query = {}) {
  const workbook = createWorkbook();
  appendAoaSheet(workbook, 'Loi_mapping', [ERROR_HEADERS, ...errors.map((row) => ERROR_HEADERS.map((h) => row[h] ?? ''))]);
  return {
    buffer: writeWorkbook(workbook),
    rows: errors.length,
    fileName: `SSE_Loi_mapping_${normalizeInvoiceType(invoiceType) || 'ALL'}_${normalizeDateOnly(query.dateFrom || query.fromDate || '') || 'all'}_${normalizeDateOnly(query.dateTo || query.toDate || '') || dateUtil.todayVN()}.xlsx`
  };
}
async function loadData(query = {}, invoiceType, currentUser = {}) {
  const type = invoiceExportQueryService.normalizeInvoiceGroup(invoiceType, invoiceExportQueryService.INVOICE_GROUPS.ALL);
  const configByType = {
    [INVOICE_TYPES.VAT]: loadConfig(INVOICE_TYPES.VAT),
    [INVOICE_TYPES.NON_VAT]: loadConfig(INVOICE_TYPES.NON_VAT)
  };
  const data = await invoiceExportQueryService.loadInvoiceExportData({
    query,
    invoiceGroup: type,
    currentUser,
    maxOrders: Math.max(configByType[INVOICE_TYPES.VAT].maxOrders, configByType[INVOICE_TYPES.NON_VAT].maxOrders)
  });
  return {
    ...data,
    config: configByType[INVOICE_TYPES.VAT],
    configByType
  };
}

function validateConfigSet(configByType = {}, invoiceType) {
  const type = invoiceExportQueryService.normalizeInvoiceGroup(invoiceType, invoiceExportQueryService.INVOICE_GROUPS.ALL);
  const types = type === invoiceExportQueryService.INVOICE_GROUPS.ALL
    ? [INVOICE_TYPES.VAT, INVOICE_TYPES.NON_VAT]
    : [type];
  const errors = [];
  for (const currentType of types) {
    for (const field of validateConfig(configByType[currentType] || {})) {
      errors.push(`${currentType}: ${field}`);
    }
  }
  return errors;
}

async function buildSseInvoiceWorkbook(query = {}, currentUser = {}) {
  let invoiceType;
  try {
    invoiceType = invoiceExportQueryService.normalizeInvoiceGroup(query.invoiceType || 'ALL', invoiceExportQueryService.INVOICE_GROUPS.ALL);
    if (!invoiceType) return { error:'invoiceType chỉ nhận VAT, NON_VAT hoặc ALL', status:400, code:'INVALID_INVOICE_TYPE' };
    invoiceExportQueryService.normalizeExportQuery(query, { invoiceGroup: invoiceType });
  } catch (error) {
    return { error:error.message, status:error.statusCode || 400, code:error.code || 'INVALID_EXPORT_FILTER' };
  }
  const data = await loadData(query, invoiceType, currentUser);
  const configErrors = validateConfigSet(data.configByType, invoiceType);
  if (configErrors.length) return { error:`Thiếu cấu hình SSE: ${configErrors.join(', ')}`, status:422, code:'SSE_CONFIG_INVALID' };
  const built = buildSseRows({ ...data, invoiceType });
  if (built.errors.length) {
    const params = new URLSearchParams();
    ['invoiceType','dateFrom','dateTo','fromDate','toDate','salesStaffCode'].forEach((key)=>{ if(query[key])params.set(key,String(query[key])); });
    if (!params.has('invoiceType')) params.set('invoiceType', invoiceType);
    return {
      error:`Có ${built.errors.length} lỗi mapping SSE. File upload chưa được tạo để tránh dữ liệu thiếu.`,
      status:422, code:'SSE_MAPPING_INVALID', errors:built.errors.slice(0,100), totalErrors:built.errors.length,
      warnings:built.warnings.slice(0,100), warningCount:built.warnings.length,
      errorReportUrl:`/api/export/sse-invoice-errors.xlsx?${params.toString()}`
    };
  }
  if (!built.rows.length) return { error:'Không có dòng sản phẩm hợp lệ trong phạm vi đã chọn', status:404, code:'SSE_NO_DATA' };
  return {
    buffer:buildUploadWorkbook(built.rows,data.config),
    rows:built.rows.length,
    orderCount:built.orderCount,
    warningCount:built.warnings.length,
    warnings:built.warnings.slice(0,100),
    fileName:sseFileName(invoiceType,query)
  };
}
async function buildSseErrorReportWorkbook(query = {}, currentUser = {}) {
  let invoiceType;
  try {
    invoiceType = invoiceExportQueryService.normalizeInvoiceGroup(query.invoiceType || 'ALL', invoiceExportQueryService.INVOICE_GROUPS.ALL);
    if (!invoiceType) return { error:'invoiceType chỉ nhận VAT, NON_VAT hoặc ALL', status:400, code:'INVALID_INVOICE_TYPE' };
    invoiceExportQueryService.normalizeExportQuery(query, { invoiceGroup: invoiceType });
  } catch (error) {
    return { error:error.message, status:error.statusCode || 400, code:error.code || 'INVALID_EXPORT_FILTER' };
  }
  const data = await loadData(query, invoiceType, currentUser);
  const configErrors = validateConfigSet(data.configByType, invoiceType);
  const errors = configErrors.map((field)=>({
    'Mã đơn':'', 'Khách hàng':'', 'Mã sản phẩm':'', 'Tên sản phẩm':'', 'Trường bị thiếu':field,
    'Nguyên nhân':'Thiếu cấu hình SSE', 'Hướng xử lý':'Cập nhật config/sse-export.json hoặc biến môi trường SSE_*'
  }));
  const built = buildSseRows({ ...data, invoiceType });
  errors.push(...built.errors, ...built.warnings);
  if (!errors.length) return { error:'Không có lỗi hoặc cảnh báo SSE trong phạm vi đã chọn', status:404, code:'SSE_NO_MAPPING_ERRORS' };
  return buildErrorWorkbook(errors, invoiceType, query);
}

module.exports = {
  SSE_HEADERS, ERROR_HEADERS, loadConfig, validateConfig, buildSseRows, buildUploadWorkbook, buildErrorWorkbook,
  buildSseInvoiceWorkbook, buildSseErrorReportWorkbook, sseFileName, loadData, _private:{resolveCustomer,resolveProduct,returnedQtyForLine,buildReturnMap,makeSseRow,returnOrderActive,validateConfigSet}
};
