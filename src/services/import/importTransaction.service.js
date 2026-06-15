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
  let completedRows = 0;
  for (const [chunkIndex, chunk] of chunks.entries()) {
    let result;
    try {
      const value = await withMongoTransaction((session) => handler(chunk, { session, chunkIndex }));
      result = { chunkIndex, ok: true, count: chunk.length, value };
    } catch (error) {
      result = {
        chunkIndex,
        ok: false,
        count: chunk.length,
        error: error?.message || String(error),
        code: error?.code || 'IMPORT_CHUNK_FAILED'
      };
    }
    results.push(result);
    completedRows += chunk.length;

    if (typeof options.onChunkComplete === 'function') {
      try {
        await options.onChunkComplete({
          ...result,
          completedChunks: chunkIndex + 1,
          totalChunks: chunks.length,
          completedRows,
          totalRows: rows.length
        });
      } catch (_) {
        // Tiến độ chỉ phục vụ UI/monitoring; lỗi ghi progress không được làm hỏng nghiệp vụ import.
      }
    }
  }
  return results;
}

module.exports = { chunkRows, runAtomicChunks };
