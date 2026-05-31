'use strict';

const collectionRepository = require('./mongoCollection.repository');

const PAYMENT_KEY = 'payments';

async function findAll(filter = {}, options = {}) {
  return collectionRepository.findAll(PAYMENT_KEY, filter, options);
}

async function upsert(payment, options = {}) {
  return collectionRepository.upsertByIdentity(PAYMENT_KEY, payment, ['id', 'code'], options);
}

async function deleteOne(idOrCode, options = {}) {
  return collectionRepository.deleteOneByIdentity(PAYMENT_KEY, idOrCode, ['id', 'code'], options);
}

module.exports = { findAll, upsert, deleteOne };
