'use strict';

const excelImportService = require('../services/excelImportService');
const { runImportPreviewPipeline } = require('./importPreviewRunner');

// parseExcelBuffer/readFile và updateProgress nằm trong importPreviewRunner để worker và
// inline fallback dùng chung mà không tạo circular dependency.
async function runImportPreviewJob(args = {}) {
  return runImportPreviewPipeline({
    ...args,
    buildPreviewFromRows: excelImportService.buildPreviewFromRows
  });
}

module.exports = { runImportPreviewJob };
