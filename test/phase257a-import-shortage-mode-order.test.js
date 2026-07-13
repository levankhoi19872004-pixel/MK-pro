'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const reviewService = require('../src/services/import/ImportShortageReviewService');

test('Phase257A order mode excludes the whole shortage order and keeps full-stock orders', () => {
  const rows = [
    {
      documentCode: 'SO-SHORT',
      valid: true,
      canImport: true,
      hasShortage: true,
      lineCount: 2,
      totalAmount: 90000,
      __adjustedRows: [
        { documentCode: 'SO-SHORT', productCode: 'SP-A', quantity: 7 },
        { documentCode: 'SO-SHORT', productCode: 'SP-B', quantity: 2 }
      ]
    },
    {
      documentCode: 'SO-FULL',
      valid: true,
      canImport: true,
      hasShortage: false,
      lineCount: 1,
      totalAmount: 50000,
      __adjustedRows: [
        { documentCode: 'SO-FULL', productCode: 'SP-C', quantity: 5 }
      ]
    }
  ];
  const review = {
    items: [{ orderKey: 'SO-SHORT', documentCode: 'SO-SHORT', productCode: 'SP-B', missingQuantity: 3, cutAmount: 30000 }],
    summary: { totalMissingQuantity: 3, totalCutAmount: 30000 }
  };

  const result = reviewService.applyReviewMode(
    rows,
    reviewService.REVIEW_MODES.EXCLUDE_SHORTAGE_ORDERS,
    review
  );

  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].documentCode, 'SO-FULL');
  assert.equal(result.commitRows.length, 1);
  assert.equal(result.commitRows[0].documentCode, 'SO-FULL');
  assert.equal(result.shortageModeSummary.excludedShortageOrderCount, 1);
  assert.deepEqual(result.shortageModeSummary.excludedShortageOrderCodes, ['SO-SHORT']);
  assert.equal(result.shortageModeSummary.excludedLineCount, 2);
  assert.equal(result.shortageModeSummary.excludedOriginalAmount, 90000);
});
