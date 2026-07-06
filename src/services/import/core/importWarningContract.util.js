'use strict';

function cleanText(value) {
  return String(value ?? '').trim();
}

function stripVietnamese(value) {
  return cleanText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

const FIELD_DEFINITIONS = [
  { field: 'programCode', label: 'Mã CTKM', tokens: ['ma ctkm', 'ma chuong trinh', 'chuong trinh', 'promotion', 'program'] },
  { field: 'groupCode', label: 'Mã nhóm', tokens: ['ma nhom', 'nhom san pham', 'group'] },
  { field: 'productCode', label: 'Mã sản phẩm', tokens: ['ma san pham', 'san pham', 'product', 'sku'] },
  { field: 'productName', label: 'Tên sản phẩm', tokens: ['ten san pham', 'product name'] },
  { field: 'customerCode', label: 'Mã khách hàng', tokens: ['ma khach hang', 'ma kh', 'khach hang', 'customer'] },
  { field: 'customerName', label: 'Tên khách hàng', tokens: ['ten khach hang', 'ten kh'] },
  { field: 'salesStaffCode', label: 'Mã NVBH', tokens: ['ma nvbh', 'nvbh', 'nhan vien ban hang', 'sales staff'] },
  { field: 'deliveryStaffCode', label: 'Mã NVGH', tokens: ['ma nvgh', 'nvgh', 'nhan vien giao hang', 'delivery staff'] },
  { field: 'documentCode', label: 'Mã đơn/chứng từ', tokens: ['ma don', 'ma chung tu', 'so don', 'document', 'order'] },
  { field: 'date', label: 'Ngày', tokens: ['ngay', 'date'] },
  { field: 'quantity', label: 'Số lượng', tokens: ['so luong', 'quantity', 'qty'] },
  { field: 'qty', label: 'Số lượng', tokens: ['so luong', 'quantity', 'qty'] },
  { field: 'salePrice', label: 'Giá bán', tokens: ['gia ban', 'don gia', 'price'] },
  { field: 'discountPercent', label: 'Chiết khấu', tokens: ['chiet khau', 'ck', 'discount'] },
  { field: 'amount', label: 'Số tiền', tokens: ['so tien', 'amount', 'thanh tien'] }
];

const FIELD_BY_NAME = new Map(FIELD_DEFINITIONS.map((item) => [item.field, item]));

function normalizeFieldName(value) {
  return stripVietnamese(value).replace(/[^a-z0-9]/g, '');
}

function labelForField(field) {
  const cleanField = cleanText(field);
  return FIELD_BY_NAME.get(cleanField)?.label || cleanField || 'Dữ liệu';
}

function getRowNo(row = {}, fallback = 0) {
  const value = Number(row.__rowNo || row.rowNo || row.sourceRowNo || row.rowNumber || row.excelRowNo || fallback || 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function pickValue(source = {}, field = '') {
  if (!source || typeof source !== 'object') return '';
  const candidates = [
    source,
    source.raw,
    source.source,
    source.normalized,
    source.payload
  ].filter((item) => item && typeof item === 'object');

  const normalizedField = normalizeFieldName(field);
  for (const pool of candidates) {
    if (Object.prototype.hasOwnProperty.call(pool, field) && pool[field] !== undefined && pool[field] !== null) return pool[field];
    for (const [key, value] of Object.entries(pool)) {
      if (normalizeFieldName(key) === normalizedField && value !== undefined && value !== null) return value;
    }
  }
  return '';
}

function inferFieldFromMessage(message = '') {
  const normalized = stripVietnamese(message);
  for (const definition of FIELD_DEFINITIONS) {
    if (definition.tokens.some((token) => normalized.includes(token))) return definition;
  }
  return { field: '', label: 'Dữ liệu' };
}

function normalizeIssueCode(issue = {}, message = '') {
  const explicit = cleanText(issue.code || issue.errorCode || issue.type).toUpperCase();
  if (explicit) return explicit.replace(/[^A-Z0-9_]/g, '_').slice(0, 60);

  const normalized = stripVietnamese(message);
  if (/\bthieu\b|trong|bat buoc/.test(normalized)) return 'MISSING_REQUIRED';
  if (/khong tim thay|chua co|khong ton tai|not found/.test(normalized)) return 'REFERENCE_NOT_FOUND';
  if (/trung.*file|duplicate.*file/.test(normalized)) return 'DUPLICATE_IN_FILE';
  if (/da ton tai|trung.*du lieu|duplicate/.test(normalized)) return 'DUPLICATE_IN_DB';
  if (/sai dinh dang|khong hop le|invalid|format/.test(normalized)) return 'INVALID_FORMAT';
  if (/bo qua|skip|so luong.*0|qty.*0/.test(normalized)) return 'SKIPPED';
  return 'BUSINESS_RULE_ERROR';
}

function messageFromIssue(issue) {
  if (issue && typeof issue === 'object' && !Array.isArray(issue)) {
    return cleanText(issue.message || issue.error || issue.warning || issue.reason || issue.detail || '');
  }
  return cleanText(issue);
}

function normalizeImportIssue(row = {}, issue, { rowNo = 0, sourceFile = '' } = {}) {
  const source = issue && typeof issue === 'object' && !Array.isArray(issue) ? issue : {};
  const message = messageFromIssue(issue) || cleanText(row.statusText) || 'Dòng dữ liệu không hợp lệ';
  const inferred = source.field ? { field: cleanText(source.field), label: cleanText(source.label) || labelForField(source.field) } : inferFieldFromMessage(message);
  const field = cleanText(inferred.field);
  const label = cleanText(source.label || inferred.label || labelForField(field));
  const rawValue = source.value !== undefined
    ? source.value
    : (source.rawValue !== undefined ? source.rawValue : pickValue(row, field));

  return {
    rowNo: Number(source.rowNo || source.row || rowNo || getRowNo(row)) || 0,
    field,
    label: label || 'Dữ liệu',
    value: rawValue === undefined || rawValue === null || cleanText(rawValue) === '' ? 'Trống' : cleanText(rawValue),
    code: normalizeIssueCode(source, message),
    message,
    sourceFile: cleanText(source.sourceFile || sourceFile || row.sourceFile || row.__sourceFile || row.fileName || ''),
    status: 'invalid'
  };
}

function rowHasBlockingIssue(row = {}) {
  const status = cleanText(row.status).toLowerCase();
  const errors = Array.isArray(row.errors) ? row.errors.filter(Boolean) : [];
  return row.valid === false || row.missingProduct === true || row.productMatched === false || errors.length > 0 || ['invalid', 'error', 'skipped'].includes(status);
}

function isImportRowImportable(row = {}) {
  return Boolean(row && row.canImport !== false && !rowHasBlockingIssue(row));
}

function collectRowIssues(row = {}, index = 0) {
  const rowNo = getRowNo(row, index + 1);
  const sourceFile = cleanText(row.sourceFile || row.__sourceFile || row.fileName || '');
  const issues = [];

  if (Array.isArray(row.errors)) {
    row.errors.filter(Boolean).forEach((error) => issues.push(normalizeImportIssue(row, error, { rowNo, sourceFile })));
  }

  if (Array.isArray(row.detailErrors)) {
    row.detailErrors.forEach((detail) => {
      const detailRow = { ...row, ...(detail || {}) };
      const detailRowNo = Number(detail?.rowNo || rowNo) || rowNo;
      (Array.isArray(detail?.errors) ? detail.errors : []).filter(Boolean).forEach((error) => {
        issues.push(normalizeImportIssue(detailRow, error, { rowNo: detailRowNo, sourceFile }));
      });
    });
  }

  if (!issues.length && rowHasBlockingIssue(row)) {
    issues.push(normalizeImportIssue(row, row.statusText || 'Dòng dữ liệu không hợp lệ', { rowNo, sourceFile }));
  }

  return issues;
}

function buildImportInvalidRows(rows = [], { limit = 1000 } = {}) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const output = [];
  for (let index = 0; index < safeRows.length; index += 1) {
    const row = safeRows[index];
    if (!rowHasBlockingIssue(row || {})) continue;
    output.push(...collectRowIssues(row || {}, index));
    if (output.length >= limit) return output.slice(0, limit);
  }
  return output;
}

function summarizeImportWarningContract(rows = []) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const blockingRows = safeRows.filter((row) => rowHasBlockingIssue(row || {}));
  const importableRows = safeRows.filter((row) => isImportRowImportable(row || {}));
  const warningRows = safeRows.filter((row) => Array.isArray(row?.warnings) && row.warnings.filter(Boolean).length > 0);
  const skippedRows = safeRows.filter((row) => {
    const status = cleanText(row?.status).toLowerCase();
    return status === 'skipped' || (row && row.canImport === false && !rowHasBlockingIssue(row));
  });

  return {
    totalRows: safeRows.length,
    validRows: safeRows.length - blockingRows.length,
    warningRows: warningRows.length,
    errorRows: blockingRows.length,
    invalidRows: blockingRows.length,
    importableRows: importableRows.length,
    skippedRows: skippedRows.length
  };
}

function attachImportWarningContract(payload = {}) {
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const derivedSummary = summarizeImportWarningContract(rows);
  const invalidRows = buildImportInvalidRows(rows);
  const summary = {
    ...(payload.summary && typeof payload.summary === 'object' ? payload.summary : {}),
    ...derivedSummary,
    invalidRows: derivedSummary.invalidRows,
    skippedRows: derivedSummary.skippedRows,
    importableRows: derivedSummary.importableRows
  };

  return {
    ...payload,
    validRows: payload.validRows ?? summary.validRows,
    errorRows: payload.errorRows ?? summary.errorRows,
    warningRows: payload.warningRows ?? summary.warningRows,
    importableRows: payload.importableRows ?? summary.importableRows,
    skippedRows: payload.skippedRows ?? summary.skippedRows,
    invalidRows,
    summary
  };
}

module.exports = {
  buildImportInvalidRows,
  summarizeImportWarningContract,
  attachImportWarningContract,
  isImportRowImportable,
  rowHasBlockingIssue,
  normalizeImportIssue,
  normalizeIssueCode,
  inferFieldFromMessage
};
