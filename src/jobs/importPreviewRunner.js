'use strict';

const fs = require('fs/promises');
const { parseExcelBuffer } = require('../../utils/excelParser');
const importSessionService = require('../services/importSessionService');

async function runImportPreviewPipeline({ sessionId, type, files = [], userName = '', buildPreviewFromRows }) {
  if (typeof buildPreviewFromRows !== 'function') throw new TypeError('Thiếu buildPreviewFromRows');
  await importSessionService.markParsing(sessionId);

  try {
    const rows = [];
    const fileNames = [];
    for (const file of files) {
      const currentFileName = file.fileName || file.originalname || 'import.xlsx';
      const buffer = file.buffer || await fs.readFile(file.path);
      await importSessionService.updateProgress(sessionId, { percent: 20, step: `parsing:${currentFileName}` });
      const fileRows = (await parseExcelBuffer(buffer)).map((row, index) => ({
        ...row,
        __sourceFile: currentFileName,
        sourceFile: currentFileName,
        fileName: currentFileName,
        __rowNo: row.__rowNo || row.rowNo || index + 2
      }));
      fileNames.push(currentFileName);
      rows.push(...fileRows);
    }

    await importSessionService.updateProgress(sessionId, { percent: 60, step: 'validating' });
    const result = await buildPreviewFromRows({ type, rows, userName });
    if (result.error) {
      await importSessionService.markFailed(sessionId, result.error);
      return result;
    }

    await importSessionService.updateProgress(sessionId, { percent: 85, step: 'saving_preview' });
    await importSessionService.savePreviewResult(sessionId, {
      rows: result.rows || [], previewRows: result.rows || [], fileNames
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

module.exports = { runImportPreviewPipeline };
