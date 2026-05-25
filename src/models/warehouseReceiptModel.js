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

function buildReceiptItem(input = {}, lineNo = 1, product = null, receiptWarehouse = {}) {
  const productCode = cleanCode(input.productCode || input.code || input.maHang || input.maSanPham);
  const quantity = toNumber(input.quantity || input.qty || input.soLuong, 0);
  const price = toNumber(input.price || input.unitPrice || input.giaNhap || input.donGia, 0);
  const warehouseCode = cleanCode(input.warehouseCode || receiptWarehouse.warehouseCode || (product && product.warehouseCode));
  const warehouseName = cleanText(input.warehouseName || receiptWarehouse.warehouseName || (product && product.warehouseName));

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
    note: cleanText(input.note)
  };
}

function createWarehouseReceipt(input = {}, documents = []) {
  const now = new Date().toISOString();
  const warehouseCode = cleanCode(input.warehouseCode || 'KHO_CHINH');
  const warehouseName = cleanText(input.warehouseName || 'Kho chính');
  const items = Array.isArray(input.items) ? input.items : [];

  const receiptItems = items.map((item, index) => buildReceiptItem(item, index + 1, null, { warehouseCode, warehouseName }));
  const totalQuantity = receiptItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const totalAmount = receiptItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);

  return {
    id: input.id || createId('PNK'),
    type: 'WAREHOUSE_RECEIPT',
    documentNo: input.documentNo || createDocumentNo(documents, 'PNK'),
    status: input.status || 'DRAFT',
    receiptDate: input.receiptDate || now,

    supplierCode: cleanCode(input.supplierCode),
    supplierName: cleanText(input.supplierName || 'Nhập kho'),

    warehouseCode,
    warehouseName,

    receiverCode: cleanCode(input.receiverCode),
    receiverName: cleanText(input.receiverName),

    items: receiptItems,
    totalLines: receiptItems.length,
    totalQuantity,
    totalAmount,

    note: cleanText(input.note),
    createdAt: input.createdAt || now,
    updatedAt: now,
    postedAt: input.postedAt || null,
    cancelledAt: input.cancelledAt || null,
    cancelReason: input.cancelReason || ''
  };
}

module.exports = {
  createWarehouseReceipt,
  buildReceiptItem,
  cleanCode,
  cleanText,
  toNumber
};
