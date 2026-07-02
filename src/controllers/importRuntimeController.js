'use strict';

const excelImportService = require('../services/excelImportService');
const ImportWebDirectCommitService = require('../services/import/ImportWebDirectCommitService');
const ImportWebDetachedCommitService = require('../services/import/ImportWebDetachedCommitService');
const AsyncJobHttpAdapter = require('../services/background-jobs/AsyncJobHttpAdapter');


function importCommitAsyncThreshold() {
  const value = Number(process.env.IMPORT_COMMIT_PROMOTION_ASYNC_THRESHOLD || 1000);
  return Number.isFinite(value) && value > 0 ? value : Infinity;
}

function selectedImportCommitCount(body = {}) {
  return Math.max(
    Array.isArray(body.selectedRowNumbers) ? body.selectedRowNumbers.length : 0,
    Array.isArray(body.selectedRowKeys) ? body.selectedRowKeys.length : 0,
    Array.isArray(body.selectedOrderCodes) ? body.selectedOrderCodes.length : 0,
    Array.isArray(body.selectedProgramCodes) ? body.selectedProgramCodes.length : 0
  );
}


function shouldRunWebDetachedImportCommit(req = {}) {
  const body = req.body || {};
  const type = String(body.type || '').trim();
  return type === 'promotionProductRules';
}

function shouldRunImportCommitAsync(req = {}) {
  if (AsyncJobHttpAdapter.prefersAsync(req)) return true;
  const body = req.body || {};
  const type = String(body.type || '').trim();
  return type === 'promotionProductRules' && selectedImportCommitCount(body) > importCommitAsyncThreshold();
}

async function preview(req, res) {
  try {
    const file = (req.importFiles && req.importFiles[0]) || req.file;
    if (!file) return res.status(400).json({ ok: false, message: 'Chưa có file Excel để import' });
    const result = await excelImportService.preview({ type: String(req.body?.type || req.query?.type || '').trim(), buffer: file.buffer, fileName: file.originalname || '', userName: req.user?.username || req.user?.fullName || '', importMode: String(req.body?.importMode || req.query?.importMode || '').trim() });
    if (result.error) return res.status(result.status || 400).json({ ok: false, message: result.error, ...result });
    return res.status(result.accepted ? 202 : 200).json({ ok: true, source: 'mongo-native-import-controller', ...result });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không đọc được file import', error: process.env.NODE_ENV === 'production' ? undefined : err.message });
  }
}

async function commit(req, res) {
  try {
    if (shouldRunWebDetachedImportCommit(req)) {
      const submitted = await ImportWebDetachedCommitService.submit({
        ...(req.body || {}),
        sessionId: req.params?.sessionId || req.body?.sessionId || req.body?.importSessionId
      }, req.user || {});
      if (submitted.error) {
        return res.status(submitted.status || 400).json({ ok: false, message: submitted.error, ...submitted });
      }
      return res.status(submitted.accepted ? 202 : 200).json({ ok: true, ...submitted });
    }

    if (shouldRunImportCommitAsync(req)) {
      const submitted = await AsyncJobHttpAdapter.submitImportCommit(req);
      if (submitted.error) {
        return res.status(submitted.status || 400).json({ ok: false, message: submitted.error, ...submitted });
      }
      return res.status(202).json(AsyncJobHttpAdapter.acceptedPayload(submitted, { source: 'mongo-native-import-controller' }));
    }

    const result = await ImportWebDirectCommitService.commitSession({
      ...(req.body || {}),
      sessionId: req.params?.sessionId || req.body?.sessionId || req.body?.importSessionId
    }, req.user || {});

    if (result.error) {
      return res.status(result.status || 400).json({
        ok: false,
        message: result.error,
        ...result
      });
    }

    return res.json({ ok: true, source: 'mongo-native-import-controller', ...result });
  } catch (err) {
    return res.status(500).json({ ok: false, message: 'Không ghi được dữ liệu import', error: process.env.NODE_ENV === 'production' ? undefined : err.message });
  }
}


async function sessionRows(req, res) {
  if (typeof res.set === 'function') res.set('Cache-Control', 'no-store');
  try {
    const result = await excelImportService.getSessionRows(
      String(req.params.sessionId || req.query.sessionId || '').trim(),
      {
        offset: Number(req.query.offset || 0),
        limit: Number(req.query.limit || 500)
      }
    );

    if (result.error) {
      return res.status(result.status || 400).json({
        ok: false,
        message: result.error,
        ...result
      });
    }

    return res.json({ ok: true, ...result });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: 'Không tải được danh sách dòng import',
      error: process.env.NODE_ENV === 'production' ? undefined : err.message
    });
  }
}

async function sessionStatus(req, res) {
  if (typeof res.set === 'function') res.set('Cache-Control', 'no-store');
  try {
    const result = await excelImportService.getSessionStatus(
      String(req.params.sessionId || req.query.sessionId || '').trim()
    );

    if (result.error) {
      return res.status(result.status || 400).json({
        ok: false,
        message: result.error,
        ...result
      });
    }

    return res.json({ ok: true, source: 'mongo-native-import-controller', ...result });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không lấy được trạng thái import', error: process.env.NODE_ENV === 'production' ? undefined : err.message });
  }
}

async function logs(req, res) {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 500);
    const logs = await excelImportService.logs();
    res.json({ ok: true, source: 'mongo-native-import-controller', logs: logs.slice(0, limit), importLogs: logs.slice(0, limit) });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không lấy được lịch sử import', error: process.env.NODE_ENV === 'production' ? undefined : err.message });
  }
}

module.exports = { preview, commit, logs, sessionStatus, sessionRows };
