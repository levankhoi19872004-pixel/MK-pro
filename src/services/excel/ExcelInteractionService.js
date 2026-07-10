'use strict';

const dateUtil = require('../../utils/date.util');
const { createWorkbook, appendAoaSheet, writeWorkbook } = require('../../utils/excelWriter.util');
const orderService = require('../orderService');
const masterOrderService = require('../masterOrderService');
const importOrderService = require('../importOrderService');
const ReportCenterService = require('../reports/ReportCenterService');
const orderRepository = require('../../repositories/orderRepository');
const importOrderRepository = require('../../repositories/importOrderRepository');
const productRepository = require('../../repositories/productRepository');
const importSessionService = require('../importSessionService');
const auditService = require('../auditService');
const inventoryStockService = require('../inventoryStock.service');
const ProductExcelEnrichmentService = require('./ProductExcelEnrichmentService');
const ImportPreviewStreamingWorkbook = require('./ImportPreviewStreamingWorkbook');
const { compareProductNameAsc } = require('../../utils/productSort');
const { getCurrentPickingZone } = require('../../utils/productHydration');
const { pickingZoneLabel } = require('../../utils/pickingZone.util');

const DEFAULT_MAX_EXPORT_ROWS = 50000;
const MAX_SELECTED_IDS = 2000;
const MAX_RESOLVE_CODES = 1000;

function toNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function cleanText(value) {
  return String(value ?? '').trim();
}

function safeLimit(value, fallback = DEFAULT_MAX_EXPORT_ROWS) {
  return Math.min(Math.max(Number(value || fallback), 1), DEFAULT_MAX_EXPORT_ROWS);
}

function normalizeScope(value) {
  const scope = cleanText(value).toUpperCase();
  return ['SELECTED', 'PAGE', 'FILTERED'].includes(scope) ? scope : 'PAGE';
}

function uniqueStrings(values = [], max = MAX_SELECTED_IDS) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(cleanText)
    .filter(Boolean))].slice(0, max);
}

function sanitizeExcelValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'boolean') return value ? 'Có' : 'Không';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  // Chặn Excel formula injection từ tên khách hàng, ghi chú và dữ liệu import.
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function firstValue(row = {}, keys = [], fallback = '') {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return fallback;
}

function formatDate(value) {
  const normalized = dateUtil.toDateOnly(value);
  return normalized || cleanText(value);
}

function rowIdentity(row = {}) {
  return cleanText(firstValue(row, ['id', 'code', 'orderCode', 'documentCode', 'salesOrderCode', '_id']));
}

function statusText(row = {}) {
  return cleanText(firstValue(row, ['accountingStatus', 'deliveryStatus', 'lifecycleStatus', 'status'], ''));
}

function sourceText(row = {}) {
  return cleanText(firstValue(row, ['source', 'orderSource', 'sourceType', 'origin'], ''));
}

function salesStaffCode(row = {}) {
  return cleanText(firstValue(row, ['salesStaffCode', 'salesmanCode', 'nvbhCode', 'staffCode'], ''));
}

function salesStaffName(row = {}) {
  return cleanText(firstValue(row, ['salesStaffName', 'salesmanName', 'nvbhName', 'staffName'], ''));
}

function deliveryStaffCode(row = {}) {
  return cleanText(firstValue(row, ['deliveryStaffCode', 'deliveryCode', 'nvghCode'], ''));
}

function deliveryStaffName(row = {}) {
  return cleanText(firstValue(row, ['deliveryStaffName', 'deliveryName', 'nvghName'], ''));
}

function orderItems(order = {}) {
  const items = firstValue(order, ['items', 'lines', 'details', 'products'], []);
  return Array.isArray(items) ? items : [];
}

function itemProductCode(item = {}) {
  return cleanText(firstValue(item, ['productCode', 'code', 'sku', 'InvtID'], ''));
}

function itemProductName(item = {}) {
  return cleanText(firstValue(item, ['productName', 'name', 'description', 'InvtFullName'], ''));
}

function itemConversionRate(item = {}) {
  return Math.max(1, toNumber(firstValue(item, ['conversionRate', 'packingQty', 'unitsPerCase', 'InvtCaseQty'], 1)) || 1);
}

function itemBaseQty(item = {}) {
  return toNumber(firstValue(item, ['quantity', 'baseQty', 'qty', 'LineQty', 'INQty'], 0));
}

function itemCaseQty(item = {}) {
  const explicit = firstValue(item, ['cartonQty', 'caseQty', 'cases', 'Cases', 'TranCases'], null);
  if (explicit !== null) return toNumber(explicit);
  return Math.floor(itemBaseQty(item) / itemConversionRate(item));
}

function itemLooseQty(item = {}) {
  const explicit = firstValue(item, ['unitQty', 'looseQty', 'remainderQty', 'RemUnits', 'TranUnits'], null);
  if (explicit !== null) return toNumber(explicit);
  return itemBaseQty(item) % itemConversionRate(item);
}

function itemPrice(item = {}, type = 'sale') {
  if (type === 'cost') return toNumber(firstValue(item, ['costPrice', 'importPrice', 'purchasePrice', 'INPrice', 'TranUnitPrice'], 0));
  return toNumber(firstValue(item, ['salePrice', 'finalPrice', 'price', 'unitPrice', 'UnitPrice'], 0));
}

function itemAmount(item = {}, type = 'sale') {
  const explicit = toNumber(firstValue(item, ['amount', 'lineAmount', 'LineAmt', 'TranAmt'], 0));
  return explicit || itemBaseQty(item) * itemPrice(item, type);
}

function appendObjectSheet(workbook, name, columns, rows, options = {}) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const headers = columns.map((column) => column.label);
  const values = safeRows.map((row) => columns.map((column) => {
    const value = typeof column.value === 'function' ? column.value(row) : row?.[column.key];
    if (column.type === 'number' || column.type === 'money') {
      if (column.preserveBlank && (value === '' || value === null || value === undefined)) return '';
      return toNumber(value);
    }
    if (column.type === 'date') return sanitizeExcelValue(formatDate(value));
    return sanitizeExcelValue(value);
  }));
  appendAoaSheet(workbook, name, [headers, ...values], {
    autoFilter: options.autoFilter !== false,
    widths: columns.map((column) => column.width || 16)
  });
}

function appendFilterSheet(workbook, title, filters = {}, extra = {}) {
  const rows = [
    ['Tên dữ liệu', title],
    ['Thời điểm xuất', new Date().toLocaleString('vi-VN')],
    ...Object.entries(filters || {}).filter(([, value]) => value !== '' && value !== undefined && value !== null)
      .map(([key, value]) => [key, sanitizeExcelValue(Array.isArray(value) ? value.join(', ') : value)]),
    ...Object.entries(extra || {}).map(([key, value]) => [key, sanitizeExcelValue(value)])
  ];
  appendAoaSheet(workbook, 'ThongTin', rows, { widths: [28, 55] });
}


function sourceNoteText(value) {
  if (Array.isArray(value)) return value.join(', ');
  if (value && typeof value === 'object') return JSON.stringify(value);
  return sanitizeExcelValue(value ?? '');
}

function appendReportSourceNoteSheet(workbook, sourceNote = {}) {
  const rows = [
    ['Trường', 'Giá trị'],
    ['Mã báo cáo', sourceNote.reportCode || ''],
    ['Tên báo cáo', sourceNote.reportTitle || ''],
    ['Service', [sourceNote.service, sourceNote.serviceMethod].filter(Boolean).join('.')],
    ['Endpoint xem', sourceNote.runEndpoint || ''],
    ['Endpoint export', sourceNote.exportEndpoint || '/api/excel/export'],
    ['Export mode', sourceNote.exportMode || 'report-center'],
    ['Xem và xuất cùng nguồn', sourceNote.viewAndExportSameSource ? 'Có' : 'Không'],
    ['Nguồn chính', sourceNoteText(sourceNote.primaryCollections)],
    ['Nguồn phụ', sourceNoteText(sourceNote.secondaryCollections)],
    ['Nguồn bị cấm', sourceNoteText(sourceNote.forbiddenCollections)],
    ['Quy tắc SSoT', sourceNote.ssotRule || sourceNote.sourceLabel || ''],
    ['Nguồn amount', sourceNote.amountSource || ''],
    ['Nguồn công nợ', sourceNote.debtSource || ''],
    ['Nguồn tồn kho', sourceNote.inventorySource || ''],
    ['Nguồn quỹ', sourceNote.fundSource || ''],
    ['Nguồn giao hàng', sourceNote.deliverySource || ''],
    ['Bộ lọc', sourceNoteText(sourceNote.filters || {})],
    ['Từ ngày', sourceNote.dateFrom || ''],
    ['Đến ngày', sourceNote.dateTo || ''],
    ['Ngày as-of', sourceNote.asOfDate || ''],
    ['Sinh lúc', sourceNote.generatedAt || new Date().toISOString()],
    ['Người xuất', sourceNote.generatedBy || 'system'],
    ['Trạng thái nguồn', sourceNote.sourceStatus || 'OK'],
    ['Cảnh báo nguồn', sourceNoteText(sourceNote.sourceWarnings)],
    ['Cảnh báo dữ liệu', sourceNoteText(sourceNote.dataQualityWarnings)]
  ];
  appendAoaSheet(workbook, 'THÔNG TIN NGUỒN', rows, { widths: [28, 90] });
}

const SALES_COLUMNS = [
  { label: 'Mã đơn', value: (row) => firstValue(row, ['code', 'id', 'orderCode', 'documentCode']), width: 20 },
  { label: 'Ngày bán', value: (row) => firstValue(row, ['orderDate', 'date', 'documentDate', 'createdAt']), type: 'date', width: 14 },
  { label: 'Mã khách hàng', value: (row) => row.customerCode, width: 16 },
  { label: 'Khách hàng', value: (row) => row.customerName, width: 32 },
  { label: 'Mã NVBH', value: salesStaffCode, width: 14 },
  { label: 'NV bán hàng', value: salesStaffName, width: 28 },
  { label: 'Mã NVGH', value: deliveryStaffCode, width: 14 },
  { label: 'NV giao hàng', value: deliveryStaffName, width: 28 },
  { label: 'Nguồn', value: sourceText, width: 14 },
  { label: 'Giá trị', value: (row) => firstValue(row, ['totalAmount', 'amount', 'total'], 0), type: 'money', width: 18 },
  { label: 'Đã thu', value: (row) => row.paidAmount, type: 'money', width: 18 },
  { label: 'Công nợ', value: (row) => row.debtAmount, type: 'money', width: 18 },
  { label: 'Đơn tổng', value: (row) => firstValue(row, ['masterOrderCode', 'masterOrderId']), width: 20 },
  { label: 'Trạng thái', value: statusText, width: 18 },
  { label: 'Xuất VAT', value: (row) => row.vatInvoiceRequired !== false, width: 12 },
  { label: 'Ghi chú', value: (row) => firstValue(row, ['note', 'remark', 'description']), width: 38 }
];

const SALES_ITEM_COLUMNS = [
  { label: 'Mã đơn', key: 'orderCode', width: 20 },
  { label: 'Ngày bán', key: 'orderDate', type: 'date', width: 14 },
  { label: 'Mã khách hàng', key: 'customerCode', width: 16 },
  { label: 'Khách hàng', key: 'customerName', width: 30 },
  { label: 'Mã NVBH', key: 'salesStaffCode', width: 14 },
  { label: 'Mã SP', key: 'productCode', width: 16 },
  { label: 'Tên sản phẩm', key: 'productName', width: 45 },
  { label: 'Quy cách', key: 'catalogPackingQty', type: 'number', preserveBlank: true, width: 12 },
  { label: 'Thùng', key: 'cartonQty', type: 'number', width: 10 },
  { label: 'Lẻ', key: 'unitQty', type: 'number', width: 10 },
  { label: 'Tổng lẻ', key: 'baseQty', type: 'number', width: 12 },
  { label: 'Giá bán', key: 'catalogSalePrice', type: 'money', preserveBlank: true, width: 16 },
  // Đơn con bắt buộc giữ giá giao dịch sau khuyến mại bên cạnh giá bán danh mục.
  { label: 'Giá sau KM', key: 'finalPrice', type: 'money', width: 16 },
  { label: 'Khuyến mại', key: 'promotionValue', type: 'money', width: 16 },
  { label: 'Thành tiền', key: 'amount', type: 'money', width: 18 }
];

function catalogLineMeta(item = {}, productMap = null) {
  if (productMap instanceof Map) return ProductExcelEnrichmentService.catalogMeta(productMap, item);
  return {
    found: false,
    product: null,
    packingQty: itemConversionRate(item),
    salePrice: itemPrice(item, 'sale')
  };
}

function currentPickingZoneLabel(item = {}, product = {}) {
  return pickingZoneLabel(getCurrentPickingZone(item, product || {}, 'HC'));
}

function salesItemRows(orders = [], productMap = null) {
  return orders.flatMap((order) => orderItems(order).map((item) => {
    const catalog = catalogLineMeta(item, productMap);
    const transactionSalePrice = itemPrice(item, 'sale');
    const calculationSalePrice = catalog.salePrice === '' ? transactionSalePrice : toNumber(catalog.salePrice);
    const finalPrice = toNumber(firstValue(item, ['finalPrice', 'discountedPrice', 'netPrice'], transactionSalePrice || calculationSalePrice));
    const baseQty = itemBaseQty(item);
    return {
      orderCode: firstValue(order, ['code', 'id', 'orderCode', 'documentCode']),
      orderDate: firstValue(order, ['orderDate', 'date', 'documentDate']),
      customerCode: order.customerCode,
      customerName: order.customerName,
      salesStaffCode: salesStaffCode(order),
      productCode: itemProductCode(item),
      productName: itemProductName(item),
      catalogPackingQty: catalog.packingQty,
      cartonQty: itemCaseQty(item),
      unitQty: itemLooseQty(item),
      baseQty,
      catalogSalePrice: catalog.salePrice,
      finalPrice,
      promotionValue: Math.max(0, (calculationSalePrice - finalPrice) * baseQty),
      amount: itemAmount(item, 'sale') || finalPrice * baseQty
    };
  }));
}

async function hydrateSalesOrders(rows = []) {
  const list = Array.isArray(rows) ? rows : [];
  const ids = list.map(rowIdentity).filter(Boolean);
  if (!ids.length) return list;
  const fullRows = [];
  for (let offset = 0; offset < ids.length; offset += 500) {
    const batchIds = ids.slice(offset, offset + 500);
    const batch = await orderRepository.findManyByIdentity(batchIds, { limit: batchIds.length });
    fullRows.push(...batch);
  }
  const fullMap = new Map();
  for (const row of fullRows) {
    [row.id, row.code, row.orderCode, row.documentCode, row.salesOrderCode, row._id]
      .map(cleanText).filter(Boolean).forEach(key => fullMap.set(key, row));
  }
  return list.map(row => fullMap.get(rowIdentity(row)) || row);
}

async function loadSalesOrders({ scope, selectedIds, filters, maxRows }) {
  if (scope === 'SELECTED' || scope === 'PAGE') {
    const ids = uniqueStrings(selectedIds);
    const rows = ids.length ? await orderRepository.findManyByIdentity(ids, { limit: ids.length }) : [];
    const orderMap = new Map();
    rows.forEach(row => [row.id, row.code, row.orderCode, row.documentCode, row.salesOrderCode, row._id]
      .map(cleanText).filter(Boolean).forEach(key => orderMap.set(key, row)));
    return ids.map(id => orderMap.get(id)).filter(Boolean);
  }
  const listed = await orderService.listOrders({
    ...(filters || {}),
    page: 1,
    limit: maxRows,
    __internalMaxLimit: maxRows
  });
  return hydrateSalesOrders(listed);
}

async function exportSalesOrders(params = {}) {
  const scope = normalizeScope(params.scope);
  const maxRows = safeLimit(params.maxRows);
  const orders = (await loadSalesOrders({
    scope,
    selectedIds: params.selectedIds,
    filters: params.filters,
    maxRows
  })).slice(0, maxRows);
  const workbook = createWorkbook();
  appendFilterSheet(workbook, 'Đơn con', params.filters, { 'Phạm vi': scope, 'Số đơn': orders.length });
  appendObjectSheet(workbook, 'DanhSachDon', SALES_COLUMNS, orders);
  if (params.includeDetails !== false) {
    const productMap = await ProductExcelEnrichmentService.loadProductMapForRows(
      ProductExcelEnrichmentService.documentProductLines(orders)
    );
    appendObjectSheet(workbook, 'ChiTietSanPham', SALES_ITEM_COLUMNS, salesItemRows(orders, productMap));
  }
  return {
    buffer: writeWorkbook(workbook),
    rowCount: orders.length,
    fileName: `Don_con_${dateUtil.todayVN()}.xlsx`
  };
}

const MASTER_COLUMNS = [
  { label: 'Mã đơn tổng', value: (row) => firstValue(row, ['code', 'id']), width: 20 },
  { label: 'Ngày tạo', value: (row) => firstValue(row, ['masterOrderDate', 'date', 'createdAt']), type: 'date', width: 14 },
  { label: 'Ngày giao', value: (row) => row.deliveryDate, type: 'date', width: 14 },
  { label: 'Mã NVGH', value: deliveryStaffCode, width: 14 },
  { label: 'NV giao hàng', value: deliveryStaffName, width: 28 },
  { label: 'Tuyến / khu vực', value: (row) => row.routeName, width: 28 },
  { label: 'Số đơn con', value: (row) => (Array.isArray(row.children) ? row.children.length : (row.childOrderIds || []).length), type: 'number', width: 12 },
  { label: 'Tổng tiền', value: (row) => row.totalAmount, type: 'money', width: 18 },
  { label: 'Trạng thái', value: statusText, width: 18 },
  { label: 'Ghi chú', value: (row) => firstValue(row, ['note', 'deliveryNote', 'remark', 'description']), width: 38 }
];

function masterChildRows(masters = []) {
  return masters.flatMap((master) => (Array.isArray(master.children) ? master.children : []).map((order) => ({
    masterOrderCode: firstValue(master, ['code', 'id']),
    orderCode: firstValue(order, ['code', 'id', 'orderCode']),
    orderDate: firstValue(order, ['orderDate', 'date']),
    customerCode: order.customerCode,
    customerName: order.customerName,
    salesStaffCode: salesStaffCode(order),
    salesStaffName: salesStaffName(order),
    amount: firstValue(order, ['totalAmount', 'amount', 'total'], 0),
    status: statusText(order)
  })));
}

const MASTER_CHILD_COLUMNS = [
  { label: 'Mã đơn tổng', key: 'masterOrderCode', width: 20 },
  { label: 'Mã đơn con', key: 'orderCode', width: 20 },
  { label: 'Ngày bán', key: 'orderDate', type: 'date', width: 14 },
  { label: 'Mã KH', key: 'customerCode', width: 16 },
  { label: 'Khách hàng', key: 'customerName', width: 30 },
  { label: 'Mã NVBH', key: 'salesStaffCode', width: 14 },
  { label: 'NV bán hàng', key: 'salesStaffName', width: 26 },
  { label: 'Giá trị', key: 'amount', type: 'money', width: 18 },
  { label: 'Trạng thái', key: 'status', width: 18 }
];

function masterItemRows(masters = [], productMap = null) {
  return masters.flatMap((master) => {
    const masterOrderCode = firstValue(master, ['code', 'id']);
    return (Array.isArray(master.children) ? master.children : []).flatMap((order) =>
      orderItems(order).map((item) => {
        const catalog = catalogLineMeta(item, productMap);
        return {
          masterOrderCode,
          orderCode: firstValue(order, ['code', 'id', 'orderCode']),
          productCode: itemProductCode(item),
          productName: itemProductName(item),
          pickingZone: currentPickingZoneLabel(item, catalog.product),
          catalogPackingQty: catalog.packingQty,
          cartonQty: itemCaseQty(item),
          unitQty: itemLooseQty(item),
          baseQty: itemBaseQty(item),
          catalogSalePrice: catalog.salePrice,
          amount: itemAmount(item, 'sale')
        };
      })
    ).sort((a, b) => compareProductNameAsc(a, b)
      || String(a.orderCode || '').localeCompare(String(b.orderCode || ''), 'vi', { numeric: true }));
  });
}

const MASTER_ITEM_COLUMNS = [
  { label: 'Mã đơn tổng', key: 'masterOrderCode', width: 20 },
  { label: 'Mã đơn con', key: 'orderCode', width: 20 },
  { label: 'Mã SP', key: 'productCode', width: 16 },
  { label: 'Tên sản phẩm', key: 'productName', width: 45 },
  { label: 'Khu bốc', key: 'pickingZone', width: 10 },
  { label: 'Quy cách', key: 'catalogPackingQty', type: 'number', preserveBlank: true, width: 12 },
  { label: 'Thùng', key: 'cartonQty', type: 'number', width: 10 },
  { label: 'Lẻ', key: 'unitQty', type: 'number', width: 10 },
  { label: 'Tổng lẻ', key: 'baseQty', type: 'number', width: 12 },
  { label: 'Giá bán', key: 'catalogSalePrice', type: 'money', preserveBlank: true, width: 16 },
  { label: 'Thành tiền', key: 'amount', type: 'money', width: 18 }
];

async function loadMasterOrders(params = {}) {
  const scope = normalizeScope(params.scope);
  const ids = uniqueStrings(params.selectedIds);
  if (scope === 'SELECTED' || scope === 'PAGE') {
    return masterOrderService.getMasterOrders(ids, { batchSize: 250, childBatchSize: 250 });
  }
  const rows = [];
  const maxRows = safeLimit(params.maxRows, 5000);
  for (let page = 1; rows.length < maxRows; page += 1) {
    const batch = await masterOrderService.listMasterOrders({ ...(params.filters || {}), page, limit: 100 });
    if (!batch.length) break;
    rows.push(...batch);
    if (batch.length < 100) break;
  }
  return rows.slice(0, maxRows);
}

async function exportMasterOrders(params = {}) {
  const scope = normalizeScope(params.scope);
  const masters = await loadMasterOrders(params);
  const workbook = createWorkbook();
  appendFilterSheet(workbook, 'Đơn tổng', params.filters, { 'Phạm vi': scope, 'Số đơn tổng': masters.length });
  appendObjectSheet(workbook, 'DonTong', MASTER_COLUMNS, masters);
  if (params.includeDetails !== false) {
    appendObjectSheet(workbook, 'DonCon', MASTER_CHILD_COLUMNS, masterChildRows(masters));
    const productLines = masters.flatMap((master) =>
      ProductExcelEnrichmentService.documentProductLines(Array.isArray(master.children) ? master.children : [])
    );
    const productMap = await ProductExcelEnrichmentService.loadProductMapForRows(productLines);
    appendObjectSheet(workbook, 'SanPham', MASTER_ITEM_COLUMNS, masterItemRows(masters, productMap));
  }
  return {
    buffer: writeWorkbook(workbook),
    rowCount: masters.length,
    fileName: `Don_tong_${dateUtil.todayVN()}.xlsx`
  };
}

const IMPORT_ORDER_COLUMNS = [
  { label: 'Mã phiếu', value: (row) => firstValue(row, ['code', 'id']), width: 20 },
  { label: 'Ngày nhập', value: (row) => firstValue(row, ['date', 'documentDate', 'importDate', 'createdAt']), type: 'date', width: 14 },
  { label: 'Nhà cung cấp', value: (row) => firstValue(row, ['supplier', 'supplierName']), width: 30 },
  { label: 'Kho', value: (row) => firstValue(row, ['warehouseCode', 'warehouseName']), width: 16 },
  { label: 'Số dòng', value: (row) => (row.items || []).length, type: 'number', width: 10 },
  { label: 'Tổng SL', value: (row) => row.totalQuantity, type: 'number', width: 14 },
  { label: 'Tổng tiền', value: (row) => row.totalAmount, type: 'money', width: 18 },
  { label: 'Trạng thái', value: statusText, width: 16 },
  { label: 'Ghi chú', value: (row) => row.note, width: 38 }
];

const IMPORT_ORDER_ITEM_COLUMNS = [
  { label: 'Mã phiếu', key: 'importOrderCode', width: 20 },
  { label: 'Ngày nhập', key: 'date', type: 'date', width: 14 },
  { label: 'Mã SP', key: 'productCode', width: 16 },
  { label: 'Tên sản phẩm', key: 'productName', width: 45 },
  { label: 'Khu bốc', key: 'pickingZone', width: 10 },
  { label: 'Quy cách', key: 'catalogPackingQty', type: 'number', preserveBlank: true, width: 12 },
  { label: 'Thùng', key: 'cartonQty', type: 'number', width: 10 },
  { label: 'Lẻ', key: 'unitQty', type: 'number', width: 10 },
  { label: 'Tổng lẻ', key: 'baseQty', type: 'number', width: 12 },
  { label: 'Giá bán', key: 'catalogSalePrice', type: 'money', preserveBlank: true, width: 16 },
  { label: 'Giá nhập', key: 'costPrice', type: 'money', width: 16 },
  { label: 'Thành tiền', key: 'amount', type: 'money', width: 18 }
];

function importOrderItemRows(orders = [], productMap = null) {
  return orders.flatMap((order) => orderItems(order).map((item) => {
    const catalog = catalogLineMeta(item, productMap);
    return {
      importOrderCode: firstValue(order, ['code', 'id']),
      date: firstValue(order, ['date', 'documentDate', 'importDate']),
      productCode: itemProductCode(item),
      productName: itemProductName(item),
      pickingZone: currentPickingZoneLabel(item, catalog.product),
      catalogPackingQty: catalog.packingQty,
      cartonQty: itemCaseQty(item),
      unitQty: itemLooseQty(item),
      baseQty: itemBaseQty(item),
      catalogSalePrice: catalog.salePrice,
      costPrice: itemPrice(item, 'cost'),
      amount: itemAmount(item, 'cost')
    };
  }));
}

async function loadImportOrders(params = {}) {
  const scope = normalizeScope(params.scope);
  const ids = uniqueStrings(params.selectedIds);
  if (scope === 'SELECTED' || scope === 'PAGE') {
    if (!ids.length) return [];
    const rows = await importOrderRepository.findAll({
      $or: [{ id: { $in: ids } }, { code: { $in: ids } }]
    }, { limit: ids.length, sort: { createdAt: -1, code: -1 } });
    return rows.map((row) => importOrderService.toClient(row));
  }
  const rows = [];
  const maxRows = safeLimit(params.maxRows, 5000);
  for (let page = 1; rows.length < maxRows; page += 1) {
    const batch = await importOrderService.listImportOrders({ ...(params.filters || {}), page, limit: 100 });
    if (!batch.length) break;
    rows.push(...batch);
    if (batch.length < 100) break;
  }
  return rows.slice(0, maxRows);
}

async function exportImportOrders(params = {}) {
  const scope = normalizeScope(params.scope);
  const orders = await loadImportOrders(params);
  const workbook = createWorkbook();
  appendFilterSheet(workbook, 'Phiếu nhập', params.filters, { 'Phạm vi': scope, 'Số phiếu': orders.length });
  appendObjectSheet(workbook, 'PhieuNhap', IMPORT_ORDER_COLUMNS, orders);
  if (params.includeDetails !== false) {
    const productMap = await ProductExcelEnrichmentService.loadProductMapForRows(
      ProductExcelEnrichmentService.documentProductLines(orders)
    );
    appendObjectSheet(workbook, 'ChiTietHangNhap', IMPORT_ORDER_ITEM_COLUMNS, importOrderItemRows(orders, productMap));
  }
  return {
    buffer: writeWorkbook(workbook),
    rowCount: orders.length,
    fileName: `Phieu_nhap_${dateUtil.todayVN()}.xlsx`
  };
}

function collectDynamicKeys(rows = []) {
  const priority = ['rowNo', 'documentCode', 'code', 'statusText', 'valid', 'canImport'];
  const keys = new Set(priority);
  for (const row of rows.slice(0, 500)) {
    Object.keys(row || {}).forEach((key) => {
      if (!['raw', '__importRows', '__adjustedRows', 'lineDetails', 'shortageReport'].includes(key)) keys.add(key);
    });
  }
  return [...keys].filter((key) => rows.some((row) => row?.[key] !== undefined));
}

async function loadImportSessionRows(sessionId) {
  const session = await importSessionService.getSession(sessionId);
  if (!session) {
    const error = new Error('Không tìm thấy phiên import để xuất Excel');
    error.status = 404;
    error.code = 'IMPORT_SESSION_NOT_FOUND';
    throw error;
  }
  const rows = [];
  for (let offset = 0; offset < Number(session.totalRows || DEFAULT_MAX_EXPORT_ROWS); offset += 1000) {
    const page = await importSessionService.listSessionRows(sessionId, { offset, limit: 1000 });
    if (!page || !page.rows.length) break;
    rows.push(...page.rows);
    if (!page.hasMore || rows.length >= DEFAULT_MAX_EXPORT_ROWS) break;
  }
  return { session, rows: rows.slice(0, DEFAULT_MAX_EXPORT_ROWS) };
}

function ensureProductCatalogColumns(columns = [], hasProducts = false) {
  if (!hasProducts) return columns;
  const output = columns.map((column) => ({ ...column }));
  const packingIndex = output.findIndex((column) => cleanText(column.label).toLowerCase() === 'quy cách');
  const salePriceIndex = output.findIndex((column) => cleanText(column.label).toLowerCase() === 'giá bán');
  const packingColumn = { label: 'Quy cách', key: 'catalogPackingQty', type: 'number', preserveBlank: true, width: 12 };
  const salePriceColumn = { label: 'Giá bán', key: 'catalogSalePrice', type: 'money', preserveBlank: true, width: 16 };
  if (packingIndex >= 0) output[packingIndex] = packingColumn;
  else output.push(packingColumn);
  if (salePriceIndex >= 0) output[salePriceIndex] = salePriceColumn;
  else output.push(salePriceColumn);
  return output;
}

async function enrichProductRows(rows = []) {
  return ProductExcelEnrichmentService.enrichRows(rows, {
    packingKey: 'catalogPackingQty',
    salePriceKey: 'catalogSalePrice'
  });
}

async function exportImportPreview(params = {}) {
  const sessionId = cleanText(params.sessionId);
  const { session, rows: allRows } = await loadImportSessionRows(sessionId);
  const selectedRowNumbers = new Set(uniqueStrings(params.selectedRowNumbers, DEFAULT_MAX_EXPORT_ROWS).map(Number));
  const rows = selectedRowNumbers.size
    ? allRows.filter((row) => selectedRowNumbers.has(Number(row.rowNo || row.__rowNo)))
    : allRows;
  const enrichedAll = await enrichProductRows(rows);
  const validRows = [];
  const invalidRows = [];
  for (const row of enrichedAll.rows) {
    if (row.valid !== false && (!Array.isArray(row.errors) || row.errors.length === 0)) validRows.push(row);
    else invalidRows.push(row);
  }
  const keys = collectDynamicKeys(enrichedAll.rows);
  const columns = ensureProductCatalogColumns(
    keys.filter((key) => !['catalogPackingQty', 'catalogSalePrice'].includes(key))
      .map((key) => ({ label: key, key, width: key.length > 20 ? 35 : 18 })),
    enrichedAll.hasProducts
  );
  const infoRows = [
    ['Tên dữ liệu', 'Kết quả import'],
    ['Thời điểm xuất', new Date().toLocaleString('vi-VN')],
    ['sessionId', sanitizeExcelValue(sessionId)],
    ['type', sanitizeExcelValue(session.type)],
    ['importMode', sanitizeExcelValue(session.importMode)],
    ['fileName', sanitizeExcelValue(session.fileName)],
    ['Tổng dòng xuất', rows.length],
    ['Hợp lệ', validRows.length],
    ['Lỗi', invalidRows.length]
  ];
  const streamed = await ImportPreviewStreamingWorkbook.writeImportPreviewWorkbook({
    infoRows,
    columns,
    allRows: enrichedAll.rows,
    validRows,
    invalidRows
  });
  return {
    filePath: streamed.filePath,
    outputBytes: streamed.outputBytes,
    streaming: true,
    rowCount: rows.length,
    fileName: `Ket_qua_import_${session.type || 'data'}_${dateUtil.todayVN()}.xlsx`
  };
}

async function exportReport(params = {}, user = {}) {
  const code = cleanText(params.reportCode);
  if (!code) {
    const error = new Error('Thiếu mã báo cáo');
    error.status = 400;
    throw error;
  }
  const scope = normalizeScope(params.scope);
  const filters = { ...(params.filters || {}) };
  let payload;
  if (scope === 'FILTERED') {
    payload = await ReportCenterService.run(code, { ...filters, __exportAll: true }, user);
  } else {
    payload = await ReportCenterService.run(code, {
      ...filters,
      page: Number(params.page || filters.page || 1),
      limit: Number(params.limit || filters.limit || 200)
    }, user);
    const indexes = uniqueStrings(params.rowIndexes, 200).map(Number).filter((value) => Number.isInteger(value) && value >= 0);
    if (indexes.length) payload.rows = indexes.map((index) => payload.rows?.[index]).filter(Boolean);
  }
  const definition = payload.definition || ReportCenterService.assertAccess(code, user);
  const productEnrichment = await enrichProductRows(payload.rows || []);
  const columns = ensureProductCatalogColumns((definition.columns || []).map((column) => ({
    label: column.label,
    key: column.key,
    type: ['money', 'number'].includes(column.type) ? column.type : (column.type === 'date' ? 'date' : 'text'),
    width: column.type === 'money' ? 18 : 22
  })), productEnrichment.hasProducts);
  const workbook = createWorkbook();
  const sourceNote = payload.sourceNote || {};
  appendReportSourceNoteSheet(workbook, sourceNote);
  appendFilterSheet(workbook, definition.title || code, filters, {
    'Phạm vi': scope,
    'Nguồn': payload.source || '',
    'Mã báo cáo': sourceNote.reportCode || code,
    'Service': [sourceNote.service, sourceNote.serviceMethod].filter(Boolean).join('.'),
    'Trạng thái nguồn': sourceNote.sourceStatus || 'OK',
    'Xem và xuất cùng nguồn': sourceNote.viewAndExportSameSource ? 'Có' : 'Không',
    'Số dòng': (payload.rows || []).length
  });
  appendObjectSheet(workbook, 'BaoCao', columns, productEnrichment.rows);
  const summaryRows = Object.entries(payload.summary || {}).map(([key, value]) => [key, sanitizeExcelValue(value)]);
  if (summaryRows.length) appendAoaSheet(workbook, 'TongHop', [['Chỉ số', 'Giá trị'], ...summaryRows], { widths: [35, 24] });
  return {
    buffer: writeWorkbook(workbook),
    rowCount: (payload.rows || []).length,
    fileName: `${String(definition.title || code).replace(/[^\p{L}\p{N}]+/gu, '_')}_${dateUtil.todayVN()}.xlsx`
  };
}

async function resolveProducts(codes = []) {
  const values = uniqueStrings(codes, MAX_RESOLVE_CODES);
  const rows = await productRepository.findByCodes(values);
  const canonicalCodes = (rows || [])
    .map((row) => cleanText(row.code || row.productCode || row.sku || row.id || row._id))
    .filter(Boolean);
  const stockMap = await inventoryStockService.getAvailableStocks(canonicalCodes);
  const foundKeys = new Set();

  const products = (rows || []).map((row) => {
    const code = cleanText(row.code || row.productCode || row.sku);
    const productCode = cleanText(row.productCode || row.code || row.sku);
    const sku = cleanText(row.sku || code);
    const barcode = cleanText(row.barcode);
    const normalizedCode = inventoryStockService.normalizeProductCode(code || productCode || sku);
    const availableQty = toNumber(stockMap[normalizedCode] ?? stockMap[code] ?? stockMap[productCode] ?? 0);
    const conversionRate = Math.max(1, toNumber(row.conversionRate) || 1);
    const displayQty = Math.max(0, availableQty);
    const stockCase = Math.floor(displayQty / conversionRate);
    const stockLoose = displayQty % conversionRate;

    [row.code, row.sku, row.productCode, row.barcode, row.id, row._id]
      .map((key) => inventoryStockService.normalizeProductCode(key))
      .filter(Boolean)
      .forEach((key) => foundKeys.add(key));

    return {
      id: cleanText(row.id || row._id || code),
      code,
      productCode,
      sku,
      barcode,
      name: cleanText(row.name || row.productName),
      productName: cleanText(row.productName || row.name),
      unit: cleanText(row.unit || row.baseUnit),
      baseUnit: cleanText(row.baseUnit || row.unit),
      conversionRate,
      packingQty: conversionRate,
      unitsPerCase: conversionRate,
      packing: cleanText(row.packing),
      salePrice: toNumber(row.salePrice),
      costPrice: toNumber(row.costPrice),
      pickingZone: cleanText(row.pickingZone || row.warehouseCode),
      isActive: row.isActive !== false,

      // Cùng contract tồn mở bán với tìm kiếm sản phẩm thông thường.
      // Không đọc tồn từ products vì products chỉ là danh mục.
      availableQty,
      availableStock: availableQty,
      stockQuantity: availableQty,
      openSaleQty: availableQty,
      stock: availableQty,
      quantity: availableQty,
      qty: availableQty,
      stockCase,
      stockLoose,
      stockDisplay: `${stockCase}/${stockLoose}`,
      isOutOfStock: availableQty <= 0,
      inventorySource: 'inventories'
    };
  });

  return {
    products,
    missingCodes: values.filter((code) => !foundKeys.has(inventoryStockService.normalizeProductCode(code)))
  };
}

async function exportWorkbook(params = {}, user = {}) {
  const type = cleanText(params.type).toUpperCase();
  let result;
  switch (type) {
    case 'SALES_ORDERS': result = await exportSalesOrders(params); break;
    case 'MASTER_ORDERS': result = await exportMasterOrders(params); break;
    case 'IMPORT_ORDERS': result = await exportImportOrders(params); break;
    case 'IMPORT_PREVIEW': result = await exportImportPreview(params); break;
    case 'REPORT': result = await exportReport(params, user); break;
    default: {
      const error = new Error('Loại xuất Excel không được hỗ trợ');
      error.status = 400;
      error.code = 'EXCEL_EXPORT_TYPE_NOT_SUPPORTED';
      throw error;
    }
  }
  auditService.log('EXPORT_EXCEL_CONTEXT', {
    refType: type,
    refId: cleanText(params.sessionId || params.reportCode || ''),
    refCode: cleanText(params.reportCode || params.sessionId || ''),
    userName: cleanText(user.username || user.fullName || user.name || ''),
    summary: {
      type,
      scope: normalizeScope(params.scope),
      rowCount: result.rowCount,
      includeDetails: params.includeDetails !== false
    }
  }).catch(() => {});
  return result;
}

module.exports = {
  DEFAULT_MAX_EXPORT_ROWS,
  sanitizeExcelValue,
  appendObjectSheet,
  exportWorkbook,
  resolveProducts,
  _internal: {
    hydrateSalesOrders,
    salesItemRows,
    masterChildRows,
    masterItemRows,
    importOrderItemRows,
    ensureProductCatalogColumns,
    enrichProductRows,
    loadMasterOrders,
    normalizeScope,
    uniqueStrings
  }
};
