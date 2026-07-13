'use strict';

const crypto = require('node:crypto');
const importSessionService = require('../importSessionService');
const auditService = require('../auditService');
const { buildPreviewFromRows } = require('./preview/importPreview.impl');
const {
  flattenCommitRows,
  flattenAdjustedCommitRows,
  normalizeShortageRows
} = require('./core/importRow.util');
const { normalizeImportMode } = require('./selectiveUpdate.util');

const REVIEW_STATUS = Object.freeze({
  NOT_REQUIRED: 'not_required',
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  STALE: 'stale'
});

const REVIEW_MODES = Object.freeze({
  EXCLUDE_SHORTAGE_QUANTITY: 'exclude_shortage_quantity',
  EXCLUDE_SHORTAGE_ORDERS: 'exclude_shortage_orders'
});

const VALID_REVIEW_MODES = new Set(Object.values(REVIEW_MODES));

function cleanText(value) {
  return String(value ?? '').trim();
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function hashPayload(value) {
  return crypto.createHash('sha256').update(stableJson(value)).digest('hex');
}

function orderKey(row = {}) {
  return cleanText(row.documentCode || row.orderCode || row.code || row.invoiceCode || row.refCode || '');
}

function rowSourceKey(row = {}, index = 0) {
  return cleanText(row.rowKey || row.sessionRowKey || row.__rowKey || row.sourceRowKey)
    || `${orderKey(row) || 'ROW'}|${row.rowNo || row.sourceRowNo || row.__rowNo || index + 1}`;
}

function selectedScopeIdentity(rows = [], sessionId = '') {
  return (rows || []).map((row, index) => ({
    sessionId: cleanText(sessionId),
    orderKey: orderKey(row),
    rowKey: rowSourceKey(row, index),
    rowNo: Number(row.rowNo || row.sourceRowNo || row.__rowNo || index + 1) || 0,
    sourceFile: cleanText(row.sourceFile || row.fileName || row.__sourceFile || '')
  })).sort((a, b) => stableJson(a).localeCompare(stableJson(b)));
}

function selectedScopeFingerprint(rows = [], sessionId = '') {
  return hashPayload({
    kind: 'import-shortage-selected-scope',
    sessionId: cleanText(sessionId),
    selected: selectedScopeIdentity(rows, sessionId)
  });
}

function normalizeReviewItem(shortage = {}, row = {}, index = 0) {
  const missingQuantity = toNumber(shortage.missingQuantity ?? shortage.shortageQuantity ?? shortage.missingQty);
  if (missingQuantity <= 0) return null;
  const documentCode = cleanText(shortage.documentCode || row.documentCode || row.orderCode || row.code || '');
  const productCode = cleanText(shortage.productCode || shortage.code || shortage.productId || '');
  const requestedQuantity = toNumber(shortage.requestedQuantity ?? shortage.quantity ?? shortage.orderedQuantity);
  const availableQuantity = toNumber(shortage.availableQuantity ?? shortage.stockQuantity ?? shortage.availableStock);
  const importQuantity = toNumber(shortage.importQuantity ?? shortage.allowedQuantity ?? shortage.importedQuantity);
  const cutAmount = Math.max(0, toNumber(shortage.cutAmount ?? shortage.shortageAmount ?? shortage.amount));
  return {
    orderKey: documentCode,
    sessionRowKey: rowSourceKey(row, index),
    lineKey: [
      documentCode,
      shortage.rowNo || row.rowNo || row.sourceRowNo || row.__rowNo || index + 1,
      productCode,
      requestedQuantity,
      availableQuantity,
      importQuantity,
      missingQuantity,
      cutAmount
    ].join('|'),
    documentCode,
    customerCode: cleanText(shortage.customerCode || row.customerCode || ''),
    customerName: cleanText(shortage.customerName || row.customerName || ''),
    rowNo: shortage.rowNo || row.rowNo || row.sourceRowNo || row.__rowNo || index + 1,
    productCode,
    productName: cleanText(shortage.productName || ''),
    unit: cleanText(shortage.unit || ''),
    conversionRate: toNumber(shortage.conversionRate),
    requestedQuantity,
    availableQuantity,
    importQuantity,
    missingQuantity,
    cutAmount,
    note: cleanText(shortage.note || (importQuantity > 0 ? 'Cat phan vuot ton' : 'Khong con ton kha dung'))
  };
}

function collectShortageItems(rows = []) {
  const seen = new Set();
  const items = [];
  (rows || []).forEach((row, index) => {
    const shortages = normalizeShortageRows(row.shortageReport || []);
    shortages.forEach((shortage) => {
      const item = normalizeReviewItem(shortage, row, index);
      if (!item || seen.has(item.lineKey)) return;
      seen.add(item.lineKey);
      items.push(item);
    });
  });
  return items.sort((a, b) => stableJson({
    orderKey: a.orderKey,
    rowNo: a.rowNo,
    productCode: a.productCode,
    lineKey: a.lineKey
  }).localeCompare(stableJson({
    orderKey: b.orderKey,
    rowNo: b.rowNo,
    productCode: b.productCode,
    lineKey: b.lineKey
  })));
}

function summarizeReview(rows = [], items = []) {
  const selectedOrderCodes = new Set((rows || []).map(orderKey).filter(Boolean));
  const shortageOrderCodes = new Set(items.map((item) => item.orderKey).filter(Boolean));
  const productCodes = new Set(items.map((item) => item.productCode).filter(Boolean));
  return {
    selectedOrderCount: selectedOrderCodes.size || rows.length,
    shortageOrderCount: shortageOrderCodes.size,
    productCount: productCodes.size,
    itemCount: items.length,
    totalMissingQuantity: items.reduce((sum, item) => sum + toNumber(item.missingQuantity), 0),
    totalCutAmount: items.reduce((sum, item) => sum + toNumber(item.cutAmount), 0)
  };
}

function reviewFingerprint({ sessionId = '', rows = [], items = [] } = {}) {
  return hashPayload({
    kind: 'import-shortage-review',
    sessionId: cleanText(sessionId),
    selected: selectedScopeIdentity(rows, sessionId),
    items: (items || []).map((item) => ({
      documentCode: item.documentCode,
      customerCode: item.customerCode,
      rowNo: item.rowNo,
      productCode: item.productCode,
      requestedQuantity: toNumber(item.requestedQuantity),
      availableQuantity: toNumber(item.availableQuantity),
      importQuantity: toNumber(item.importQuantity),
      missingQuantity: toNumber(item.missingQuantity),
      cutAmount: toNumber(item.cutAmount)
    })).sort((a, b) => stableJson(a).localeCompare(stableJson(b)))
  });
}

async function rebuildSalesOrderRows(sourceRows = [], { userName = '', importMode = '' } = {}) {
  const rawRows = flattenCommitRows(sourceRows);
  if (!rawRows.length) return [];
  const rebuilt = await buildPreviewFromRows({
    type: 'salesOrders',
    rows: rawRows,
    userName,
    importMode
  });
  if (rebuilt && rebuilt.error) {
    const err = new Error(rebuilt.error);
    err.status = rebuilt.status || 400;
    throw err;
  }
  return Array.isArray(rebuilt?.rows) ? rebuilt.rows : [];
}

async function buildReviewForRows(session = {}, selectedRows = [], options = {}) {
  const sessionId = cleanText(session.sessionId || session.id || options.sessionId);
  const importMode = normalizeImportMode(options.importMode || session.importMode, 'salesOrders');
  const rebuiltRows = await rebuildSalesOrderRows(selectedRows, {
    userName: options.userName || '',
    importMode
  });
  const validRows = rebuiltRows.filter((row) =>
    row &&
    row.valid !== false &&
    row.canImport !== false &&
    (!Array.isArray(row.errors) || row.errors.length === 0)
  );
  const items = collectShortageItems(validRows);
  const summary = summarizeReview(validRows, items);
  const scopeFingerprint = selectedScopeFingerprint(validRows, sessionId);
  const fingerprint = reviewFingerprint({ sessionId, rows: validRows, items });
  return {
    ok: true,
    sessionId,
    type: 'salesOrders',
    status: items.length ? REVIEW_STATUS.PENDING : REVIEW_STATUS.NOT_REQUIRED,
    summary,
    items,
    fingerprint,
    selectedScopeFingerprint: scopeFingerprint,
    rebuiltRows,
    validRows
  };
}

async function getReview(sessionId, selection = {}, options = {}) {
  const session = await importSessionService.getSession(sessionId);
  if (!session) return { error: 'Khong tim thay phien import', status: 404, code: 'IMPORT_SESSION_NOT_FOUND' };
  if (session.type !== 'salesOrders') {
    return {
      ok: true,
      sessionId: session.sessionId || session.id || sessionId,
      type: session.type,
      status: REVIEW_STATUS.NOT_REQUIRED,
      summary: summarizeReview([], []),
      items: [],
      fingerprint: '',
      selectedScopeFingerprint: ''
    };
  }
  if (session.status !== 'preview_ready') {
    return {
      error: 'Phien import chua san sang review thieu hang',
      status: 409,
      code: 'IMPORT_SHORTAGE_REVIEW_SESSION_NOT_READY',
      sessionStatus: session.status
    };
  }
  const selectedRows = await importSessionService.selectRows(
    session,
    selection.selectedOrderCodes,
    selection.selectedRowNumbers,
    selection.selectedProgramCodes,
    selection.selectedRowKeys
  );
  return buildReviewForRows(session, selectedRows, options);
}

async function confirmReview(sessionId, payload = {}, user = {}) {
  const mode = cleanText(payload.mode);
  if (!VALID_REVIEW_MODES.has(mode)) {
    return {
      error: 'Che do review thieu hang khong hop le',
      status: 409,
      code: 'IMPORT_SHORTAGE_REVIEW_INVALID_MODE'
    };
  }
  const review = await getReview(sessionId, payload, {
    userName: user.username || user.fullName || user.name || ''
  });
  if (review.error) return review;
  if (!review.items.length) {
    return {
      ok: true,
      ...review,
      status: REVIEW_STATUS.NOT_REQUIRED
    };
  }
  if (cleanText(payload.fingerprint) !== review.fingerprint
    || cleanText(payload.selectedScopeFingerprint) !== review.selectedScopeFingerprint) {
    await importSessionService.updateShortageReview(sessionId, {
      status: REVIEW_STATUS.STALE,
      fingerprint: review.fingerprint,
      selectedScopeFingerprint: review.selectedScopeFingerprint,
      updatedAt: new Date()
    });
    return {
      error: 'Du lieu review thieu hang da thay doi, vui long tai lai popup.',
      status: 409,
      code: 'IMPORT_SHORTAGE_REVIEW_STALE',
      data: {
        fingerprint: review.fingerprint,
        selectedScopeFingerprint: review.selectedScopeFingerprint,
        summary: review.summary
      }
    };
  }
  const now = new Date();
  const actor = cleanText(user.username || user.fullName || user.name || user.code || '');
  const shortageReview = {
    status: REVIEW_STATUS.CONFIRMED,
    mode,
    fingerprint: review.fingerprint,
    selectedScopeFingerprint: review.selectedScopeFingerprint,
    orderCount: review.summary.shortageOrderCount,
    productCount: review.summary.productCount,
    itemCount: review.summary.itemCount,
    totalMissingQuantity: review.summary.totalMissingQuantity,
    totalCutAmount: review.summary.totalCutAmount,
    note: cleanText(payload.note),
    confirmedBy: actor,
    confirmedAt: now,
    updatedAt: now
  };
  await importSessionService.updateShortageReview(sessionId, shortageReview);
  try {
    await auditService.log('IMPORT_SHORTAGE_REVIEW_CONFIRMED', {
      refType: 'importSession',
      refId: review.sessionId,
      refCode: review.sessionId,
      userName: actor,
      summary: {
        importSessionId: review.sessionId,
        mode,
        selectedOrderCount: review.summary.selectedOrderCount,
        shortageOrderCount: review.summary.shortageOrderCount,
        totalMissingQuantity: review.summary.totalMissingQuantity,
        totalCutAmount: review.summary.totalCutAmount,
        confirmedBy: actor,
        confirmedAt: now.toISOString()
      }
    });
  } catch (err) {
    console.error('[IMPORT_SHORTAGE_REVIEW_AUDIT_ERROR]', {
      sessionId: review.sessionId,
      error: err && (err.stack || err.message || err)
    });
  }
  return {
    ok: true,
    ...review,
    status: REVIEW_STATUS.CONFIRMED,
    mode
  };
}

function buildReviewRequiredError(review, code = 'IMPORT_SHORTAGE_REVIEW_REQUIRED') {
  return {
    error: 'Can review don thieu hang truoc khi import',
    status: 409,
    code,
    sessionId: review.sessionId,
    importSessionId: review.sessionId,
    summary: review.summary,
    items: review.items,
    fingerprint: review.fingerprint,
    selectedScopeFingerprint: review.selectedScopeFingerprint
  };
}

function validateConfirmedReview(session = {}, review = {}, requestedMode = '') {
  if (!review.items.length) return { ok: true, mode: '', status: REVIEW_STATUS.NOT_REQUIRED };
  const mode = cleanText(requestedMode);
  if (!VALID_REVIEW_MODES.has(mode)) {
    return {
      ok: false,
      result: buildReviewRequiredError(review, 'IMPORT_SHORTAGE_REVIEW_INVALID_MODE')
    };
  }
  const saved = session.shortageReview || {};
  if (saved.status !== REVIEW_STATUS.CONFIRMED || saved.mode !== mode) {
    return {
      ok: false,
      result: buildReviewRequiredError(review, 'IMPORT_SHORTAGE_REVIEW_REQUIRED')
    };
  }
  if (cleanText(saved.fingerprint) !== review.fingerprint
    || cleanText(saved.selectedScopeFingerprint) !== review.selectedScopeFingerprint) {
    return {
      ok: false,
      result: buildReviewRequiredError(review, 'IMPORT_SHORTAGE_REVIEW_STALE')
    };
  }
  return { ok: true, mode, status: REVIEW_STATUS.CONFIRMED };
}

function applyReviewMode(validRows = [], mode = '', review = {}) {
  const shortageOrderKeys = new Set((review.items || []).map((item) => cleanText(item.orderKey)).filter(Boolean));
  const result = {
    rows: validRows,
    commitRows: [],
    shortageModeSummary: {
      shortageMode: mode || '',
      importedFullOrderCount: 0,
      importedPartialOrderCount: 0,
      skippedEmptyOrderCount: 0,
      totalCutQuantity: 0,
      totalCutAmount: 0,
      excludedShortageOrderCount: 0,
      excludedShortageOrderCodes: [],
      excludedLineCount: 0,
      excludedOriginalAmount: 0
    }
  };

  if (mode === REVIEW_MODES.EXCLUDE_SHORTAGE_ORDERS) {
    const keptRows = [];
    const excludedCodes = new Set();
    for (const row of validRows || []) {
      const key = orderKey(row);
      if (shortageOrderKeys.has(key)) {
        excludedCodes.add(key);
        result.shortageModeSummary.excludedLineCount += Number(row.lineCount || (Array.isArray(row.__importRows) ? row.__importRows.length : 1) || 0);
        result.shortageModeSummary.excludedOriginalAmount += toNumber(row.totalAmount || row.amount);
      } else {
        keptRows.push(row);
      }
    }
    result.rows = keptRows;
    result.commitRows = flattenAdjustedCommitRows(keptRows);
    result.shortageModeSummary.importedFullOrderCount = keptRows.length;
    result.shortageModeSummary.excludedShortageOrderCodes = [...excludedCodes];
    result.shortageModeSummary.excludedShortageOrderCount = excludedCodes.size;
    return result;
  }

  result.commitRows = flattenAdjustedCommitRows(validRows);
  for (const row of validRows || []) {
    if (row.hasShortage) result.shortageModeSummary.importedPartialOrderCount += 1;
    else result.shortageModeSummary.importedFullOrderCount += 1;
  }
  result.shortageModeSummary.skippedEmptyOrderCount = (validRows || []).filter((row) => {
    const adjusted = Array.isArray(row.__adjustedRows) ? row.__adjustedRows : [];
    return adjusted.length > 0 && adjusted.every((item) => item.__skipImportLine);
  }).length;
  result.shortageModeSummary.totalCutQuantity = review.summary?.totalMissingQuantity || 0;
  result.shortageModeSummary.totalCutAmount = review.summary?.totalCutAmount || 0;
  return result;
}

module.exports = {
  REVIEW_STATUS,
  REVIEW_MODES,
  VALID_REVIEW_MODES,
  collectShortageItems,
  summarizeReview,
  selectedScopeFingerprint,
  reviewFingerprint,
  buildReviewForRows,
  getReview,
  confirmReview,
  validateConfirmedReview,
  applyReviewMode,
  rebuildSalesOrderRows
};
