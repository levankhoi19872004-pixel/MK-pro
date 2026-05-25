const { createWarehouseReceipt, buildReceiptItem, cleanCode, cleanText } = require('../models/warehouseReceiptModel');
const { getProductByCode } = require('./productService');
const { postWarehouseReceipt, reverseWarehouseReceipt } = require('./postingService');
const { getStock } = require('./inventoryService');

function ensureShape(data) {
  if (!data.documents) data.documents = [];
  if (!data.products) data.products = [];
  if (!data.postings) data.postings = [];
  return data;
}

function isReceipt(document) {
  return document && document.type === 'WAREHOUSE_RECEIPT';
}

function listWarehouseReceipts(data, query = {}) {
  ensureShape(data);

  const keyword = cleanText(query.keyword || query.q).toLowerCase();
  const status = cleanCode(query.status);
  const fromDate = query.fromDate ? new Date(query.fromDate) : null;
  const toDate = query.toDate ? new Date(query.toDate) : null;

  return data.documents
    .filter(isReceipt)
    .filter(receipt => !status || cleanCode(receipt.status) === status)
    .filter(receipt => {
      if (!fromDate && !toDate) return true;
      const d = new Date(receipt.receiptDate || receipt.createdAt);
      if (fromDate && d < fromDate) return false;
      if (toDate && d > toDate) return false;
      return true;
    })
    .filter(receipt => {
      if (!keyword) return true;
      return [
        receipt.documentNo,
        receipt.supplierCode,
        receipt.supplierName,
        receipt.warehouseCode,
        receipt.warehouseName,
        receipt.receiverName,
        receipt.note
      ].some(value => String(value || '').toLowerCase().includes(keyword));
    })
    .sort((a, b) => new Date(b.receiptDate || b.createdAt) - new Date(a.receiptDate || a.createdAt));
}

function getWarehouseReceipt(data, idOrDocumentNo) {
  ensureShape(data);
  const key = cleanCode(idOrDocumentNo);
  return data.documents.find(document => {
    return isReceipt(document) && (cleanCode(document.id) === key || cleanCode(document.documentNo) === key);
  }) || null;
}

function validateReceiptItems(data, inputItems = [], receiptWarehouse = {}) {
  ensureShape(data);

  if (!Array.isArray(inputItems) || inputItems.length === 0) {
    throw new Error('Phiếu nhập phải có ít nhất 1 dòng sản phẩm');
  }

  const errors = [];
  const validItems = [];

  inputItems.forEach((rawItem, index) => {
    const productCode = cleanCode(rawItem.productCode || rawItem.code || rawItem.maHang || rawItem.maSanPham);
    const product = getProductByCode(data, productCode);
    const item = buildReceiptItem(rawItem, index + 1, product, receiptWarehouse);

    if (!item.productCode) errors.push(`Dòng ${index + 1}: thiếu mã sản phẩm`);
    if (!product) errors.push(`Dòng ${index + 1}: sản phẩm ${item.productCode || '(trống)'} chưa có trong danh mục`);
    if (product && product.isActive === false) errors.push(`Dòng ${index + 1}: sản phẩm ${item.productCode} đã ngừng sử dụng`);
    if (!item.productName) errors.push(`Dòng ${index + 1}: thiếu tên sản phẩm`);
    if (Number(item.quantity) <= 0) errors.push(`Dòng ${index + 1}: số lượng nhập phải lớn hơn 0`);
    if (Number(item.price) < 0) errors.push(`Dòng ${index + 1}: đơn giá không được âm`);
    if (!item.warehouseCode) errors.push(`Dòng ${index + 1}: thiếu kho nhập`);

    if (product) {
      item.productName = item.productName || product.name;
      item.unit = item.unit || product.unit;
      item.warehouseCode = item.warehouseCode || product.warehouseCode;
      item.warehouseName = item.warehouseName || product.warehouseName;
    }

    item.amount = Number(item.quantity || 0) * Number(item.price || 0);
    validItems.push(item);
  });

  return {
    ok: errors.length === 0,
    errors,
    items: validItems,
    totalLines: validItems.length,
    totalQuantity: validItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    totalAmount: validItems.reduce((sum, item) => sum + Number(item.amount || 0), 0)
  };
}

function previewWarehouseReceipt(data, input = {}) {
  const warehouseCode = cleanCode(input.warehouseCode || 'KHO_CHINH');
  const warehouseName = cleanText(input.warehouseName || 'Kho chính');
  return validateReceiptItems(data, input.items || [], { warehouseCode, warehouseName });
}

function createReceiptDraft(data, input = {}) {
  ensureShape(data);

  const warehouseCode = cleanCode(input.warehouseCode || 'KHO_CHINH');
  const warehouseName = cleanText(input.warehouseName || 'Kho chính');
  const preview = validateReceiptItems(data, input.items || [], { warehouseCode, warehouseName });

  if (!preview.ok) {
    const error = new Error('Phiếu nhập chưa hợp lệ');
    error.details = preview.errors;
    throw error;
  }

  const receipt = createWarehouseReceipt({
    ...input,
    warehouseCode,
    warehouseName,
    items: preview.items,
    status: 'DRAFT'
  }, data.documents);

  data.documents.push(receipt);
  return receipt;
}

function confirmWarehouseReceipt(data, idOrDocumentNo) {
  ensureShape(data);

  const receipt = getWarehouseReceipt(data, idOrDocumentNo);
  if (!receipt) throw new Error('Không tìm thấy phiếu nhập');
  if (receipt.status === 'POSTED') throw new Error('Phiếu nhập đã xác nhận rồi');
  if (receipt.status === 'CANCELLED') throw new Error('Phiếu nhập đã bị hủy');

  const preview = validateReceiptItems(data, receipt.items || [], {
    warehouseCode: receipt.warehouseCode,
    warehouseName: receipt.warehouseName
  });

  if (!preview.ok) {
    const error = new Error('Phiếu nhập chưa hợp lệ nên không thể xác nhận');
    error.details = preview.errors;
    throw error;
  }

  receipt.items = preview.items;
  receipt.totalLines = preview.totalLines;
  receipt.totalQuantity = preview.totalQuantity;
  receipt.totalAmount = preview.totalAmount;
  receipt.status = 'POSTED';
  receipt.postedAt = new Date().toISOString();
  receipt.updatedAt = new Date().toISOString();

  const postings = postWarehouseReceipt(data, receipt);

  return {
    receipt,
    postings
  };
}

function cancelWarehouseReceipt(data, idOrDocumentNo, reason = '') {
  ensureShape(data);

  const receipt = getWarehouseReceipt(data, idOrDocumentNo);
  if (!receipt) throw new Error('Không tìm thấy phiếu nhập');
  if (receipt.status === 'CANCELLED') throw new Error('Phiếu nhập đã hủy rồi');

  if (receipt.status === 'POSTED') {
    const insufficient = [];
    receipt.items.forEach(item => {
      const stock = getStock(data, item.productCode, item.warehouseCode || receipt.warehouseCode);
      if (stock < Number(item.quantity || 0)) {
        insufficient.push(`${item.productCode}: tồn ${stock}, cần đảo ${item.quantity}`);
      }
    });

    if (insufficient.length > 0) {
      const error = new Error('Không thể hủy phiếu nhập vì tồn kho hiện tại không đủ để đảo bút toán');
      error.details = insufficient;
      throw error;
    }

    reverseWarehouseReceipt(data, receipt, reason);
  }

  receipt.status = 'CANCELLED';
  receipt.cancelledAt = new Date().toISOString();
  receipt.cancelReason = cleanText(reason);
  receipt.updatedAt = new Date().toISOString();

  return receipt;
}

module.exports = {
  listWarehouseReceipts,
  getWarehouseReceipt,
  previewWarehouseReceipt,
  createReceiptDraft,
  confirmWarehouseReceipt,
  cancelWarehouseReceipt,
  validateReceiptItems
};
