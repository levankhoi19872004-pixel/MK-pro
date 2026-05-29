'use strict';

const { createMobileDeliveryService } = require('../../services/mobile/delivery.service');

function sendResult(res, result) {
  return res.status(result.statusCode || 200).json(result.body || result);
}

function createMobileDeliveryController(ctx) {
  const service = createMobileDeliveryService(ctx);

  return {
    async listOrders(req, res) {
      try {
        return res.json(await service.listDeliveryOrders({ query: req.query, mobileUser: req.mobileUser }));
      } catch (err) {
        return res.status(500).json({ ok: false, message: 'Không tải được đơn giao hàng mobile', error: err.message });
      }
    },
    async confirm(req, res) {
      try {
        return sendResult(res, await service.confirmDelivery({ body: req.body, mobileUser: req.mobileUser }));
      } catch (err) {
        return res.status(500).json({ ok: false, message: 'Không cập nhật được giao hàng mobile', error: err.message });
      }
    },
    async createReturn(req, res) {
      try {
        return sendResult(res, await service.createReturnFromDelivery({ body: req.body, mobileUser: req.mobileUser }));
      } catch (err) {
        return res.status(400).json({ ok: false, message: err.message || 'Không tạo được phiếu trả hàng từ app giao hàng' });
      }
    },
    async submitCash(req, res) {
      try {
        return sendResult(res, await service.submitCash({ body: req.body, mobileUser: req.mobileUser }));
      } catch (err) {
        return res.status(500).json({ ok: false, message: 'Không ghi nhận được nộp quỹ mobile', error: err.message });
      }
    }
  };
}

module.exports = { createMobileDeliveryController };
