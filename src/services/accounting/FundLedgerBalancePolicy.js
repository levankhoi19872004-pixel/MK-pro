'use strict';

const HistoricalFundOwnershipPolicy = require('./HistoricalFundOwnershipPolicy');

const NON_BALANCE_SOURCE_TYPES = Object.freeze(new Set());
const HISTORICAL_OWNERSHIP_SOURCE_TYPES = Object.freeze(new Set([
  HistoricalFundOwnershipPolicy.ORDER_PAYMENT_ALLOCATION
]));

function text(value = '') {
  return String(value ?? '').trim();
}

function canonicalFundSourceType(row = {}) {
  return text(row.sourceType || row.refType || row.referenceType || '').toUpperCase();
}

function affectsFundBalance(row = {}, context = {}) {
  const sourceType = canonicalFundSourceType(row);
  if (NON_BALANCE_SOURCE_TYPES.has(sourceType)) return false;
  if (HISTORICAL_OWNERSHIP_SOURCE_TYPES.has(sourceType)) {
    return HistoricalFundOwnershipPolicy.isBalanceAffecting(row, context);
  }
  return true;
}

function nonBalanceSourceMongoNor() {
  const branches = [];
  for (const sourceType of NON_BALANCE_SOURCE_TYPES) {
    const exact = new RegExp(`^${sourceType}$`, 'i');
    branches.push({ sourceType: exact }, { refType: exact }, { referenceType: exact });
  }
  if (!branches.length) return {};
  return { $nor: branches };
}

function balanceAffectingMongoFilter() {
  return nonBalanceSourceMongoNor();
}

module.exports = {
  NON_BALANCE_SOURCE_TYPES,
  HISTORICAL_OWNERSHIP_SOURCE_TYPES,
  canonicalFundSourceType,
  affectsFundBalance,
  nonBalanceSourceMongoNor,
  balanceAffectingMongoFilter,
  HistoricalFundOwnershipPolicy
};
