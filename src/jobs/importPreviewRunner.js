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

function pushRows(target = [], source = []) {
  for (const row of source || []) target.push(row);
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
    const fileStats = new Map();
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
      fileStats.set(currentFileName, { totalRows: fileRows.length, totalOrders: 0, errors: [] });
      pushRows(rows, fileRows);
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

    for (const row of result.rows || []) {
      const fileName = row.fileName || row.sourceFile;
      const stats = fileStats.get(fileName);
      if (!stats) continue;
      stats.totalOrders += 1;
      if (row.valid === false && stats.errors.length < 20) {
        for (const error of row.errors || []) {
          if (stats.errors.length >= 20) break;
          stats.errors.push(error);
        }
      }
    }

    return {
      ...result,
      files: fileNames.map((fileName) => ({
        fileName,
        totalRows: fileStats.get(fileName)?.totalRows || 0,
        totalOrders: fileStats.get(fileName)?.totalOrders || 0,
        errors: fileStats.get(fileName)?.errors || []
      })),
      totalFiles: fileNames.length
    };
  } catch (err) {
    await importSessionService.markFailed(sessionId, err.message);
    throw err;
  }
}

module.exports = { runImportPreviewPipeline };
