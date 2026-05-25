const { cleanText, cleanCode } = require('../models/receivableModel');
const { getStock } = require('./inventoryService');
const { reverseWarehouseReceipt } = require('./postingService');
const { reverseSalesOrder } = require('./postingService');
const { reverseSalesOrderReceivable, reverseCustomerPaymentReceivable } = require('./receivableService');

function ensureShape(data) {
  if (!data.documents) data.documents = [];
  if (!data.postings) data.postings = [];
  if (!data.receivablePostings) data.receivablePostings = [];
  if (!data.cashLedger) data.cashLedger = [];
  return data;
}

function getDocument(data, idOrDocumentNo) {
  ensureShape(data);
  const key = cleanCode(idOrDocumentNo);
  return data.documents.find(document => {
    return cleanCode(document.id) === key || cleanCode(document.documentNo) === key;
  }) || null;
}

function assertCanReverseWarehouseReceipt(data, receipt) {
  const insufficient = [];
  (receipt.items || []).forEach(item => {
    const warehouseCode = item.warehouseCode || receipt.warehouseCode;
    const currentStock = getStock(data, item.productCode, warehouseCode);
    const reverseQty = Number(item.quantity || 0);
    if (currentStock < reverseQty) {
      insufficient.push({
        productCode: item.productCode,
        productName: item.productName,
        warehouseCode,
        currentStock,
        reverseQty,
        message: `${item.productCode}: tồn ${currentStock}, cần đảo ${reverseQty}`
      });
    }
  });

  if (insufficient.length > 0) {
    const error = new Error('Không thể hủy phiếu nhập vì tồn kho hiện tại không đủ để đảo bút toán');
    error.details = insufficient;
    throw error;
  }
}

function buildReversePreview(data, idOrDocumentNo) {
  ensureShape(data);
  const document = getDocument(data, idOrDocumentNo);
  if (!document) throw new Error('Không tìm thấy chứng từ');

  const preview = {
    documentId: document.id,
    documentNo: document.documentNo,
    documentType: document.type,
    status: document.status,
    canReverse: true,
    warnings: [],
    effects: []
  };

  if (document.status === 'CANCELLED') {
    preview.canReverse = false;
    preview.warnings.push('Chứng từ đã hủy trước đó');
    return preview;
  }

  if (document.status === 'DRAFT') {
    preview.effects.push('Chứng từ nháp: chỉ chuyển trạng thái CANCELLED, không sinh bút toán đảo');
    return preview;
  }

  if (document.type === 'WAREHOUSE_RECEIPT') {
    (document.items || []).forEach(item => {
      preview.effects.push({
        ledger: 'STOCK',
        action: 'OUT',
        productCode: item.productCode,
        productName: item.productName,
        warehouseCode: item.warehouseCode || document.warehouseCode,
        quantity: Number(item.quantity || 0),
        amount: Number(item.amount || 0)
      });
    });
  } else if (document.type === 'SALES_ORDER') {
    (document.items || []).forEach(item => {
      preview.effects.push({
        ledger: 'STOCK',
        action: 'IN',
        productCode: item.productCode,
        productName: item.productName,
        warehouseCode: item.warehouseCode || document.warehouseCode,
        quantity: Number(item.quantity || 0),
        amount: Number(item.amount || 0)
      });
    });
    preview.effects.push({ ledger: 'RECEIVABLE', action: 'REVERSE_SALE', amount: Number(document.totalAmount || 0) });
  } else if (document.type === 'CUSTOMER_PAYMENT') {
    preview.effects.push({ ledger: 'RECEIVABLE', action: 'REVERSE_PAYMENT', amount: Number(document.amount || 0) });
  } else {
    preview.canReverse = false;
    preview.warnings.push(`Chưa hỗ trợ hủy chứng từ loại ${document.type || '(không rõ)'}`);
  }

  return preview;
}

function reverseDocument(data, idOrDocumentNo, options = {}) {
  ensureShape(data);

  const document = getDocument(data, idOrDocumentNo);
  if (!document) throw new Error('Không tìm thấy chứng từ');
  if (document.status === 'CANCELLED') throw new Error('Chứng từ đã hủy rồi');

  const reason = cleanText(options.reason || options.cancelReason || '');
  const reversedBy = cleanText(options.reversedBy || options.userName || 'system');
  const now = new Date().toISOString();

  const result = {
    document,
    stockReverses: [],
    receivableReverses: [],
    cashReverses: []
  };

  if (document.status === 'DRAFT') {
    document.status = 'CANCELLED';
    document.cancelReason = reason;
    document.cancelledAt = now;
    document.reversedAt = now;
    document.reversedBy = reversedBy;
    document.updatedAt = now;
    return result;
  }

  if (document.type === 'WAREHOUSE_RECEIPT') {
    assertCanReverseWarehouseReceipt(data, document);
    result.stockReverses = reverseWarehouseReceipt(data, document, reason);
  } else if (document.type === 'SALES_ORDER') {
    result.stockReverses = reverseSalesOrder(data, document, reason);
    result.receivableReverses = reverseSalesOrderReceivable(data, document, reason);
  } else if (document.type === 'CUSTOMER_PAYMENT') {
    result.receivableReverses = reverseCustomerPaymentReceivable(data, document, reason);
  } else {
    throw new Error(`Chưa hỗ trợ hủy chứng từ loại ${document.type || '(không rõ)'}`);
  }

  document.status = 'CANCELLED';
  document.cancelReason = reason;
  document.cancelledAt = now;
  document.reversedAt = now;
  document.reversedBy = reversedBy;
  document.updatedAt = now;

  return result;
}

module.exports = {
  getDocument,
  buildReversePreview,
  reverseDocument
};
