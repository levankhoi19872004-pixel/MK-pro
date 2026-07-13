'use strict';

const excelImportService = require('../services/excelImportService');
const ImportWebDirectCommitService = require('../services/import/ImportWebDirectCommitService');
const ImportWebDetachedCommitService = require('../services/import/ImportWebDetachedCommitService');
const importShortageReviewService = require('../services/import/ImportShortageReviewService');
const { createCommandTelemetry } = require('../utils/commandTelemetry');


function shouldRunWebDetachedImportCommit(req = {}) {
  const body = req.body || {};
  const type = String(body.type || '').trim();
  return type === 'promotionProductRules';
}

function normalizeRequestArray(value) {
  if (Array.isArray(value)) return value.map((item) => String(item ?? '').trim()).filter(Boolean);
  return String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildShortageReviewSelection(source = {}) {
  return {
    selectedOrderCodes: normalizeRequestArray(source.selectedOrderCodes),
    selectedRowNumbers: normalizeRequestArray(source.selectedRowNumbers)
      .map((item) => Number(item))
      .filter((item) => Number.isFinite(item) && item > 0),
    selectedProgramCodes: normalizeRequestArray(source.selectedProgramCodes),
    selectedRowKeys: normalizeRequestArray(source.selectedRowKeys)
  };
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
  const telemetry = createCommandTelemetry('import.runtime.commit');
  try {
    if (shouldRunWebDetachedImportCommit(req)) {
      const submitted = await ImportWebDetachedCommitService.submit({
        ...(req.body || {}),
        sessionId: req.params?.sessionId || req.body?.sessionId || req.body?.importSessionId
      }, req.user || {});
      if (submitted.error) {
        telemetry.mark('submitDetachedFailed');
        return res.status(submitted.status || 400).json({ ok: false, message: submitted.error, ...submitted, performance: telemetry.finish() });
      }
      telemetry.mark('submitDetached');
      return res.status(submitted.accepted ? 202 : 200).json({ ok: true, ...submitted, performance: telemetry.finish() });
    }

    const result = await ImportWebDirectCommitService.commitSession({
      ...(req.body || {}),
      sessionId: req.params?.sessionId || req.body?.sessionId || req.body?.importSessionId
    }, req.user || {});

    if (result.error) {
      telemetry.mark('commitFailed');
      return res.status(result.status || 400).json({
        ok: false,
        message: result.error,
        ...result,
        performance: telemetry.finish()
      });
    }

    telemetry.mark('commitSession');
    return res.json({ ok: true, source: 'mongo-native-import-controller', ...result, performance: telemetry.finish() });
  } catch (err) {
    telemetry.mark('exception');
    return res.status(500).json({ ok: false, message: 'Không ghi được dữ liệu import', performance: telemetry.finish(), error: process.env.NODE_ENV === 'production' ? undefined : err.message });
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

async function shortageReview(req, res) {
  if (typeof res.set === 'function') res.set('Cache-Control', 'no-store');
  try {
    const result = await importShortageReviewService.getReview(
      String(req.params.sessionId || req.query.sessionId || '').trim(),
      buildShortageReviewSelection(req.query || {}),
      { userName: req.user?.username || req.user?.fullName || '' }
    );
    if (result.error) return res.status(result.status || 400).json({ ok: false, message: result.error, ...result });
    return res.json({ ok: true, ...result });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: 'Không tải được review đơn thiếu hàng',
      error: process.env.NODE_ENV === 'production' ? undefined : err.message
    });
  }
}

async function confirmShortageReview(req, res) {
  try {
    const result = await importShortageReviewService.confirmReview(
      String(req.params.sessionId || req.body?.sessionId || req.body?.importSessionId || '').trim(),
      {
        ...(req.body || {}),
        ...buildShortageReviewSelection(req.body || {})
      },
      req.user || {}
    );
    if (result.error) return res.status(result.status || 400).json({ ok: false, message: result.error, ...result });
    return res.json({ ok: true, ...result });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: 'Không xác nhận được review đơn thiếu hàng',
      error: process.env.NODE_ENV === 'production' ? undefined : err.message
    });
  }
}

async function sessionStatus(req, res) {
  const telemetry = createCommandTelemetry('import.runtime.sessionStatus');
  if (typeof res.set === 'function') res.set('Cache-Control', 'no-store');
  try {
    const result = await excelImportService.getSessionStatus(
      String(req.params.sessionId || req.query.sessionId || '').trim()
    );

    if (result.error) {
      telemetry.mark('commitFailed');
      return res.status(result.status || 400).json({
        ok: false,
        message: result.error,
        ...result,
        performance: telemetry.finish()
      });
    }

    telemetry.mark('commitSession');
    return res.json({ ok: true, source: 'mongo-native-import-controller', ...result, performance: telemetry.finish() });
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

module.exports = { preview, commit, logs, sessionStatus, sessionRows, shortageReview, confirmShortageReview };
