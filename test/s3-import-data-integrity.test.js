'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const Module = require('node:module');

const ROOT = path.resolve(__dirname, '..');

function loadImportUtilsWithoutExternalDeps() {
  const originalLoad = Module._load;
  Module._load = function mockedLoad(request, parent, isMain) {
    if (/models\/(Product|Customer|User)$/.test(request)) return {};
    if (request.includes('inventoryStock.service')) return {};
    if (request.includes('promotionService')) return {};
    if (request.includes('importLogging.util')) return { addImportLog: () => {} };
    if (request.includes('passwordPolicy')) return { isBcryptHash: () => false, hashPasswordSync: (value) => value };
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const values = require('../src/services/import/core/importValue.util');
    const rows = require('../src/services/import/core/importRow.util');
    return { values, rows };
  } finally {
    Module._load = originalLoad;
  }
}

const { values, rows } = loadImportUtilsWithoutExternalDeps();

test('S3 promo flag converts SL thùng/SL lẻ to promotion quantity instead of dropping the line', () => {
  const row = {
    __importProfile: 'S3',
    QC: 15,
    'Là KM': 1,
    'SL thùng': 1,
    'SL lẻ': 2,
    'Đơn giá sau KM/Ck': 0,
    'Thành tiền': 0
  };

  assert.equal(values.getDmsQuantityFromRow(row, { conversionRate: 12 }), 0);
  assert.equal(values.getDmsPromoQuantityFromRow(row, { conversionRate: 12 }), 17);
});

test('S3 QC=1 is authoritative and must not fall back to the current product conversion rate', () => {
  const row = { __importProfile: 'S3', QC: 1, 'SL thùng': 2, 'SL lẻ': 3 };
  assert.equal(values.getPackingFromRow(row, { conversionRate: 12 }), 1);
  assert.equal(values.getDmsQuantityFromRow(row, { conversionRate: 12 }), 5);
});

test('S3 compact file accepts canonical Số lượng without requiring SL thùng/SL lẻ', () => {
  const row = {
    __importProfile: 'S3',
    Qc: 84,
    'Số lượng': 12,
    'Đơn giá sau KM/Ck': 7944,
    'Thành tiền': 95327
  };

  assert.equal(values.getDmsQuantityFromRow(row, { conversionRate: 1 }), 12);
  assert.deepEqual(values.getS3StructureValidation(row).errors, []);
  assert.deepEqual(values.getS3PriceAmountValidation(row, 12, 1000).errors, []);
});

test('S3 promo flag accepts the real Excel header variant Là Km', () => {
  const row = {
    __importProfile: 'S3',
    Qc: 84,
    'Là Km': 'X',
    'Số lượng': 6,
    'Đơn giá sau KM/Ck': 0,
    'Thành tiền': 0
  };

  assert.equal(values.isPromoLineFromRow(row), true);
  assert.equal(values.getDmsQuantityFromRow(row, { conversionRate: 84 }), 0);
  assert.equal(values.getDmsPromoQuantityFromRow(row, { conversionRate: 84 }), 6);
  assert.deepEqual(values.getS3StructureValidation(row).errors, []);
  assert.deepEqual(values.getS3PriceAmountValidation(row, 0, 1000).errors, []);
});

test('S3 explicit unit price remains authoritative while small amount rounding differences are accepted', () => {
  const row = {
    __importProfile: 'S3',
    QC: 15,
    'SL thùng': 3,
    'SL lẻ': 0,
    'Đơn giá sau KM/Ck': 28093,
    'Thành tiền': 1264169
  };
  const quantity = values.getDmsQuantityFromRow(row, { conversionRate: 15 });
  assert.equal(quantity, 45);
  assert.equal(values.getDmsPriceFromRow(row, quantity), 28093);
  const validation = values.getS3PriceAmountValidation(row, quantity, 1000);
  assert.deepEqual(validation.errors, []);
  assert.equal(validation.difference, 16);
});

test('S3 blocks gross amount mistakes, zero-amount sale lines and negative prices', () => {
  const grossMismatch = {
    __importProfile: 'S3', QC: 15, 'SL thùng': 3, 'SL lẻ': 0,
    'Đơn giá sau KM/Ck': 28093, 'Thành tiền': 12641690
  };
  const quantity = values.getDmsQuantityFromRow(grossMismatch, { conversionRate: 15 });
  assert.ok(values.getS3PriceAmountValidation(grossMismatch, quantity, 1000).errors.length > 0);

  const zeroAmountSale = {
    __importProfile: 'S3', QC: 1, 'SL thùng': 0, 'SL lẻ': 2,
    'Là KM': 0, 'Đơn giá sau KM/Ck': 5000, 'Thành tiền': 0
  };
  assert.equal(values.isZeroAmountPromoLineFromRow(zeroAmountSale), false);
  assert.match(values.getS3PriceAmountValidation(zeroAmountSale, 2, 1000).errors.join(' | '), /Thành tiền = 0/);

  const negativePrice = {
    __importProfile: 'S3', QC: 1, 'SL thùng': 0, 'SL lẻ': 2,
    'Là KM': 0, 'Đơn giá sau KM/Ck': -5000, 'Thành tiền': -10000
  };
  assert.ok(values.getS3PriceAmountValidation(negativePrice, 2, 1000).errors.length >= 2);
});

test('legacy DMS zero-amount heuristic remains backward compatible', () => {
  const row = { quantity: 14, amount: 0, lineAmount: 0 };
  assert.equal(values.isZeroAmountPromoLineFromRow(row), true);
  assert.equal(values.getDmsQuantityFromRow(row, { conversionRate: 84 }), 0);
  assert.equal(values.getDmsPromoQuantityFromRow(row, { conversionRate: 84 }), 14);
});

test('adjusted S3 rows preserve carton/loose structure by QC instead of flattening to loose units', () => {
  const adjusted = rows.applyAdjustedQuantityToRow(
    { __importProfile: 'S3', QC: 15, 'SL thùng': 3, 'SL lẻ': 2 },
    47,
    0,
    28093,
    15
  );
  assert.equal(adjusted.cartons, 3);
  assert.equal(adjusted.units, 2);
  assert.equal(adjusted.quantity, 47);
  assert.equal(adjusted.__importProfile, 'S3');
});


test('adjusted S3 promo rows do not double count canonical promo quantity on commit re-read', () => {
  const adjusted = rows.applyAdjustedQuantityToRow(
    { __importProfile: 'S3', QC: 15, 'Là KM': 1, 'SL thùng': 1, 'SL lẻ': 2 },
    0,
    17,
    0,
    15
  );
  assert.equal(adjusted.promoCartons, 1);
  assert.equal(adjusted.promoUnits, 2);
  assert.equal(adjusted.promoQuantity, 17);
  assert.equal(values.getDmsPromoQuantityFromRow(adjusted, { conversionRate: 15 }), 17);
});

test('S3 rejects negative/fractional carton-unit structure and fractional QC', () => {
  const negative = { __importProfile: 'S3', QC: 15, 'SL thùng': -1, 'SL lẻ': 20 };
  assert.match(values.getS3StructureValidation(negative).errors.join(' | '), /SL thùng/);

  const fractional = { __importProfile: 'S3', QC: 15, 'SL thùng': 1.5, 'SL lẻ': 0 };
  assert.match(values.getS3StructureValidation(fractional).errors.join(' | '), /SL thùng/);

  const badQc = { __importProfile: 'S3', QC: 1.5, 'SL thùng': 1, 'SL lẻ': 0 };
  assert.match(values.getS3StructureValidation(badQc).errors.join(' | '), /QC S3/);
});

test('S3 provenance is persisted through import session and order commit metadata', () => {
  const sessionModel = fs.readFileSync(path.join(ROOT, 'src/models/ImportSession.js'), 'utf8');
  const preview = fs.readFileSync(path.join(ROOT, 'src/services/import/preview/importPreview.impl.js'), 'utf8');
  const runner = fs.readFileSync(path.join(ROOT, 'src/jobs/importPreviewRunner.js'), 'utf8');
  const commit = fs.readFileSync(path.join(ROOT, 'src/services/import/importCommit.impl.js'), 'utf8');
  const sales = fs.readFileSync(path.join(ROOT, 'src/services/import/operations/salesImport.impl.js'), 'utf8');

  assert.match(sessionModel, /sourceProfile:\s*\{[^}]*'DMS',\s*'S3'/s);
  assert.match(preview, /requestedType === 'salesOrdersS3' \? 'S3'/);
  assert.match(runner, /__importProfile:\s*parsingSession\?\.sourceProfile/);
  assert.match(commit, /sourceProfile:\s*session\.sourceProfile/);
  assert.match(sales, /importSource:\s*isS3Import \? 'excel_s3' : 'excel_dms'/);
  assert.match(sales, /importType:\s*isS3Import \? 'salesOrdersS3' : 'salesOrders'/);
});
