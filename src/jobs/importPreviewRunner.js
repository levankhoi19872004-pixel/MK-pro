'use strict';

const fs = require('fs/promises');
const { parseExcelBuffer } = require('../../utils/excelParser');
const importSessionService = require('../services/importSessionService');

function normalizePreviewFileName(value) {
  const text = String(value ?? '').trim();
  if (!text) return text;
  if (!/[ÃÂÄ]/.test(text)) return text;
  try {
    const decoded = Buffer.from(text, 'latin1').toString('utf8');
    if (decoded && decoded !== text && !decoded.includes('�')) return decoded;
  } catch (_) {
    // Không phải mojibake latin1->utf8, giữ nguyên.
  }
  return text;
}

async function runImportPreviewPipeline({ sessionId, type, files = [], userName = '', importMode = 'create', buildPreviewFromRows }) {
  if (typeof buildPreviewFromRows !== 'function') throw new TypeError('Thiếu buildPreviewFromRows');
  const parsingSession = await importSessionService.markParsing(sessionId);
  // Import mode is persisted in Mongo when the preview session is created. Always
  // prefer that value so a queue/worker serialization bug cannot silently turn an
  // update preview back into create mode.
  const effectiveImportMode = parsingSession?.importMode === 'update'
    ? 'update'
    : (importMode === 'update' ? 'update' : 'create');

  try {
    const rows = [];
    const fileNames = [];
    for (const file of files) {
      const currentFileName = normalizePreviewFileName(file.fileName || file.originalname || 'import.xlsx');
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
    const result = await buildPreviewFromRows({ type, rows, userName, importMode: effectiveImportMode });
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
