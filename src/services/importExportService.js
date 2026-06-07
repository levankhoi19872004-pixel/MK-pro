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
const models = require('../models');

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

function returnOrderCodeOf(ro = {}) {
  return cleanText(ro.code || ro.id || ro.returnOrderCode || ro.documentCode || ro._id);
}

function returnOrderIdOf(ro = {}) {
  return cleanText(ro.id || ro._id || ro.code || ro.returnOrderCode || ro.documentCode);
}

function updatedTimeOf(row = {}) {
  const raw = row.updatedAt || row.modifiedAt || row.createdAt || row.date || row.documentDate || '';
  const t = raw ? new Date(raw).getTime() : 0;
  return Number.isFinite(t) ? t : 0;
}

function activeReturnOrderFilter() {
  return {
    status: { $nin: ['void', 'cancelled', 'canceled', 'deleted', 'removed'] },
    returnStatus: { $nin: ['void', 'cancelled', 'canceled', 'deleted', 'removed'] }
  };
}

function addReturnQty(map, key, qty, source = {}) {
  if (!key || !qty) return;
  map.set(key, toNumber(map.get(key)) + qty);

  if (!map.__sourceMap) map.__sourceMap = new Map();
  const existed = map.__sourceMap.get(key) || { codes: new Set(), ids: new Set(), sourceRows: [] };
  if (source.code) existed.codes.add(source.code);
  if (source.id) existed.ids.add(source.id);
  if (source.sourceRow) existed.sourceRows.push(source.sourceRow);
  map.__sourceMap.set(key, existed);
}

function sourceInfoForKey(map, key) {
  const sourceMap = map && map.__sourceMap;
  if (!sourceMap) return { ReturnOrderCode: '', ReturnOrderId: '', ReturnQtySource: '' };
  const src = sourceMap.get(key);
  if (!src) return { ReturnOrderCode: '', ReturnOrderId: '', ReturnQtySource: '' };
  const codes = Array.from(src.codes || []).filter(Boolean);
  const ids = Array.from(src.ids || []).filter(Boolean);
  const sourceRows = Array.from(src.sourceRows || []).filter(Boolean);
  return {
    ReturnOrderCode: codes.join(', '),
    ReturnOrderId: ids.join(', '),
    ReturnQtySource: sourceRows.join(' | ')
  };
}

function buildReturnQtyMap(returnOrders = []) {
  const map = new Map();
  const latestLineByReturnOrder = new Map();

  for (const ro of returnOrders || []) {
    if (!isActiveDoc(ro)) continue;
    const roCode = returnOrderCodeOf(ro);
    const roId = returnOrderIdOf(ro);
    const updatedMs = updatedTimeOf(ro);
    const roKeys = Array.from(new Set([
      ro.salesOrderId, ro.orderId, ro.sourceOrderId, ro.deliveryOrderId,
      ro.salesOrderCode, ro.orderCode, ro.sourceOrderCode, ro.deliveryOrderCode, ro.originalOrderCode
    ].map(cleanText).filter(Boolean)));
    if (!roKeys.length) continue;

    const primaryOrderKey = cleanText(ro.salesOrderCode || ro.orderCode || ro.salesOrderId || ro.orderId || roKeys[0]);

    for (const item of Array.isArray(ro.items) ? ro.items : []) {
      const pcode = productCodeOf(item);
      if (!pcode) continue;

      const qty = returnQtyOf(item);
      if (!qty) continue;

      const lineKey = lineKeyOf(item);
      const priceKey = priceKeyOf(item);
      const sourceRow = `${roCode || roId || 'RETURN_ORDER'}:${primaryOrderKey}:${pcode}:${qty}`;

      // Nếu cùng một phiếu trả bị lưu trùng nhiều lần, chỉ lấy bản mới nhất theo updatedAt.
      // Key cố ý KHÔNG dùng Mongo _id riêng lẻ, vì bản ghi trùng thường khác _id nhưng cùng code/order/product/price.
      const duplicateKey = [
        roCode || roId,
        primaryOrderKey,
        pcode,
        lineKey || '',
        priceKey || ''
      ].map(cleanText).join('@@');

      const record = { roKeys, pcode, qty, lineKey, priceKey, roCode, roId, updatedMs, sourceRow };
      const existed = latestLineByReturnOrder.get(duplicateKey);
      if (!existed || updatedMs >= existed.updatedMs) {
        latestLineByReturnOrder.set(duplicateKey, record);
      }
    }
  }

  for (const record of latestLineByReturnOrder.values()) {
    const { roKeys, pcode, qty, lineKey, priceKey, roCode, roId, sourceRow } = record;
    const source = { code: roCode, id: roId, sourceRow };
    for (const key of roKeys) {
      if (lineKey && priceKey) {
        addReturnQty(map, makeReturnKey(key, pcode, lineKey, priceKey), qty, source);
        continue;
      }

      if (lineKey) {
        addReturnQty(map, makeReturnKey(key, pcode, lineKey, ''), qty, source);
        continue;
      }

      if (priceKey) {
        addReturnQty(map, makeReturnKey(key, pcode, '', priceKey), qty, source);
        continue;
      }

      addReturnQty(map, makeKey(key, pcode), qty, source);
    }
  }

  return map;
}

function getReturnInfoForOrderLine(returnQtyMap, order = {}, item = {}) {
  const pcode = productCodeOf(item);
  if (!pcode) return { qty: 0, ReturnOrderCode: '', ReturnOrderId: '', ReturnQtySource: '' };

  const lineKey = lineKeyOf(item);
  const priceKey = priceKeyOf(item);
  let best = { qty: 0, key: '' };

  for (const key of orderIdValues(order)) {
    const candidateKeys = [
      lineKey && priceKey ? makeReturnKey(key, pcode, lineKey, priceKey) : '',
      lineKey ? makeReturnKey(key, pcode, lineKey, '') : '',
      priceKey ? makeReturnKey(key, pcode, '', priceKey) : '',
      makeKey(key, pcode)
    ].filter(Boolean);

    for (const candidateKey of candidateKeys) {
      const qty = toNumber(returnQtyMap.get(candidateKey));
      if (qty > best.qty) best = { qty, key: candidateKey };
      if (qty) break;
    }
  }

  return { qty: best.qty, ...sourceInfoForKey(returnQtyMap, best.key) };
}

function getReturnQtyForOrderLine(returnQtyMap, order = {}, item = {}) {
  return getReturnInfoForOrderLine(returnQtyMap, order, item).qty;
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
      const returnInfo = getReturnInfoForOrderLine(returnQtyMap, order, item);
      const returnQty = returnInfo.qty;
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
          ReturnOrderCode: returnInfo.ReturnOrderCode,
          ReturnOrderId: returnInfo.ReturnOrderId,
          ReturnQtySource: returnInfo.ReturnQtySource,
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
        lineAmountBeforeVat,
        returnOrderCode: returnInfo.ReturnOrderCode,
        returnOrderId: returnInfo.ReturnOrderId,
        returnQtySource: returnInfo.ReturnQtySource
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
        ReturnOrderCode: line.returnOrderCode,
        ReturnOrderId: line.returnOrderId,
        ReturnQtySource: line.returnQtySource,
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
    ReturnOrder.find(activeReturnOrderFilter()).lean(),
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
    'GiaSauKhuyenMaiCoVAT', 'DonGiaTruocVAT', 'ThanhTienTruocVAT', 'ReturnOrderCode', 'ReturnOrderId', 'ReturnQtySource', 'LyDoBoDong'
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


const BUSINESS_REPORT_TYPES = [
  'sales-report', 'delivery-report', 'return-report', 'debt-report', 'ar-ledger-detail',
  'stock-report', 'stock-card-report', 'fund-report', 'salesman-report', 'deliveryman-report',
  'customer-sales-report', 'product-sales-report'
];

function reportDateRange(query = {}) {
  return {
    from: normalizeDateOnly(query.dateFrom || query.from || query.fromDate || ''),
    to: normalizeDateOnly(query.dateTo || query.to || query.toDate || '')
  };
}

function buildReportFilter(query = {}, fields = ['date', 'createdAt']) {
  const { from, to } = reportDateRange(query);
  if (!from && !to) return {};
  const clauses = fields.map((field) => ({
    [field]: { ...(from ? { $gte: from } : {}), ...(to ? { $lte: field === 'createdAt' ? `${to}T23:59:59.999Z` : to } : {}) }
  }));
  return { $or: clauses };
}

function safeLimit(query = {}) {
  return Math.min(Math.max(Number(query.limit || 100000), 1), 200000);
}

function appendAoaSheet(workbook, name, headers, rows) {
  const sheetRows = rows.map((row) => headers.map((h) => row[h] ?? ''));
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...sheetRows]);
  sheet['!cols'] = headers.map((header) => ({ wch: Math.max(12, Math.min(35, String(header).length + 4)) }));
  XLSX.utils.book_append_sheet(workbook, sheet, String(name || 'BaoCao').slice(0, 31));
}

function reportWorkbook(type, sheetName, headers, rows, query = {}) {
  const workbook = XLSX.utils.book_new();
  appendAoaSheet(workbook, sheetName, headers, rows);
  const { from, to } = reportDateRange(query);
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Mẫu báo cáo', sheetName], ['Từ ngày', from], ['Đến ngày', to], ['Số dòng', rows.length], ['Thời gian xuất', new Date().toISOString()],
    ['Quy tắc doanh số', 'Doanh số trước KM = số lượng x giá bán gốc; Doanh số sau KM = giá trị thực tế trên đơn sau khuyến mại; Chênh lệch KM = trước KM - sau KM']
  ]), 'ThongTin');
  const safeType = String(type || 'report').replace(/[^a-zA-Z0-9_-]/g, '-');
  const suffix = `${from || 'all'}_${to || dateUtil.todayVN()}`;
  return { buffer: XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }), rows: rows.length, fileName: `${safeType}_${suffix}.xlsx` };
}

function orderItems(order = {}) { return Array.isArray(order.items) ? order.items : []; }
function orderQty(order = {}) { return orderItems(order).reduce((s, i) => s + qtyOf(i), 0) || toNumber(order.totalQuantity || order.quantity || 0); }
function basePriceOf(item = {}, product = {}) { return toNumber(item.originalPrice ?? item.basePrice ?? item.listPrice ?? product.salePrice ?? item.salePrice ?? item.price ?? item.unitPrice ?? 0); }
function lineBeforePromo(item = {}, product = {}) { return qtyOf(item) * basePriceOf(item, product); }
function lineAfterPromo(item = {}) { return toNumber(item.finalAmount ?? item.amount ?? item.totalAmount ?? item.lineAmount ?? 0) || qtyOf(item) * priceInclVatOf(item); }
function orderBeforePromo(order = {}, productMap = new Map()) { return orderItems(order).reduce((s, item) => s + lineBeforePromo(item, productMap.get(productCodeOf(item)) || {}), 0) || toNumber(order.beforePromoAmount || order.grossAmount || order.totalBeforeDiscount || order.totalAmount || 0); }
function orderAfterPromo(order = {}) { return toNumber(order.afterPromoAmount || order.totalAfterPromotion || order.totalAmount || order.amount || 0); }
function staffName(order = {}, kind = 'sales') { return kind === 'delivery' ? cleanText(order.deliveryStaffName || order.deliveryName || order.shipperName || order.deliveryStaffCode || '') : cleanText(order.salesStaffName || order.salesmanName || order.staffName || order.salesStaffCode || ''); }
function staffCode(order = {}, kind = 'sales') { return kind === 'delivery' ? cleanText(order.deliveryStaffCode || order.deliveryStaffId || '') : cleanText(order.salesStaffCode || order.salesmanCode || order.staffCode || ''); }

async function loadProductMap() {
  const products = await Product.find({}).select('code name salePrice baseUnit unit brand category').lean();
  return new Map(products.map((p) => [cleanText(p.code), p]));
}

async function buildSalesReportWorkbook(query = {}) {
  const productMap = await loadProductMap();
  const orders = await SalesOrder.find({ ...buildReportFilter(query), ...activeReturnOrderFilter() }).sort({ date: 1, createdAt: 1 }).limit(safeLimit(query)).lean();
  const rows = orders.map((o, idx) => {
    const before = orderBeforePromo(o, productMap); const after = orderAfterPromo(o);
    return { STT: idx + 1, Ngay: normalizeDateOnly(o.date || o.createdAt), MaDon: orderCode(o), Nguon: cleanText(o.orderSource || o.source || ''), MaKhachHang: cleanText(o.customerCode), KhachHang: cleanText(o.customerName), NVBH: staffName(o, 'sales'), NVGH: staffName(o, 'delivery'), SoLuong: orderQty(o), DoanhSoTruocKM: Math.round(before), DoanhSoSauKM: Math.round(after), ChenhLechKM: Math.round(before - after), DaThu: Math.round(toNumber(o.paidAmount)), ConNo: Math.round(toNumber(o.debtAmount)), TrangThaiGiaoHang: cleanText(o.deliveryStatus) };
  });
  return reportWorkbook('sales-report', 'BaoCaoBanHang', Object.keys(rows[0] || { STT:'', Ngay:'', MaDon:'', Nguon:'', MaKhachHang:'', KhachHang:'', NVBH:'', NVGH:'', SoLuong:'', DoanhSoTruocKM:'', DoanhSoSauKM:'', ChenhLechKM:'', DaThu:'', ConNo:'', TrangThaiGiaoHang:'' }), rows, query);
}

async function buildDeliveryReportWorkbook(query = {}) {
  const MasterOrder = models.masterOrders;
  const rowsRaw = await MasterOrder.find(buildReportFilter(query, ['deliveryDate', 'date', 'createdAt'])).sort({ deliveryDate: 1, createdAt: 1 }).limit(safeLimit(query)).lean();
  const rows = rowsRaw.map((o, idx) => ({ STT: idx + 1, NgayGiao: normalizeDateOnly(o.deliveryDate || o.date || o.createdAt), MaDonTong: cleanText(o.code || o.id), NVGH: cleanText(o.deliveryStaffName || o.deliveryStaffCode), SoDon: toNumber(o.orderCount || o.childOrderCount || (Array.isArray(o.orderIds) ? o.orderIds.length : 0)), TongTien: Math.round(toNumber(o.totalAmount || o.amount)), TrangThai: cleanText(o.status || o.deliveryStatus) }));
  return reportWorkbook('delivery-report', 'BaoCaoGiaoHang', Object.keys(rows[0] || { STT:'', NgayGiao:'', MaDonTong:'', NVGH:'', SoDon:'', TongTien:'', TrangThai:'' }), rows, query);
}

async function buildReturnReportWorkbook(query = {}) {
  const rowsRaw = await ReturnOrder.find({ ...buildReportFilter(query), ...activeReturnOrderFilter() }).sort({ date: 1, createdAt: 1 }).limit(safeLimit(query)).lean();
  const rows = rowsRaw.map((r, idx) => ({ STT: idx + 1, Ngay: normalizeDateOnly(r.date || r.createdAt), MaTraHang: returnOrderCodeOf(r), MaDon: cleanText(r.salesOrderCode || r.orderCode), MaKhachHang: cleanText(r.customerCode), KhachHang: cleanText(r.customerName), GiaTriTra: Math.round(toNumber(r.amount || r.returnAmount || r.debtReduction)), TrangThai: cleanText(r.status) }));
  return reportWorkbook('return-report', 'BaoCaoTraHang', Object.keys(rows[0] || { STT:'', Ngay:'', MaTraHang:'', MaDon:'', MaKhachHang:'', KhachHang:'', GiaTriTra:'', TrangThai:'' }), rows, query);
}

async function buildDebtReportWorkbook(query = {}) {
  const ArLedger = models.arLedgers;
  const ledgers = await ArLedger.find(buildReportFilter(query, ['date', 'createdAt'])).sort({ customerCode: 1, date: 1 }).limit(safeLimit(query)).lean();
  const map = new Map();
  ledgers.forEach((l) => { const key = cleanText(l.customerCode || l.customerId || l.customerName); const row = map.get(key) || { MaKhachHang: cleanText(l.customerCode), KhachHang: cleanText(l.customerName), PhatSinhNo: 0, DaThu: 0, TraHang: 0, ConNo: 0 }; const debit = toNumber(l.debit || l.arDebit); const credit = toNumber(l.credit || l.arCredit); row.PhatSinhNo += debit; if (/RETURN|TRA/i.test(cleanText(l.type || l.source))) row.TraHang += credit; else row.DaThu += credit; row.ConNo += debit - credit; map.set(key, row); });
  const rows = Array.from(map.values()).map((r, i) => ({ STT: i + 1, ...r, PhatSinhNo: Math.round(r.PhatSinhNo), DaThu: Math.round(r.DaThu), TraHang: Math.round(r.TraHang), ConNo: Math.round(r.ConNo) }));
  return reportWorkbook('debt-report', 'BaoCaoCongNo', Object.keys(rows[0] || { STT:'', MaKhachHang:'', KhachHang:'', PhatSinhNo:'', DaThu:'', TraHang:'', ConNo:'' }), rows, query);
}

async function buildArLedgerDetailWorkbook(query = {}) {
  const ArLedger = models.arLedgers;
  const ledgers = await ArLedger.find(buildReportFilter(query, ['date', 'createdAt'])).sort({ customerCode: 1, date: 1, createdAt: 1 }).limit(safeLimit(query)).lean();
  const balances = new Map();
  const rows = ledgers.map((l, idx) => { const key = cleanText(l.customerCode || l.customerId || l.customerName); const debit = toNumber(l.debit || l.arDebit); const credit = toNumber(l.credit || l.arCredit); const balance = toNumber(balances.get(key)) + debit - credit; balances.set(key, balance); return { STT: idx + 1, Ngay: normalizeDateOnly(l.date || l.createdAt), MaKhachHang: cleanText(l.customerCode), KhachHang: cleanText(l.customerName), ChungTu: cleanText(l.code || l.referenceCode || l.salesOrderCode), DienGiai: cleanText(l.description || l.note || l.type), No: Math.round(debit), Co: Math.round(credit), Du: Math.round(balance) }; });
  return reportWorkbook('ar-ledger-detail', 'SoCongNoChiTiet', Object.keys(rows[0] || { STT:'', Ngay:'', MaKhachHang:'', KhachHang:'', ChungTu:'', DienGiai:'', No:'', Co:'', Du:'' }), rows, query);
}

async function buildStockReportWorkbook(query = {}) {
  const Inventory = models.inventories;
  const stocks = await Inventory.find({}).sort({ productCode: 1, warehouseCode: 1 }).limit(safeLimit(query)).lean();
  const rows = stocks.map((s, idx) => ({ STT: idx + 1, MaSP: cleanText(s.productCode || s.code), SanPham: cleanText(s.productName || s.name), Kho: cleanText(s.warehouseCode || s.warehouseName), DonViTinh: cleanText(s.unit || s.baseUnit), Ton: toNumber(s.quantity || s.qty || s.onHand) }));
  return reportWorkbook('stock-report', 'BaoCaoTonKho', Object.keys(rows[0] || { STT:'', MaSP:'', SanPham:'', Kho:'', DonViTinh:'', Ton:'' }), rows, query);
}

async function buildStockCardReportWorkbook(query = {}) {
  const StockTransaction = models.stockTransactions || models.inventories;
  const txs = await StockTransaction.find(buildReportFilter(query, ['date', 'createdAt'])).sort({ productCode: 1, date: 1, createdAt: 1 }).limit(safeLimit(query)).lean();
  const bal = new Map();
  const rows = txs.map((t, idx) => { const key = `${cleanText(t.productCode || t.productId)}@@${cleanText(t.warehouseCode || t.warehouseId)}`; const inQty = toNumber(t.inQty || (String(t.transactionType || t.type).toUpperCase().includes('IN') ? t.qty : 0)); const outQty = toNumber(t.outQty || (String(t.transactionType || t.type).toUpperCase().includes('OUT') ? t.qty : 0)); const ton = toNumber(bal.get(key)) + inQty - outQty; bal.set(key, ton); return { STT: idx + 1, Ngay: normalizeDateOnly(t.date || t.createdAt), MaSP: cleanText(t.productCode || t.productId), SanPham: cleanText(t.productName), Kho: cleanText(t.warehouseCode || t.warehouseName), ChungTu: cleanText(t.referenceCode || t.code), Nhap: inQty, Xuat: outQty, Ton: ton }; });
  return reportWorkbook('stock-card-report', 'TheKho', Object.keys(rows[0] || { STT:'', Ngay:'', MaSP:'', SanPham:'', Kho:'', ChungTu:'', Nhap:'', Xuat:'', Ton:'' }), rows, query);
}

async function buildFundReportWorkbook(query = {}) {
  const FundLedger = models.fundLedgers || models.cashbooks;
  const docs = await FundLedger.find(buildReportFilter(query, ['date', 'createdAt'])).sort({ date: 1, createdAt: 1 }).limit(safeLimit(query)).lean();
  let balance = 0;
  const rows = docs.map((f, idx) => { const type = cleanText(f.type || f.direction || f.transactionType).toLowerCase(); const amount = toNumber(f.amount); const thu = type.includes('in') || type.includes('thu') || type === 'receipt' ? amount : 0; const chi = type.includes('out') || type.includes('chi') || type === 'payment' ? amount : 0; balance += thu - chi; return { STT: idx + 1, Ngay: normalizeDateOnly(f.date || f.createdAt), ChungTu: cleanText(f.code || f.referenceCode), Loai: cleanText(f.type || f.transactionType), Quy: cleanText(f.fund || f.fundType || (f.isBank ? 'bank' : 'cash')), NguoiLienQuan: cleanText(f.customerName || f.staffName || f.partnerName), Thu: Math.round(thu), Chi: Math.round(chi), Ton: Math.round(balance), GhiChu: cleanText(f.note) }; });
  return reportWorkbook('fund-report', 'BaoCaoQuyTien', Object.keys(rows[0] || { STT:'', Ngay:'', ChungTu:'', Loai:'', Quy:'', NguoiLienQuan:'', Thu:'', Chi:'', Ton:'', GhiChu:'' }), rows, query);
}

async function buildSalesmanReportWorkbook(query = {}) {
  const productMap = await loadProductMap();
  const orders = await SalesOrder.find({ ...buildReportFilter(query), ...activeReturnOrderFilter() }).limit(safeLimit(query)).lean();
  const map = new Map();
  orders.forEach((o) => { const key = staffCode(o, 'sales') || staffName(o, 'sales') || 'UNKNOWN'; const row = map.get(key) || { MaNVBH: staffCode(o, 'sales'), NVBH: staffName(o, 'sales'), SoDon: 0, SoKhachHang: new Set(), DoanhSoTruocKM: 0, DoanhSoSauKM: 0, ChenhLechKM: 0 }; const before = orderBeforePromo(o, productMap); const after = orderAfterPromo(o); row.SoDon += 1; row.SoKhachHang.add(cleanText(o.customerCode || o.customerName)); row.DoanhSoTruocKM += before; row.DoanhSoSauKM += after; row.ChenhLechKM += before - after; map.set(key, row); });
  const rows = Array.from(map.values()).map((r, i) => ({ STT: i + 1, MaNVBH: r.MaNVBH, NVBH: r.NVBH, SoDon: r.SoDon, SoKhachHang: r.SoKhachHang.size, DoanhSoTruocKM: Math.round(r.DoanhSoTruocKM), DoanhSoSauKM: Math.round(r.DoanhSoSauKM), ChenhLechKM: Math.round(r.ChenhLechKM) }));
  return reportWorkbook('salesman-report', 'BaoCaoNVBH', Object.keys(rows[0] || { STT:'', MaNVBH:'', NVBH:'', SoDon:'', SoKhachHang:'', DoanhSoTruocKM:'', DoanhSoSauKM:'', ChenhLechKM:'' }), rows, query);
}

async function buildDeliverymanReportWorkbook(query = {}) {
  const productMap = await loadProductMap();
  const orders = await SalesOrder.find({ ...buildReportFilter(query, ['deliveryDate', 'date', 'createdAt']), ...activeReturnOrderFilter() }).limit(safeLimit(query)).lean();
  const map = new Map();
  orders.forEach((o) => { const key = staffCode(o, 'delivery') || staffName(o, 'delivery') || 'UNKNOWN'; const row = map.get(key) || { MaNVGH: staffCode(o, 'delivery'), NVGH: staffName(o, 'delivery'), SoDonGiao: 0, DoanhSoTruocKM: 0, DoanhSoSauKM: 0, ChenhLechKM: 0, ThuTien: 0, TraHang: 0 }; const before = orderBeforePromo(o, productMap); const after = orderAfterPromo(o); row.SoDonGiao += 1; row.DoanhSoTruocKM += before; row.DoanhSoSauKM += after; row.ChenhLechKM += before - after; row.ThuTien += toNumber(o.paidAmount); row.TraHang += toNumber(o.returnAmount); map.set(key, row); });
  const rows = Array.from(map.values()).map((r, i) => ({ STT: i + 1, ...r, DoanhSoTruocKM: Math.round(r.DoanhSoTruocKM), DoanhSoSauKM: Math.round(r.DoanhSoSauKM), ChenhLechKM: Math.round(r.ChenhLechKM), ThuTien: Math.round(r.ThuTien), TraHang: Math.round(r.TraHang) }));
  return reportWorkbook('deliveryman-report', 'BaoCaoNVGH', Object.keys(rows[0] || { STT:'', MaNVGH:'', NVGH:'', SoDonGiao:'', DoanhSoTruocKM:'', DoanhSoSauKM:'', ChenhLechKM:'', ThuTien:'', TraHang:'' }), rows, query);
}

async function buildCustomerSalesReportWorkbook(query = {}) {
  const productMap = await loadProductMap();
  const orders = await SalesOrder.find({ ...buildReportFilter(query), ...activeReturnOrderFilter() }).limit(safeLimit(query)).lean();
  const map = new Map();
  orders.forEach((o) => { const key = cleanText(o.customerCode || o.customerId || o.customerName); const row = map.get(key) || { MaKhachHang: cleanText(o.customerCode), KhachHang: cleanText(o.customerName), NVBH: staffName(o, 'sales'), SoDon: 0, DoanhSoTruocKM: 0, DoanhSoSauKM: 0, ChenhLechKM: 0, DaThu: 0, ConNo: 0 }; const before = orderBeforePromo(o, productMap); const after = orderAfterPromo(o); row.SoDon += 1; row.DoanhSoTruocKM += before; row.DoanhSoSauKM += after; row.ChenhLechKM += before - after; row.DaThu += toNumber(o.paidAmount); row.ConNo += toNumber(o.debtAmount); map.set(key, row); });
  const rows = Array.from(map.values()).map((r, i) => ({ STT: i + 1, ...r, DoanhSoTruocKM: Math.round(r.DoanhSoTruocKM), DoanhSoSauKM: Math.round(r.DoanhSoSauKM), ChenhLechKM: Math.round(r.ChenhLechKM), DaThu: Math.round(r.DaThu), ConNo: Math.round(r.ConNo) }));
  return reportWorkbook('customer-sales-report', 'DoanhSoKhachHang', Object.keys(rows[0] || { STT:'', MaKhachHang:'', KhachHang:'', NVBH:'', SoDon:'', DoanhSoTruocKM:'', DoanhSoSauKM:'', ChenhLechKM:'', DaThu:'', ConNo:'' }), rows, query);
}

async function buildProductSalesReportWorkbook(query = {}) {
  const productMap = await loadProductMap();
  const orders = await SalesOrder.find({ ...buildReportFilter(query), ...activeReturnOrderFilter() }).limit(safeLimit(query)).lean();
  const map = new Map();
  orders.forEach((o) => orderItems(o).forEach((item) => { const code = productCodeOf(item); const product = productMap.get(code) || {}; const row = map.get(code) || { MaSP: code, SanPham: productNameOf(item) || cleanText(product.name), NhanHang: cleanText(product.brand), SoLuongBan: 0, DoanhSoTruocKM: 0, DoanhSoSauKM: 0, ChenhLechKM: 0 }; const before = lineBeforePromo(item, product); const after = lineAfterPromo(item); row.SoLuongBan += qtyOf(item); row.DoanhSoTruocKM += before; row.DoanhSoSauKM += after; row.ChenhLechKM += before - after; map.set(code, row); }));
  const totalAfter = Array.from(map.values()).reduce((s, r) => s + r.DoanhSoSauKM, 0) || 1;
  const rows = Array.from(map.values()).map((r, i) => ({ STT: i + 1, ...r, SoLuongBan: r.SoLuongBan, DoanhSoTruocKM: Math.round(r.DoanhSoTruocKM), DoanhSoSauKM: Math.round(r.DoanhSoSauKM), ChenhLechKM: Math.round(r.ChenhLechKM), TyTrong: `${roundMoney((r.DoanhSoSauKM / totalAfter) * 100, 2)}%` }));
  return reportWorkbook('product-sales-report', 'DoanhSoSanPham', Object.keys(rows[0] || { STT:'', MaSP:'', SanPham:'', NhanHang:'', SoLuongBan:'', DoanhSoTruocKM:'', DoanhSoSauKM:'', ChenhLechKM:'', TyTrong:'' }), rows, query);
}

const BUSINESS_REPORT_BUILDERS = {
  'sales-report': buildSalesReportWorkbook,
  'delivery-report': buildDeliveryReportWorkbook,
  'return-report': buildReturnReportWorkbook,
  'debt-report': buildDebtReportWorkbook,
  'ar-ledger-detail': buildArLedgerDetailWorkbook,
  'stock-report': buildStockReportWorkbook,
  'stock-card-report': buildStockCardReportWorkbook,
  'fund-report': buildFundReportWorkbook,
  'salesman-report': buildSalesmanReportWorkbook,
  'deliveryman-report': buildDeliverymanReportWorkbook,
  'customer-sales-report': buildCustomerSalesReportWorkbook,
  'product-sales-report': buildProductSalesReportWorkbook
};

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
  return [...new Set([...exportRepository.getExportTypes(), 'vatInvoiceTT78', ...BUSINESS_REPORT_TYPES])].sort();
}

async function exportToExcel(type, query = {}) {
  const normalizedType = String(type || '').trim();
  if (['vatInvoiceTT78', 'vat-invoice-tt78', 'hoa-don-vat-tt78'].includes(normalizedType)) {
    return buildVatInvoiceTT78Workbook(query);
  }
  if (BUSINESS_REPORT_BUILDERS[normalizedType]) {
    return BUSINESS_REPORT_BUILDERS[normalizedType](query);
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
