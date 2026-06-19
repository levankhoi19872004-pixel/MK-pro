'use strict';

const mongoose = require('mongoose');

async function withMongoTransaction(work) {
  if (typeof work !== 'function') throw new Error('withMongoTransaction cần truyền vào một hàm');
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

async function withOptionalMongoTransaction(options = {}, work) {
  if (typeof work !== 'function') {
    throw new Error('withOptionalMongoTransaction cần truyền vào một hàm');
  }
  if (options.session) return work(options.session);
  return withMongoTransaction(work);
}

module.exports = { withMongoTransaction, withOptionalMongoTransaction };
