'use strict';

const { createMobileSalesService } = require('../../services/mobile/sales.service');
const { wrapMobile } = require('./_mobileResponse');

function createMobileSalesController(ctx) {
  const service = createMobileSalesService(ctx);
  return {
    createOrder: wrapMobile(service, 'createSalesOrder', 500, 'Không tạo được đơn mobile'),
    getOrder: wrapMobile(service, 'getSalesOrder', 500, 'Không đọc được đơn mobile'),
    updateOrder: wrapMobile(service, 'updateSalesOrder', 400, 'Không sửa được đơn mobile'),
    listOrders: wrapMobile(service, 'listSalesOrders', 500, 'Không tải được đơn mobile')
  };
}

module.exports = { createMobileSalesController };
