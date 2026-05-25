const { createId } = require('../utils/idGenerator');

function ensurePostingShape(data) {
  if (!data.postings) data.postings = [];
  return data;
}

function normalize(value) {
  return String(value || '').trim().toUpperCase();
}

function isReversePosting(posting) {
  return String(posting.postingType || '').startsWith('REVERSE_') || !!posting.reversalOfPostingId;
}

function getActivePostingsByDocument(data, documentId) {
  ensurePostingShape(data);
  return data.postings.filter(posting => {
    return posting.documentId === documentId && posting.isCancelled !== true && !isReversePosting(posting);
  });
}

function hasPostedDocument(data, documentId) {
  return getActivePostingsByDocument(data, documentId).length > 0;
}

function hasReversedDocument(data, documentId) {
  ensurePostingShape(data);
  return data.postings.some(posting => {
    return posting.reversedFromDocumentId === documentId || posting.reversalOfDocumentId === documentId;
  });
}

function createInventoryPosting(input = {}) {
  return {
    id: createId('POST'),
    documentId: input.documentId,
    documentNo: input.documentNo,
    documentType: input.documentType,
    postingType: input.postingType,
    direction: input.direction,
    productCode: input.productCode,
    productName: input.productName,
    warehouseCode: input.warehouseCode,
    warehouseName: input.warehouseName,
    unit: input.unit,
    qtyIn: Number(input.qtyIn || 0),
    qtyOut: Number(input.qtyOut || 0),
    unitPrice: Number(input.unitPrice || 0),
    amountIn: Number(input.amountIn || 0),
    amountOut: Number(input.amountOut || 0),
    customerCode: input.customerCode || '',
    customerName: input.customerName || '',
    staffCode: input.staffCode || '',
    staffName: input.staffName || '',
    occurredAt: input.occurredAt || new Date().toISOString(),
    createdAt: input.createdAt || new Date().toISOString(),
    reversalOfPostingId: input.reversalOfPostingId || null,
    reversalOfDocumentId: input.reversalOfDocumentId || null,
    reversedFromDocumentId: input.reversedFromDocumentId || null,
    reverseReason: input.reverseReason || ''
  };
}

function postWarehouseReceipt(data, receipt) {
  ensurePostingShape(data);

  if (hasPostedDocument(data, receipt.id)) {
    throw new Error(`Phiếu ${receipt.documentNo} đã hạch toán kho`);
  }

  const now = new Date().toISOString();
  const postings = (receipt.items || []).map(item => createInventoryPosting({
    documentId: receipt.id,
    documentNo: receipt.documentNo,
    documentType: 'WAREHOUSE_RECEIPT',
    postingType: 'INVENTORY_IN',
    direction: 'IN',
    productCode: item.productCode,
    productName: item.productName,
    warehouseCode: item.warehouseCode || receipt.warehouseCode,
    warehouseName: item.warehouseName || receipt.warehouseName,
    unit: item.unit,
    qtyIn: Number(item.quantity || 0),
    qtyOut: 0,
    unitPrice: Number(item.price || 0),
    amountIn: Number(item.amount || 0),
    amountOut: 0,
    occurredAt: receipt.receiptDate || now,
    createdAt: now
  }));

  data.postings.push(...postings);
  return postings;
}

function reverseWarehouseReceipt(data, receipt, reason = '') {
  ensurePostingShape(data);

  if (hasReversedDocument(data, receipt.id)) {
    throw new Error(`Phiếu ${receipt.documentNo} đã có bút toán đảo, không được hủy lặp`);
  }

  const activePostings = getActivePostingsByDocument(data, receipt.id);
  const now = new Date().toISOString();

  const postings = activePostings.map(original => createInventoryPosting({
    documentId: receipt.id,
    documentNo: receipt.documentNo,
    documentType: original.documentType || 'WAREHOUSE_RECEIPT',
    postingType: `REVERSE_${original.postingType || 'INVENTORY_IN'}`,
    direction: original.direction === 'IN' ? 'OUT' : 'IN',
    productCode: original.productCode,
    productName: original.productName,
    warehouseCode: original.warehouseCode,
    warehouseName: original.warehouseName,
    unit: original.unit,
    qtyIn: Number(original.qtyOut || 0),
    qtyOut: Number(original.qtyIn || 0),
    unitPrice: Number(original.unitPrice || 0),
    amountIn: Number(original.amountOut || 0),
    amountOut: Number(original.amountIn || 0),
    occurredAt: now,
    createdAt: now,
    reversalOfPostingId: original.id,
    reversalOfDocumentId: receipt.id,
    reversedFromDocumentId: receipt.id,
    reverseReason: reason
  }));

  data.postings.push(...postings);
  return postings;
}

function postSalesOrder(data, order) {
  ensurePostingShape(data);

  if (hasPostedDocument(data, order.id)) {
    throw new Error(`Đơn ${order.documentNo} đã hạch toán kho`);
  }

  const now = new Date().toISOString();
  const postings = (order.items || []).map(item => createInventoryPosting({
    documentId: order.id,
    documentNo: order.documentNo,
    documentType: 'SALES_ORDER',
    postingType: 'INVENTORY_OUT',
    direction: 'OUT',
    productCode: item.productCode,
    productName: item.productName,
    warehouseCode: item.warehouseCode || order.warehouseCode,
    warehouseName: item.warehouseName || order.warehouseName,
    unit: item.unit,
    qtyIn: 0,
    qtyOut: Number(item.quantity || 0),
    unitPrice: Number(item.price || 0),
    amountIn: 0,
    amountOut: Number(item.amount || 0),
    customerCode: order.customerCode,
    customerName: order.customerName,
    staffCode: order.staffCode,
    staffName: order.staffName,
    occurredAt: order.orderDate || now,
    createdAt: now
  }));

  data.postings.push(...postings);
  return postings;
}

function reverseSalesOrder(data, order, reason = '') {
  ensurePostingShape(data);

  if (hasReversedDocument(data, order.id)) {
    throw new Error(`Đơn ${order.documentNo} đã có bút toán đảo, không được hủy lặp`);
  }

  const activePostings = getActivePostingsByDocument(data, order.id);
  const now = new Date().toISOString();

  const postings = activePostings.map(original => createInventoryPosting({
    documentId: order.id,
    documentNo: order.documentNo,
    documentType: original.documentType || 'SALES_ORDER',
    postingType: `REVERSE_${original.postingType || 'INVENTORY_OUT'}`,
    direction: original.direction === 'OUT' ? 'IN' : 'OUT',
    productCode: original.productCode,
    productName: original.productName,
    warehouseCode: original.warehouseCode,
    warehouseName: original.warehouseName,
    unit: original.unit,
    qtyIn: Number(original.qtyOut || 0),
    qtyOut: Number(original.qtyIn || 0),
    unitPrice: Number(original.unitPrice || 0),
    amountIn: Number(original.amountOut || 0),
    amountOut: Number(original.amountIn || 0),
    customerCode: original.customerCode,
    customerName: original.customerName,
    staffCode: original.staffCode,
    staffName: original.staffName,
    occurredAt: now,
    createdAt: now,
    reversalOfPostingId: original.id,
    reversalOfDocumentId: order.id,
    reversedFromDocumentId: order.id,
    reverseReason: reason
  }));

  data.postings.push(...postings);
  return postings;
}

module.exports = {
  postWarehouseReceipt,
  reverseWarehouseReceipt,
  postSalesOrder,
  reverseSalesOrder,
  hasPostedDocument,
  hasReversedDocument,
  getActivePostingsByDocument
};
