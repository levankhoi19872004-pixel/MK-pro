'use strict';

const { createMobileDeliveryService } = require('../../services/mobile/delivery.service');
const { wrapMobile } = require('./_mobileResponse');

function createMobileDeliveryController(ctx) {
  const service = createMobileDeliveryService(ctx);
  return {
    listOrders: wrapMobile(service, 'listDeliveryOrders', 500, 'Không tải được đơn giao hàng mobile'),
    confirm: wrapMobile(service, 'confirmDelivery', 500, 'Không cập nhật được giao hàng mobile'),
    createReturn: wrapMobile(service, 'createReturnFromDelivery', 400, 'Không tạo được phiếu trả hàng từ app giao hàng'),
    submitPayment: wrapMobile(service, 'submitDeliveryPayment', 500, 'Không lưu được tiền thu app giao hàng'),
    submitCash: wrapMobile(service, 'submitCash', 500, 'Không ghi nhận được nộp quỹ mobile')
  };
}

module.exports = { createMobileDeliveryController };
