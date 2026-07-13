'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const reviewService = require('../src/services/import/ImportShortageReviewService');

test('Phase257A quantity mode imports selected orders with canonical adjusted shortage rows', () => {
  const rows = [
    {
      documentCode: 'SO-PARTIAL',
      valid: true,
      canImport: true,
      hasShortage: true,
      salesStaffCode: 'NVBH01',
      salesStaffName: 'Sales One',
      __adjustedRows: [
        { documentCode: 'SO-PARTIAL', productCode: 'SP-A', quantity: 7, stockQuantity: 7 },
        { documentCode: 'SO-PARTIAL', productCode: 'SP-B', quantity: 0, stockQuantity: 0, __skipImportLine: true }
      ]
    },
    {
      documentCode: 'SO-FULL',
      valid: true,
      canImport: true,
      hasShortage: false,
      __adjustedRows: [
        { documentCode: 'SO-FULL', productCode: 'SP-C', quantity: 5, stockQuantity: 5 }
      ]
    }
  ];
  const review = {
    items: [{ orderKey: 'SO-PARTIAL', documentCode: 'SO-PARTIAL', productCode: 'SP-B', missingQuantity: 3, cutAmount: 30000 }],
    summary: { totalMissingQuantity: 3, totalCutAmount: 30000 }
  };

  const result = reviewService.applyReviewMode(
    rows,
    reviewService.REVIEW_MODES.EXCLUDE_SHORTAGE_QUANTITY,
    review
  );

  assert.equal(result.rows.length, 2);
  assert.equal(result.commitRows.length, 2);
  assert.deepEqual(result.commitRows.map((row) => row.productCode), ['SP-A', 'SP-C']);
  assert.equal(result.commitRows.find((row) => row.productCode === 'SP-A').quantity, 7);
  assert.equal(result.shortageModeSummary.importedPartialOrderCount, 1);
  assert.equal(result.shortageModeSummary.importedFullOrderCount, 1);
  assert.equal(result.shortageModeSummary.totalCutQuantity, 3);
  assert.equal(result.shortageModeSummary.totalCutAmount, 30000);
});
