'use strict';

const orderRepository = require('./orderRepository');
const masterOrderRepository = require('./masterOrderRepository');
const importOrderRepository = require('./importOrderRepository');
const receiptRepository = require('./receiptRepository');
const cashbookRepository = require('./cashbookRepository');
const bankbookRepository = require('./bankbookRepository');

const PRINT_TYPE_ALIASES = {
  ORDER: 'ORDER_SINGLE',
  SALES_ORDER: 'ORDER_SINGLE',
  SALES: 'ORDER_SINGLE',
  ORDER_SINGLE: 'ORDER_SINGLE',

  MASTER_ORDER: 'ORDER_TOTAL',
  TOTAL_ORDER: 'ORDER_TOTAL',
  ORDER_TOTAL: 'ORDER_TOTAL',

  IMPORT: 'IMPORT_ORDER',
  IMPORT_ORDER: 'IMPORT_ORDER',

  RECEIPT: 'PAYMENT_RECEIPT',
  PAYMENT: 'PAYMENT_RECEIPT',
  CASH_RECEIPT: 'PAYMENT_RECEIPT',
  PAYMENT_RECEIPT: 'PAYMENT_RECEIPT'
};

function normalizePrintType(type) {
  const key = String(type || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  return PRINT_TYPE_ALIASES[key] || key;
}

async function findPaymentReceiptByIdOrCode(idOrCode) {
  return (await receiptRepository.findByIdOrCode(idOrCode))
    || (await cashbookRepository.findByIdOrCode(idOrCode))
    || (await bankbookRepository.findByIdOrCode(idOrCode));
}

async function findDocumentByPrintType(type, idOrCode) {
  const printType = normalizePrintType(type);
  if (!idOrCode) return { printType, document: null };

  let document = null;
  if (printType === 'ORDER_SINGLE') document = await orderRepository.findByIdOrCode(idOrCode);
  if (printType === 'ORDER_TOTAL') document = await masterOrderRepository.findByIdOrCode(idOrCode);
  if (printType === 'IMPORT_ORDER') document = await importOrderRepository.findByIdOrCode(idOrCode);
  if (printType === 'PAYMENT_RECEIPT') document = await findPaymentReceiptByIdOrCode(idOrCode);

  return { printType, document };
}

module.exports = {
  normalizePrintType,
  findDocumentByPrintType
};
