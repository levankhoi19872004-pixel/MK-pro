'use strict';

const ImportLog = require('../../models/ImportLog');
const importSessionService = require('../importSessionService');
const auditService = require('../auditService');
const importShortageReportService = require('../importShortageReportService');
const importCommitOrchestrator = require('./ImportCommitOrchestrator');
const {
  IMPORT_MODE_CREATE,
  IMPORT_MODE_UPDATE,
  normalizeImportMode,
  getProvidedField,
  parseImportBoolean,
  buildChanges,
  omitUnchanged
} = require('./selectiveUpdate.util');

const {
  flattenAdjustedCommitRows,
  flattenCommitRows,
  normalizeShortageRows,
  summarizeOrderShortages
} = require('./core/importRow.util');
const { buildPreviewFromRows } = require('./preview/importPreview.impl');
const { upsertProducts, upsertCustomers } = require('./operations/catalogImport.impl');
const { importOpeningStock, importImportOrders, importSalesOrders } = require('./operations/salesImport.impl');
const { importOpeningDebt, importDebtCollections, importCashbook } = require('./operations/financeImport.impl');
const {
  importUsers,
  importPromotionProductRules,
  importPromotionGroupItems,
  importPromotionGroupRules
} = require('./operations/adminImport.impl');

async function getSessionStatus(sessionId) {
  const session = await importSessionService.getSession(sessionId);

  if (!session) {
    return {
      error: 'Không tìm thấy phiên import',
      status: 404
    };
  }

  return {
    sessionId: session.sessionId || session.id,
    importSessionId: session.sessionId || session.id,
    type: session.type,
    importMode: normalizeImportMode(session.importMode, session.type),
    status: session.status,
    progress: session.progress || { percent: 0, step: '' },
    totalRows: session.totalRows || 0,
    validRows: session.validRows || 0,
    errorRows: session.errorRows || 0,
    storedRows: session.storedRows || 0,
    previewRows: session.previewRows || [],
    importErrors: session.importErrors || [],
    errorMessage: session.errorMessage || '',
    result: session.result || {},
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    queuedAt: session.queuedAt,
    startedAt: session.startedAt,
    finishedAt: session.finishedAt,
    failedAt: session.failedAt
  };
}

async function getSessionRows(sessionId, { offset = 0, limit = 500 } = {}) {
  const result = await importSessionService.listSessionRows(sessionId, { offset, limit });

  if (!result) {
    return {
      error: 'Không tìm thấy phiên import',
      status: 404
    };
  }

  return result;
}

async function safeMarkImportFailed(sessionId, err, fallbackMessage = 'Import thất bại') {
  const message = err && err.message ? err.message : String(err || fallbackMessage);

  if (!sessionId) return message;

  try {
    await importSessionService.markFailed(sessionId, message);
  } catch (markErr) {
    console.error('[IMPORT_SESSION_MARK_FAILED_ERROR]', {
      sessionId,
      originalError: message,
      markFailedError: markErr && (markErr.stack || markErr.message || markErr)
    });
  }

  return message;
}

async function rebuildSelectedSalesOrderPreviewRows(sourceRows = [], { userName = '', importMode = '' } = {}) {
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

async function commit({ type, rows, shortageMode = '', sessionId = '', selectedOrderCodes = [], userName = '' }) {
  if (!type) return { error: 'Thiếu loại import', status: 400 };
  if (type === 'salesOrdersS3') type = 'salesOrders';
  if (!sessionId) return { error: 'Bắt buộc xác nhận bằng importSessionId từ bước preview', status: 400 };

  const session = await importSessionService.markImporting(sessionId);
  if (!session) {
    return { error: 'Phiên import không tồn tại hoặc chưa sẵn sàng xác nhận', status: 400 };
  }

  const currentSessionId = session.sessionId || session.id;
  const importMode = normalizeImportMode(session.importMode, type);

  let sourceRows = [];
  let validRows = [];
  let commitRows = [];
  let result = null;
  let hasShortage = false;

  try {
    if (session.type !== type) {
      await importSessionService.markFailed(currentSessionId, 'Phiên preview không khớp loại import');
      return {
        error: 'Phiên preview không khớp loại import',
        status: 400,
        sessionId: currentSessionId,
        importSessionId: currentSessionId
      };
    }

    sourceRows = await importSessionService.selectRows(session, selectedOrderCodes);
    await importSessionService.updateProgress(currentSessionId, {
      percent: 5,
      step: 'loading_selected_rows'
    });
    if (!sourceRows.length) {
      await importSessionService.markFailed(currentSessionId, 'Không có dòng hợp lệ để import');
      return {
        error: 'Không có dòng hợp lệ để import',
        status: 400,
        sessionId: currentSessionId,
        importSessionId: currentSessionId
      };
    }

    if (type === 'salesOrders') {
      await importSessionService.updateProgress(currentSessionId, {
        percent: 10,
        step: 'reallocating_selected_orders_against_current_stock'
      });
      // Rebuild lại preview từ đúng các đơn người dùng đã chọn và tồn kho hiện tại.
      // Tránh trường hợp đơn bị cắt theo các đơn đã bỏ chọn hoặc theo snapshot tồn cũ.
      sourceRows = await rebuildSelectedSalesOrderPreviewRows(sourceRows, {
        userName,
        importMode
      });
    }

    validRows = sourceRows.filter((r) =>
      r &&
      r.valid !== false &&
      r.canImport !== false &&
      (!Array.isArray(r.errors) || r.errors.length === 0)
    );

    if (!validRows.length) {
      await importSessionService.markFailed(currentSessionId, 'Không có dòng/đơn hợp lệ để import');
      return {
        error: 'Không có dòng/đơn hợp lệ để import',
        status: 400,
        errors: sourceRows.flatMap((r) => r.errors || []).slice(0, 50),
        sessionId: currentSessionId,
        importSessionId: currentSessionId
      };
    }

    hasShortage = validRows.some((r) => r && r.hasShortage);
    commitRows = type === 'salesOrders'
      ? flattenAdjustedCommitRows(validRows)
      : flattenCommitRows(validRows);

    if (!importCommitOrchestrator.supports(type)) {
      await importSessionService.markFailed(currentSessionId, 'Loại import không hợp lệ');
      return {
        error: 'Loại import không hợp lệ',
        status: 400,
        supportedTypes: importCommitOrchestrator.supportedTypes(),
        sessionId: currentSessionId,
        importSessionId: currentSessionId
      };
    }

    await importSessionService.updateProgress(currentSessionId, {
      percent: 18,
      step: 'committing'
    });

    result = await importCommitOrchestrator.commit(type, commitRows, {
      options: {
        importSessionId: currentSessionId,
        sessionId: currentSessionId,
        importMode
      },
      operations: {
        upsertProducts,
        upsertCustomers,
        importUsers,
        importOpeningStock,
        importImportOrders,
        importSalesOrders,
        importOpeningDebt,
        importDebtCollections,
        importCashbook,
        importPromotionProductRules,
        importPromotionGroupItems,
        importPromotionGroupRules
      }
    });

    if (result && result.error) {
      throw new Error(result.error);
    }

    await importSessionService.updateProgress(currentSessionId, {
      percent: 95,
      step: 'finalizing'
    });
  } catch (err) {
    const message = await safeMarkImportFailed(currentSessionId, err, 'Import thất bại');

    return {
      error: 'Import thất bại',
      status: 500,
      detail: message,
      sessionId: currentSessionId,
      importSessionId: currentSessionId
    };
  }

  try {
    await importSessionService.markDone(currentSessionId, result);
  } catch (err) {
    const message = await safeMarkImportFailed(
      currentSessionId,
      err,
      'Import đã ghi dữ liệu nhưng không cập nhật được trạng thái hoàn tất'
    );

    return {
      error: 'Import đã ghi dữ liệu nhưng không cập nhật được trạng thái hoàn tất',
      status: 500,
      detail: message,
      sessionId: currentSessionId,
      importSessionId: currentSessionId
    };
  }

  try {
    await auditService.log('IMPORT_COMMIT', {
      refType: 'importSession',
      refId: currentSessionId,
      refCode: currentSessionId,
      userName,
      summary: {
        type,
        importMode,
        totalSelected: sourceRows.length,
        totalValid: validRows.length,
        totalCommitRows: commitRows.length,
        imported: result.imported || 0,
        skipped: result.skipped || 0,
        errors: (result.errors || []).slice(0, 20)
      }
    });
  } catch (err) {
    console.error('[IMPORT_COMMIT_AUDIT_ERROR]', {
      sessionId: currentSessionId,
      error: err && (err.stack || err.message || err)
    });
  }

  const shortageRows = type === 'salesOrders'
    ? normalizeShortageRows([
        ...validRows.flatMap((r) => r.shortageReport || []),
        ...(result.shortageReport || [])
      ])
    : [];

  let savedShortageReport = null;
  if (type === 'salesOrders' && shortageRows.length) {
    try {
      savedShortageReport = await importShortageReportService.saveFromImport({
        importSessionId: currentSessionId,
        shortageRows,
        userName
      });
    } catch (err) {
      console.error('[IMPORT_SHORTAGE_REPORT_SAVE_ERROR]', {
        sessionId: currentSessionId,
        error: err && (err.stack || err.message || err)
      });
    }
  }

  return {
    ...result,
    source: 'mongo-import-session-confirm',
    ok: true,
    message: result.message || `Đã import ${result.imported || 0} chứng từ`,
    importMode,
    totalRows: sourceRows.length,
    totalCommitRows: commitRows.length,
    hasShortage: type === 'salesOrders' && (hasShortage || shortageRows.length > 0),
    shortageMode: shortageRows.length ? 'cut' : '',
    shortageReport: shortageRows,
    shortageSummary: summarizeOrderShortages(shortageRows),
    shortageReportId: savedShortageReport?._id || '',
    shortageReportCode: savedShortageReport?.code || '',
    shortageReportSaved: Boolean(savedShortageReport),
    sessionId: currentSessionId,
    importSessionId: currentSessionId
  };
}

async function importDirect() {
  return {
    error: 'Import trực tiếp đã bị khóa. Vui lòng preview Excel rồi xác nhận import.',
    status: 410
  };
}

async function logs() {
  const logs = await ImportLog.find({}).sort({ createdAt: -1 }).limit(200).lean().catch(() => []);
  return logs;
}

module.exports = {
  getSessionStatus,
  getSessionRows,
  safeMarkImportFailed,
  rebuildSelectedSalesOrderPreviewRows,
  commit,
  importDirect,
  logs
};