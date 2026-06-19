'use strict';

const { createMobileService } = require('../services/mobileService');

function send(res, result) {
  const status = result.statusCode || result.status || 200;
  const body = result.body || result;
  return res.status(status).json(body);
}

function createMobileController(ctx) {
  const service = createMobileService(ctx);
  const wrap = (method, fallbackStatus = 500, fallbackMessage = 'Lỗi mobile API') => async (req, res) => {
    try {
      return send(res, await service[method]({ req, body: req.body || {}, query: req.query || {}, params: req.params || {}, mobileUser: req.mobileUser }));
    } catch (err) {
      return res.status(err.statusCode || err.status || fallbackStatus).json({ ok: false, success: false, message: err.message || fallbackMessage, error: process.env.NODE_ENV === 'production' ? undefined : err.message });
    }
  };

  return {
    login: wrap('login', 500, 'Không đăng nhập được mobile app'),
    refresh: wrap('refresh', 500, 'Không làm mới được phiên đăng nhập'),
    me: wrap('me'),
    roles: wrap('roles', 500, 'Không tải được vai trò mobile'),
    customers: wrap('customers', 500, 'Không tải được khách hàng mobile'),
    products: wrap('products', 500, 'Không tải được sản phẩm mobile'),
    stock: wrap('stock', 500, 'Không tải được tồn kho mobile'),
    createSalesOrder: wrap('createSalesOrder', 500, 'Không tạo được đơn mobile'),
    getSalesOrder: wrap('getSalesOrder', 500, 'Không đọc được đơn mobile'),
    updateSalesOrder: wrap('updateSalesOrder', 400, 'Không sửa được đơn mobile'),
    listSalesOrders: wrap('listSalesOrders', 500, 'Không tải được đơn mobile')
  };
}

module.exports = { createMobileController };
