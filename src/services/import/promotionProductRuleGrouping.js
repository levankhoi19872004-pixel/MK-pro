'use strict';

const { toNumber } = require('../../utils/common.util');
const { cleanText } = require('./core/importValue.util');

function isPromotionPreviewRowImportable(row = {}) {
  return Boolean(
    row &&
    row.valid !== false &&
    row.canImport !== false &&
    row.missingProduct !== true &&
    row.productMatched !== false &&
    (!Array.isArray(row.errors) || row.errors.length === 0)
  );
}

function getPromotionPreviewProgramCode(row = {}) {
  return cleanText(row.programCode || row.promotionCode || row.groupCode || '');
}

function getPromotionPreviewProductCode(row = {}) {
  return cleanText(row.productCode || row.code || '');
}

function getPromotionDuplicateSignature(row = {}) {
  return JSON.stringify({
    programName: cleanText(row.programName || row.name || ''),
    productName: cleanText(row.productName || ''),
    discountPercent: toNumber(row.discountPercent),
    startDate: cleanText(row.startDate || row.fromDate || row.effectiveFrom || ''),
    endDate: cleanText(row.endDate || row.toDate || row.effectiveTo || ''),
    isActive: row.isActive !== false && row.isActive !== 'false'
  });
}

function addUniqueError(row, message) {
  if (!row || !message) return;
  if (!Array.isArray(row.errors)) row.errors = [];
  if (!row.errors.includes(message)) row.errors.push(message);
}

function setPromotionRowInvalid(row, message, { statusText = 'Lỗi', status = 'invalid', warningOnly = false } = {}) {
  if (!row) return row;
  if (message) {
    if (warningOnly) {
      if (!Array.isArray(row.warnings)) row.warnings = [];
      if (!row.warnings.includes(message)) row.warnings.push(message);
    } else {
      addUniqueError(row, message);
    }
  }
  row.valid = false;
  row.canImport = false;
  row.status = status;
  row.statusText = statusText;
  return row;
}

function applyPromotionProductRuleDuplicatePolicy(items = []) {
  const byKey = new Map();
  for (const item of items || []) {
    const programCode = getPromotionPreviewProgramCode(item);
    const productCode = getPromotionPreviewProductCode(item);
    if (!programCode || !productCode) continue;
    const key = `${programCode}__${productCode}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(item);
  }

  for (const group of byKey.values()) {
    if (group.length <= 1) continue;
    const signatures = new Set(group.map(getPromotionDuplicateSignature));
    const rowNos = group
      .map((row) => Number(row.sourceRowNo || row.rowNo || 0))
      .filter((rowNo) => Number.isFinite(rowNo) && rowNo > 0);

    if (signatures.size === 1) {
      const [first, ...duplicates] = group;
      first.sourceRowNos = Array.from(new Set([Number(first.sourceRowNo || first.rowNo || 0), ...rowNos].filter(Boolean)));
      first.duplicateCollapsedCount = duplicates.length;
      if (!Array.isArray(first.warnings)) first.warnings = [];
      const note = `Đã gom ${duplicates.length} dòng trùng giống nhau trong cùng mã CTKM + mã sản phẩm`;
      if (!first.warnings.includes(note)) first.warnings.push(note);
      for (const duplicate of duplicates) {
        duplicate.sourceRowNos = rowNos;
        setPromotionRowInvalid(duplicate, 'Dòng trùng giống nhau đã được gom vào dòng đầu tiên', {
          statusText: 'Đã gom trùng',
          status: 'duplicate-collapsed',
          warningOnly: true
        });
      }
      continue;
    }

    for (const item of group) {
      setPromotionRowInvalid(item, 'Trùng mã chương trình + mã sản phẩm trong file với dữ liệu CK khác nhau', {
        statusText: 'Lỗi trùng CK',
        status: 'invalid'
      });
    }
  }

  return items;
}

function compactPromotionPreviewRow(row = {}) {
  return {
    sourceRowNo: row.sourceRowNo || row.rowNo || row.__rowNo || '',
    sourceRowNos: Array.isArray(row.sourceRowNos) ? row.sourceRowNos : undefined,
    productCode: cleanText(row.productCode),
    productName: cleanText(row.productName),
    discountPercent: row.discountPercent,
    productMatched: row.productMatched === true,
    missingProduct: row.missingProduct === true,
    valid: row.valid !== false,
    canImport: row.canImport !== false,
    status: row.status || (row.valid !== false ? 'valid' : 'invalid'),
    statusText: row.statusText || (row.valid !== false ? 'Hợp lệ' : 'Lỗi'),
    errors: Array.isArray(row.errors) ? row.errors.filter(Boolean) : [],
    warnings: Array.isArray(row.warnings) ? row.warnings.filter(Boolean) : []
  };
}

function buildPromotionProductRuleGroups(previewRows = []) {
  const groupsByProgram = new Map();
  const groups = [];

  for (const row of previewRows || []) {
    const programCode = getPromotionPreviewProgramCode(row) || '(Thiếu mã CTKM)';
    if (!groupsByProgram.has(programCode)) {
      const group = {
        programCode,
        programName: cleanText(row.programName || ''),
        totalRows: 0,
        validRows: 0,
        invalidRows: 0,
        missingProductCount: 0,
        duplicateConflictCount: 0,
        duplicateCollapsedCount: 0,
        selected: false,
        canImport: false,
        status: 'invalid',
        statusText: 'Không hợp lệ',
        errors: [],
        warnings: [],
        rows: [],
        excludedRows: [],
        excludedSummary: {
          missingProductCount: 0,
          duplicateConflictCount: 0,
          duplicateCollapsedCount: 0,
          examples: []
        }
      };
      groupsByProgram.set(programCode, group);
      groups.push(group);
    }

    const group = groupsByProgram.get(programCode);
    group.totalRows += 1;
    if (!group.programName && row.programName) group.programName = cleanText(row.programName);

    if (isPromotionPreviewRowImportable(row)) {
      group.validRows += 1;
      group.rows.push(compactPromotionPreviewRow(row));
    } else {
      group.invalidRows += 1;
      const compact = compactPromotionPreviewRow(row);
      group.excludedRows.push(compact);
      if (group.excludedSummary.examples.length < 20) group.excludedSummary.examples.push(compact);
      if (row.missingProduct === true) {
        group.missingProductCount += 1;
        group.excludedSummary.missingProductCount += 1;
      }
      const errorText = Array.isArray(row.errors) ? row.errors.join(' | ') : '';
      const status = cleanText(row.status).toLowerCase();
      if (errorText.includes('dữ liệu CK khác nhau')) {
        group.duplicateConflictCount += 1;
        group.excludedSummary.duplicateConflictCount += 1;
      }
      if (status === 'duplicate-collapsed') {
        group.duplicateCollapsedCount += 1;
        group.excludedSummary.duplicateCollapsedCount += 1;
      }
    }
  }

  for (const group of groups) {
    group.canImport = group.validRows > 0;
    group.selected = group.canImport;
    if (group.validRows > 0 && group.invalidRows > 0) {
      group.status = 'partial-valid';
      group.statusText = 'Import partial';
      group.warnings.push(`Đã loại ${group.invalidRows} dòng lỗi khỏi danh sách import`);
    } else if (group.validRows > 0) {
      group.status = 'valid';
      group.statusText = 'Hợp lệ';
    } else {
      group.status = 'invalid';
      group.statusText = 'Không hợp lệ';
      group.errors.push('Chương trình không có dòng sản phẩm hợp lệ để import');
    }
  }

  const missingUnique = new Set();
  for (const row of previewRows || []) {
    if (row && row.missingProduct === true && row.productCode) missingUnique.add(cleanText(row.productCode));
  }

  const summary = {
    totalProgramCount: groups.length,
    importableProgramCount: groups.filter((group) => group.canImport).length,
    blockedProgramCount: groups.filter((group) => !group.canImport).length,
    missingProductCount: groups.reduce((sum, group) => sum + group.missingProductCount, 0),
    missingUniqueProductCount: missingUnique.size,
    duplicateConflictCount: groups.reduce((sum, group) => sum + group.duplicateConflictCount, 0),
    duplicateCollapsedCount: groups.reduce((sum, group) => sum + group.duplicateCollapsedCount, 0)
  };

  return { groups, groupSummary: summary };
}


module.exports = {
  buildPromotionProductRuleGroups,
  applyPromotionProductRuleDuplicatePolicy,
  isPromotionPreviewRowImportable
};
