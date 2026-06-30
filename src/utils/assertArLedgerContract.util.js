'use strict';

const {
  validateArLedgerContract,
  assertValidArLedgerContract,
  isCanonicalArDebtLedger
} = require('../domain/ar/arLedgerValidator');

function assertArLedgerWriteContract(ledger = {}) {
  return assertValidArLedgerContract(ledger);
}

function validateArLedgerReadContract(ledger = {}) {
  return validateArLedgerContract(ledger);
}

function isReadableCanonicalArLedger(ledger = {}) {
  return isCanonicalArDebtLedger(ledger);
}

module.exports = {
  validateArLedgerReadContract,
  assertArLedgerWriteContract,
  isReadableCanonicalArLedger
};
