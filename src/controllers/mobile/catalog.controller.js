'use strict';

const { createMobileCatalogService } = require('../../services/mobile/catalog.service');
const { wrapMobile } = require('./_mobileResponse');

function createMobileCatalogController(ctx) {
  const service = createMobileCatalogService(ctx);
  return {
    customers: wrapMobile(service, 'customers', 500, 'Không tải được khách hàng mobile'),
    products: wrapMobile(service, 'products', 500, 'Không tải được sản phẩm mobile'),
    stock: wrapMobile(service, 'stock', 500, 'Không tải được tồn kho mobile')
  };
}

module.exports = { createMobileCatalogController };
