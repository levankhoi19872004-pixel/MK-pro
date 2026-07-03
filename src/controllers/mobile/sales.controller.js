'use strict';

const { createMobileSalesService } = require('../../services/mobile/sales.service');
const { wrapMobile } = require('./_mobileResponse');

function createMobileSalesController(ctx) {
  const service = createMobileSalesService(ctx);

  async function renderOrderPrint(req, res) {
    try {
      const result = await service.renderSalesOrderPrintHtml({
        req,
        params: req.params || {},
        query: req.query || {},
        mobileUser: req.mobileUser
      });

      if (result && result.html) {
        res.setHeader('Content-Type', result.contentType || 'text/html; charset=utf-8');
        res.setHeader('Content-Disposition', `inline; filename="${result.filename || 'sales-order.html'}"`);
        return res.status(result.statusCode || 200).send(result.html);
      }

      const statusCode = result?.statusCode || result?.status || 400;
      return res.status(statusCode).json(result?.body || {
        ok: false,
        message: result?.message || 'Không in được đơn bán'
      });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        message: error?.message || 'Không in được đơn bán'
      });
    }
  }

  return {
    createOrder: wrapMobile(service, 'createSalesOrder', 500, 'Không tạo được đơn mobile'),
    getOrder: wrapMobile(service, 'getSalesOrder', 500, 'Không đọc được đơn mobile'),
    getOrderReturns: wrapMobile(service, 'getSalesOrderReturns', 500, 'Không tải được hàng trả mobile'),
    renderOrderPrint,
    updateOrder: wrapMobile(service, 'updateSalesOrder', 400, 'Không sửa được đơn mobile'),
    deleteOrder: wrapMobile(service, 'deleteSalesOrder', 400, 'Không xóa được đơn mobile'),
    listOrders: wrapMobile(service, 'listSalesOrders', 500, 'Không tải được đơn mobile'),
    listDebts: wrapMobile(service, 'listDebts', 500, 'Không tải được công nợ mobile')
  };
}

module.exports = { createMobileSalesController };
