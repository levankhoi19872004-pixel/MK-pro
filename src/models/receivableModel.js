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

function createReceivablePosting(input = {}) {
  const debitAmount = toNumber(input.debitAmount, 0);
  const creditAmount = toNumber(input.creditAmount, 0);

  if (debitAmount < 0 || creditAmount < 0) {
    throw new Error('Số tiền công nợ không được âm');
  }

  if (debitAmount === 0 && creditAmount === 0) {
    throw new Error('Phát sinh công nợ phải có số tiền');
  }

  return {
    id: input.id || createId('AR'),
    documentId: cleanText(input.documentId),
    documentNo: cleanText(input.documentNo),
    documentType: cleanText(input.documentType),
    postingType: cleanText(input.postingType),

    customerCode: cleanCode(input.customerCode),
    customerName: cleanText(input.customerName),
    customerPhone: cleanText(input.customerPhone),
    customerAddress: cleanText(input.customerAddress),

    staffCode: cleanCode(input.staffCode),
    staffName: cleanText(input.staffName),

    debitAmount,
    creditAmount,
    amount: debitAmount - creditAmount,

    paymentMethod: cleanText(input.paymentMethod),
    note: cleanText(input.note),
    occurredAt: input.occurredAt || new Date().toISOString(),
    createdAt: input.createdAt || new Date().toISOString(),
    reversedFromDocumentId: input.reversedFromDocumentId || null,
    reversalOfPostingId: input.reversalOfPostingId || null,
    reversalOfDocumentId: input.reversalOfDocumentId || null
  };
}

function createCustomerPayment(input = {}, documents = []) {
  const now = new Date().toISOString();
  const amount = toNumber(input.amount || input.paymentAmount || input.soTien || input.thuTien, 0);

  if (!cleanCode(input.customerCode || input.maKhachHang)) {
    throw new Error('Phiếu thu công nợ phải có mã khách hàng');
  }

  if (amount <= 0) {
    throw new Error('Số tiền thu công nợ phải lớn hơn 0');
  }

  return {
    id: input.id || createId('PAY'),
    type: 'CUSTOMER_PAYMENT',
    documentNo: input.documentNo || createDocumentNo(documents, 'PT'),
    status: input.status || 'POSTED',
    paymentDate: input.paymentDate || input.date || now,

    customerCode: cleanCode(input.customerCode || input.maKhachHang),
    customerName: cleanText(input.customerName || input.tenKhachHang),
    customerPhone: cleanText(input.customerPhone || input.phone || input.sdt),
    customerAddress: cleanText(input.customerAddress || input.address || input.diaChi),

    staffCode: cleanCode(input.staffCode || input.collectorCode || input.maNhanVien),
    staffName: cleanText(input.staffName || input.collectorName || input.tenNhanVien),

    amount,
    paymentMethod: cleanText(input.paymentMethod || 'Tiền mặt'),
    note: cleanText(input.note),

    createdAt: input.createdAt || now,
    updatedAt: now,
    postedAt: input.postedAt || now,
    cancelledAt: input.cancelledAt || null,
    cancelReason: input.cancelReason || ''
  };
}

module.exports = {
  createReceivablePosting,
  createCustomerPayment,
  cleanText,
  cleanCode,
  toNumber
};
