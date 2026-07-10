'use strict';

const fs = require('node:fs/promises');

const importSessionService = require('../src/services/importSessionService');
const ExcelInteractionService = require('../src/services/excel/ExcelInteractionService');
const ImportSession = require('../src/models/ImportSession');
const ImportSessionRow = require('../src/models/ImportSessionRow');
const productRepository = require('../src/repositories/productRepository');
const auditService = require('../src/services/auditService');

function arg(name, fallback = '') {
  const prefix = `--${name}=`;
  const found = process.argv.find((value) => value.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function row(index) {
  return {
    rowNo: index + 1,
    documentCode: `SO-${Math.floor(index / 5)}`,
    productCode: `P${String(index % 200).padStart(4, '0')}`,
    productName: `Product ${index % 200}`,
    customerCode: `C${String(index % 100).padStart(4, '0')}`,
    quantity: 1,
    amount: 1000 + index,
    valid: index % 11 !== 0,
    errors: index % 11 === 0 ? ['Fixture validation error'] : []
  };
}

function rows(count) {
  return Array.from({ length: count }, (_, index) => row(index));
}

function memorySnapshot() {
  if (global.gc) global.gc();
  const usage = process.memoryUsage();
  return {
    heapUsed: usage.heapUsed,
    heapTotal: usage.heapTotal,
    rss: usage.rss,
    external: usage.external,
    arrayBuffers: usage.arrayBuffers
  };
}

function mb(value) {
  return Math.round((Number(value) || 0) / 1024 / 1024 * 100) / 100;
}

function memoryDelta(start, end) {
  return {
    heapDeltaMB: mb(end.heapUsed - start.heapUsed),
    heapUsedMB: mb(end.heapUsed),
    heapTotalMB: mb(end.heapTotal),
    rssMB: mb(end.rss),
    externalMB: mb(end.external),
    arrayBuffersMB: mb(end.arrayBuffers)
  };
}

async function measure(label, fn) {
  const startMemory = memorySnapshot();
  const startedAt = Date.now();
  const result = await fn();
  const endMemory = memorySnapshot();
  return {
    label,
    durationMs: Date.now() - startedAt,
    ...memoryDelta(startMemory, endMemory),
    ...result
  };
}

async function benchmarkSavePreviewResult(count) {
  const data = rows(count);
  let insertCalls = 0;
  let inserted = 0;
  let maxBatchSize = 0;
  const old = {
    findOne: ImportSession.findOne,
    findOneAndUpdate: ImportSession.findOneAndUpdate,
    deleteMany: ImportSessionRow.deleteMany,
    insertMany: ImportSessionRow.insertMany
  };

  ImportSession.findOne = () => ({ lean: () => Promise.resolve({ id: 'IMP-BENCH', sessionId: 'IMP-BENCH', type: 'salesOrders' }) });
  ImportSession.findOneAndUpdate = () => Promise.resolve({ id: 'IMP-BENCH', sessionId: 'IMP-BENCH' });
  ImportSessionRow.deleteMany = () => Promise.resolve({ deletedCount: 0 });
  ImportSessionRow.insertMany = async (batch) => {
    insertCalls += 1;
    inserted += batch.length;
    maxBatchSize = Math.max(maxBatchSize, batch.length);
    return batch;
  };

  try {
    await importSessionService.savePreviewResult('IMP-BENCH', {
      rows: data,
      previewRows: data,
      fileNames: ['fixture.xlsx']
    });
    return { rows: count, insertCalls, inserted, maxBatchSize };
  } finally {
    ImportSession.findOne = old.findOne;
    ImportSession.findOneAndUpdate = old.findOneAndUpdate;
    ImportSessionRow.deleteMany = old.deleteMany;
    ImportSessionRow.insertMany = old.insertMany;
  }
}

async function benchmarkExportImportPreview(count) {
  const data = rows(count);
  const old = {
    getSession: importSessionService.getSession,
    listSessionRows: importSessionService.listSessionRows,
    findByCodes: productRepository.findByCodes,
    auditLog: auditService.log
  };

  importSessionService.getSession = async () => ({
    id: 'IMP-BENCH',
    sessionId: 'IMP-BENCH',
    type: 'salesOrders',
    importMode: 'create',
    fileName: 'fixture.xlsx',
    totalRows: count
  });
  importSessionService.listSessionRows = async (id, { offset = 0, limit = 1000 } = {}) => {
    const batch = data.slice(offset, offset + limit);
    return { rows: batch, total: count, hasMore: offset + batch.length < count };
  };
  productRepository.findByCodes = async (codes) => codes.map((code) => ({
    code,
    productCode: code,
    name: `Name ${code}`,
    conversionRate: 12,
    salePrice: 1000
  }));
  auditService.log = async () => {};

  let result;
  try {
    result = await ExcelInteractionService.exportWorkbook({ type: 'IMPORT_PREVIEW', sessionId: 'IMP-BENCH' }, { username: 'bench' });
    return {
      rows: count,
      outputBytes: result.outputBytes || (result.buffer ? result.buffer.length : 0),
      streamed: Boolean(result.filePath),
      hasBuffer: Boolean(result.buffer)
    };
  } finally {
    importSessionService.getSession = old.getSession;
    importSessionService.listSessionRows = old.listSessionRows;
    productRepository.findByCodes = old.findByCodes;
    auditService.log = old.auditLog;
    if (result && result.filePath) await fs.unlink(result.filePath).catch(() => {});
  }
}

async function main() {
  const counts = String(arg('rows', '1000,10000'))
    .split(',')
    .map((value) => Math.max(1, Number(value.trim()) || 0))
    .filter(Boolean);
  const results = [];
  for (const count of counts) {
    results.push(await measure(`savePreviewResult.${count}`, () => benchmarkSavePreviewResult(count)));
    results.push(await measure(`exportImportPreview.${count}`, () => benchmarkExportImportPreview(count)));
  }
  console.log(JSON.stringify({
    ok: true,
    exposeGc: typeof global.gc === 'function',
    rows: counts,
    results
  }, null, 2));
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
