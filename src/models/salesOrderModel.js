const { createId, createDocumentNo } = require('../utils/idGenerator');

function cleanText(value) {
  return String(value || '').trim();
}

function cleanCode(value) {
  return cleanText(value).toUpperCase();
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function buildSalesOrderItem(input = {}, lineNo = 1, product = null, orderWarehouse = {}) {
  const productCode = cleanCode(input.productCode || input.code || input.maHang || input.maSanPham);
  const quantity = toNumber(input.quantity || input.qty || input.soLuong, 0);
  const price = toNumber(input.price || input.unitPrice || input.salePrice || input.giaBan || input.donGia || (product && product.salePrice), 0);
  const warehouseCode = cleanCode(input.warehouseCode || orderWarehouse.warehouseCode || (product && product.warehouseCode));
  const warehouseName = cleanText(input.warehouseName || orderWarehouse.warehouseName || (product && product.warehouseName));

  return {
    lineNo,
    productCode,
    productName: cleanText(input.productName || input.name || input.tenHang || input.tenSanPham || (product && product.name)),
    unit: cleanText(input.unit || input.dvt || (product && product.unit)),
    warehouseCode,
    warehouseName,
    quantity,
    price,
    amount: quantity * price,
    discountAmount: toNumber(input.discountAmount || input.chietKhau, 0),
    note: cleanText(input.note)
  };
}

function createSalesOrder(input = {}, documents = []) {
  const now = new Date().toISOString();
  const warehouseCode = cleanCode(input.warehouseCode || 'KHO_CHINH');
  const warehouseName = cleanText(input.warehouseName || 'Kho chính');
  const items = Array.isArray(input.items) ? input.items : [];

  const orderItems = items.map((item, index) => buildSalesOrderItem(item, index + 1, null, { warehouseCode, warehouseName }));
  const totalQuantity = orderItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const grossAmount = orderItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const discountAmount = orderItems.reduce((sum, item) => sum + Number(item.discountAmount || 0), 0) + toNumber(input.discountAmount, 0);
  const totalAmount = grossAmount - discountAmount;

  return {
    id: input.id || createId('SO'),
    type: 'SALES_ORDER',
    documentNo: input.documentNo || createDocumentNo(documents, 'SO'),
    status: input.status || 'DRAFT',
    orderDate: input.orderDate || now,

    customerCode: cleanCode(input.customerCode || input.maKhachHang),
    customerName: cleanText(input.customerName || input.tenKhachHang),
    customerPhone: cleanText(input.customerPhone || input.phone || input.sdt),
    customerAddress: cleanText(input.customerAddress || input.address || input.diaChi),

    staffCode: cleanCode(input.staffCode || input.salesCode || input.maNhanVien),
    staffName: cleanText(input.staffName || input.salesName || input.tenNhanVien),

    warehouseCode,
    warehouseName,

    items: orderItems,
    totalLines: orderItems.length,
    totalQuantity,
    grossAmount,
    discountAmount,
    totalAmount,
    paidAmount: toNumber(input.paidAmount || input.daThu, 0),
    debtAmount: totalAmount - toNumber(input.paidAmount || input.daThu, 0),

    note: cleanText(input.note),
    createdAt: input.createdAt || now,
    updatedAt: now,
    postedAt: input.postedAt || null,
    cancelledAt: input.cancelledAt || null,
    cancelReason: input.cancelReason || ''
  };
}

module.exports = {
  createSalesOrder,
  buildSalesOrderItem,
  cleanCode,
  cleanText,
  toNumber
};
