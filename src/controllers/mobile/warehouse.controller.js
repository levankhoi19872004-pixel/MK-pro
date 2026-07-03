'use strict';

const { createMobileWarehouseReturnCheckService } = require('../../services/mobile/warehouseReturnCheck.service');
const { wrapMobile } = require('./_mobileResponse');

function createMobileWarehouseController() {
  const service = createMobileWarehouseReturnCheckService();
  return {
    listChecks: wrapMobile(service, 'listChecks', 500, 'Không tải được danh sách kiểm hàng trả'),
    detail: wrapMobile(service, 'detail', 500, 'Không tải được chi tiết kiểm hàng trả'),
    save: wrapMobile(service, 'save', 400, 'Không lưu được kiểm hàng trả'),
    confirm: wrapMobile(service, 'confirm', 400, 'Không xác nhận được kiểm hàng trả'),
    itemSources: wrapMobile(service, 'itemSources', 500, 'Không tải được nguồn hàng trả')
  };
}

module.exports = { createMobileWarehouseController };
