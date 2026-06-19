'use strict';

const fundService = require('../../services/fundService');

function fundTypeFromPaymentMethod(paymentMethod = '') {
  const raw = String(paymentMethod || '').toLowerCase();
  return raw === 'bank' || raw === 'bank_transfer' || raw === 'transfer' ? 'bank' : 'cash';
}

async function postCashIn(input = {}, options = {}) {
  const fundType = fundTypeFromPaymentMethod(input.paymentMethod || input.method);
  const result = await fundService.postFundLedger({
    ...input,
    fundType,
    direction: 'in',
    sourceType: input.sourceType || 'debtCollection',
    refType: input.refType || input.sourceType || 'debtCollection',
    referenceType: input.referenceType || input.refType || input.sourceType || 'debtCollection',
    staffCode: input.collectorCode || input.staffCode || '',
    staffName: input.collectorName || input.staffName || '',
    idempotencyKey: input.idempotencyKey || ''
  }, options);

  return result && result.ledger ? result.ledger : result;
}


async function postCashOut(input = {}, options = {}) {
  const fundType = fundTypeFromPaymentMethod(input.paymentMethod || input.method);
  const result = await fundService.postFundLedger({
    ...input,
    fundType,
    direction: 'out',
    sourceType: input.sourceType || 'supplierPayment',
    refType: input.refType || input.sourceType || 'supplierPayment',
    referenceType: input.referenceType || input.refType || input.sourceType || 'supplierPayment',
    staffCode: input.staffCode || input.paidByCode || '',
    staffName: input.staffName || input.paidByName || '',
    idempotencyKey: input.idempotencyKey || ''
  }, options);

  return result && result.ledger ? result.ledger : result;
}

module.exports = {
  postCashIn,
  postCashOut,
  fundTypeFromPaymentMethod
};
