'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const test = require('node:test');
const ExcelJS = require('exceljs');

const ImportSession = require('../src/models/ImportSession');
const ImportSessionRow = require('../src/models/ImportSessionRow');
const importSessionService = require('../src/services/importSessionService');
const ExcelInteractionService = require('../src/services/excel/ExcelInteractionService');
const productRepository = require('../src/repositories/productRepository');
const auditService = require('../src/services/auditService');

function previewRow(index) {
  return {
    rowNo: index + 1,
    documentCode: `SO-${Math.floor(index / 5)}`,
    productCode: `P${String(index % 30).padStart(4, '0')}`,
    productName: index === 0 ? '=unsafe' : `Product ${index % 30}`,
    customerCode: `C${String(index % 10).padStart(4, '0')}`,
    quantity: 1,
    amount: 1000 + index,
    valid: index % 7 !== 0,
    errors: index % 7 === 0 ? ['Fixture validation error'] : []
  };
}

function previewRows(count) {
  return Array.from({ length: count }, (_, index) => previewRow(index));
}

test('Phase237 import preview session save builds row documents only per insert batch', async () => {
  const old = {
    findOne: ImportSession.findOne,
    findOneAndUpdate: ImportSession.findOneAndUpdate,
    deleteMany: ImportSessionRow.deleteMany,
    insertMany: ImportSessionRow.insertMany
  };
  const calls = [];
  ImportSession.findOne = () => ({ lean: () => Promise.resolve({ id: 'IMP-237', sessionId: 'IMP-237', type: 'salesOrders' }) });
  ImportSession.findOneAndUpdate = (filter, update) => Promise.resolve({ filter, update });
  ImportSessionRow.deleteMany = () => Promise.resolve({ deletedCount: 0 });
  ImportSessionRow.insertMany = async (batch) => {
    calls.push(batch.length);
    return batch;
  };

  try {
    await importSessionService.savePreviewResult('IMP-237', {
      rows: previewRows(1200),
      previewRows: previewRows(1200),
      fileNames: ['fixture.xlsx']
    });
  } finally {
    ImportSession.findOne = old.findOne;
    ImportSession.findOneAndUpdate = old.findOneAndUpdate;
    ImportSessionRow.deleteMany = old.deleteMany;
    ImportSessionRow.insertMany = old.insertMany;
  }

  assert.deepEqual(calls, [500, 500, 200]);
});

test('Phase237 IMPORT_PREVIEW export streams workbook to temp file and preserves business sheets', async () => {
  const rows = previewRows(40);
  const old = {
    getSession: importSessionService.getSession,
    listSessionRows: importSessionService.listSessionRows,
    findByCodes: productRepository.findByCodes,
    auditLog: auditService.log
  };

  importSessionService.getSession = async () => ({
    id: 'IMP-237-XLSX',
    sessionId: 'IMP-237-XLSX',
    type: 'salesOrders',
    importMode: 'create',
    fileName: 'fixture.xlsx',
    totalRows: rows.length
  });
  importSessionService.listSessionRows = async (id, { offset = 0, limit = 1000 } = {}) => {
    const pageRows = rows.slice(offset, offset + limit);
    return {
      rows: pageRows,
      total: rows.length,
      hasMore: offset + pageRows.length < rows.length
    };
  };
  productRepository.findByCodes = async (codes) => codes.map((code) => ({
    code,
    productCode: code,
    name: `Catalog ${code}`,
    conversionRate: 12,
    salePrice: 12345
  }));
  auditService.log = async () => {};

  let result;
  try {
    result = await ExcelInteractionService.exportWorkbook({
      type: 'IMPORT_PREVIEW',
      sessionId: 'IMP-237-XLSX'
    }, { username: 'tester' });

    assert.equal(result.streaming, true);
    assert.ok(result.filePath);
    assert.equal(result.buffer, undefined);
    assert.equal(result.rowCount, 40);
    assert.ok(result.outputBytes > 0);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(result.filePath);
    const allSheet = workbook.getWorksheet('TatCa');
    const validSheet = workbook.getWorksheet('HopLe');
    const invalidSheet = workbook.getWorksheet('Loi');

    assert.equal(allSheet.rowCount, 41);
    assert.equal(validSheet.rowCount, 35);
    assert.equal(invalidSheet.rowCount, 7);
    const headers = allSheet.getRow(1).values;
    assert.ok(headers.includes('productCode'));
    assert.ok(headers.includes('Quy cách'));
    assert.ok(headers.includes('Giá bán'));
    assert.equal(allSheet.getRow(7).getCell(headers.indexOf('documentCode')).value, 'SO-1');

    const productNameCol = headers.indexOf('productName');
    assert.equal(allSheet.getRow(2).getCell(productNameCol).value, "'=unsafe");
  } finally {
    importSessionService.getSession = old.getSession;
    importSessionService.listSessionRows = old.listSessionRows;
    productRepository.findByCodes = old.findByCodes;
    auditService.log = old.auditLog;
    if (result && result.filePath) await fs.unlink(result.filePath).catch(() => {});
  }
});
