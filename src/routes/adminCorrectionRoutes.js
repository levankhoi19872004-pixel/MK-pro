'use strict';

const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const controller = require('../controllers/adminCorrectionController');
const { requireRole } = require('../middlewares/auth.middleware');
const { requireCorrectionReason } = require('../middlewares/adminCorrectionReason.middleware');

const router = express.Router();

function validateRequest(req, res, next) {
  const errors = validationResult(req);
  if (errors.isEmpty()) return next();
  return res.status(400).json({
    ok: false,
    success: false,
    message: errors.array()[0]?.msg || 'Dữ liệu không hợp lệ',
    errors: errors.array()
  });
}

const viewRoles = ['admin', 'manager', 'accountant', 'warehouse'];
const editRoles = ['admin', 'accountant'];
const approveRoles = ['admin', 'accountant'];
const rollbackRoles = ['admin'];

router.get('/data-correction/standard', requireRole(viewRoles), controller.standard);

router.get('/corrections', requireRole(viewRoles), [
  query('status').optional().isString().trim().isLength({ max: 40 }),
  query('entityType').optional().isString().trim().isLength({ max: 80 }),
  query('riskLevel').optional().isString().trim().isLength({ max: 20 }),
  query('entityCode').optional().isString().trim().isLength({ max: 160 }),
  query('limit').optional().isInt({ min: 1, max: 500 })
], validateRequest, controller.list);

router.get('/corrections/:id', requireRole(viewRoles), [
  param('id').isString().trim().notEmpty().isLength({ max: 180 })
], validateRequest, controller.detail);

router.post('/corrections', requireRole(editRoles), [
  body('entityType').isString().trim().notEmpty().withMessage('Thiếu loại dữ liệu cần sửa'),
  body('entityId').optional().isString().trim().isLength({ max: 180 }),
  body('entityCode').optional().isString().trim().isLength({ max: 180 }),
  body('correctionType').optional().isString().trim().isLength({ max: 80 }),
  body('proposedPatch').isObject().withMessage('proposedPatch phải là object'),
  body('reason').isString().trim().isLength({ min: 3, max: 1000 }).withMessage('Cần nhập lý do chỉnh sửa')
], validateRequest, requireCorrectionReason, controller.create);

router.post('/corrections/:id/approve', requireRole(approveRoles), [
  param('id').isString().trim().notEmpty().isLength({ max: 180 }),
  body('note').optional().isString().trim().isLength({ max: 1000 })
], validateRequest, controller.approve);

router.post('/corrections/:id/reject', requireRole(approveRoles), [
  param('id').isString().trim().notEmpty().isLength({ max: 180 }),
  body('reason').isString().trim().isLength({ min: 3, max: 1000 }).withMessage('Cần nhập lý do từ chối')
], validateRequest, requireCorrectionReason, controller.reject);

router.post('/corrections/:id/apply', requireRole(approveRoles), [
  param('id').isString().trim().notEmpty().isLength({ max: 180 })
], validateRequest, controller.apply);

router.post('/corrections/:id/rollback', requireRole(rollbackRoles), [
  param('id').isString().trim().notEmpty().isLength({ max: 180 }),
  body('reason').isString().trim().isLength({ min: 3, max: 1000 }).withMessage('Cần nhập lý do rollback')
], validateRequest, requireCorrectionReason, controller.rollback);

router.get('/entities/:entityType/:id/edit-context', requireRole(viewRoles), [
  param('entityType').isString().trim().notEmpty().isLength({ max: 80 }),
  param('id').isString().trim().notEmpty().isLength({ max: 180 })
], validateRequest, controller.editContext);

router.post('/entities/:entityType/:id/validate-change', requireRole(editRoles), [
  param('entityType').isString().trim().notEmpty().isLength({ max: 80 }),
  param('id').isString().trim().notEmpty().isLength({ max: 180 }),
  body('proposedPatch').optional().isObject().withMessage('proposedPatch phải là object'),
  body('patch').optional().isObject().withMessage('patch phải là object')
], validateRequest, controller.validateChange);

router.post('/entities/:entityType/:id/request-change', requireRole(editRoles), [
  param('entityType').isString().trim().notEmpty().isLength({ max: 80 }),
  param('id').isString().trim().notEmpty().isLength({ max: 180 }),
  body('proposedPatch').optional().isObject().withMessage('proposedPatch phải là object'),
  body('patch').optional().isObject().withMessage('patch phải là object'),
  body('reason').isString().trim().isLength({ min: 3, max: 1000 }).withMessage('Cần nhập lý do chỉnh sửa')
], validateRequest, requireCorrectionReason, controller.requestChange);

router.get('/audit-logs', requireRole(viewRoles), [
  query('entityType').optional().isString().trim().isLength({ max: 80 }),
  query('entityId').optional().isString().trim().isLength({ max: 180 }),
  query('entityCode').optional().isString().trim().isLength({ max: 180 }),
  query('action').optional().isString().trim().isLength({ max: 120 }),
  query('limit').optional().isInt({ min: 1, max: 500 })
], validateRequest, controller.auditLogs);

router.get('/audit-logs/:entityType/:id', requireRole(viewRoles), [
  param('entityType').isString().trim().notEmpty().isLength({ max: 80 }),
  param('id').isString().trim().notEmpty().isLength({ max: 180 })
], validateRequest, controller.entityAuditLogs);

module.exports = router;
