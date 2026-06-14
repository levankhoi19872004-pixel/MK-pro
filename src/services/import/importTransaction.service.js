'use strict';

const { withMongoTransaction } = require('../../utils/transaction.util');

function chunkRows(rows = [], size = 25) {
  const safeSize = Math.min(Math.max(Number(size || 25), 1), 100);
  const chunks = [];
  for (let index = 0; index < rows.length; index += safeSize) {
    chunks.push(rows.slice(index, index + safeSize));
  }
  return chunks;
}

async function runAtomicChunks(rows = [], handler, options = {}) {
  if (typeof handler !== 'function') {
    throw new Error('runAtomicChunks cần truyền vào một handler');
  }
  const chunks = chunkRows(rows, options.chunkSize || 25);
  const results = [];
  for (const [chunkIndex, chunk] of chunks.entries()) {
    try {
      const value = await withMongoTransaction((session) => handler(chunk, { session, chunkIndex }));
      results.push({ chunkIndex, ok: true, count: chunk.length, value });
    } catch (error) {
      results.push({
        chunkIndex,
        ok: false,
        count: chunk.length,
        error: error?.message || String(error),
        code: error?.code || 'IMPORT_CHUNK_FAILED'
      });
    }
  }
  return results;
}

module.exports = { chunkRows, runAtomicChunks };
