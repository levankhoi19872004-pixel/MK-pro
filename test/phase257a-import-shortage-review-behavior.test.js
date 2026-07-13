'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const reviewService = require('../src/services/import/ImportShortageReviewService');

function shortageRow(documentCode, productCode, missingQuantity, index = 1) {
  return {
    documentCode,
    rowNo: index,
    valid: true,
    canImport: true,
    hasShortage: true,
    shortageReport: [{
      documentCode,
      rowNo: index,
      productCode,
      productName: `Product ${productCode}`,
      requestedQuantity: 10,
      availableQuantity: 7,
      importQuantity: 7,
      missingQuantity,
      cutAmount: missingQuantity * 12000
    }]
  };
}

test('Phase257A review collects only shortage lines and summarizes the selected scope', () => {
  const rows = [
    shortageRow('SO-002', 'SP-02', 2, 2),
    { documentCode: 'SO-001', rowNo: 1, valid: true, canImport: true, hasShortage: false, shortageReport: [] },
    shortageRow('SO-003', 'SP-03', 0, 3),
    shortageRow('SO-002', 'SP-02', 2, 2)
  ];

  const items = reviewService.collectShortageItems(rows);
  const summary = reviewService.summarizeReview(rows, items);

  assert.equal(items.length, 1);
  assert.equal(items[0].documentCode, 'SO-002');
  assert.equal(items[0].productCode, 'SP-02');
  assert.equal(items[0].missingQuantity, 2);
  assert.equal(summary.selectedOrderCount, 3);
  assert.equal(summary.shortageOrderCount, 1);
  assert.equal(summary.itemCount, 1);
  assert.equal(summary.totalMissingQuantity, 2);
});

test('Phase257A fingerprints are stable for the same selected rows and shortage facts', () => {
  const rowsA = [shortageRow('SO-002', 'SP-02', 2, 2), shortageRow('SO-001', 'SP-01', 3, 1)];
  const rowsB = [shortageRow('SO-001', 'SP-01', 3, 1), shortageRow('SO-002', 'SP-02', 2, 2)];
  const itemsA = reviewService.collectShortageItems(rowsA);
  const itemsB = reviewService.collectShortageItems(rowsB);

  assert.equal(
    reviewService.selectedScopeFingerprint(rowsA, 'IMP-257A'),
    reviewService.selectedScopeFingerprint(rowsB, 'IMP-257A')
  );
  assert.equal(
    reviewService.reviewFingerprint({ sessionId: 'IMP-257A', rows: rowsA, items: itemsA }),
    reviewService.reviewFingerprint({ sessionId: 'IMP-257A', rows: rowsB, items: itemsB })
  );
});
