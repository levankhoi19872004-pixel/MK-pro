'use strict';

const service = require('../services/adminCorrectionService');

function actor(req) {
  return req.user || req.mobileUser || {};
}

function ok(res, data, message = 'OK') {
  return res.json({ ok: true, success: true, message, data });
}

function fail(res, err) {
  const status = Number(err.status || err.statusCode || 500);
  return res.status(status >= 400 && status < 600 ? status : 500).json({
    ok: false,
    success: false,
    message: status >= 500 ? 'Lỗi hệ thống, vui lòng thử lại sau' : err.message,
    error: process.env.NODE_ENV === 'production' ? undefined : err.message
  });
}

async function standard(req, res) {
  try { return ok(res, service.getCorrectionStandard(), 'Quy chuẩn chỉnh sửa số liệu'); }
  catch (err) { return fail(res, err); }
}

async function list(req, res) {
  try { return ok(res, await service.listCorrections(req.query), 'Danh sách phiếu chỉnh sửa'); }
  catch (err) { return fail(res, err); }
}

async function detail(req, res) {
  try {
    const data = await service.getCorrection(req.params.id);
    if (!data) return res.status(404).json({ ok: false, success: false, message: 'Không tìm thấy phiếu chỉnh sửa' });
    return ok(res, data, 'Chi tiết phiếu chỉnh sửa');
  } catch (err) { return fail(res, err); }
}

async function create(req, res) {
  try { return ok(res, await service.createCorrectionRequest(req.body, actor(req)), 'Đã tạo phiếu chỉnh sửa', 201); }
  catch (err) { return fail(res, err); }
}

async function approve(req, res) {
  try { return ok(res, await service.approveCorrection(req.params.id, actor(req), req.body), 'Đã duyệt phiếu chỉnh sửa'); }
  catch (err) { return fail(res, err); }
}

async function reject(req, res) {
  try { return ok(res, await service.rejectCorrection(req.params.id, actor(req), req.body), 'Đã từ chối phiếu chỉnh sửa'); }
  catch (err) { return fail(res, err); }
}

async function apply(req, res) {
  try { return ok(res, await service.applyCorrectionRequest(req.params.id, actor(req), req.body), 'Đã áp dụng chỉnh sửa'); }
  catch (err) { return fail(res, err); }
}

async function rollback(req, res) {
  try { return ok(res, await service.rollbackCorrectionRequest(req.params.id, actor(req), req.body), 'Đã rollback chỉnh sửa'); }
  catch (err) { return fail(res, err); }
}

async function editContext(req, res) {
  try { return ok(res, await service.getEntityEditContext(req.params.entityType, req.params.id), 'Ngữ cảnh chỉnh sửa'); }
  catch (err) { return fail(res, err); }
}

async function validateChange(req, res) {
  try { return ok(res, await service.validateEntityChange(req.params.entityType, req.params.id, req.body?.proposedPatch || req.body?.patch || {}), 'Kết quả kiểm tra thay đổi'); }
  catch (err) { return fail(res, err); }
}

async function requestChange(req, res) {
  try { return ok(res, await service.requestEntityChange(req.params.entityType, req.params.id, req.body, actor(req)), 'Đã tạo yêu cầu chỉnh sửa'); }
  catch (err) { return fail(res, err); }
}

async function auditLogs(req, res) {
  try { return ok(res, await service.listAuditLogs(req.query), 'Lịch sử thay đổi'); }
  catch (err) { return fail(res, err); }
}

async function entityAuditLogs(req, res) {
  try { return ok(res, await service.listAuditLogs({ ...req.query, entityType: req.params.entityType, entityId: req.params.id }), 'Lịch sử thay đổi dữ liệu'); }
  catch (err) { return fail(res, err); }
}

module.exports = {
  standard,
  list,
  detail,
  create,
  approve,
  reject,
  apply,
  rollback,
  editContext,
  validateChange,
  requestChange,
  auditLogs,
  entityAuditLogs
};
