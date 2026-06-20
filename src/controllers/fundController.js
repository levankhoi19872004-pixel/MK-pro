'use strict';

const fundService = require('../services/fundService');
const fundSummaryService = require('../services/fundSummary.service');
const DeliverySettlementService = require('../domain/settlement/DeliverySettlementService');

function sendResult(res, result, successMessage = 'OK', statusCode = 200) {
  if (result?.error) return res.status(result.status || 400).json({ ok: false, success: false, message: result.error, ...result });
  return res.status(statusCode).json({ ok: true, success: true, message: result?.message || successMessage, ...result });
}

async function listLedger(req, res) {
  try { sendResult(res, await fundService.listFundLedgers(req.query || {}), 'Đã tải sổ quỹ'); }
  catch (err) { res.status(500).json({ ok: false, success: false, message: 'Không tải được sổ quỹ fundLedgers', error: process.env.NODE_ENV === 'production' ? undefined : err.message }); }
}

async function listDeliverySubmissions(req, res) {
  try { sendResult(res, await fundService.listDeliveryCashSubmissions(req.query || {}), 'Đã tải phiếu nộp quỹ giao hàng'); }
  catch (err) { res.status(500).json({ ok: false, success: false, message: 'Không tải được phiếu nộp quỹ giao hàng', error: process.env.NODE_ENV === 'production' ? undefined : err.message }); }
}


async function deliveryCashInTransit(req, res) {
  try {
    sendResult(
      res,
      await DeliverySettlementService.cashInTransitReport(req.query || {}),
      'Đã tải báo cáo tiền NVGH còn phải nộp'
    );
  } catch (err) {
    res.status(500).json({
      ok: false,
      success: false,
      message: 'Không tải được báo cáo tiền NVGH còn phải nộp',
      error: process.env.NODE_ENV === 'production' ? undefined : err.message
    });
  }
}


async function listExpenses(req, res) {
  try { sendResult(res, await fundService.listExpenseVouchers(req.query || {}), 'Đã tải phiếu chi'); }
  catch (err) { res.status(500).json({ ok: false, success: false, message: 'Không tải được phiếu chi', error: process.env.NODE_ENV === 'production' ? undefined : err.message }); }
}

async function listTransfers(req, res) {
  try { sendResult(res, await fundService.listFundTransfers(req.query || {}), 'Đã tải phiếu chuyển quỹ'); }
  catch (err) { res.status(500).json({ ok: false, success: false, message: 'Không tải được phiếu chuyển quỹ', error: process.env.NODE_ENV === 'production' ? undefined : err.message }); }
}

async function previewDeliverySubmission(req, res) {
  try { sendResult(res, await fundService.buildDeliverySubmissionDraft({ ...(req.query || {}), ...(req.body || {}) }), 'Đã lập nháp phiếu nộp quỹ'); }
  catch (err) { res.status(500).json({ ok: false, success: false, message: 'Không lập được nháp nộp quỹ', error: process.env.NODE_ENV === 'production' ? undefined : err.message }); }
}

async function createDeliverySubmission(req, res) {
  try { sendResult(res, await fundService.createDeliveryCashSubmission(req.body || {}), 'Đã tạo phiếu nộp quỹ giao hàng', 201); }
  catch (err) { res.status(400).json({ ok: false, success: false, message: err.message || 'Không tạo được phiếu nộp quỹ' }); }
}

async function updateDeliverySubmission(req, res) {
  try { sendResult(res, await fundService.updateDeliveryCashSubmission(req.params.id, req.body || {}), 'Đã cập nhật phiếu nộp quỹ'); }
  catch (err) { res.status(400).json({ ok: false, success: false, message: err.message || 'Không cập nhật được phiếu nộp quỹ' }); }
}

function actorCode(req) {
  return String(
    req.user?.staffCode || req.user?.code || req.user?.username || req.user?.name || req.user?.fullName || ''
  ).trim();
}

function summaryContext(req) {
  return { tenantId: req.tenantId, actor: req.user || {} };
}

function sendSummaryError(res, error, fallbackMessage) {
  const status = Number(error?.status || 500);
  return res.status(status).json({
    ok: false,
    success: false,
    code: error?.code || (status >= 500 ? 'FUND_SUMMARY_ERROR' : 'INVALID_REQUEST'),
    message: status >= 500 ? fallbackMessage : (error?.message || fallbackMessage),
    error: process.env.NODE_ENV === 'production' || status < 500 ? undefined : error?.message
  });
}

async function getSummary(req, res) {
  try {
    return res.json(await fundSummaryService.getFundSummary(req.query || {}, summaryContext(req)));
  } catch (error) {
    return sendSummaryError(res, error, 'Không tải được Sổ quỹ tổng hợp');
  }
}

async function getSummaryTransactions(req, res) {
  try {
    return res.json(await fundSummaryService.getFundSummaryTransactions(
      req.params.personKey,
      req.query || {},
      summaryContext(req)
    ));
  } catch (error) {
    return sendSummaryError(res, error, 'Không tải được chi tiết Sổ quỹ tổng hợp');
  }
}

async function exportSummary(req, res) {
  try {
    const result = await fundSummaryService.exportFundSummary(req.query || {}, summaryContext(req));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(result.fileName)}`);
    return res.send(result.buffer);
  } catch (error) {
    return sendSummaryError(res, error, 'Không xuất được Excel Sổ quỹ tổng hợp');
  }
}

async function confirmDeliverySubmission(req, res) {
  try {
    sendResult(
      res,
      await fundService.confirmDeliveryCashSubmission(req.params.id, { ...(req.body || {}), confirmedBy: actorCode(req) }),
      'Đã xác nhận phiếu nộp quỹ'
    );
  } catch (err) {
    res.status(err.status || 400).json({ ok: false, success: false, message: err.message || 'Không xác nhận được phiếu nộp quỹ' });
  }
}

async function classifyDeliveryShortages(req, res) {
  try {
    sendResult(
      res,
      await fundService.classifyConfirmedDeliveryShortages(req.params.id, { ...(req.body || {}), classifiedBy: actorCode(req) }),
      'Đã phân loại khoản thiếu'
    );
  } catch (err) {
    res.status(err.status || 400).json({ ok: false, success: false, message: err.message || 'Không phân loại được khoản thiếu' });
  }
}

async function getDeliveryShortageHistory(req, res) {
  try {
    sendResult(res, await fundService.getDeliveryCashShortageHistory(req.params.id), 'Đã tải lịch sử khoản thiếu');
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, success: false, message: err.message || 'Không tải được lịch sử khoản thiếu' });
  }
}

async function createDeliveryShortageRepayment(req, res) {
  try {
    sendResult(
      res,
      await fundService.createDeliveryShortageRepayment(req.params.id, { ...(req.body || {}), createdBy: actorCode(req) }),
      'Đã tạo phiếu nộp bù',
      201
    );
  } catch (err) {
    res.status(err.status || 400).json({ ok: false, success: false, message: err.message || 'Không tạo được phiếu nộp bù' });
  }
}

async function confirmDeliveryShortageRepayment(req, res) {
  try {
    sendResult(
      res,
      await fundService.confirmDeliveryShortageRepayment(req.params.id, { ...(req.body || {}), confirmedBy: actorCode(req) }),
      'Đã xác nhận phiếu nộp bù'
    );
  } catch (err) {
    res.status(err.status || 400).json({ ok: false, success: false, message: err.message || 'Không xác nhận được phiếu nộp bù' });
  }
}

async function createExpense(req, res) {
  try { sendResult(res, await fundService.createExpenseVoucher(req.body || {}), 'Đã tạo phiếu chi', 201); }
  catch (err) { res.status(400).json({ ok: false, success: false, message: err.message || 'Không tạo được phiếu chi' }); }
}

async function updateExpense(req, res) {
  try { sendResult(res, await fundService.updateExpenseVoucher(req.params.id, req.body || {}), 'Đã cập nhật phiếu chi'); }
  catch (err) { res.status(400).json({ ok: false, success: false, message: err.message || 'Không cập nhật được phiếu chi' }); }
}

async function confirmExpense(req, res) {
  try { sendResult(res, await fundService.confirmExpenseVoucher(req.params.id, req.body || {}), 'Đã xác nhận phiếu chi'); }
  catch (err) { res.status(400).json({ ok: false, success: false, message: err.message || 'Không xác nhận được phiếu chi' }); }
}

async function createTransfer(req, res) {
  try { sendResult(res, await fundService.createFundTransfer(req.body || {}), 'Đã tạo phiếu chuyển quỹ', 201); }
  catch (err) { res.status(400).json({ ok: false, success: false, message: err.message || 'Không tạo được phiếu chuyển quỹ' }); }
}

async function updateTransfer(req, res) {
  try { sendResult(res, await fundService.updateFundTransfer(req.params.id, req.body || {}), 'Đã cập nhật phiếu chuyển quỹ'); }
  catch (err) { res.status(400).json({ ok: false, success: false, message: err.message || 'Không cập nhật được phiếu chuyển quỹ' }); }
}

async function confirmTransfer(req, res) {
  try { sendResult(res, await fundService.confirmFundTransfer(req.params.id, req.body || {}), 'Đã xác nhận phiếu chuyển quỹ'); }
  catch (err) { res.status(400).json({ ok: false, success: false, message: err.message || 'Không xác nhận được phiếu chuyển quỹ' }); }
}

module.exports = { listLedger, getSummary, getSummaryTransactions, exportSummary, listDeliverySubmissions, deliveryCashInTransit, listExpenses, listTransfers, previewDeliverySubmission, createDeliverySubmission, updateDeliverySubmission, confirmDeliverySubmission, classifyDeliveryShortages, getDeliveryShortageHistory, createDeliveryShortageRepayment, confirmDeliveryShortageRepayment, createExpense, updateExpense, confirmExpense, createTransfer, updateTransfer, confirmTransfer };
