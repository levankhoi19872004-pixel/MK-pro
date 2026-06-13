'use strict';

const PRINT_PROFILES = Object.freeze({
  SALES_INVOICE: 'SALES_INVOICE',
  WAREHOUSE_PICKING: 'WAREHOUSE_PICKING',
  PAYMENT_RECEIPT: 'PAYMENT_RECEIPT'
});

const PRINT_DOCUMENT_TYPES = Object.freeze({
  SALES_ORDER: 'SALES_ORDER',
  MASTER_ORDER: 'MASTER_ORDER',
  IMPORT_ORDER_AGGREGATE: 'IMPORT_ORDER_AGGREGATE',
  MASTER_RETURN_ORDER: 'MASTER_RETURN_ORDER',
  PAYMENT_RECEIPT: 'PAYMENT_RECEIPT'
});

const INACTIVE_STATUSES = new Set([
  'cancelled',
  'canceled',
  'void',
  'deleted',
  'removed',
  'reversed'
]);

function cleanText(value) {
  return String(value ?? '').trim();
}

function lower(value) {
  return cleanText(value).toLowerCase();
}

function isActiveDocument(document = {}) {
  return !INACTIVE_STATUSES.has(lower(document.status))
    && !document.deletedAt
    && document.deleted !== true
    && document.isDeleted !== true;
}

function uniqueText(values = []) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(cleanText)
    .filter(Boolean))];
}

function documentIdentity(document = {}) {
  return cleanText(
    document.id
    || document.code
    || document.orderCode
    || document.salesOrderCode
    || document.documentCode
    || document.invoiceCode
    || document._id
  );
}

function createPrintDocument({ profile, type, document = {}, parties = {}, lines = [], totals = {}, metadata = {} } = {}) {
  if (!Object.values(PRINT_PROFILES).includes(profile)) {
    throw new Error(`Print profile không hợp lệ: ${profile || '(trống)'}`);
  }

  return {
    contractVersion: '1.0',
    profile,
    type,
    document: {
      id: cleanText(document.id || document._id),
      code: cleanText(document.code || document.id || document._id),
      documentDate: cleanText(document.documentDate),
      sourceCodes: uniqueText(document.sourceCodes),
      copies: Array.isArray(document.copies) && document.copies.length ? document.copies : undefined,
      status: cleanText(document.status),
      title: cleanText(document.title),
      printMode: cleanText(document.printMode),
      note: cleanText(document.note),
      ...document
    },
    parties: {
      customer: parties.customer || {},
      supplier: parties.supplier || {},
      salesStaff: parties.salesStaff || {},
      deliveryStaff: parties.deliveryStaff || {},
      ...parties
    },
    lines: Array.isArray(lines) ? lines : [],
    totals: totals || {},
    metadata: metadata || {}
  };
}

module.exports = {
  PRINT_PROFILES,
  PRINT_DOCUMENT_TYPES,
  INACTIVE_STATUSES,
  cleanText,
  isActiveDocument,
  uniqueText,
  documentIdentity,
  createPrintDocument
};
