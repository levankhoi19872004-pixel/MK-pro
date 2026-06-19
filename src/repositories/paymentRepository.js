'use strict';

const collectionRepository = require('./mongoCollection.repository');
const { canonicalizeOperationalStaff } = require('../utils/canonicalStaffWrite.util');

// V45 canonical AR Ledger collection.
// Công nợ không còn ghi vào journals/payments; mọi bút toán AR ghi vào arLedgers.
const PAYMENT_KEY = 'arLedgers';

async function findAll(filter = {}, options = {}) {
  return collectionRepository.findAll(PAYMENT_KEY, filter, options);
}

async function upsert(payment, options = {}) {
  return collectionRepository.upsertByIdentity(PAYMENT_KEY, canonicalizeOperationalStaff(payment), ['id', 'code'], options);
}

async function deleteOne(idOrCode, options = {}) {
  return collectionRepository.deleteOneByIdentity(PAYMENT_KEY, idOrCode, ['id', 'code'], options);
}

module.exports = { findAll, upsert, deleteOne };
