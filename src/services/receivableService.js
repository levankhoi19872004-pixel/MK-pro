const {
  createReceivablePosting,
  createCustomerPayment,
  cleanText,
  cleanCode,
  toNumber
} = require('../models/receivableModel');

function ensureReceivableShape(data) {
  if (!data.documents) data.documents = [];
  if (!data.receivablePostings) data.receivablePostings = [];
  return data;
}

function hasReceivablePostedDocument(data, documentId) {
  ensureReceivableShape(data);
  return data.receivablePostings.some(item => item.documentId === documentId && !item.reversedFromDocumentId && !item.reversalOfPostingId);
}

function hasReceivableReversedDocument(data, documentId) {
  ensureReceivableShape(data);
  return data.receivablePostings.some(item => item.reversedFromDocumentId === documentId || item.reversalOfDocumentId === documentId);
}

function postSalesOrderReceivable(data, order) {
  ensureReceivableShape(data);

  if (hasReceivablePostedDocument(data, order.id)) {
    throw new Error(`Đơn ${order.documentNo} đã hạch toán công nợ`);
  }

  const postings = [];
  const totalAmount = toNumber(order.totalAmount, 0);
  const paidAmount = toNumber(order.paidAmount, 0);

  if (totalAmount > 0) {
    postings.push(createReceivablePosting({
      documentId: order.id,
      documentNo: order.documentNo,
      documentType: 'SALES_ORDER',
      postingType: 'SALE_RECEIVABLE_INCREASE',
      customerCode: order.customerCode,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      customerAddress: order.customerAddress,
      staffCode: order.staffCode,
      staffName: order.staffName,
      debitAmount: totalAmount,
      creditAmount: 0,
      note: order.note,
      occurredAt: order.orderDate
    }));
  }

  if (paidAmount > 0) {
    postings.push(createReceivablePosting({
      documentId: order.id,
      documentNo: order.documentNo,
      documentType: 'SALES_ORDER',
      postingType: 'SALE_INSTANT_PAYMENT',
      customerCode: order.customerCode,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      customerAddress: order.customerAddress,
      staffCode: order.staffCode,
      staffName: order.staffName,
      debitAmount: 0,
      creditAmount: paidAmount,
      paymentMethod: order.paymentMethod || 'Tiền mặt',
      note: 'Khách thanh toán ngay trên đơn bán hàng',
      occurredAt: order.orderDate
    }));
  }

  data.receivablePostings.push(...postings);
  return postings;
}

function reverseSalesOrderReceivable(data, order, reason = '') {
  ensureReceivableShape(data);

  if (hasReceivableReversedDocument(data, order.id)) {
    throw new Error(`Đơn ${order.documentNo} đã có bút toán đảo công nợ, không được hủy lặp`);
  }

  const related = data.receivablePostings.filter(item => item.documentId === order.id && !item.reversedFromDocumentId && !item.reversalOfPostingId);
  const now = new Date().toISOString();
  const reverses = related.map(item => createReceivablePosting({
    documentId: order.id,
    documentNo: order.documentNo,
    documentType: item.documentType,
    postingType: `REVERSE_${item.postingType}`,
    customerCode: item.customerCode,
    customerName: item.customerName,
    customerPhone: item.customerPhone,
    customerAddress: item.customerAddress,
    staffCode: item.staffCode,
    staffName: item.staffName,
    debitAmount: item.creditAmount,
    creditAmount: item.debitAmount,
    paymentMethod: item.paymentMethod,
    note: reason ? `Đảo công nợ do hủy ${order.documentNo}: ${cleanText(reason)}` : `Đảo công nợ do hủy ${order.documentNo}`,
    occurredAt: now,
    reversedFromDocumentId: order.id,
    reversalOfPostingId: item.id,
    reversalOfDocumentId: order.id
  }));

  data.receivablePostings.push(...reverses);
  return reverses;
}

function createPayment(data, input = {}) {
  ensureReceivableShape(data);

  const payment = createCustomerPayment(input, data.documents);
  data.documents.push(payment);

  const posting = createReceivablePosting({
    documentId: payment.id,
    documentNo: payment.documentNo,
    documentType: 'CUSTOMER_PAYMENT',
    postingType: 'CUSTOMER_PAYMENT_RECEIVED',
    customerCode: payment.customerCode,
    customerName: payment.customerName,
    customerPhone: payment.customerPhone,
    customerAddress: payment.customerAddress,
    staffCode: payment.staffCode,
    staffName: payment.staffName,
    debitAmount: 0,
    creditAmount: payment.amount,
    paymentMethod: payment.paymentMethod,
    note: payment.note,
    occurredAt: payment.paymentDate
  });

  data.receivablePostings.push(posting);

  return { payment, posting };
}

function getPayment(data, idOrDocumentNo) {
  ensureReceivableShape(data);
  const key = cleanCode(idOrDocumentNo);
  return data.documents.find(item => item.type === 'CUSTOMER_PAYMENT' && (cleanCode(item.id) === key || cleanCode(item.documentNo) === key)) || null;
}

function reverseCustomerPaymentReceivable(data, payment, reason = '') {
  ensureReceivableShape(data);

  if (hasReceivableReversedDocument(data, payment.id)) {
    throw new Error(`Phiếu thu ${payment.documentNo} đã có bút toán đảo, không được hủy lặp`);
  }

  const related = data.receivablePostings.filter(item => item.documentId === payment.id && !item.reversedFromDocumentId && !item.reversalOfPostingId);
  const reverses = related.map(item => createReceivablePosting({
    documentId: payment.id,
    documentNo: payment.documentNo,
    documentType: item.documentType,
    postingType: `REVERSE_${item.postingType}`,
    customerCode: item.customerCode,
    customerName: item.customerName,
    customerPhone: item.customerPhone,
    customerAddress: item.customerAddress,
    staffCode: item.staffCode,
    staffName: item.staffName,
    debitAmount: item.creditAmount,
    creditAmount: item.debitAmount,
    paymentMethod: item.paymentMethod,
    note: `Đảo phiếu thu: ${cleanText(reason)}`,
    occurredAt: new Date().toISOString(),
    reversedFromDocumentId: payment.id,
    reversalOfPostingId: item.id,
    reversalOfDocumentId: payment.id
  }));

  data.receivablePostings.push(...reverses);
  return reverses;
}

function cancelPayment(data, idOrDocumentNo, reason = '') {
  ensureReceivableShape(data);

  const payment = getPayment(data, idOrDocumentNo);
  if (!payment) throw new Error('Không tìm thấy phiếu thu công nợ');
  if (payment.status === 'CANCELLED') throw new Error('Phiếu thu đã hủy rồi');

  const reverses = reverseCustomerPaymentReceivable(data, payment, reason);
  payment.status = 'CANCELLED';
  payment.cancelReason = cleanText(reason);
  payment.cancelledAt = new Date().toISOString();
  payment.updatedAt = new Date().toISOString();

  return { payment, reverses };
}

function listReceivableLedger(data, query = {}) {
  ensureReceivableShape(data);

  const customerCode = cleanCode(query.customerCode);
  const staffCode = cleanCode(query.staffCode);
  const keyword = cleanText(query.keyword || query.q).toLowerCase();
  const fromDate = query.fromDate ? new Date(query.fromDate) : null;
  const toDate = query.toDate ? new Date(query.toDate) : null;

  return data.receivablePostings
    .filter(item => !customerCode || cleanCode(item.customerCode) === customerCode)
    .filter(item => !staffCode || cleanCode(item.staffCode) === staffCode)
    .filter(item => {
      if (!keyword) return true;
      return [item.documentNo, item.customerCode, item.customerName, item.staffCode, item.staffName, item.note]
        .some(value => String(value || '').toLowerCase().includes(keyword));
    })
    .filter(item => {
      if (!fromDate && !toDate) return true;
      const occurred = new Date(item.occurredAt || item.createdAt);
      if (fromDate && occurred < fromDate) return false;
      if (toDate && occurred > toDate) return false;
      return true;
    })
    .sort((a, b) => new Date(b.occurredAt || b.createdAt) - new Date(a.occurredAt || a.createdAt));
}

function getReceivableSummary(data, query = {}) {
  const ledger = listReceivableLedger(data, query);
  const map = new Map();

  ledger.forEach(item => {
    const key = cleanCode(item.customerCode) || 'NO_CUSTOMER';
    if (!map.has(key)) {
      map.set(key, {
        customerCode: item.customerCode,
        customerName: item.customerName,
        customerPhone: item.customerPhone,
        customerAddress: item.customerAddress,
        debitAmount: 0,
        creditAmount: 0,
        balance: 0,
        lastOccurredAt: item.occurredAt || item.createdAt
      });
    }

    const row = map.get(key);
    row.customerName = row.customerName || item.customerName;
    row.customerPhone = row.customerPhone || item.customerPhone;
    row.customerAddress = row.customerAddress || item.customerAddress;
    row.debitAmount += toNumber(item.debitAmount, 0);
    row.creditAmount += toNumber(item.creditAmount, 0);
    row.balance = row.debitAmount - row.creditAmount;

    if (new Date(item.occurredAt || item.createdAt) > new Date(row.lastOccurredAt)) {
      row.lastOccurredAt = item.occurredAt || item.createdAt;
    }
  });

  const rows = Array.from(map.values())
    .filter(row => query.onlyDebt === 'true' || query.onlyDebt === true ? row.balance > 0 : true)
    .sort((a, b) => b.balance - a.balance);

  return {
    totalCustomers: rows.length,
    totalDebitAmount: rows.reduce((sum, row) => sum + row.debitAmount, 0),
    totalCreditAmount: rows.reduce((sum, row) => sum + row.creditAmount, 0),
    totalBalance: rows.reduce((sum, row) => sum + row.balance, 0),
    rows
  };
}

module.exports = {
  ensureReceivableShape,
  postSalesOrderReceivable,
  reverseSalesOrderReceivable,
  reverseCustomerPaymentReceivable,
  hasReceivableReversedDocument,
  createPayment,
  getPayment,
  cancelPayment,
  listReceivableLedger,
  getReceivableSummary
};
