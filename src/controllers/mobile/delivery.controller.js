'use strict';

const { createMobileDeliveryService } = require('../../services/mobile/delivery.service');
const { wrapMobile } = require('./_mobileResponse');

function createMobileDeliveryController(ctx) {
  const service = createMobileDeliveryService(ctx);
  return {
    listOrders: wrapMobile(service, 'listDeliveryOrders', 500, 'Không tải được đơn giao hàng mobile'),
    listReturns: wrapMobile(service, 'listDeliveryReturns', 500, 'Không tải được hàng trả mobile'),
    confirm: wrapMobile(service, 'confirmDelivery', 500, 'Không cập nhật được giao hàng mobile'),
    createReturn: wrapMobile(service, 'createReturnFromDelivery', 400, 'Không tạo được phiếu trả hàng từ app giao hàng'),
    submitPayment: wrapMobile(service, 'submitDeliveryPayment', 500, 'Không lưu được tiền thu app giao hàng'),
    submitCash: wrapMobile(service, 'submitCash', 500, 'Không ghi nhận được nộp quỹ mobile'),
    reconciliation: wrapMobile(service, 'deliveryReconciliation', 500, 'Không tải được đối soát giao hàng mobile'),
    startRouteSession: wrapMobile(service, 'startRouteSession', 500, 'Không bắt đầu được tuyến giao hàng'),
    pingRouteLocation: wrapMobile(service, 'pingRouteLocation', 500, 'Không ghi nhận được vị trí giao hàng'),
    stopRouteSession: wrapMobile(service, 'stopRouteSession', 500, 'Không kết thúc được tuyến giao hàng'),
    currentRouteSession: wrapMobile(service, 'currentRouteSession', 500, 'Không tải được phiên tuyến giao hàng')
  };
}

module.exports = { createMobileDeliveryController };
