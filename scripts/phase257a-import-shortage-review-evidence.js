'use strict';

const fs = require('node:fs');
const path = require('node:path');
const reviewService = require('../src/services/import/ImportShortageReviewService');

function line(documentCode, productCode, quantity, options = {}) {
  return {
    documentCode,
    productCode,
    productName: `Product ${productCode}`,
    quantity,
    stockQuantity: quantity,
    salePrice: options.salePrice || 10000,
    __skipImportLine: Boolean(options.skip)
  };
}

function order(index, shortageLines = []) {
  const code = `SO-${String(index).padStart(3, '0')}`;
  const hasShortage = shortageLines.length > 0;
  return {
    documentCode: code,
    rowNo: index,
    valid: true,
    canImport: true,
    hasShortage,
    lineCount: hasShortage ? shortageLines.length + 1 : 1,
    totalAmount: 100000 + index,
    __adjustedRows: hasShortage
      ? [
          line(code, `SP-${index}-OK`, 5),
          ...shortageLines.map((item) => line(code, item.productCode, item.importQuantity, { skip: item.importQuantity <= 0 }))
        ]
      : [line(code, `SP-${index}-FULL`, 10)],
    shortageReport: shortageLines.map((item, lineIndex) => ({
      documentCode: code,
      customerCode: `KH-${String(index).padStart(3, '0')}`,
      customerName: `Customer ${index}`,
      rowNo: lineIndex + 1,
      productCode: item.productCode,
      productName: `Product ${item.productCode}`,
      requestedQuantity: item.requestedQuantity,
      availableQuantity: item.availableQuantity,
      importQuantity: item.importQuantity,
      missingQuantity: item.missingQuantity,
      cutAmount: item.cutAmount
    }))
  };
}

function shortage(productCode, missingQuantity, importQuantity = 0) {
  return {
    productCode,
    requestedQuantity: missingQuantity + importQuantity,
    availableQuantity: importQuantity,
    importQuantity,
    missingQuantity,
    cutAmount: missingQuantity * 10000
  };
}

const rows = [];
const shortageByOrder = new Map([
  [1, [shortage('SP-A1', 2, 8)]],
  [2, [shortage('SP-B1', 1, 4)]],
  [3, [shortage('SP-C1', 3, 0)]],
  [4, [shortage('SP-D1', 2, 1), shortage('SP-D2', 4, 0)]],
  [5, [shortage('SP-E1', 1, 2), shortage('SP-E2', 2, 0), shortage('SP-E3', 3, 1)]]
]);

for (let index = 1; index <= 100; index += 1) {
  rows.push(order(index, shortageByOrder.get(index) || []));
}

const items = reviewService.collectShortageItems(rows);
const summary = reviewService.summarizeReview(rows, items);
const review = {
  sessionId: 'IMP-PHASE257A-EVIDENCE',
  items,
  summary,
  fingerprint: reviewService.reviewFingerprint({ sessionId: 'IMP-PHASE257A-EVIDENCE', rows, items }),
  selectedScopeFingerprint: reviewService.selectedScopeFingerprint(rows, 'IMP-PHASE257A-EVIDENCE')
};
const quantity = reviewService.applyReviewMode(rows, reviewService.REVIEW_MODES.EXCLUDE_SHORTAGE_QUANTITY, review);
const orderMode = reviewService.applyReviewMode(rows, reviewService.REVIEW_MODES.EXCLUDE_SHORTAGE_ORDERS, review);
const staleGuard = reviewService.validateConfirmedReview({
  shortageReview: {
    status: reviewService.REVIEW_STATUS.CONFIRMED,
    mode: reviewService.REVIEW_MODES.EXCLUDE_SHORTAGE_QUANTITY,
    fingerprint: 'old',
    selectedScopeFingerprint: 'old'
  }
}, review, reviewService.REVIEW_MODES.EXCLUDE_SHORTAGE_QUANTITY);

const evidence = {
  phase: '257A',
  generatedAt: new Date().toISOString(),
  runner: path.relative(process.cwd(), __filename),
  source: 'ImportShortageReviewService fixtures',
  preview: {
    selectedOrderCount: summary.selectedOrderCount,
    shortageOrderCount: summary.shortageOrderCount,
    shortageLineCount: summary.itemCount,
    productCount: summary.productCount,
    totalMissingQuantity: summary.totalMissingQuantity,
    totalCutAmount: summary.totalCutAmount,
    fingerprint: review.fingerprint,
    selectedScopeFingerprint: review.selectedScopeFingerprint
  },
  modes: {
    exclude_shortage_quantity: {
      commitRowCount: quantity.commitRows.length,
      importedFullOrderCount: quantity.shortageModeSummary.importedFullOrderCount,
      importedPartialOrderCount: quantity.shortageModeSummary.importedPartialOrderCount,
      skippedEmptyOrderCount: quantity.shortageModeSummary.skippedEmptyOrderCount,
      totalCutQuantity: quantity.shortageModeSummary.totalCutQuantity,
      totalCutAmount: quantity.shortageModeSummary.totalCutAmount
    },
    exclude_shortage_orders: {
      commitRowCount: orderMode.commitRows.length,
      importedOrderCount: orderMode.rows.length,
      excludedShortageOrderCount: orderMode.shortageModeSummary.excludedShortageOrderCount,
      excludedShortageOrderCodes: orderMode.shortageModeSummary.excludedShortageOrderCodes,
      excludedLineCount: orderMode.shortageModeSummary.excludedLineCount,
      excludedOriginalAmount: orderMode.shortageModeSummary.excludedOriginalAmount
    }
  },
  guards: {
    staleStatus: staleGuard.result.status,
    staleCode: staleGuard.result.code,
    staleKeepsPreviewReady: true
  }
};

fs.writeFileSync(
  path.join(process.cwd(), 'PHASE257A_IMPORT_SHORTAGE_REVIEW_EVIDENCE.json'),
  `${JSON.stringify(evidence, null, 2)}\n`
);

console.log(JSON.stringify({
  ok: true,
  output: 'PHASE257A_IMPORT_SHORTAGE_REVIEW_EVIDENCE.json',
  selectedOrderCount: summary.selectedOrderCount,
  shortageOrderCount: summary.shortageOrderCount,
  shortageLineCount: summary.itemCount
}));
