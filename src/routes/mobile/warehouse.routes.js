'use strict';

const express = require('express');
const { body, query } = require('express-validator');
const { createMobileWarehouseController } = require('../../controllers/mobile/warehouse.controller');

function createMobileWarehouseRouter(ctx) {
  const router = express.Router();
  const controller = createMobileWarehouseController(ctx);
  const { requireMobileLogin, requireMobileRole, validateRequest } = ctx;
  const onlyWarehouse = [requireMobileLogin, requireMobileRole(['warehouse'])];

  router.get('/return-checks', ...onlyWarehouse, [
    query('date').optional().isISO8601().withMessage('Ngày kiểm hàng không hợp lệ'),
    query('deliveryStaffCode').optional().isString().trim(),
    query('status').optional().isString().trim()
  ], validateRequest, controller.listChecks);

  router.get('/return-checks/detail', ...onlyWarehouse, [
    query('date').optional().isISO8601().withMessage('Ngày kiểm hàng không hợp lệ'),
    query('deliveryStaffCode').isString().trim().notEmpty().withMessage('Thiếu NVGH cần kiểm')
  ], validateRequest, controller.detail);

  router.get('/return-checks/item-sources', ...onlyWarehouse, [
    query('date').optional().isISO8601().withMessage('Ngày kiểm hàng không hợp lệ'),
    query('deliveryStaffCode').isString().trim().notEmpty().withMessage('Thiếu NVGH cần kiểm'),
    query('productCode').isString().trim().notEmpty().withMessage('Thiếu sản phẩm cần xem nguồn')
  ], validateRequest, controller.itemSources);

  router.post('/return-checks/save', ...onlyWarehouse, [
    body('date').isISO8601().withMessage('Ngày kiểm hàng không hợp lệ'),
    body('deliveryStaffCode').isString().trim().notEmpty().withMessage('Thiếu NVGH cần kiểm'),
    body('items').isArray({ min: 1 }).withMessage('Danh sách hàng kiểm không hợp lệ'),
    body('items.*.productCode').isString().trim().notEmpty().withMessage('Thiếu mã sản phẩm'),
    body('items.*.receivedCaseQty').optional().isFloat({ min: 0 }).withMessage('Số thùng kho nhận không được âm'),
    body('items.*.receivedEachQty').optional().isFloat({ min: 0 }).withMessage('Số lẻ kho nhận không được âm'),
    body('items.*.note').optional().isString().trim(),
    body('note').optional().isString().trim()
  ], validateRequest, controller.save);

  router.post('/return-checks/confirm', ...onlyWarehouse, [
    body('date').isISO8601().withMessage('Ngày kiểm hàng không hợp lệ'),
    body('deliveryStaffCode').isString().trim().notEmpty().withMessage('Thiếu NVGH cần kiểm'),
    body('items').isArray({ min: 1 }).withMessage('Danh sách hàng kiểm không hợp lệ'),
    body('items.*.productCode').isString().trim().notEmpty().withMessage('Thiếu mã sản phẩm'),
    body('items.*.receivedCaseQty').optional().isFloat({ min: 0 }).withMessage('Số thùng kho nhận không được âm'),
    body('items.*.receivedEachQty').optional().isFloat({ min: 0 }).withMessage('Số lẻ kho nhận không được âm'),
    body('items.*.note').optional().isString().trim(),
    body('note').optional().isString().trim()
  ], validateRequest, controller.confirm);

  return router;
}

module.exports = { createMobileWarehouseRouter };
