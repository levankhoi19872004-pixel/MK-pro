
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
const invoiceNetSalesService = require('./invoiceNetSales.service');

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

const SALESMAN_SUMMARY_SHEET_NAME = 'TONG_THEO_NVBH';
const SALESMAN_SUMMARY_HEADERS = Object.freeze([
  'STT', 'Mã NVBH', 'Tên NVBH', 'Số đơn', 'Mã hàng', 'Tên mặt hàng', 'Đvt', 'Mã kho',
  'Số lượng', 'Giá bán', 'Tiền hàng', 'Ghi chú'
]);
const DELIVERY_STAFF_SUMMARY_SHEET_NAME = 'TONG_THEO_NVGH';
const DELIVERY_STAFF_SUMMARY_HEADERS = Object.freeze([
  'STT', 'Mã NVGH', 'Tên NVGH', 'Số đơn tổng', 'Số đơn con', 'Mã hàng', 'Tên mặt hàng', 'Đvt',
  'Số lượng bán', 'Số lượng trả', 'Số lượng còn lại', 'Giá bán', 'Thành tiền', 'Ghi chú'
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
function childOrderCode(order = {}) { return firstText(order.code, order.orderCode, order.salesOrderCode, order.documentCode, order.id, order._id); }
function orderDate(order = {}) { return firstText(order.__sseInvoiceDate, invoiceExportQueryService.businessDateOf(order)); }
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
function catalogSalePriceInfo(product = {}) {
  const fields = ['salePrice', 'price', 'unitPrice', 'basePrice'];
  for (const field of fields) {
    const value = product[field];
    if (value === null || value === undefined || cleanText(value) === '') continue;
    const price = toNumber(value, NaN);
    if (Number.isFinite(price)) return { price, field, missing: false };
  }
  return { price: 0, field: '', missing: true };
}
function resolveSalesmanName(order = {}) {
  return firstText(
    order.salesStaffName, order.salesPersonName, order.salesmanName, order.nvbhName, order.maNVBHName,
    order.sseSalesmanName, order.accountingSalesmanName
  );
}
function isDeliveryStaffSummaryMode(value) {
  const text = cleanText(value).toLowerCase().replace(/[\s-]+/g, '_');
  return ['delivery_staff', 'deliverystaff', 'delivery', 'nvgh', 'theo_nvgh'].includes(text);
}
function resolveDeliveryStaffCode(order = {}) {
  return firstText(
    order.__sseDeliveryStaffCode, order.deliveryStaffCode, order.deliveryCode, order.nvghCode,
    order.assignedDeliveryStaffCode, order.shipperCode, order.staffCode
  );
}
function resolveDeliveryStaffName(order = {}) {
  return firstText(
    order.__sseDeliveryStaffName, order.deliveryStaffName, order.deliveryName, order.nvghName,
    order.assignedDeliveryStaffName, order.shipperName, order.staffName
  );
}
function deliveryInvoiceDateOf(order = {}) {
  return normalizeDateOnly(order.__sseInvoiceDate || order.deliveryDate || order.masterOrderDate || order.date || order.orderDate || order.createdAt || '');
}
function deliveryInvoiceCodeOf({ date, deliveryStaffCode, order = {} } = {}) {
  return firstText(order.__sseInvoiceCode, order.sseInvoiceCode, `SSE-${date || 'all'}-${deliveryStaffCode || 'NVGH'}`);
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

function groupDeliveryStaffExportRows({ orders = [], returnOrders = [], products = [], invoiceType = invoiceExportQueryService.INVOICE_GROUPS.ALL, config, configByType = {} }) {
  const requestedType = invoiceExportQueryService.normalizeInvoiceGroup(invoiceType, invoiceExportQueryService.INVOICE_GROUPS.ALL);
  const productMap = buildCatalogMap(products, ['_id','id','code','productCode','sku','barcode']);
  const rows = [];
  const summarySourceRows = [];
  const errors = [];
  const warnings = [];
  const seenOrders = new Set();
  const selectedOrders = [];

  for (const order of orders || []) {
    const orderType = resolveInvoiceType(order);
    if (!isActiveInvoiceOrder(order)) continue;
    if (requestedType !== invoiceExportQueryService.INVOICE_GROUPS.ALL && orderType !== requestedType) continue;
    const orderKey = orderIdentity(order);
    if (!orderKey || seenOrders.has(orderKey)) continue;
    seenOrders.add(orderKey);
    selectedOrders.push(order);
  }

  const netDataset = invoiceNetSalesService.buildNetSaleDataset({
    orders: selectedOrders,
    returnOrders,
    isEligibleReturnOrder: invoiceExportQueryService.isEligibleReturnOrder
  });
  warnings.push(...netDataset.warnings.map((warning) => ({
    'Mã đơn': warning.orderCode || '',
    'Khách hàng': '',
    'Mã sản phẩm': warning.productCode || '',
    'Tên sản phẩm': '',
    'Trường bị thiếu': warning.code || 'RETURN_WARNING',
    'Nguyên nhân': [warning.message || '', warning.returnedQty !== undefined ? `Tổng trả ${warning.returnedQty}` : '', warning.soldQty !== undefined ? `Số lượng bán ${warning.soldQty}` : ''].filter(Boolean).join(' - '),
    'Hướng xử lý': 'Đối chiếu returnOrders; dữ liệu nguồn không bị thay đổi'
  })));

  const groups = new Map();
  const seenLines = new Set();
  const exportedChildOrders = new Set();

  for (const netOrder of netDataset.orders) {
    const order = netOrder.order;
    const orderType = resolveInvoiceType(order);
    const orderKey = orderIdentity(order);
    const rowConfig = configByType[orderType] || config;
    const deliveryStaffCode = resolveDeliveryStaffCode(order);
    const deliveryStaffName = resolveDeliveryStaffName(order);
    const invoiceDate = deliveryInvoiceDateOf(order) || orderDate(order);
    const childCode = childOrderCode(order);
    const masterOrderCode = firstText(order.__sseMasterOrderCode, order.masterOrderCode, order.masterCode, order.deliveryMasterCode);
    const masterOrderId = firstText(order.__sseMasterOrderId, order.masterOrderId, order.masterId, order.deliveryMasterId);

    for (const line of netOrder.exportableLines) {
      const item = line.item;
      const productKey = line.productCode;
      const catalogProduct = productMap.get(productKey) || productMap.get(productIdOf(item)) || {};
      const product = resolveProduct(item, catalogProduct, rowConfig);
      const quantity = line.netQty;
      const catalogSalePrice = catalogSalePriceInfo(catalogProduct);
      const lineIdentity = [orderKey, line.itemIndex, productKey].join('@@');
      if (seenLines.has(lineIdentity)) continue;
      seenLines.add(lineIdentity);

      const lineErrors = [];
      if (!deliveryStaffCode) lineErrors.push(errorRow(order, item, 'Mã khách', 'Đơn tổng chưa có mã NVGH để map vào cột Mã khách SSE', 'Gán NVGH cho đơn tổng trước khi xuất SSE'));
      if (!deliveryStaffName) lineErrors.push(errorRow(order, item, 'Tên khách hàng', 'Đơn tổng chưa có tên NVGH để map vào cột Tên khách hàng SSE', 'Gán/tải lại tên NVGH trên đơn tổng'));
      if (!invoiceDate) lineErrors.push(errorRow(order, item, 'Ngày', 'Đơn tổng/đơn con không có ngày giao hợp lệ', 'Kiểm tra deliveryDate/masterOrderDate'));
      if (!product.code) lineErrors.push(errorRow(order, item, 'Mã hàng', 'Sản phẩm chưa có mã SSE/kế toán hợp lệ', 'Cập nhật mã SSE hoặc bật fallback mã sản phẩm chuẩn sau khi đối chiếu'));
      if (!product.name) lineErrors.push(errorRow(order, item, 'Tên mặt hàng', 'Thiếu tên sản phẩm chuẩn', 'Cập nhật danh mục sản phẩm'));
      if (!product.unit) lineErrors.push(errorRow(order, item, 'Đvt', 'Thiếu đơn vị tính tương ứng số lượng cơ sở', 'Cập nhật baseUnit/đơn vị tính sản phẩm'));
      if (!Number.isFinite(quantity) || quantity <= 0) lineErrors.push(errorRow(order, item, 'Số lượng', 'Số lượng sau khi trừ trả hàng không hợp lệ', 'Đối chiếu số lượng bán/trả'));
      if (lineErrors.length) { errors.push(...lineErrors); continue; }
      if (catalogSalePrice.missing) {
        warnings.push(errorRow(order, item, 'Giá bán danh mục', 'Thiếu giá bán trong danh mục sản phẩm; sheet SSE vẫn xuất giá 0', 'Cập nhật product.salePrice'));
      }

      const key = [deliveryStaffCode, product.code].join('@@');
      let group = groups.get(key);
      if (!group) {
        group = {
          deliveryStaffCode,
          deliveryStaffName,
          invoiceDate,
          invoiceCode: deliveryInvoiceCodeOf({ date: invoiceDate, deliveryStaffCode, order }),
          orderType,
          config: rowConfig,
          product,
          productCode: product.code,
          productName: firstText(catalogProduct.name, catalogProduct.productName, product.name),
          unit: firstText(catalogProduct.baseUnit, catalogProduct.unit, product.unit),
          warehouseCode: rowConfig.warehouseCode,
          soldQty: 0,
          returnedQty: 0,
          quantity: 0,
          unitPrice: catalogSalePrice.price,
          missingCatalogSalePrice: catalogSalePrice.missing,
          catalogSalePriceField: catalogSalePrice.field,
          orderCodes: new Set(),
          masterOrderCodes: new Set(),
          masterOrderIds: new Set(),
          notes: new Set(),
          sampleOrder: order
        };
        groups.set(key, group);
      }
      group.deliveryStaffName = group.deliveryStaffName || deliveryStaffName;
      group.invoiceDate = group.invoiceDate || invoiceDate;
      group.invoiceCode = group.invoiceCode || deliveryInvoiceCodeOf({ date: invoiceDate, deliveryStaffCode, order });
      group.productName = group.productName || firstText(catalogProduct.name, catalogProduct.productName, product.name);
      group.unit = group.unit || firstText(catalogProduct.baseUnit, catalogProduct.unit, product.unit);
      group.soldQty = round(group.soldQty + toNumber(line.soldQty), 6);
      group.returnedQty = round(group.returnedQty + toNumber(line.returnQty ?? line.returnedQty ?? (toNumber(line.soldQty) - toNumber(line.netQty))), 6);
      group.quantity = round(group.quantity + quantity, 6);
      if (!group.missingCatalogSalePrice && !catalogSalePrice.missing) group.unitPrice = catalogSalePrice.price;
      if (catalogSalePrice.missing) {
        group.missingCatalogSalePrice = true;
        group.unitPrice = 0;
        group.notes.add('Thiếu giá bán trong danh mục sản phẩm');
      }
      if (childCode) group.orderCodes.add(childCode);
      if (masterOrderCode) group.masterOrderCodes.add(masterOrderCode);
      if (masterOrderId) group.masterOrderIds.add(masterOrderId);
      if (childCode) exportedChildOrders.add(childCode);
    }
  }

  const sortedGroups = [...groups.values()].sort((a, b) => a.deliveryStaffCode.localeCompare(b.deliveryStaffCode, 'vi') || a.productCode.localeCompare(b.productCode, 'vi'));
  for (const group of sortedGroups) {
    if (group.quantity <= 0) continue;
    const rowConfig = group.config || config;
    const sseOrder = {
      ...(group.sampleOrder || {}),
      orderDate: group.invoiceDate,
      date: group.invoiceDate,
      invoiceCode: group.invoiceCode,
      documentCode: group.invoiceCode,
      code: group.invoiceCode,
      sseSalesmanCode: rowConfig.defaultSalesmanCode
    };
    const customer = { code: group.deliveryStaffCode, name: group.deliveryStaffName };
    const product = { code: group.productCode, name: group.productName, unit: group.unit };
    const unitPrice = toNumber(group.unitPrice, 0);
    rows.push(makeSseRow({ order: sseOrder, customer, product, quantity: group.quantity, unitPrice, config: rowConfig }));
    summarySourceRows.push({
      mode: 'deliveryStaff',
      deliveryStaffCode: group.deliveryStaffCode,
      deliveryStaffName: group.deliveryStaffName,
      masterOrderCount: group.masterOrderCodes.size || group.masterOrderIds.size,
      masterOrderCodes: [...group.masterOrderCodes],
      masterOrderIds: [...group.masterOrderIds],
      childOrderCount: group.orderCodes.size,
      childOrderCodes: [...group.orderCodes],
      productCode: group.productCode,
      productName: group.productName,
      unit: group.unit,
      warehouseCode: group.warehouseCode,
      soldQty: group.soldQty,
      returnedQty: group.returnedQty,
      quantity: group.quantity,
      catalogSalePrice: unitPrice,
      catalogSalePriceField: group.catalogSalePriceField,
      missingCatalogSalePrice: group.missingCatalogSalePrice,
      amount: round(group.quantity * unitPrice, 2),
      note: ['Tổng hợp từ đơn tổng theo NVGH', ...group.notes].join('; ')
    });
    if (rows.length > rowConfig.maxRows) {
      errors.push(errorRow(sseOrder, { productCode: group.productCode, productName: group.productName }, 'Giới hạn dòng', `Số dòng vượt giới hạn ${rowConfig.maxRows}`, 'Thu hẹp khoảng ngày và xuất lại'));
      break;
    }
  }

  return { rows, summarySourceRows, errors, warnings, orderCount: exportedChildOrders.size };
}

function buildSseRows({ orders = [], returnOrders = [], customers = [], products = [], invoiceType = invoiceExportQueryService.INVOICE_GROUPS.ALL, config, configByType = {}, summaryBy = '' }) {
  if (isDeliveryStaffSummaryMode(summaryBy)) return groupDeliveryStaffExportRows({ orders, returnOrders, products, invoiceType, config, configByType });
  const requestedType = invoiceExportQueryService.normalizeInvoiceGroup(invoiceType, invoiceExportQueryService.INVOICE_GROUPS.ALL);
  const customerMap = buildCatalogMap(customers, ['_id','id','code','customerCode']);
  const productMap = buildCatalogMap(products, ['_id','id','code','productCode','sku','barcode']);
  const rows = [];
  const summarySourceRows = [];
  const errors = [];
  const warnings = [];
  const seenOrders = new Set();
  const selectedOrders = [];

  for (const order of orders || []) {
    const orderType = resolveInvoiceType(order);
    if (!isActiveInvoiceOrder(order)) continue;
    if (requestedType !== invoiceExportQueryService.INVOICE_GROUPS.ALL && orderType !== requestedType) continue;
    const orderKey = orderIdentity(order);
    if (!orderKey || seenOrders.has(orderKey)) continue;
    seenOrders.add(orderKey);
    selectedOrders.push(order);
  }

  const netDataset = invoiceNetSalesService.buildNetSaleDataset({
    orders: selectedOrders,
    returnOrders,
    isEligibleReturnOrder: invoiceExportQueryService.isEligibleReturnOrder
  });
  warnings.push(...netDataset.warnings.map((warning) => ({
    'Mã đơn': warning.orderCode || '',
    'Khách hàng': '',
    'Mã sản phẩm': warning.productCode || '',
    'Tên sản phẩm': '',
    'Trường bị thiếu': warning.code || 'RETURN_WARNING',
    'Nguyên nhân': [warning.message || '', warning.returnedQty !== undefined ? `Tổng trả ${warning.returnedQty}` : '', warning.soldQty !== undefined ? `Số lượng bán ${warning.soldQty}` : ''].filter(Boolean).join(' - '),
    'Hướng xử lý': 'Đối chiếu returnOrders; dữ liệu nguồn không bị thay đổi'
  })));

  const exportedOrders = new Set();
  const seenLines = new Set();
  for (const netOrder of netDataset.orders) {
    const order = netOrder.order;
    const orderType = resolveInvoiceType(order);
    const orderKey = orderIdentity(order);
    const rowConfig = configByType[orderType] || config;
    const customerDoc = customerMap.get(cleanText(order.customerCode)) || customerMap.get(cleanText(order.customerId)) || {};
    const customer = resolveCustomer(order, customerDoc, rowConfig);

    for (const line of netOrder.exportableLines) {
      const item = line.item;
      const soldQty = line.soldQty;
      const productKey = line.productCode;
      const catalogProduct = productMap.get(productKey) || productMap.get(productIdOf(item)) || {};
      const product = resolveProduct(item, catalogProduct, rowConfig);
      const quantity = line.netQty;
      const directPriceValue = item.finalPrice ?? item.priceAfterPromotion ?? item.promoPrice ?? item.price ?? item.salePrice ?? item.unitPrice ?? item.sellPrice;
      const amountValue = item.amount ?? item.totalAmount ?? item.lineAmount;
      const hasDirectPrice = directPriceValue !== null && directPriceValue !== undefined && cleanText(directPriceValue) !== '' && Number.isFinite(toNumber(directPriceValue, NaN));
      const hasAmountPrice = soldQty > 0 && amountValue !== null && amountValue !== undefined && cleanText(amountValue) !== '' && Number.isFinite(toNumber(amountValue, NaN));
      const sourcePrice = hasDirectPrice ? toNumber(directPriceValue) : (hasAmountPrice ? toNumber(amountValue) / soldQty : NaN);
      const unitPrice = round(orderType === INVOICE_TYPES.VAT ? sourcePrice / (1 + rowConfig.vatRate) : sourcePrice, 6);
      const lineIdentity = [orderKey, line.itemIndex, productKey].join('@@');
      if (seenLines.has(lineIdentity)) continue;
      seenLines.add(lineIdentity);
      const lineErrors = validateLine({ order, item, customer, product, quantity, unitPrice, hasPrice: hasDirectPrice || hasAmountPrice, config: rowConfig });
      if (lineErrors.length) { errors.push(...lineErrors); continue; }
      rows.push(makeSseRow({ order, customer, product, quantity, unitPrice, config: rowConfig }));
      const catalogSalePrice = catalogSalePriceInfo(catalogProduct);
      summarySourceRows.push({
        orderCode: orderCode(order),
        orderKey,
        salesStaffCode: resolveSalesmanCode(order, rowConfig),
        salesStaffName: resolveSalesmanName(order),
        productCode: product.code,
        productName: firstText(catalogProduct.name, catalogProduct.productName, product.name),
        unit: firstText(catalogProduct.baseUnit, catalogProduct.unit, product.unit),
        warehouseCode: rowConfig.warehouseCode,
        quantity,
        catalogSalePrice: catalogSalePrice.price,
        catalogSalePriceField: catalogSalePrice.field,
        missingCatalogSalePrice: catalogSalePrice.missing
      });
      exportedOrders.add(orderKey);
      if (rows.length > rowConfig.maxRows) {
        errors.push(errorRow(order,item,'Giới hạn dòng',`Số dòng vượt giới hạn ${rowConfig.maxRows}`,'Thu hẹp khoảng ngày và xuất lại'));
        break;
      }
    }
  }
  return { rows, summarySourceRows, errors, warnings, orderCount: exportedOrders.size };
}

function sseFileName(invoiceType, query = {}) {
  const normalized = invoiceExportQueryService.normalizeInvoiceGroup(invoiceType, invoiceExportQueryService.INVOICE_GROUPS.ALL);
  const typeLabel = normalized === INVOICE_TYPES.NON_VAT ? 'khong_VAT' : normalized === INVOICE_TYPES.VAT ? 'VAT' : 'tat_ca';
  const from = normalizeDateOnly(query.dateFrom || query.from || query.fromDate || '') || 'all';
  const to = normalizeDateOnly(query.dateTo || query.to || query.toDate || '') || dateUtil.todayVN();
  const deliveryStaffCode = cleanText(query.deliveryStaffCode || query.deliveryCode || query.nvghCode || query.deliveryStaff || query.delivery || query.nvgh || '');
  const deliveryScope = deliveryStaffCode ? `_NVGH_${deliveryStaffCode.replace(/[^a-zA-Z0-9_-]+/g, '_')}` : '';
  const fmt = (d) => d === 'all' ? d : d.split('-').reverse().join('-');
  return `SSE_Hoa_don_${typeLabel}${deliveryScope}_tu_${fmt(from)}_den_${fmt(to)}.xlsx`;
}
function makeSalesmanSummaryKey(row = {}) {
  return [cleanText(row.salesStaffCode), cleanText(row.productCode)].join('@@');
}

function buildSseSalesmanSummaryRows(sourceRows = []) {
  const groups = new Map();
  for (const source of Array.isArray(sourceRows) ? sourceRows : []) {
    const salesStaffCode = cleanText(source.salesStaffCode);
    const productCode = cleanText(source.productCode);
    const quantity = toNumber(source.quantity, NaN);
    if (!salesStaffCode || !productCode || !Number.isFinite(quantity) || quantity <= 0) continue;
    const key = makeSalesmanSummaryKey(source);
    let group = groups.get(key);
    if (!group) {
      group = {
        salesStaffCode,
        salesStaffName: cleanText(source.salesStaffName),
        productCode,
        productName: cleanText(source.productName),
        unit: cleanText(source.unit),
        warehouseCodes: new Set(),
        orderCodes: new Set(),
        quantity: 0,
        unitPrice: toNumber(source.catalogSalePrice, 0),
        missingCatalogSalePrice: Boolean(source.missingCatalogSalePrice),
        priceFields: new Set(),
        notes: new Set()
      };
      groups.set(key, group);
    }
    group.salesStaffName = group.salesStaffName || cleanText(source.salesStaffName);
    group.productName = group.productName || cleanText(source.productName);
    group.unit = group.unit || cleanText(source.unit);
    if (cleanText(source.warehouseCode)) group.warehouseCodes.add(cleanText(source.warehouseCode));
    if (cleanText(source.orderCode)) group.orderCodes.add(cleanText(source.orderCode));
    else if (cleanText(source.orderKey)) group.orderCodes.add(cleanText(source.orderKey));
    group.quantity = round(group.quantity + quantity, 6);
    const currentPrice = toNumber(source.catalogSalePrice, NaN);
    if (!group.missingCatalogSalePrice && Number.isFinite(currentPrice)) group.unitPrice = currentPrice;
    if (source.missingCatalogSalePrice) {
      group.missingCatalogSalePrice = true;
      group.unitPrice = 0;
      group.notes.add('Thiếu giá bán trong danh mục sản phẩm');
    }
    if (cleanText(source.catalogSalePriceField)) group.priceFields.add(cleanText(source.catalogSalePriceField));
  }

  return [...groups.values()]
    .map((group) => {
      const amount = round(group.quantity * toNumber(group.unitPrice), 2);
      const noteParts = ['Tổng hợp từ sheet TỔNG'];
      if (group.notes.size) noteParts.push(...group.notes);
      return {
        salesStaffCode: group.salesStaffCode,
        salesStaffName: group.salesStaffName,
        orderCount: group.orderCodes.size,
        orderCodes: [...group.orderCodes],
        productCode: group.productCode,
        productName: group.productName,
        unit: group.unit,
        warehouseCode: [...group.warehouseCodes].join(', '),
        quantity: group.quantity,
        unitPrice: toNumber(group.unitPrice),
        amount,
        note: noteParts.join('; ')
      };
    })
    .sort((a, b) => a.salesStaffCode.localeCompare(b.salesStaffCode, 'vi') || a.productCode.localeCompare(b.productCode, 'vi'));
}

function buildSseSalesmanSummaryAoa(sourceRows = []) {
  const rows = buildSseSalesmanSummaryRows(sourceRows);
  const aoa = [[...SALESMAN_SUMMARY_HEADERS]];
  let currentSalesman = null;
  let currentRows = [];
  let stt = 1;
  const allOrders = new Set();
  let allQty = 0;
  let allAmount = 0;

  const flushSalesmanTotal = () => {
    if (!currentRows.length) return;
    const first = currentRows[0];
    const orderCodes = new Set();
    let qty = 0;
    let amount = 0;
    for (const row of currentRows) {
      qty = round(qty + toNumber(row.quantity), 6);
      amount = round(amount + toNumber(row.amount), 2);
      for (const code of Array.isArray(row.orderCodes) ? row.orderCodes : []) {
        if (cleanText(code)) orderCodes.add(cleanText(code));
      }
    }
    aoa.push(['', first.salesStaffCode, first.salesStaffName, orderCodes.size || '', '', 'TỔNG NVBH', '', '', qty, '', amount, '']);
    currentRows = [];
  };

  for (const row of rows) {
    if (currentSalesman !== null && row.salesStaffCode !== currentSalesman) flushSalesmanTotal();
    currentSalesman = row.salesStaffCode;
    currentRows.push(row);
    for (const code of Array.isArray(row.orderCodes) ? row.orderCodes : []) {
      if (cleanText(code)) allOrders.add(cleanText(code));
    }
    allQty = round(allQty + toNumber(row.quantity), 6);
    allAmount = round(allAmount + toNumber(row.amount), 2);
    aoa.push([
      stt, row.salesStaffCode, row.salesStaffName, row.orderCount, row.productCode, row.productName, row.unit,
      row.warehouseCode, row.quantity, row.unitPrice, row.amount, row.note
    ]);
    stt += 1;
  }
  flushSalesmanTotal();
  if (rows.length) aoa.push(['', '', '', allOrders.size || '', '', 'TỔNG CỘNG', '', '', allQty, '', allAmount, '']);
  return aoa;
}


function buildSseDeliveryStaffSummaryRows(sourceRows = []) {
  const rows = [];
  for (const source of Array.isArray(sourceRows) ? sourceRows : []) {
    const deliveryStaffCode = cleanText(source.deliveryStaffCode);
    const productCode = cleanText(source.productCode);
    if (!deliveryStaffCode || !productCode) continue;
    const quantity = toNumber(source.quantity, NaN);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    const unitPrice = toNumber(source.catalogSalePrice, 0);
    const noteParts = ['Tổng hợp từ đơn tổng theo NVGH'];
    if (source.missingCatalogSalePrice) noteParts.push('Thiếu giá bán trong danh mục sản phẩm');
    if (cleanText(source.note)) noteParts.push(cleanText(source.note));
    rows.push({
      deliveryStaffCode,
      deliveryStaffName: cleanText(source.deliveryStaffName),
      masterOrderCount: toNumber(source.masterOrderCount, Array.isArray(source.masterOrderCodes) ? source.masterOrderCodes.length : 0),
      childOrderCount: toNumber(source.childOrderCount, Array.isArray(source.childOrderCodes) ? source.childOrderCodes.length : 0),
      productCode,
      productName: cleanText(source.productName),
      unit: cleanText(source.unit),
      soldQty: toNumber(source.soldQty, quantity),
      returnedQty: toNumber(source.returnedQty, 0),
      quantity,
      unitPrice,
      amount: round(quantity * unitPrice, 2),
      note: [...new Set(noteParts.filter(Boolean))].join('; ')
    });
  }
  return rows.sort((a, b) => a.deliveryStaffCode.localeCompare(b.deliveryStaffCode, 'vi') || a.productCode.localeCompare(b.productCode, 'vi'));
}

function buildSseDeliveryStaffSummaryAoa(sourceRows = []) {
  const rows = buildSseDeliveryStaffSummaryRows(sourceRows);
  const aoa = [[...DELIVERY_STAFF_SUMMARY_HEADERS]];
  let currentStaff = null;
  let currentRows = [];
  let stt = 1;
  let allSoldQty = 0;
  let allReturnedQty = 0;
  let allNetQty = 0;
  let allAmount = 0;

  const flushStaffTotal = () => {
    if (!currentRows.length) return;
    const first = currentRows[0];
    const totalSold = round(currentRows.reduce((sum, row) => sum + toNumber(row.soldQty), 0), 6);
    const totalReturned = round(currentRows.reduce((sum, row) => sum + toNumber(row.returnedQty), 0), 6);
    const totalNet = round(currentRows.reduce((sum, row) => sum + toNumber(row.quantity), 0), 6);
    const totalAmount = round(currentRows.reduce((sum, row) => sum + toNumber(row.amount), 0), 2);
    aoa.push(['', first.deliveryStaffCode, first.deliveryStaffName, '', '', '', 'TỔNG NVGH', '', totalSold, totalReturned, totalNet, '', totalAmount, '']);
    currentRows = [];
  };

  for (const row of rows) {
    if (currentStaff !== null && row.deliveryStaffCode !== currentStaff) flushStaffTotal();
    currentStaff = row.deliveryStaffCode;
    currentRows.push(row);
    allSoldQty = round(allSoldQty + toNumber(row.soldQty), 6);
    allReturnedQty = round(allReturnedQty + toNumber(row.returnedQty), 6);
    allNetQty = round(allNetQty + toNumber(row.quantity), 6);
    allAmount = round(allAmount + toNumber(row.amount), 2);
    aoa.push([
      stt, row.deliveryStaffCode, row.deliveryStaffName, row.masterOrderCount || '', row.childOrderCount || '', row.productCode,
      row.productName, row.unit, row.soldQty, row.returnedQty, row.quantity, row.unitPrice, row.amount, row.note
    ]);
    stt += 1;
  }
  flushStaffTotal();
  if (rows.length) aoa.push(['', '', '', '', '', '', 'TỔNG CỘNG', '', allSoldQty, allReturnedQty, allNetQty, '', allAmount, '']);
  return aoa;
}

function buildUploadWorkbook(rows, config, summarySourceRows, options = {}) {
  const workbook = createWorkbook();
  appendAoaSheet(workbook, config.sheetName || 'TỔNG', [[], [], [], [], [...SSE_HEADERS], ...rows], {
    widths: [14,28,12,18,14,16,24,16,32,10,12,12,12,10,12,14,16,12,14,10,10,12,12,14,12,12,16,14,12,12,10,12,12,10,12,14]
  });
  if (Array.isArray(summarySourceRows)) {
    if (isDeliveryStaffSummaryMode(options.summaryBy)) {
      appendAoaSheet(workbook, DELIVERY_STAFF_SUMMARY_SHEET_NAME, buildSseDeliveryStaffSummaryAoa(summarySourceRows), {
        widths: [6,14,26,12,12,16,35,10,12,12,14,14,16,38],
        autoFilter: true
      });
    } else {
      appendAoaSheet(workbook, SALESMAN_SUMMARY_SHEET_NAME, buildSseSalesmanSummaryAoa(summarySourceRows), {
        widths: [6,14,24,10,16,35,10,12,12,14,16,36],
        autoFilter: true
      });
    }
  }
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
  const built = buildSseRows({ ...data, invoiceType, summaryBy: query.summaryBy || data.filters?.summaryBy || '' });
  if (built.errors.length) {
    const params = new URLSearchParams();
    ['invoiceType','dateFrom','dateTo','fromDate','toDate','salesStaffCode','deliveryStaffCode','deliveryCode','nvghCode','deliveryStaff','delivery','nvgh','customerCode','summaryBy'].forEach((key)=>{ if(query[key])params.set(key,String(query[key])); });
    if (!params.has('invoiceType')) params.set('invoiceType', invoiceType);
    if (!params.has('summaryBy') && invoiceExportQueryService.isDeliveryStaffSummaryMode(query.summaryBy || data.filters?.summaryBy || '')) params.set('summaryBy', 'deliveryStaff');
    return {
      error:`Có ${built.errors.length} lỗi mapping SSE. File upload chưa được tạo để tránh dữ liệu thiếu.`,
      status:422, code:'SSE_MAPPING_INVALID', errors:built.errors.slice(0,100), totalErrors:built.errors.length,
      warnings:built.warnings.slice(0,100), warningCount:built.warnings.length,
      errorReportUrl:`/api/export/sse-invoice-errors.xlsx?${params.toString()}`
    };
  }
  if (!built.rows.length) return { error:'Không có dòng sản phẩm hợp lệ trong phạm vi đã chọn', status:404, code:'SSE_NO_DATA' };
  return {
    buffer:buildUploadWorkbook(built.rows,data.config,built.summarySourceRows,{ summaryBy: query.summaryBy || data.filters?.summaryBy || '' }),
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
  const built = buildSseRows({ ...data, invoiceType, summaryBy: query.summaryBy || data.filters?.summaryBy || '' });
  errors.push(...built.errors, ...built.warnings);
  if (!errors.length) return { error:'Không có lỗi hoặc cảnh báo SSE trong phạm vi đã chọn', status:404, code:'SSE_NO_MAPPING_ERRORS' };
  return buildErrorWorkbook(errors, invoiceType, query);
}

module.exports = {
  SSE_HEADERS, ERROR_HEADERS, SALESMAN_SUMMARY_SHEET_NAME, SALESMAN_SUMMARY_HEADERS, DELIVERY_STAFF_SUMMARY_SHEET_NAME, DELIVERY_STAFF_SUMMARY_HEADERS, loadConfig, validateConfig, buildSseRows, buildUploadWorkbook, buildErrorWorkbook,
  buildSseInvoiceWorkbook, buildSseErrorReportWorkbook, sseFileName, loadData, _private:{resolveCustomer,resolveProduct,returnedQtyForLine,buildReturnMap,makeSseRow,returnOrderActive,validateConfigSet,catalogSalePriceInfo,resolveSalesmanName,isDeliveryStaffSummaryMode,resolveDeliveryStaffCode,resolveDeliveryStaffName,makeSalesmanSummaryKey,buildSseSalesmanSummaryRows,buildSseSalesmanSummaryAoa,buildSseDeliveryStaffSummaryRows,buildSseDeliveryStaffSummaryAoa,groupDeliveryStaffExportRows}
};
