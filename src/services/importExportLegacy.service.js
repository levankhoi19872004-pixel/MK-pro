'use strict';

const dateUtil = require('../utils/date.util');
const { createWorkbook, appendAoaSheet: appendAoaSheetToWorkbook, writeWorkbook } = require('../utils/excelWriter.util');
const excelImportService = require('./excelImportService');
const importTemplateService = require('./importTemplateService');
const exportRepository = require('../repositories/exportRepository');
const SalesOrder = require('../models/SalesOrder');
const ReturnOrder = require('../models/ReturnOrder');
const Customer = require('../models/Customer');
const Product = require('../models/Product');
const models = require('../models');
const reportService = require('./reportService');
const {
  pickSalesStaffCode,
  pickSalesStaffName,
  pickDeliveryStaffCode,
  pickDeliveryStaffName
} = require('../domain/staff/staffIdentity');

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

async function buildWorkbook({ type, rows }) {
  const { headers, body } = rowsToSheetRows(rows);
  const workbook = createWorkbook();
  appendAoaSheetToWorkbook(workbook, 'Export', [headers, ...body]);
  appendAoaSheetToWorkbook(workbook, 'ThongTin', [
    ['Loại dữ liệu', type],
    ['Số dòng', rows.length],
    ['Thời gian xuất', new Date().toISOString()]
  ]);
  return writeWorkbook(workbook);
}


const TT78_VAT_RATE = 0.08;
const { extractCustomerTaxProfile } = require('../utils/customerTaxProfile.util');
const { extractCustomerBusinessProfile } = require('../utils/customerBusinessProfile.util');
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
  const orderTax = extractCustomerTaxProfile(order);
  const customerTax = extractCustomerTaxProfile(customer);
  const orderBusiness = extractCustomerBusinessProfile(order);
  const customerBusiness = extractCustomerBusinessProfile(customer);
  const customerDisplayName = cleanText(order.customerName || customer.name || customer.customerName);
  const businessName = cleanText(orderBusiness.businessName || customerBusiness.businessName);
  return {
    code: cleanText(order.customerCode || customer.code || customer.customerCode || order.customerId || customer.id),
    // Tên hộ kinh doanh là tên pháp lý trên hóa đơn; nếu chưa khai báo thì dùng tên khách hàng hiện tại.
    name: businessName || customerDisplayName,
    buyer: cleanText(order.buyerName || order.contactName || customer.buyerName || customer.representative || customer.contactName || customerDisplayName),
    // Chỉ ưu tiên snapshot thuế riêng trên đơn; không lấy địa chỉ giao hàng thay cho địa chỉ thuế khi hồ sơ KH đã có.
    taxCode: cleanText(orderTax.taxCode || customerTax.taxCode),
    address: cleanText(orderTax.taxInvoiceAddress || customerTax.taxInvoiceAddress || order.customerAddress || order.address || customer.address || customer.deliveryAddress),
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
    .filter((order) => order.vatInvoiceRequired !== false)
    .filter((order) => dateInRange(order.orderDate || order.date || order.documentDate || order.createdAt, query))
    .filter((order) => {
      if (!query.customerCode && !query.customerId) return true;
      const target = cleanText(query.customerCode || query.customerId);
      return [order.customerCode, order.customerId, order.customerName].map(cleanText).includes(target);
    })
    .filter((order) => {
      if (!query.salesStaffCode && !query.salesmanCode) return true;
      const target = cleanText(query.salesStaffCode || query.salesmanCode);
      return [order.salesStaffCode, order.salesmanCode, order.nvbhCode].map(cleanText).includes(target);
    })
    .sort((a, b) => cleanText(a.orderDate || a.date || a.documentDate || a.createdAt).localeCompare(cleanText(b.orderDate || b.date || b.documentDate || b.createdAt)) || orderCode(a).localeCompare(orderCode(b)));

  for (const order of filteredOrders) {
    const detailLines = [];
    const ci = customerInfo(order, customerMap);
    const currentOrderCode = orderCode(order);
    const orderDate = normalizeDateOnly(order.orderDate || order.date || order.documentDate || order.createdAt || dateUtil.todayVN());

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
        MaSoThue: ci.taxCode,
        DiaChiHoaDon: ci.address,
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
  const orderFilter = { vatInvoiceRequired: { $ne: false } };
  if (dateFrom || dateTo) {
    orderFilter.$or = [
      { orderDate: { ...(dateFrom ? { $gte: dateFrom } : {}), ...(dateTo ? { $lte: dateTo } : {}) } },
      { date: { ...(dateFrom ? { $gte: dateFrom } : {}), ...(dateTo ? { $lte: dateTo } : {}) } },
      { documentDate: { ...(dateFrom ? { $gte: dateFrom } : {}), ...(dateTo ? { $lte: dateTo } : {}) } },
      { createdAt: { ...(dateFrom ? { $gte: `${dateFrom}T00:00:00.000Z` } : {}), ...(dateTo ? { $lte: `${dateTo}T23:59:59.999Z` } : {}) } }
    ];
  }
  const [orders, returnOrders, customers, products] = await Promise.all([
    SalesOrder.find(orderFilter).sort({ orderDate: 1, date: 1, code: 1 }).limit(Math.min(Math.max(Number(query.limit || 20000), 1), 100000)).lean(),
    ReturnOrder.find(activeReturnOrderFilter()).lean(),
    Customer.find({}).lean(),
    Product.find({}).lean()
  ]);
  const { rows, auditRows } = buildVatInvoiceRows({ orders, returnOrders, customers, products, query });
  const workbook = createWorkbook();
  const sheetRows = [TT78_HEADERS, ...rows.map((row) => TT78_HEADERS.map((header) => row[header] ?? ''))];
  appendAoaSheetToWorkbook(workbook, 'Sheet1', sheetRows, { autoFilter: true });

  const auditHeaders = [
    'MaDon', 'MaKhachHang', 'TenKhachHang', 'MaSoThue', 'DiaChiHoaDon', 'MaSanPham', 'SanPham',
    'SoLuongBan', 'SoLuongTra', 'SoLuongTraAnToan', 'SoLuongXuatHoaDon',
    'GiaSauKhuyenMaiCoVAT', 'DonGiaTruocVAT', 'ThanhTienTruocVAT', 'ReturnOrderCode', 'ReturnOrderId', 'ReturnQtySource', 'LyDoBoDong'
  ];
  appendAoaSheetToWorkbook(workbook, 'DoiChieu', [auditHeaders, ...auditRows.map((row) => auditHeaders.map((header) => row[header] ?? ''))]);

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
  appendAoaSheetToWorkbook(workbook, 'ThongTin', [
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

  const buffer = writeWorkbook(workbook);
  const fromName = dateFrom === '0000-01-01' ? 'all' : dateFrom;
  const toName = dateTo === '9999-12-31' ? dateUtil.todayVN() : dateTo;
  return { buffer, rows: rows.length, fileName: `HoaDonVAT_TT78_${fromName}_${toName}.xlsx` };
}


function salesStaffDisplay(order = {}) {
  const code = cleanText(order.salesStaffCode || order.salesPersonCode || order.salesmanCode || order.nvbhCode || order.maNVBH);
  const name = cleanText(order.salesStaffName || order.salesPersonName || order.salesmanName || order.nvbhName || order.maNVBHName);
  return [code, name].filter(Boolean).join(' - ');
}

function orderSourceDisplay(order = {}) {
  return cleanText(order.orderSourceName || order.orderSource || order.source || order.sourceType || order.importSource || '');
}

async function buildVatNonInvoiceOrdersWorkbook(query = {}) {
  const dateFrom = normalizeDateOnly(query.dateFrom || query.from || query.fromDate || '') || '0000-01-01';
  const dateTo = normalizeDateOnly(query.dateTo || query.to || query.toDate || '') || '9999-12-31';
  const range = {
    ...(dateFrom !== '0000-01-01' ? { $gte: dateFrom } : {}),
    ...(dateTo !== '9999-12-31' ? { $lte: dateTo } : {})
  };
  const orderFilter = {
    vatInvoiceRequired: false,
    ...(Object.keys(range).length ? {
      $or: [
        { orderDate: range },
        { date: range },
        { documentDate: range },
        { createdAt: {
          ...(dateFrom !== '0000-01-01' ? { $gte: `${dateFrom}T00:00:00.000Z` } : {}),
          ...(dateTo !== '9999-12-31' ? { $lte: `${dateTo}T23:59:59.999Z` } : {})
        } }
      ]
    } : {})
  };

  const [orders, returnOrders, customers, products] = await Promise.all([
    SalesOrder.find(orderFilter).sort({ orderDate: 1, date: 1, code: 1 }).limit(Math.min(Math.max(Number(query.limit || 20000), 1), 100000)).lean(),
    ReturnOrder.find(activeReturnOrderFilter()).lean(),
    Customer.find({}).lean(),
    Product.find({}).lean()
  ]);

  const activeOrders = (orders || [])
    .filter(isActiveDoc)
    .filter((order) => order.vatInvoiceRequired === false)
    .filter((order) => dateInRange(order.orderDate || order.date || order.documentDate || order.createdAt, query));
  const returnQtyMap = buildReturnQtyMap(returnOrders);
  const customerMap = buildCustomerMap(customers);
  const productMap = buildProductMap(products);
  const orderRows = [];
  const detailRows = [];
  let totalOrderAmount = 0;
  let totalReturnAmount = 0;
  let totalRemainingAmount = 0;

  activeOrders.forEach((order, index) => {
    const ci = customerInfo(order, customerMap);
    const code = orderCode(order);
    let orderReturnAmount = 0;
    let orderRemainingAmount = 0;

    for (const item of Array.isArray(order.items) ? order.items : []) {
      const pcode = productCodeOf(item);
      const product = productMap.get(pcode) || {};
      const soldQty = qtyOf(item);
      const returnQty = Math.min(soldQty, getReturnQtyForOrderLine(returnQtyMap, order, item));
      const remainingQty = Math.max(0, soldQty - returnQty);
      const unitPrice = priceInclVatOf(item) || (soldQty ? amountInclVatOf(item) / soldQty : 0);
      const lineAmount = roundMoney(remainingQty * unitPrice, 2);
      orderReturnAmount += roundMoney(returnQty * unitPrice, 2);
      orderRemainingAmount += lineAmount;
      detailRows.push({
        'Mã đơn': code,
        'Mã sản phẩm': pcode,
        'Tên sản phẩm': productNameOf(item) || cleanText(product.name || product.productName),
        'Số lượng bán': soldQty,
        'Số lượng trả': returnQty,
        'Số lượng còn lại': remainingQty,
        'Đơn giá': unitPrice,
        'Thành tiền': lineAmount
      });
    }

    const orderAmount = toNumber(order.totalAmount || order.grandTotal || 0);
    const paidAmount = toNumber(order.paidAmount || order.paymentAmount || 0);
    const debtAmount = toNumber(order.debtAmount ?? Math.max(0, orderAmount - paidAmount));
    totalOrderAmount += orderAmount;
    totalReturnAmount += orderReturnAmount;
    totalRemainingAmount += orderRemainingAmount;
    orderRows.push({
      'STT': index + 1,
      'Ngày bán': normalizeDateOnly(order.orderDate || order.date || order.documentDate || order.createdAt),
      'Mã đơn': code,
      'Mã khách hàng': ci.code,
      'Tên khách hàng': ci.name,
      'NVBH': salesStaffDisplay(order),
      'Nguồn đơn': orderSourceDisplay(order),
      'Giá trị đơn': orderAmount,
      'Tiền đã thu': paidAmount,
      'Công nợ': debtAmount,
      'Lý do không xuất': cleanText(order.vatInvoiceNote),
      'Người thay đổi': cleanText(order.vatInvoiceUpdatedBy),
      'Thời gian thay đổi': cleanText(order.vatInvoiceUpdatedAt)
    });
  });

  const workbook = createWorkbook();
  const orderHeaders = ['STT', 'Ngày bán', 'Mã đơn', 'Mã khách hàng', 'Tên khách hàng', 'NVBH', 'Nguồn đơn', 'Giá trị đơn', 'Tiền đã thu', 'Công nợ', 'Lý do không xuất', 'Người thay đổi', 'Thời gian thay đổi'];
  const detailHeaders = ['Mã đơn', 'Mã sản phẩm', 'Tên sản phẩm', 'Số lượng bán', 'Số lượng trả', 'Số lượng còn lại', 'Đơn giá', 'Thành tiền'];
  appendAoaSheet(workbook, 'DanhSachDon', orderHeaders, orderRows);
  appendAoaSheet(workbook, 'ChiTietHang', detailHeaders, detailRows);
  appendAoaSheetToWorkbook(workbook, 'ThongTin', [
    ['Từ ngày', dateFrom === '0000-01-01' ? '' : dateFrom],
    ['Đến ngày', dateTo === '9999-12-31' ? '' : dateTo],
    ['Số đơn không xuất hóa đơn', orderRows.length],
    ['Tổng giá trị đơn', roundMoney(totalOrderAmount, 2)],
    ['Tổng hàng trả', roundMoney(totalReturnAmount, 2)],
    ['Giá trị còn lại', roundMoney(totalRemainingAmount, 2)]
  ]);

  const buffer = writeWorkbook(workbook);
  const fromName = dateFrom === '0000-01-01' ? 'all' : dateFrom;
  const toName = dateTo === '9999-12-31' ? dateUtil.todayVN() : dateTo;
  const rangeName = fromName === toName ? fromName : `${fromName}_${toName}`;
  return { buffer, rows: orderRows.length, fileName: `DanhSach_Don_Khong_Xuat_HoaDon_${rangeName}.xlsx` };
}


const BUSINESS_REPORT_TYPES = [
  'sales-report', 'delivery-report', 'return-report', 'debt-report', 'ar-ledger-detail',
  'stock-report', 'inventory-movement-report', 'stock-card-report', 'fund-report', 'salesman-report', 'deliveryman-report',
  'customer-sales-report', 'product-sales-report',
  'product-info-report', 'customer-info-report', 'user-info-report'
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
  appendAoaSheetToWorkbook(workbook, String(name || 'BaoCao').slice(0, 31), [headers, ...sheetRows]);
}

function reportBusinessRule(type = '') {
  const rules = {
    'stock-report': 'Tồn hiện tại đọc inventories; Tồn vật lý = onHand, Tồn khả dụng = onHand - reservedQty.',
    'inventory-movement-report': 'Tồn đầu + Tổng nhập - Tổng xuất = Tồn cuối; chiều nhập/xuất theo dấu quantity; tồn cuối được backcast từ inventories khi có thể.',
    'stock-card-report': 'Số dư chạy bắt đầu từ tồn đầu kỳ, không bắt đầu từ 0.',
    'sales-report': 'Chỉ đơn đã xác nhận kế toán; loại hàng khuyến mại; giá trị thực tế lấy snapshot/tổng tiền của đơn.',
    'return-report': 'Chỉ phiếu trả đã xác nhận kế toán; ưu tiên giá trị AR-RETURN đã post.',
    'debt-report': 'Dư đầu kỳ + Phát sinh Nợ - Tổng phát sinh Có = Dư cuối kỳ; nguồn arLedgers.',
    'ar-ledger-detail': 'Số dư từng dòng bắt đầu từ dư trước kỳ của khách hàng.',
    'fund-report': 'Tồn đầu kỳ + Thu - Chi = Tồn cuối kỳ, tách theo fundType và account; nguồn fundLedgers.',
    'delivery-report': 'Tổng đơn giao tính lại từ đơn con còn hiệu lực; tiền thu lấy fundLedgers, không lấy snapshot đơn tổng.',
    'product-info-report': 'Thông tin sản phẩm ghép tồn kho hiện tại từ inventories và tách Tồn vật lý, Đã giữ chỗ, Tồn khả dụng.',
    'customer-info-report': 'Công nợ lấy arLedgers; doanh số tháng chỉ gồm đơn đã xác nhận kế toán và giá trị thực tế tại thời điểm bán.'
  };
  return rules[type] || 'Báo cáo sử dụng nguồn dữ liệu nghiệp vụ chuẩn của hệ thống.';
}

async function reportWorkbook(type, sheetName, headers, rows, query = {}) {
  const workbook = createWorkbook();
  appendAoaSheet(workbook, sheetName, headers, rows);
  const { from, to } = reportDateRange(query);
  appendAoaSheetToWorkbook(workbook, 'ThongTin', [
    ['Mẫu báo cáo', sheetName], ['Từ ngày', from], ['Đến ngày', to], ['Số dòng', rows.length], ['Thời gian xuất', new Date().toISOString()],
    ['Quy tắc nghiệp vụ', reportBusinessRule(type)]
  ]);
  const safeType = String(type || 'report').replace(/[^a-zA-Z0-9_-]/g, '-');
  const suffix = `${from || 'all'}_${to || dateUtil.todayVN()}`;
  return { buffer: writeWorkbook(workbook), rows: rows.length, fileName: `${safeType}_${suffix}.xlsx` };
}


function orderItems(order = {}) { return Array.isArray(order.items) ? order.items : []; }
function orderQty(order = {}) { return orderItems(order).reduce((s, i) => s + qtyOf(i), 0) || toNumber(order.totalQuantity || order.quantity || 0); }
function basePriceOf(item = {}, product = {}) { return toNumber(item.originalPrice ?? item.basePrice ?? item.listPrice ?? product.salePrice ?? item.salePrice ?? item.price ?? item.unitPrice ?? 0); }
function lineBeforePromo(item = {}, product = {}) { return qtyOf(item) * basePriceOf(item, product); }
function lineAfterPromo(item = {}) { return toNumber(item.finalAmount ?? item.amount ?? item.totalAmount ?? item.lineAmount ?? 0) || qtyOf(item) * priceInclVatOf(item); }
function orderBeforePromo(order = {}, productMap = new Map()) { return orderItems(order).reduce((s, item) => s + lineBeforePromo(item, productMap.get(productCodeOf(item)) || {}), 0) || toNumber(order.beforePromoAmount || order.grossAmount || order.totalBeforeDiscount || order.totalAmount || 0); }
function orderAfterPromo(order = {}) { return toNumber(order.afterPromoAmount || order.totalAfterPromotion || order.totalAmount || order.amount || 0); }
function staffName(order = {}, kind = 'sales') { return kind === 'delivery' ? cleanText(pickDeliveryStaffName(order)) : cleanText(pickSalesStaffName(order)); }
function staffCode(order = {}, kind = 'sales') { return kind === 'delivery' ? cleanText(pickDeliveryStaffCode(order)) : cleanText(pickSalesStaffCode(order)); }

async function loadProductMap() {
  const products = await Product.find({}).select('code name salePrice baseUnit unit brand category').lean();
  return new Map(products.map((p) => [cleanText(p.code), p]));
}

async function buildSalesReportWorkbook(query = {}) {
  const result = await reportService.salesReport({ ...query, full: '1', export: '1' });
  const rows = (result.sales || []).map((row, idx) => ({
    STT: idx + 1,
    Ngay: row.date,
    MaDon: row.code,
    Nguon: row.source,
    MaKhachHang: row.customerCode,
    KhachHang: row.customerName,
    MaNVBH: row.salesStaffCode,
    NVBH: row.salesStaffName,
    MaNVGH: row.deliveryStaffCode,
    NVGH: row.deliveryStaffName,
    SoLuongBan: row.saleQuantity,
    SoLuongKhuyenMai: row.promoQuantity,
    DoanhSoTruocKM: Math.round(toNumber(row.beforePromoAmount)),
    DoanhSoThucTe: Math.round(toNumber(row.actualAmount)),
    ChietKhauKM: Math.round(toNumber(row.promotionDiscountAmount)),
    GiaTriHangKM: Math.round(toNumber(row.promotionValue)),
    DaThuTheoAR: Math.round(toNumber(row.receiptAmount)),
    TraHangTheoAR: Math.round(toNumber(row.returnAmount)),
    DieuChinhCongNo: Math.round(toNumber(row.adjustmentAmount)),
    ConNoTheoAR: Math.round(toNumber(row.debtAmount)),
    TrangThaiGiaoHang: row.deliveryStatus,
    TrangThaiKeToan: row.accountingStatus
  }));
  return reportWorkbook('sales-report', 'BaoCaoBanHang', Object.keys(rows[0] || {
    STT:'', Ngay:'', MaDon:'', Nguon:'', MaKhachHang:'', KhachHang:'', MaNVBH:'', NVBH:'', MaNVGH:'', NVGH:'',
    SoLuongBan:'', SoLuongKhuyenMai:'', DoanhSoTruocKM:'', DoanhSoThucTe:'', ChietKhauKM:'', GiaTriHangKM:'',
    DaThuTheoAR:'', TraHangTheoAR:'', DieuChinhCongNo:'', ConNoTheoAR:'', TrangThaiGiaoHang:'', TrangThaiKeToan:''
  }), rows, query);
}

async function buildDeliveryReportWorkbook(query = {}) {
  const result = await reportService.deliveryReport({ ...query, full: '1', export: '1' });
  const rows = (result.delivery || []).map((row, idx) => ({
    STT: idx + 1,
    NgayGiao: row.deliveryDate,
    MaDonTong: row.code,
    MaNVGH: row.deliveryStaffCode,
    NVGH: row.deliveryStaffName,
    SoDonDangGan: row.assignedOrderCount,
    SoDonDaGiao: row.orderCount,
    TongTienDonCon: Math.round(toNumber(row.totalAmount)),
    DoanhSoDaXacNhan: Math.round(toNumber(row.accountingConfirmedAmount)),
    TienThuTheoQuy: Math.round(toNumber(row.collectedAmount)),
    TrangThai: row.status,
    LechSoDonSnapshot: toNumber(row.dataQuality?.snapshotOrderCountDifference),
    LechTienSnapshot: Math.round(toNumber(row.dataQuality?.snapshotAmountDifference))
  }));
  return reportWorkbook('delivery-report', 'BaoCaoGiaoHang', Object.keys(rows[0] || {
    STT:'', NgayGiao:'', MaDonTong:'', MaNVGH:'', NVGH:'', SoDonDangGan:'', SoDonDaGiao:'', TongTienDonCon:'',
    DoanhSoDaXacNhan:'', TienThuTheoQuy:'', TrangThai:'', LechSoDonSnapshot:'', LechTienSnapshot:''
  }), rows, query);
}

async function buildReturnReportWorkbook(query = {}) {
  const result = await reportService.returnReport({ ...query, full: '1', export: '1' });
  const rows = (result.returns || []).map((row, idx) => ({
    STT: idx + 1,
    Ngay: row.date,
    MaTraHang: row.code,
    MaDon: row.salesOrderCode,
    MaKhachHang: row.customerCode,
    KhachHang: row.customerName,
    MaNVBH: row.salesStaffCode,
    NVBH: row.salesStaffName,
    MaNVGH: row.deliveryStaffCode,
    NVGH: row.deliveryStaffName,
    GiaTriTra: Math.round(toNumber(row.amount)),
    GiaTriChungTu: Math.round(toNumber(row.documentAmount)),
    GiaTriARReturn: Math.round(toNumber(row.arAmount)),
    TrangThaiNhapKho: row.warehouseReceiveStatus,
    TrangThaiTraHang: row.returnState,
    TrangThaiKeToan: row.accountingStatus
  }));
  return reportWorkbook('return-report', 'BaoCaoTraHang', Object.keys(rows[0] || {
    STT:'', Ngay:'', MaTraHang:'', MaDon:'', MaKhachHang:'', KhachHang:'', MaNVBH:'', NVBH:'', MaNVGH:'', NVGH:'',
    GiaTriTra:'', GiaTriChungTu:'', GiaTriARReturn:'', TrangThaiNhapKho:'', TrangThaiTraHang:'', TrangThaiKeToan:''
  }), rows, query);
}

async function buildDebtReportWorkbook(query = {}) {
  const result = await reportService.periodDebtReport({ ...query, full: '1', export: '1', includePaid: '1' });
  const rows = (result.debts || []).map((row, idx) => ({
    STT: idx + 1,
    MaKhachHang: row.customerCode,
    KhachHang: row.customerName,
    MaNVBH: row.salesStaffCode,
    NVBH: row.salesStaffName,
    MaNVGH: row.deliveryStaffCode,
    NVGH: row.deliveryStaffName,
    DuDauKy: Math.round(toNumber(row.openingBalance)),
    PhatSinhNo: Math.round(toNumber(row.debitInPeriod)),
    DaThu: Math.round(toNumber(row.receiptInPeriod)),
    TraHang: Math.round(toNumber(row.returnInPeriod)),
    ChietKhauDieuChinh: Math.round(toNumber(row.adjustmentInPeriod) + toNumber(row.otherCreditInPeriod)),
    TongPhatSinhCo: Math.round(toNumber(row.totalCreditInPeriod)),
    DuCuoiKy: Math.round(toNumber(row.closingBalance))
  }));
  return reportWorkbook('debt-report', 'BaoCaoCongNo', Object.keys(rows[0] || {
    STT:'', MaKhachHang:'', KhachHang:'', MaNVBH:'', NVBH:'', MaNVGH:'', NVGH:'', DuDauKy:'', PhatSinhNo:'',
    DaThu:'', TraHang:'', ChietKhauDieuChinh:'', TongPhatSinhCo:'', DuCuoiKy:''
  }), rows, query);
}

async function buildArLedgerDetailWorkbook(query = {}) {
  const result = await reportService.arLedgerDetailReport({ ...query, full: '1', export: '1' });
  const rows = (result.ledger || []).map((row, idx) => ({
    STT: idx + 1,
    Ngay: row.date,
    MaKhachHang: row.customerCode,
    KhachHang: row.customerName,
    ChungTu: row.documentCode,
    Loai: row.type,
    DienGiai: row.description,
    DuTruocGiaoDich: Math.round(toNumber(row.openingBalance)),
    No: Math.round(toNumber(row.debit)),
    Co: Math.round(toNumber(row.credit)),
    PhanLoaiCo: row.creditCategory,
    DuSauGiaoDich: Math.round(toNumber(row.closingBalance))
  }));
  return reportWorkbook('ar-ledger-detail', 'SoCongNoChiTiet', Object.keys(rows[0] || {
    STT:'', Ngay:'', MaKhachHang:'', KhachHang:'', ChungTu:'', Loai:'', DienGiai:'', DuTruocGiaoDich:'', No:'', Co:'', PhanLoaiCo:'', DuSauGiaoDich:''
  }), rows, query);
}

async function buildStockReportWorkbook(query = {}) {
  // Tồn kho hiện tại không nhận dateFrom/dateTo; nguồn duy nhất là inventories.
  const result = await reportService.stockReport({ ...query, full: '1', export: '1' });
  const rows = (result.stock || []).map((row, idx) => ({
    STT: idx + 1,
    MaSP: cleanText(row.productCode || row.code || row.productId),
    SanPham: cleanText(row.productName || row.name),
    DonViTinh: cleanText(row.unit || row.baseUnit),
    TonVatLy: toNumber(row.onHand ?? row.quantity ?? row.qty),
    DaGiuCho: toNumber(row.reservedQty),
    TonKhaDung: toNumber(row.availableQty)
  }));
  return reportWorkbook('stock-report', 'TonKhoHienTai', Object.keys(rows[0] || {
    STT:'', MaSP:'', SanPham:'', DonViTinh:'', TonVatLy:'', DaGiuCho:'', TonKhaDung:''
  }), rows, {});
}

async function buildInventoryMovementReportWorkbook(query = {}) {
  const result = await reportService.inventoryMovementReport({ ...query, full: '1', export: '1', mode: 'movement' });
  const rows = (result.stock || []).map((row, idx) => ({
    STT: idx + 1,
    MaSP: row.productCode,
    SanPham: row.productName,
    DonViTinh: row.unit,
    TonDauKy: toNumber(row.openingQty),
    NhapMua: toNumber(row.importQty),
    HangTraNhapKho: toNumber(row.returnQty),
    NhapKhac: toNumber(row.otherInQty),
    TongNhap: toNumber(row.inQty),
    XuatBan: toNumber(row.saleQty),
    XuatDaoChungTu: toNumber(row.reversalOutQty),
    XuatKhac: toNumber(row.otherOutQty),
    TongXuat: toNumber(row.outQty),
    DieuChinhRong: toNumber(row.adjustmentQty),
    TonCuoiKy: toNumber(row.endingQty),
    NguonTonCuoi: row.endingSource,
    TonCuoiTheoLedger: toNumber(row.ledgerEndingQty),
    ChenhLechDoiSoat: toNumber(row.reconciliationDifference)
  }));
  return reportWorkbook('inventory-movement-report', 'NhapXuatTon', Object.keys(rows[0] || {
    STT:'', MaSP:'', SanPham:'', DonViTinh:'', TonDauKy:'', NhapMua:'', HangTraNhapKho:'', NhapKhac:'', TongNhap:'',
    XuatBan:'', XuatDaoChungTu:'', XuatKhac:'', TongXuat:'', DieuChinhRong:'', TonCuoiKy:'', NguonTonCuoi:'', TonCuoiTheoLedger:'', ChenhLechDoiSoat:''
  }), rows, query);
}

async function buildStockCardReportWorkbook(query = {}) {
  const result = await reportService.stockCardReport({ ...query, full: '1', export: '1' });
  const rows = (result.transactions || []).map((row, idx) => ({
    STT: idx + 1,
    Ngay: row.date,
    MaSP: row.productCode,
    SanPham: row.productName,
    ChungTu: row.refCode,
    Loai: row.type,
    PhanLoai: row.category,
    TonTruocGiaoDich: toNumber(row.openingQty),
    Nhap: toNumber(row.inQty),
    Xuat: toNumber(row.outQty),
    TonSauGiaoDich: toNumber(row.balanceQty),
    GhiChu: row.note
  }));
  return reportWorkbook('stock-card-report', 'TheKho', Object.keys(rows[0] || {
    STT:'', Ngay:'', MaSP:'', SanPham:'', ChungTu:'', Loai:'', PhanLoai:'', TonTruocGiaoDich:'', Nhap:'', Xuat:'', TonSauGiaoDich:'', GhiChu:''
  }), rows, query);
}

async function buildFundReportWorkbook(query = {}) {
  const result = await reportService.financeReport({ ...query, full: '1', export: '1' });
  const rows = (result.fundLedger || []).map((row, idx) => ({
    STT: idx + 1,
    Ngay: row.date,
    ChungTu: row.code,
    Loai: row.type,
    LoaiQuy: row.fundType,
    TaiKhoanQuy: row.account,
    NguoiLienQuan: row.counterparty,
    TonDauDong: Math.round(toNumber(row.openingBalance)),
    Thu: Math.round(toNumber(row.inAmount)),
    Chi: Math.round(toNumber(row.outAmount)),
    TonCuoiDong: Math.round(toNumber(row.endingBalance)),
    GhiChu: row.note
  }));
  return reportWorkbook('fund-report', 'BaoCaoQuyTien', Object.keys(rows[0] || {
    STT:'', Ngay:'', ChungTu:'', Loai:'', LoaiQuy:'', TaiKhoanQuy:'', NguoiLienQuan:'', TonDauDong:'', Thu:'', Chi:'', TonCuoiDong:'', GhiChu:''
  }), rows, query);
}

async function buildSalesmanReportWorkbook(query = {}) {
  const result = await reportService.salesReport({ ...query, full: '1', export: '1' });
  const rows = (result.bySalesman || []).map((row, idx) => ({
    STT: idx + 1,
    MaNVBH: row.salesmanCode,
    NVBH: row.salesmanName,
    SoDon: row.orderCount,
    SoKhachHang: row.customerCount,
    DoanhSoTruocKM: Math.round(toNumber(row.beforePromoAmount)),
    DoanhSoThucTe: Math.round(toNumber(row.actualAmount)),
    GiaTriHangKM: Math.round(toNumber(row.promotionValue)),
    DaThuTheoAR: Math.round(toNumber(row.receiptAmount)),
    TraHangTheoAR: Math.round(toNumber(row.returnAmount)),
    ConNoTheoAR: Math.round(toNumber(row.debtAmount))
  }));
  return reportWorkbook('salesman-report', 'BaoCaoNVBH', Object.keys(rows[0] || {
    STT:'', MaNVBH:'', NVBH:'', SoDon:'', SoKhachHang:'', DoanhSoTruocKM:'', DoanhSoThucTe:'', GiaTriHangKM:'', DaThuTheoAR:'', TraHangTheoAR:'', ConNoTheoAR:''
  }), rows, query);
}

async function buildDeliverymanReportWorkbook(query = {}) {
  const result = await reportService.deliveryReport({ ...query, full: '1', export: '1' });
  const rows = (result.byStaff || []).map((row, idx) => ({
    STT: idx + 1,
    MaNVGH: row.deliveryStaffCode,
    NVGH: row.deliveryStaffName,
    SoChuyen: row.tripCount,
    SoDonDaGiao: row.orderCount,
    TongTienDonCon: Math.round(toNumber(row.totalAmount)),
    DoanhSoDaXacNhan: Math.round(toNumber(row.accountingConfirmedAmount)),
    ThuTienTheoQuy: Math.round(toNumber(row.collectedAmount))
  }));
  return reportWorkbook('deliveryman-report', 'BaoCaoNVGH', Object.keys(rows[0] || {
    STT:'', MaNVGH:'', NVGH:'', SoChuyen:'', SoDonDaGiao:'', TongTienDonCon:'', DoanhSoDaXacNhan:'', ThuTienTheoQuy:''
  }), rows, query);
}

async function buildCustomerSalesReportWorkbook(query = {}) {
  const sales = await reportService.salesReport({ ...query, full: '1', export: '1' });
  const debt = await reportService.periodDebtReport({ ...query, full: '1', export: '1', includePaid: '1' });
  const debtMap = new Map((debt.debts || []).map((row) => [cleanText(row.customerCode || row.customerName), row]));
  const map = new Map();
  (sales.sales || []).forEach((order) => {
    const key = cleanText(order.customerCode || order.customerName);
    const row = map.get(key) || {
      MaKhachHang: order.customerCode,
      KhachHang: order.customerName,
      MaNVBH: order.salesStaffCode,
      NVBH: order.salesStaffName,
      SoDon: 0,
      DoanhSoTruocKM: 0,
      DoanhSoThucTe: 0,
      GiaTriHangKM: 0,
      DaThuTheoAR: 0,
      TraHangTheoAR: 0
    };
    row.SoDon += 1;
    row.DoanhSoTruocKM += toNumber(order.beforePromoAmount);
    row.DoanhSoThucTe += toNumber(order.actualAmount);
    row.GiaTriHangKM += toNumber(order.promotionValue);
    row.DaThuTheoAR += toNumber(order.receiptAmount);
    row.TraHangTheoAR += toNumber(order.returnAmount);
    map.set(key, row);
  });
  const rows = Array.from(map.entries()).map(([key, row], idx) => {
    const ar = debtMap.get(key) || {};
    return {
      STT: idx + 1,
      ...row,
      DoanhSoTruocKM: Math.round(row.DoanhSoTruocKM),
      DoanhSoThucTe: Math.round(row.DoanhSoThucTe),
      GiaTriHangKM: Math.round(row.GiaTriHangKM),
      DaThuTheoAR: Math.round(row.DaThuTheoAR),
      TraHangTheoAR: Math.round(row.TraHangTheoAR),
      DuDauKy: Math.round(toNumber(ar.openingBalance)),
      DuCuoiKy: Math.round(toNumber(ar.closingBalance))
    };
  });
  return reportWorkbook('customer-sales-report', 'DoanhSoKhachHang', Object.keys(rows[0] || {
    STT:'', MaKhachHang:'', KhachHang:'', MaNVBH:'', NVBH:'', SoDon:'', DoanhSoTruocKM:'', DoanhSoThucTe:'', GiaTriHangKM:'',
    DaThuTheoAR:'', TraHangTheoAR:'', DuDauKy:'', DuCuoiKy:''
  }), rows, query);
}

async function buildProductSalesReportWorkbook(query = {}) {
  const result = await reportService.salesReport({ ...query, full: '1', export: '1' });
  const map = new Map();
  (result.sales || []).forEach((order) => (order.items || []).forEach((item) => {
    const key = cleanText(item.productCode || item.productName);
    const row = map.get(key) || {
      MaSP: item.productCode,
      SanPham: item.productName,
      NhanHang: item.brand,
      SoLuongBan: 0,
      DoanhSoTruocKM: 0,
      DoanhSoThucTe: 0
    };
    row.SoLuongBan += toNumber(item.quantity);
    row.DoanhSoTruocKM += toNumber(item.catalogAmount);
    row.DoanhSoThucTe += toNumber(item.actualAmount);
    map.set(key, row);
  }));
  const totalActual = Array.from(map.values()).reduce((sum, row) => sum + row.DoanhSoThucTe, 0) || 1;
  const rows = Array.from(map.values()).map((row, idx) => ({
    STT: idx + 1,
    ...row,
    SoLuongBan: row.SoLuongBan,
    DoanhSoTruocKM: Math.round(row.DoanhSoTruocKM),
    DoanhSoThucTe: Math.round(row.DoanhSoThucTe),
    ChietKhauKM: Math.round(row.DoanhSoTruocKM - row.DoanhSoThucTe),
    TyTrong: `${roundMoney((row.DoanhSoThucTe / totalActual) * 100, 2)}%`
  }));
  return reportWorkbook('product-sales-report', 'DoanhSoSanPham', Object.keys(rows[0] || {
    STT:'', MaSP:'', SanPham:'', NhanHang:'', SoLuongBan:'', DoanhSoTruocKM:'', DoanhSoThucTe:'', ChietKhauKM:'', TyTrong:''
  }), rows, query);
}


const SENSITIVE_USER_FIELDS = new Set([
  'password', 'passwordHash', 'hash', 'salt', 'token', 'tokens', 'accessToken', 'refreshToken',
  'secret', 'apiKey', 'session', 'sessions', 'resetPasswordToken', 'verificationToken'
]);

function firstText(row = {}, fields = []) {
  for (const field of fields) {
    const value = cleanText(row[field]);
    if (value) return value;
  }
  return '';
}

function boolStatus(value) {
  if (value === true) return 'Hoạt động';
  if (value === false) return 'Ngưng hoạt động';
  return cleanText(value);
}

function safeExtraJson(row = {}, usedFields = [], blockedFields = []) {
  const used = new Set([...usedFields, ...blockedFields, '_id', '__v', 'searchText']);
  const extra = {};
  Object.keys(row || {}).forEach((key) => {
    if (used.has(key)) return;
    const value = row[key];
    if (value === undefined || value === null || value === '') return;
    extra[key] = value;
  });
  return Object.keys(extra).length ? JSON.stringify(extra) : '';
}

function productInfoRow(product = {}, idx = 0, stockMap = new Map()) {
  const productCode = firstText(product, ['code', 'productCode', 'sku', 'id']);
  const stock = stockMap.get(cleanText(productCode).toUpperCase()) || {};
  const used = [
    'code', 'productCode', 'sku', 'name', 'productName', 'barcode', 'brand', 'category',
    'unit', 'baseUnit', 'conversionRate', 'packing', 'salePrice', 'costPrice',
    'warehouseCode', 'warehouseName', 'defaultWarehouse', 'isActive', 'status', 'createdAt', 'updatedAt'
  ];
  return {
    STT: idx + 1,
    MaSP: productCode,
    TenSP: firstText(product, ['name', 'productName', 'title']),
    Barcode: firstText(product, ['barcode', 'barCode']),
    NhanHang: firstText(product, ['brand', 'brandName']),
    NganhHang: firstText(product, ['category', 'categoryName', 'groupName']),
    DonVi: firstText(product, ['unit', 'baseUnit', 'uom']),
    DonViCoSo: firstText(product, ['baseUnit', 'unit']),
    QuyDoi: toNumber(product.conversionRate || product.ratio || 1),
    QuyCach: firstText(product, ['packing', 'packaging']),
    GiaBan: Math.round(toNumber(product.salePrice || product.price || product.sellPrice)),
    GiaVon: Math.round(toNumber(product.costPrice || product.cost || product.purchasePrice)),
    TonVatLy: toNumber(stock.onHand ?? stock.quantity ?? stock.qty),
    DaGiuCho: toNumber(stock.reservedQty),
    TonKhaDung: toNumber(stock.availableQty),
    KhoMacDinh: firstText(product, ['warehouseCode', 'defaultWarehouse', 'warehouseName']),
    TenKhoMacDinh: firstText(product, ['warehouseName', 'defaultWarehouseName']),
    TrangThai: boolStatus(product.isActive ?? product.status),
    NgayTao: normalizeDateOnly(product.createdAt),
    NgayCapNhat: normalizeDateOnly(product.updatedAt),
    ThongTinKhac: safeExtraJson(product, used)
  };
}

async function buildProductInfoReportWorkbook(query = {}) {
  const [docs, stockReport] = await Promise.all([
    Product.find({}).sort({ code: 1, name: 1 }).limit(safeLimit(query)).lean(),
    reportService.stockReport({ full: '1', export: '1' })
  ]);
  const stockMap = new Map((stockReport.stock || stockReport.items || []).map((row) => [
    cleanText(row.productCode || row.code).toUpperCase(),
    row
  ]));
  const rows = docs.map((product, idx) => productInfoRow(product, idx, stockMap));
  const headers = Object.keys(rows[0] || productInfoRow({}, -1, stockMap));
  return reportWorkbook('product-info-report', 'ThongTinSanPham', headers, rows, query);
}

function arDebtKeyValues(row = {}) {
  return [row.customerCode, row.customerId, row.customerName].map(cleanText).filter(Boolean);
}

async function loadCurrentDebtByCustomer() {
  const result = await reportService.periodDebtReport({
    dateFrom: '0000-01-01',
    dateTo: dateUtil.todayVN(),
    full: '1',
    export: '1',
    includePaid: '1'
  });
  const map = new Map();
  (result.debts || result.items || []).forEach((row) => {
    const balance = toNumber(row.closingBalance);
    arDebtKeyValues(row).forEach((key) => map.set(key, balance));
  });
  return map;
}

async function loadMonthSalesByCustomer(query = {}) {
  const today = dateUtil.todayVN();
  const monthStart = cleanText(query.monthStart || query.monthFrom || `${today.slice(0, 7)}-01`);
  const monthEnd = cleanText(query.monthEnd || query.monthTo || today);
  const result = await reportService.salesReport({
    dateFrom: monthStart,
    dateTo: monthEnd,
    full: '1',
    export: '1'
  });
  const map = new Map();
  (result.sales || result.items || []).forEach((order) => {
    const amount = toNumber(order.actualAmount);
    [order.customerCode, order.customerId, order.customerName].map(cleanText).filter(Boolean).forEach((key) => {
      map.set(key, toNumber(map.get(key)) + amount);
    });
  });
  return map;
}

function valueByKeys(map, keys = []) {
  for (const key of keys.map(cleanText).filter(Boolean)) {
    if (map.has(key)) return toNumber(map.get(key));
  }
  return 0;
}

function customerInfoRow(customer = {}, idx = 0, debtMap = new Map(), monthSalesMap = new Map()) {
  const taxProfile = extractCustomerTaxProfile(customer);
  const businessProfile = extractCustomerBusinessProfile(customer);
  const used = [
    'code', 'customerCode', 'name', 'customerName', 'businessName', 'customerBusinessName', 'householdBusinessName', 'taxBusinessName', 'invoiceBusinessName', 'tenHoKinhDoanh', 'phone', 'mobile', 'customerPhone',
    'address', 'customerAddress', 'taxCode', 'customerTaxCode', 'taxNumber', 'vatNumber', 'vatCode', 'mst',
    'taxInvoiceAddress', 'customerTaxInvoiceAddress', 'invoiceAddress', 'vatInvoiceAddress', 'billingAddress',
    'route', 'area', 'region', 'staffCode', 'staffName',
    'salesStaffCode', 'salesStaffName', 'deliveryStaffCode', 'deliveryStaffName',
    'isActive', 'status', 'createdAt', 'updatedAt'
  ];
  const keys = [customer.code, customer.customerCode, customer.id, customer._id, customer.name, customer.customerName];
  return {
    STT: idx + 1,
    MaKH: firstText(customer, ['code', 'customerCode', 'id']),
    TenKH: firstText(customer, ['name', 'customerName']),
    TenHoKinhDoanh: businessProfile.businessName,
    SDT: firstText(customer, ['phone', 'mobile', 'customerPhone', 'tel']),
    DiaChi: firstText(customer, ['address', 'customerAddress', 'fullAddress']),
    MaSoThue: taxProfile.taxCode,
    DiaChiHoaDonThue: taxProfile.taxInvoiceAddress,
    Tuyen: firstText(customer, ['route', 'routeName', 'line']),
    KhuVuc: firstText(customer, ['area', 'areaName', 'region', 'province']),
    MaNVBH: firstText(customer, ['staffCode', 'salesStaffCode', 'salesmanCode']),
    NVBHPhuTrach: firstText(customer, ['staffName', 'salesStaffName', 'salesmanName']),
    MaNVGH: firstText(customer, ['deliveryStaffCode', 'shipperCode']),
    NVGHPhuTrach: firstText(customer, ['deliveryStaffName', 'shipperName']),
    CongNoHienTai: Math.round(valueByKeys(debtMap, keys)),
    DoanhSoThang: Math.round(valueByKeys(monthSalesMap, keys)),
    TrangThai: boolStatus(customer.isActive ?? customer.status),
    NgayTao: normalizeDateOnly(customer.createdAt),
    NgayCapNhat: normalizeDateOnly(customer.updatedAt),
    ThongTinKhac: safeExtraJson(customer, used)
  };
}

async function buildCustomerInfoReportWorkbook(query = {}) {
  const [customers, debtMap, monthSalesMap] = await Promise.all([
    Customer.find({}).sort({ code: 1, name: 1 }).limit(safeLimit(query)).lean(),
    loadCurrentDebtByCustomer(),
    loadMonthSalesByCustomer(query)
  ]);
  const rows = customers.map((c, idx) => customerInfoRow(c, idx, debtMap, monthSalesMap))
    .sort((a, b) => toNumber(b.CongNoHienTai) - toNumber(a.CongNoHienTai) || cleanText(a.MaKH).localeCompare(cleanText(b.MaKH)));
  rows.forEach((row, idx) => { row.STT = idx + 1; });
  const headers = Object.keys(rows[0] || customerInfoRow({}, -1));
  return reportWorkbook('customer-info-report', 'ThongTinKhachHang', headers, rows, query);
}

function sanitizeUserExtra(row = {}) {
  const extra = {};
  Object.keys(row || {}).forEach((key) => {
    if (SENSITIVE_USER_FIELDS.has(key) || key.startsWith('_') || ['__v', 'searchText'].includes(key)) return;
    if ([
      'username', 'fullName', 'name', 'code', 'staffCode', 'role', 'roles', 'phone', 'email',
      'isActive', 'status', 'permissions', 'area', 'route', 'lastLoginAt', 'lastLogin', 'createdAt', 'updatedAt'
    ].includes(key)) return;
    const value = row[key];
    if (value === undefined || value === null || value === '') return;
    extra[key] = value;
  });
  return Object.keys(extra).length ? JSON.stringify(extra) : '';
}

function userInfoRow(user = {}, idx = 0) {
  return {
    STT: idx + 1,
    TenDangNhap: firstText(user, ['username', 'loginName']),
    HoTen: firstText(user, ['fullName', 'name', 'displayName']),
    MaNhanVien: firstText(user, ['staffCode', 'code', 'employeeCode']),
    VaiTro: Array.isArray(user.roles) ? user.roles.join(', ') : firstText(user, ['role', 'roles']),
    SDT: firstText(user, ['phone', 'mobile']),
    Email: firstText(user, ['email']),
    TrangThai: boolStatus(user.isActive ?? user.status),
    QuyenTruyCap: Array.isArray(user.permissions) ? user.permissions.join(', ') : cleanText(user.permissions || user.permission || ''),
    KhuVucTuyen: firstText(user, ['area', 'route', 'region']),
    NgayTao: normalizeDateOnly(user.createdAt),
    NgayCapNhat: normalizeDateOnly(user.updatedAt),
    LanDangNhapGanNhat: normalizeDateOnly(user.lastLoginAt || user.lastLogin || user.lastSeenAt),
    ThongTinKhac: sanitizeUserExtra(user)
  };
}

async function buildUserInfoReportWorkbook(query = {}) {
  const User = models.users;
  const docs = await User.find({}).select('-password -passwordHash -hash -salt -token -tokens -accessToken -refreshToken -secret -apiKey -session -sessions -resetPasswordToken -verificationToken').sort({ role: 1, code: 1, username: 1 }).limit(safeLimit(query)).lean();
  const rows = docs.map(userInfoRow);
  const headers = Object.keys(rows[0] || userInfoRow({}, -1));
  return reportWorkbook('user-info-report', 'ThongTinTaiKhoan', headers, rows, query);
}

const BUSINESS_REPORT_BUILDERS = {
  'sales-report': buildSalesReportWorkbook,
  'delivery-report': buildDeliveryReportWorkbook,
  'return-report': buildReturnReportWorkbook,
  'debt-report': buildDebtReportWorkbook,
  'ar-ledger-detail': buildArLedgerDetailWorkbook,
  'stock-report': buildStockReportWorkbook,
  'inventory-movement-report': buildInventoryMovementReportWorkbook,
  'stock-card-report': buildStockCardReportWorkbook,
  'fund-report': buildFundReportWorkbook,
  'salesman-report': buildSalesmanReportWorkbook,
  'deliveryman-report': buildDeliverymanReportWorkbook,
  'customer-sales-report': buildCustomerSalesReportWorkbook,
  'product-sales-report': buildProductSalesReportWorkbook,
  'product-info-report': buildProductInfoReportWorkbook,
  'customer-info-report': buildCustomerInfoReportWorkbook,
  'user-info-report': buildUserInfoReportWorkbook
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

async function buildBuiltInTemplateFile(type) {
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
  return [...new Set([...exportRepository.getExportTypes(), 'vatInvoiceTT78', 'vat-non-invoice-orders', ...BUSINESS_REPORT_TYPES])].sort();
}

async function exportToExcel(type, query = {}) {
  const normalizedType = String(type || '').trim();
  if (['vatInvoiceTT78', 'vat-invoice-tt78', 'hoa-don-vat-tt78'].includes(normalizedType)) {
    return buildVatInvoiceTT78Workbook(query);
  }
  if (['vat-non-invoice-orders', 'vatNonInvoiceOrders'].includes(normalizedType)) {
    return buildVatNonInvoiceOrdersWorkbook(query);
  }
  if (BUSINESS_REPORT_BUILDERS[normalizedType]) {
    return BUSINESS_REPORT_BUILDERS[normalizedType](query);
  }
  const rows = await exportRepository.findForExport(type, query);
  if (!rows) return { error: 'Loại dữ liệu export không hợp lệ', status: 400 };
  const buffer = await buildWorkbook({ type, rows });
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
