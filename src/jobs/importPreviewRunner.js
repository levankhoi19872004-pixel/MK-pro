'use strict';

const fs = require('fs/promises');
const { parseExcelBuffer } = require('../../utils/excelParser');
const importSessionService = require('../services/importSessionService');

function createImportError(message, { code, stage, status } = {}) {
  const err = new Error(String(message || 'Import preview thất bại'));
  err.code = code || 'IMPORT_PREVIEW_FAILED';
  err.importStage = stage || 'unknown';
  if (status) err.statusCode = Number(status);
  return err;
}

async function runImportPreviewPipeline({
  sessionId,
  type,
  files = [],
  userName = '',
  importMode = 'create',
  buildPreviewFromRows,
  deferFinalState = false,
  onStage
}) {
  if (typeof buildPreviewFromRows !== 'function') throw new TypeError('Thiếu buildPreviewFromRows');

  let currentStage = 'reading_file';
  const notifyStage = async ({ stage, percent, fileName = '' }) => {
    currentStage = stage;
    await importSessionService.updateProgress(sessionId, {
      percent,
      step: fileName ? `${stage}:${fileName}` : stage
    });

    if (typeof onStage === 'function') {
      try {
        await onStage({ stage, percent, fileName });
      } catch (err) {
        console.warn('[IMPORT_PREVIEW_STAGE_NOTIFY_ERROR]', err && (err.message || err));
      }
    }
  };

  const parsingSession = await importSessionService.markParsing(sessionId);
  const effectiveImportMode = parsingSession?.importMode === 'update'
    ? 'update'
    : (importMode === 'update' ? 'update' : 'create');

  try {
    await notifyStage({ stage: 'reading_file', percent: 10 });

    const rows = [];
    const fileNames = [];
    const totalFiles = Math.max(1, files.length);

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const currentFileName = file.fileName || file.originalname || 'import.xlsx';
      const fileProgressBase = 10 + Math.floor((index / totalFiles) * 40);

      await notifyStage({
        stage: 'reading_file',
        percent: fileProgressBase,
        fileName: currentFileName
      });
      const buffer = file.buffer || await fs.readFile(file.path);

      await notifyStage({
        stage: 'parsing_excel',
        percent: Math.min(50, fileProgressBase + 10),
        fileName: currentFileName
      });
      const fileRows = (await parseExcelBuffer(buffer)).map((row, rowIndex) => ({
        ...row,
        __sourceFile: currentFileName,
        sourceFile: currentFileName,
        fileName: currentFileName,
        __rowNo: row.__rowNo || row.rowNo || rowIndex + 2
      }));

      fileNames.push(currentFileName);
      rows.push(...fileRows);
    }

    await notifyStage({ stage: 'validating', percent: 60 });
    const result = await buildPreviewFromRows({
      type,
      rows,
      userName,
      importMode: effectiveImportMode
    });

    if (result.error) {
      if (!deferFinalState) {
        await importSessionService.markFailed(sessionId, result.error, {
          stage: 'validating',
          code: 'IMPORT_PREVIEW_VALIDATION_FAILED'
        });
        return result;
      }

      throw createImportError(result.error, {
        code: 'IMPORT_PREVIEW_VALIDATION_FAILED',
        stage: 'validating',
        status: result.status
      });
    }

    await notifyStage({ stage: 'saving_rows', percent: 85 });
    await importSessionService.savePreviewResult(sessionId, {
      rows: result.rows || [],
      previewRows: result.rows || [],
      fileNames,
      deferFinalState
    });

    return {
      ...result,
      files: fileNames.map((currentFileName) => ({
        fileName: currentFileName,
        totalRows: rows.filter((row) => row.fileName === currentFileName).length,
        totalOrders: (result.rows || []).filter((row) => row.fileName === currentFileName || row.sourceFile === currentFileName).length,
        errors: (result.rows || [])
          .filter((row) => (row.fileName === currentFileName || row.sourceFile === currentFileName) && row.valid === false)
          .flatMap((row) => row.errors || [])
          .slice(0, 20)
      })),
      totalFiles: fileNames.length
    };
  } catch (reason) {
    const err = reason instanceof Error ? reason : new Error(String(reason || 'Import preview thất bại'));
    if (!err.importStage) err.importStage = currentStage;
    if (!err.code) err.code = 'IMPORT_PREVIEW_FAILED';

    if (!deferFinalState) {
      await importSessionService.markFailed(sessionId, err.message, {
        stage: err.importStage,
        code: err.code
      }).catch(() => {});
    }

    throw err;
  }
}

module.exports = { runImportPreviewPipeline };
