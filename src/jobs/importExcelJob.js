'use strict';

const { parseExcelBuffer } = require('../../utils/excelParser');
const excelImportService = require('../services/excelImportService');
const importSessionService = require('../services/importSessionService');

async function runImportPreviewJob({ sessionId, type, files = [], userName = '' }) {
  await importSessionService.markParsing(sessionId);

  try {
    const rows = [];
    const fileNames = [];

    for (const file of files) {
      const fileRows = (await parseExcelBuffer(file.buffer)).map((row, index) => ({
        ...row,
        __sourceFile: file.fileName,
        sourceFile: file.fileName,
        fileName: file.fileName,
        __rowNo: row.__rowNo || row.rowNo || index + 2
      }));

      fileNames.push(file.fileName);
      rows.push(...fileRows);
    }

    const result = await excelImportService.buildPreviewFromRows({ type, rows, userName });
    if (result.error) {
      await importSessionService.markFailed(sessionId, result.error);
      return result;
    }

    await importSessionService.savePreviewResult(sessionId, {
      rows: result.rows || [],
      previewRows: result.rows || [],
      fileNames
    });

    return {
      ...result,
      files: fileNames.map((fileName) => ({
        fileName,
        totalRows: rows.filter((row) => row.fileName === fileName).length,
        totalOrders: (result.rows || []).filter((row) => row.fileName === fileName || row.sourceFile === fileName).length,
        errors: (result.rows || []).filter((row) => (row.fileName === fileName || row.sourceFile === fileName) && row.valid === false).flatMap((row) => row.errors || []).slice(0, 20)
      })),
      totalFiles: fileNames.length
    };
  } catch (err) {
    await importSessionService.markFailed(sessionId, err.message);
    throw err;
  }
}

module.exports = {
  runImportPreviewJob
};
