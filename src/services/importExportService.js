'use strict';

const dateUtil = require('../utils/date.util');
const XLSX = require('xlsx');
const excelImportService = require('./excelImportService');
const importTemplateService = require('./importTemplateService');
const exportRepository = require('../repositories/exportRepository');
const SalesOrder = require('../models/SalesOrder');
const ReturnOrder = require('../models/ReturnOrder');
const Customer = require('../models/Customer');
const Product = require('../models/Product');

function stripMongoFields(row = {}) {
  const plain = { ...row };
  delete plain._id;
  delete plain.__v;
  return plain;
}

function flattenValue(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value) || typeof value === 'object') return JSON.stringify(value);
  return value;
}

function rowsToSheetRows(rows = []) {
  const plainRows = rows.map(stripMongoFields);
  const headerSet = new Set();
  plainRows.forEach((row) => Object.keys(row).forEach((key) => headerSet.add(key)));
  const headers = Array.from(headerSet);
  const body = plainRows.map((row) => headers.map((header) => flattenValue(row[header])));
  return { headers, body };
}

function buildWorkbook({ type, rows }) {
  const { headers, body } = rowsToSheetRows(rows);
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...body]);
  sheet['!cols'] = headers.map((header) => ({ wch: Math.max(12, String(header).length + 4) }));
  XLSX.utils.book_append_sheet(workbook, sheet, 'Export');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Loại dữ liệu', type],
    ['Số dòng', rows.length],
    ['Thời gian xuất', new Date().toISOString()]
  ]), 'ThongTin');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}


const TT78_VAT_RATE = 0.08;
const TT78_HEADERS = [
  'STT', 'NgayHoaDon', 'MaKhachHang', 'TenKhachHang', 'TenNguoiMua', 'MaSoThue',
  'DiaChiKhachHang', 'DienThoaiKhachHang', 'SoTaiKhoan', 'NganHang', 'HinhThucTT',
  'MaSanPham', 'SanPham', 'DonViTinh', 'Extra1SP', 'Extra2SP', 'SoLuong', 'DonGia',
  'TyLeChietKhauHienThi', 'SoTienChietKhau', 'ThanhTien', 'TienBan', 'ThueSuat',
  'TienThueSanPham', 'TienThue', 'TongCong', 'TinhChatHangHoa', 'DonViTienTe',
  'TyGia', 'Fkey', 'Extra1', 'Extra2', 'EmailKhachHang', 'VungDuLieu', 'Extra3',
  'Extra4', 'Extra5', 'Extra6', 'Extra7', 'Extra8', 'Extra9', 'Extra10', 'Extra11',
  'Extra12', 'LOONo', 'HDSe', 'xVTNXHan', 'NVChuan', 'PTChuyenKhoan', 'HDKTTu', 'CCCDan'
];

function cleanText(value) {
  return String(value ?? '').trim();
}

function toNumber(value, fallback = 0) {
  const n = Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : fallback;
}

function roundMoney(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(toNumber(value) * factor) / factor;
}

function normalizeDateOnly(value) {
  return dateUtil.toDateOnly(value || '') || cleanText(value).slice(0, 10);
}

function dateInRange(value, query = {}) {
  const date = normalizeDateOnly(value);
  const from = normalizeDateOnly(query.dateFrom || query.from || query.fromDate || '');
  const to = normalizeDateOnly(query.dateTo || query.to || query.toDate || '');
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

function isActiveDoc(row = {}) {
  const status = cleanText(row.status || row.deliveryStatus || row.lifecycleStatus).toLowerCase();
  return !['void', 'cancelled', 'canceled', 'deleted', 'removed'].includes(status);
}

function orderIdValues(order = {}) {
  return [
    order.id, order._id, order.code, order.orderCode, order.documentCode, order.salesOrderId,
    order.salesOrderCode, order.externalOrderCode, order.invoiceCode, order.refCode
  ].map(cleanText).filter(Boolean);
}

function orderCode(order = {}) {
  return cleanText(order.code || order.orderCode || order.salesOrderCode || order.documentCode || order.id || order._id);
}

function productCodeOf(item = {}) {
  return cleanText(item.productCode || item.code || item.sku || item.barcode || item.productId || item.id);
}

function productNameOf(item = {}) {
  return cleanText(item.productName || item.name || item.itemName || item.productTitle || '');
}

function unitOf(item = {}, product = {}) {
  return cleanText(item.unit || item.baseUnit || item.dvt || item.uom || product.unit || product.baseUnit || '');
}

function qtyOf(item = {}) {
  return toNumber(item.quantity ?? item.qty ?? item.totalQty ?? item.qtySale ?? item.saleQty ?? 0);
}

function returnQtyOf(item = {}) {
  return toNumber(
    item.returnQty
    ?? item.qtyReturn
    ?? item.returnQuantity
    ?? item.returnedQty
    ?? 0
  );
}

function lineKeyOf(item = {}) {
  return cleanText(
    item.lineKey
    || item.orderLineId
    || item.salesOrderItemId
    || item.itemId
    || item._id
    || ''
  );
}

function priceInclVatOf(item = {}) {
  return toNumber(
    item.finalPrice ?? item.priceAfterPromotion ?? item.promoPrice ?? item.price ?? item.salePrice ?? item.unitPrice ?? item.sellPrice ?? 0
  );
}

function amountInclVatOf(item = {}) {
  const explicit = toNumber(item.amount ?? item.totalAmount ?? item.lineAmount ?? item.money ?? 0);
  return explicit || qtyOf(item) * priceInclVatOf(item);
}

function makeKey(orderKey, productKey) {
  return `${cleanText(orderKey)}@@${cleanText(productKey)}`;
}

function priceKeyOf(item = {}) {
  const price = priceInclVatOf(item);
  return price ? String(roundMoney(price, 6)) : '';
}

function makeReturnKey(orderKey, productKey, lineKey = '', price = '') {
  return [
    cleanText(orderKey),
    cleanText(productKey),
    cleanText(lineKey),
    cleanText(price)
  ].join('@@');
}

function addReturnQty(map, key, qty) {
  if (!key || !qty) return;
  map.set(key, toNumber(map.get(key)) + qty);
}

function buildReturnQtyMap(returnOrders = []) {
  const map = new Map();
  for (const ro of returnOrders || []) {
    if (!isActiveDoc(ro)) continue;
    const roKeys = [
      ro.salesOrderId, ro.orderId, ro.sourceOrderId, ro.deliveryOrderId,
      ro.salesOrderCode, ro.orderCode, ro.sourceOrderCode, ro.deliveryOrderCode, ro.originalOrderCode
    ].map(cleanText).filter(Boolean);
    if (!roKeys.length) continue;

    for (const item of Array.isArray(ro.items) ? ro.items : []) {
      const pcode = productCodeOf(item);
      if (!pcode) continue;

      const qty = returnQtyOf(item);
      if (!qty) continue;

      const lineKey = lineKeyOf(item);
      const priceKey = priceKeyOf(item);

      for (const key of roKeys) {
        if (lineKey && priceKey) {
          addReturnQty(map, makeReturnKey(key, pcode, lineKey, priceKey), qty);
          continue;
        }

        if (lineKey) {
          addReturnQty(map, makeReturnKey(key, pcode, lineKey, ''), qty);
          continue;
        }

        if (priceKey) {
          addReturnQty(map, makeReturnKey(key, pcode, '', priceKey), qty);
          continue;
        }

        addReturnQty(map, makeKey(key, pcode), qty);
      }
    }
  }
  return map;
}

function getReturnQtyForOrderLine(returnQtyMap, order = {}, item = {}) {
  const pcode = productCodeOf(item);
  if (!pcode) return 0;

  const lineKey = lineKeyOf(item);
  const priceKey = priceKeyOf(item);
  let maxQty = 0;

  for (const key of orderIdValues(order)) {
    const candidateKeys = [
      lineKey && priceKey ? makeReturnKey(key, pcode, lineKey, priceKey) : '',
      lineKey ? makeReturnKey(key, pcode, lineKey, '') : '',
      priceKey ? makeReturnKey(key, pcode, '', priceKey) : '',
      makeKey(key, pcode)
    ].filter(Boolean);

    for (const candidateKey of candidateKeys) {
      maxQty = Math.max(maxQty, toNumber(returnQtyMap.get(candidateKey)));
      if (maxQty) break;
    }
  }

  return maxQty;
}

function customerKey(order = {}) {
  return cleanText(order.customerCode || order.customerId || order.customerName || order.customerPhone || '');
}

function buildCustomerMap(customers = []) {
  const map = new Map();
  for (const c of customers || []) {
    [c.code, c.customerCode, c.id, c._id, c.name, c.customerName, c.phone, c.mobile]
      .map(cleanText).filter(Boolean).forEach((key) => map.set(key, c));
  }
  return map;
}

function buildProductMap(products = []) {
  const map = new Map();
  for (const p of products || []) {
    [p.code, p.productCode, p.sku, p.barcode, p.id, p._id]
      .map(cleanText).filter(Boolean).forEach((key) => map.set(key, p));
  }
  return map;
}

function customerInfo(order = {}, customerMap = new Map()) {
  const customer = customerMap.get(cleanText(order.customerCode))
    || customerMap.get(cleanText(order.customerId))
    || customerMap.get(cleanText(order.customerName))
    || {};
  return {
    code: cleanText(order.customerCode || customer.code || customer.customerCode || order.customerId || customer.id),
    name: cleanText(order.customerName || customer.name || customer.customerName),
    buyer: cleanText(order.buyerName || order.contactName || customer.buyerName || customer.representative || customer.contactName || order.customerName || customer.name),
    taxCode: cleanText(order.taxCode || order.customerTaxCode || customer.taxCode || customer.vatCode || customer.mst),
    address: cleanText(order.customerAddress || order.address || customer.invoiceAddress || customer.address || customer.deliveryAddress),
    phone: cleanText(order.customerPhone || order.phone || customer.phone || customer.mobile),
    bankAccount: cleanText(customer.bankAccount || customer.accountNumber || order.bankAccount),
    bankName: cleanText(customer.bankName || order.bankName),
    email: cleanText(customer.email || order.customerEmail || order.email)
  };
}

function paymentMethod(order = {}) {
  const raw = cleanText(order.paymentMethod || order.paymentType || order.method || order.hinhThucTT || '');
  if (raw) return raw;
  const cash = toNumber(order.cashAmount || order.collectedCashAmount);
  const bank = toNumber(order.bankAmount || order.transferAmount || order.collectedBankAmount);
  if (cash && bank) return 'TM/CK';
  if (bank) return 'CK';
  return 'TM/CK';
}

function buildVatInvoiceRows({ orders, returnOrders, customers, products, query = {} }) {
  const returnQtyMap = buildReturnQtyMap(returnOrders);
  const customerMap = buildCustomerMap(customers);
  const productMap = buildProductMap(products);
  const resultRows = [];
  const auditRows = [];
  let invoiceNo = 0;

  const filteredOrders = (orders || [])
    .filter(isActiveDoc)
    .filter((order) => dateInRange(order.orderDate || order.date || order.deliveryDate || order.createdAt, query))
    .filter((order) => {
      if (!query.customerCode && !query.customerId) return true;
      const target = cleanText(query.customerCode || query.customerId);
      return [order.customerCode, order.customerId, order.customerName].map(cleanText).includes(target);
    })
    .filter((order) => {
      if (!query.salesStaffCode && !query.staffCode) return true;
      const target = cleanText(query.salesStaffCode || query.staffCode);
      return [order.salesStaffCode, order.staffCode, order.salesmanCode, order.nvbhCode].map(cleanText).includes(target);
    })
    .sort((a, b) => cleanText(a.orderDate || a.date || a.createdAt).localeCompare(cleanText(b.orderDate || b.date || b.createdAt)) || orderCode(a).localeCompare(orderCode(b)));

  for (const order of filteredOrders) {
    const detailLines = [];
    const ci = customerInfo(order, customerMap);
    const currentOrderCode = orderCode(order);
    const orderDate = normalizeDateOnly(order.orderDate || order.date || order.deliveryDate || order.createdAt || dateUtil.todayVN());

    for (const item of Array.isArray(order.items) ? order.items : []) {
      const pcode = productCodeOf(item);
      const product = productMap.get(pcode) || {};
      const productName = productNameOf(item) || cleanText(product.name || product.productName);
      const soldQty = qtyOf(item);
      const returnQty = getReturnQtyForOrderLine(returnQtyMap, order, item);
      const safeReturnQty = Math.min(soldQty, returnQty);
      const invoiceQty = Math.max(0, soldQty - safeReturnQty);
      const priceInclVat = priceInclVatOf(item) || (soldQty ? amountInclVatOf(item) / soldQty : 0);

      if (!pcode || invoiceQty <= 0) {
        auditRows.push({
          MaDon: currentOrderCode,
          MaKhachHang: ci.code,
          TenKhachHang: ci.name,
          MaSanPham: pcode,
          SanPham: productName,
          SoLuongBan: soldQty,
          SoLuongTra: returnQty,
          SoLuongTraAnToan: safeReturnQty,
          SoLuongXuatHoaDon: invoiceQty,
          GiaSauKhuyenMaiCoVAT: priceInclVat,
          DonGiaTruocVAT: '',
          ThanhTienTruocVAT: '',
          LyDoBoDong: !pcode ? 'MISSING_PRODUCT_CODE' : 'INVOICE_QTY_ZERO'
        });
        continue;
      }

      const unitPriceBeforeVat = roundMoney(priceInclVat / (1 + TT78_VAT_RATE), 6);
      const lineAmountBeforeVat = roundMoney(invoiceQty * unitPriceBeforeVat, 2);
      detailLines.push({
        productCode: pcode,
        productName,
        unit: unitOf(item, product),
        soldQty,
        returnQty,
        safeReturnQty,
        invoiceQty,
        priceInclVat,
        unitPriceBeforeVat,
        lineAmountBeforeVat
      });
    }
    if (!detailLines.length) continue;

    invoiceNo += 1;
    const invoiceAmountBeforeVat = roundMoney(detailLines.reduce((sum, line) => sum + line.lineAmountBeforeVat, 0), 2);
    const invoiceVat = roundMoney(invoiceAmountBeforeVat * TT78_VAT_RATE, 2);
    const invoiceTotal = Math.round(invoiceAmountBeforeVat + invoiceVat);

    detailLines.forEach((line, index) => {
      const isFirst = index === 0;
      resultRows.push({
        STT: isFirst ? invoiceNo : '',
        NgayHoaDon: isFirst ? orderDate : '',
        MaKhachHang: isFirst ? ci.code : '',
        TenKhachHang: isFirst ? ci.name : '',
        TenNguoiMua: isFirst ? ci.buyer : '',
        MaSoThue: isFirst ? ci.taxCode : '',
        DiaChiKhachHang: isFirst ? ci.address : '',
        DienThoaiKhachHang: isFirst ? ci.phone : '',
        SoTaiKhoan: isFirst ? ci.bankAccount : '',
        NganHang: isFirst ? ci.bankName : '',
        HinhThucTT: isFirst ? paymentMethod(order) : '',
        MaSanPham: line.productCode,
        SanPham: line.productName,
        DonViTinh: line.unit,
        Extra1SP: '',
        Extra2SP: '',
        SoLuong: line.invoiceQty,
        DonGia: line.unitPriceBeforeVat,
        TyLeChietKhauHienThi: '',
        SoTienChietKhau: '',
        ThanhTien: line.lineAmountBeforeVat,
        TienBan: isFirst ? invoiceAmountBeforeVat : '',
        ThueSuat: isFirst ? 8 : '',
        TienThueSanPham: '',
        TienThue: isFirst ? invoiceVat : '',
        TongCong: isFirst ? invoiceTotal : '',
        TinhChatHangHoa: isFirst ? 0 : 0,
        DonViTienTe: isFirst ? 'VND' : '',
        TyGia: '',
        Fkey: isFirst ? orderCode(order) : '',
        Extra1: '', Extra2: '', EmailKhachHang: isFirst ? ci.email : '', VungDuLieu: '', Extra3: '', Extra4: '', Extra5: '', Extra6: '', Extra7: '', Extra8: '', Extra9: '', Extra10: '', Extra11: '', Extra12: '', LOONo: '', HDSe: '', xVTNXHan: '', NVChuan: '', PTChuyenKhoan: '', HDKTTu: '', CCCDan: ''
      });
      auditRows.push({
        MaDon: orderCode(order),
        MaKhachHang: ci.code,
        TenKhachHang: ci.name,
        MaSanPham: line.productCode,
        SanPham: line.productName,
        SoLuongBan: line.soldQty,
        SoLuongTra: line.returnQty,
        SoLuongTraAnToan: line.safeReturnQty,
        SoLuongXuatHoaDon: line.invoiceQty,
        GiaSauKhuyenMaiCoVAT: line.priceInclVat,
        DonGiaTruocVAT: line.unitPriceBeforeVat,
        ThanhTienTruocVAT: line.lineAmountBeforeVat,
        LyDoBoDong: ''
      });
    });
  }

  return { rows: resultRows, auditRows };
}

async function buildVatInvoiceTT78Workbook(query = {}) {
  const dateFrom = normalizeDateOnly(query.dateFrom || query.from || query.fromDate || '') || '0000-01-01';
  const dateTo = normalizeDateOnly(query.dateTo || query.to || query.toDate || '') || '9999-12-31';
  const orderFilter = {};
  if (dateFrom || dateTo) {
    orderFilter.$or = [
      { orderDate: { ...(dateFrom ? { $gte: dateFrom } : {}), ...(dateTo ? { $lte: dateTo } : {}) } },
      { date: { ...(dateFrom ? { $gte: dateFrom } : {}), ...(dateTo ? { $lte: dateTo } : {}) } }
    ];
  }
  const [orders, returnOrders, customers, products] = await Promise.all([
    SalesOrder.find(orderFilter).sort({ orderDate: 1, date: 1, code: 1 }).limit(Math.min(Math.max(Number(query.limit || 20000), 1), 100000)).lean(),
    ReturnOrder.find({}).lean(),
    Customer.find({}).lean(),
    Product.find({}).lean()
  ]);
  const { rows, auditRows } = buildVatInvoiceRows({ orders, returnOrders, customers, products, query });
  const workbook = XLSX.utils.book_new();
  const sheetRows = [TT78_HEADERS, ...rows.map((row) => TT78_HEADERS.map((header) => row[header] ?? ''))];
  const sheet = XLSX.utils.aoa_to_sheet(sheetRows);
  sheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(sheetRows.length - 1, 0), c: TT78_HEADERS.length - 1 } }) };
  sheet['!cols'] = TT78_HEADERS.map((header) => ({ wch: Math.max(10, Math.min(35, String(header).length + 4)) }));
  XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1');

  const auditHeaders = [
    'MaDon', 'MaKhachHang', 'TenKhachHang', 'MaSanPham', 'SanPham',
    'SoLuongBan', 'SoLuongTra', 'SoLuongTraAnToan', 'SoLuongXuatHoaDon',
    'GiaSauKhuyenMaiCoVAT', 'DonGiaTruocVAT', 'ThanhTienTruocVAT', 'LyDoBoDong'
  ];
  const auditSheet = XLSX.utils.aoa_to_sheet([auditHeaders, ...auditRows.map((row) => auditHeaders.map((header) => row[header] ?? ''))]);
  auditSheet['!cols'] = auditHeaders.map((header) => ({ wch: Math.max(12, Math.min(35, String(header).length + 4)) }));
  XLSX.utils.book_append_sheet(workbook, auditSheet, 'DoiChieu');

  const summary = rows.reduce((acc, row) => {
    if (row.TienBan !== '') {
      acc.invoiceCount += 1;
      acc.amountBeforeVat += toNumber(row.TienBan);
      acc.vatAmount += toNumber(row.TienThue);
      acc.totalAmount += toNumber(row.TongCong);
    }
    acc.lineCount += row.MaSanPham ? 1 : 0;
    return acc;
  }, { invoiceCount: 0, lineCount: 0, amountBeforeVat: 0, vatAmount: 0, totalAmount: 0 });
  const infoSheet = XLSX.utils.aoa_to_sheet([
    ['Mẫu', 'TT78 - Sheet1'],
    ['Từ ngày', dateFrom === '0000-01-01' ? '' : dateFrom],
    ['Đến ngày', dateTo === '9999-12-31' ? '' : dateTo],
    ['Số hóa đơn', summary.invoiceCount],
    ['Số dòng sản phẩm', summary.lineCount],
    ['Tiền bán trước thuế', roundMoney(summary.amountBeforeVat, 2)],
    ['Tiền thuế 8%', roundMoney(summary.vatAmount, 2)],
    ['Tổng cộng', Math.round(summary.totalAmount)],
    ['Quy tắc', 'Số lượng xuất HĐ = số lượng bán - số lượng trả; Đơn giá = giá sau khuyến mại trên đơn / 1.08']
  ]);
  XLSX.utils.book_append_sheet(workbook, infoSheet, 'ThongTin');

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  const fromName = dateFrom === '0000-01-01' ? 'all' : dateFrom;
  const toName = dateTo === '9999-12-31' ? dateUtil.todayVN() : dateTo;
  return { buffer, rows: rows.length, fileName: `HoaDonVAT_TT78_${fromName}_${toName}.xlsx` };
}

async function previewImport(params) {
  return excelImportService.preview(params);
}

async function commitImport(params) {
  return excelImportService.commit(params);
}

async function getImportLogs() {
  return excelImportService.logs();
}

function getBuiltInTemplates() {
  return importTemplateService.getBuiltInTemplates();
}

function buildBuiltInTemplateFile(type) {
  return importTemplateService.buildBuiltInTemplateFile(type);
}

function getFields(type) {
  return importTemplateService.getFields(type);
}

async function listCustomTemplates() {
  return importTemplateService.listCustomTemplates();
}

async function saveCustomTemplate(payload) {
  return importTemplateService.saveCustomTemplate(payload);
}

async function deleteCustomTemplate(id) {
  return importTemplateService.deleteCustomTemplate(id);
}

async function buildCustomTemplateFile(id) {
  return importTemplateService.buildCustomTemplateFile(id);
}

function getExportTypes() {
  return [...new Set([...exportRepository.getExportTypes(), 'vatInvoiceTT78'])].sort();
}

async function exportToExcel(type, query = {}) {
  const normalizedType = String(type || '').trim();
  if (['vatInvoiceTT78', 'vat-invoice-tt78', 'hoa-don-vat-tt78'].includes(normalizedType)) {
    return buildVatInvoiceTT78Workbook(query);
  }
  const rows = await exportRepository.findForExport(type, query);
  if (!rows) return { error: 'Loại dữ liệu export không hợp lệ', status: 400 };
  const buffer = buildWorkbook({ type, rows });
  const safeType = String(type || 'data').replace(/[^a-zA-Z0-9_-]/g, '-');
  return { buffer, rows: rows.length, fileName: `${safeType}-export-${dateUtil.todayVN()}.xlsx` };
}

module.exports = {
  previewImport,
  commitImport,
  getImportLogs,
  getBuiltInTemplates,
  buildBuiltInTemplateFile,
  getFields,
  listCustomTemplates,
  saveCustomTemplate,
  deleteCustomTemplate,
  buildCustomTemplateFile,
  getExportTypes,
  exportToExcel
};
