'use strict';

const NON_BALANCE_SOURCE_TYPES = Object.freeze(new Set([
  'ORDER_PAYMENT_ALLOCATION'
]));

function text(value = '') {
  return String(value ?? '').trim();
}

function canonicalFundSourceType(row = {}) {
  return text(row.sourceType || row.refType || row.referenceType || '').toUpperCase();
}

function affectsFundBalance(row = {}) {
  return !NON_BALANCE_SOURCE_TYPES.has(canonicalFundSourceType(row));
}

function nonBalanceSourceMongoNor() {
  const branches = [];
  for (const sourceType of NON_BALANCE_SOURCE_TYPES) {
    const exact = new RegExp(`^${sourceType}$`, 'i');
    branches.push({ sourceType: exact }, { refType: exact }, { referenceType: exact });
  }
  return { $nor: branches };
}

function balanceAffectingMongoFilter() {
  return nonBalanceSourceMongoNor();
}

module.exports = {
  NON_BALANCE_SOURCE_TYPES,
  canonicalFundSourceType,
  affectsFundBalance,
  nonBalanceSourceMongoNor,
  balanceAffectingMongoFilter
};
