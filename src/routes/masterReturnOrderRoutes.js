'use strict';

const express = require('express');
const masterReturnOrderController = require('../controllers/masterReturnOrderController');
const { requireRole } = require('../middlewares/auth.middleware');
const { retiredRoute } = require('../middlewares/retiredRoute.middleware');

const router = express.Router();
const manageMasterReturns = requireRole(['admin', 'manager', 'accountant', 'warehouse']);
const viewMasterReturns = manageMasterReturns;

router.get('/unmerged-return-orders', viewMasterReturns, masterReturnOrderController.listUnmerged);
router.get('/', viewMasterReturns, masterReturnOrderController.list);
router.get('/:id', viewMasterReturns, masterReturnOrderController.get);

// Phase219: Đơn tổng trả hàng không còn là luồng nghiệp vụ chuẩn.
// Giữ GET read-only compatibility để không phá lịch sử/print/read-only audit,
// nhưng chặn mọi write/receive/cancel để không có đường nhập kho/gộp trả hàng thứ hai
// ngoài canonical returnOrders -> kế toán nhập kho từng đơn trả.
const retiredMasterReturnWrite = retiredRoute('legacy-master-return-orders-write-flow', {
  replacement: '/api/return-orders',
  message: 'Đơn tổng trả hàng đã retired. Luồng chuẩn: returnOrders và kế toán nhập kho từng đơn trả.'
});
const retiredMasterReturnStockIn = retiredRoute('legacy-master-return-orders-receive-flow', {
  replacement: '/api/return-orders/:id/stock-in',
  message: 'Nhập kho qua đơn tổng trả hàng đã retired. Luồng chuẩn: kế toán bấm Nhập kho trên từng đơn trả.'
});

router.post('/', manageMasterReturns, retiredMasterReturnWrite);
router.put('/:id', manageMasterReturns, retiredMasterReturnWrite);
router.patch('/:id', manageMasterReturns, retiredMasterReturnWrite);
router.post('/:id/receive', manageMasterReturns, retiredMasterReturnStockIn);
router.post('/:id/cancel', manageMasterReturns, retiredMasterReturnWrite);

module.exports = router;
