'use strict';

const returnOrderService = require('../services/returnOrderService');
const SalesOrder = require('../models/SalesOrder');
const MasterOrder = require('../models/MasterOrder');
const ReturnOrder = require('../models/ReturnOrder');
const StockTransaction = require('../models/StockTransaction');
const ArLedger = require('../models/ArLedger');
const User = require('../models/User');
const { DeliveryEngine } = require('../engines/delivery.engine');

function createEngine() {
  return new DeliveryEngine({ SalesOrder, MasterOrder, ReturnOrder, StockTransaction, ArLedger, User });
}

async function list(req, res) {
  try {
    const returnOrders = await returnOrderService.listReturnOrders(req.query || {});
    res.json({ ok: true, source: 'mongo-route', returnOrders, returns: returnOrders });
  } catch (err) {
    const requestId = String(req.requestId || req.headers?.['x-request-id'] || `return-${Date.now()}`);
    console.error('[RETURN_ORDER_LIST_FAILED]', {
      requestId,
      message: err?.message || String(err),
      code: err?.code || err?.name || 'UNKNOWN',
      query: {
        q: String(req.query?.q || '').slice(0, 80),
        dateFrom: String(req.query?.dateFrom || ''),
        dateTo: String(req.query?.dateTo || ''),
        date: String(req.query?.date || ''),
        page: String(req.query?.page || ''),
        limit: String(req.query?.limit || '')
      }
    });
    res.status(500).json({
      ok: false,
      message: 'Không tải được phiếu trả hàng từ MongoDB',
      errorCode: 'RETURN_ORDER_LIST_FAILED',
      requestId,
      error: process.env.NODE_ENV === 'production' ? undefined : err.message
    });
  }
}

async function create(req, res) {
  try {
    // V46 canonical rule: POST /api/return-orders ghi qua DeliveryEngine.saveReturn()
    // để cùng nguồn với Đơn giao hôm nay và App giao hàng.
    const result = await createEngine().saveReturn(req.body || {});
    const rows = result.rows || result.returns || result.returnOrders || [];
    res.status(201).json({
      ok: true,
      source: 'delivery-engine-returnOrders',
      message: result.message || `Đã tạo/cập nhật phiếu trả hàng ${result.returnOrder?.code || ''}`.trim(),
      returnOrder: result.returnOrder,
      returns: rows,
      returnOrders: rows,
      rows,
      order: result.order
    });
  } catch (err) {
    res.status(err.status || 400).json({ ok: false, message: err.message || 'Không tạo được phiếu trả hàng' });
  }
}

async function getBySalesOrder(req, res) {
  try {
    const result = await returnOrderService.getReturnOrderBySalesOrderKey(req.params.salesOrderId, req.query || {});
    if (result.error) return res.status(result.status || 400).json({ ok: false, message: result.error });
    res.json({ ok: true, source: 'return-orders-by-sales-order', returnOrder: result.returnOrder });
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message || 'Không tải được phiếu trả theo đơn giao' });
  }
}

async function updateItemsBySalesOrder(req, res) {
  try {
    const result = await returnOrderService.updateReturnDraftItemsBySalesOrder(req.params.salesOrderId, req.body || {});
    if (result.error) return res.status(result.status || 400).json({ ok: false, message: result.error });
    res.json({ ok: true, source: 'return-orders-by-sales-order', message: 'Đã đồng bộ số lượng trả hàng', returnOrder: result.returnOrder });
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message || 'Không cập nhật được số lượng trả hàng' });
  }
}

async function stockIn(req, res) {
  try {
    const result = await returnOrderService.stockInReturnOrder(
      req.params.id || req.params.code,
      req.body || {},
      { user: req.user || {} }
    );

    if (result.error) {
      return res.status(result.status || 400).json({
        ok: false,
        success: false,
        message: result.error,
        code: result.code
      });
    }

    res.json({
      ok: true,
      success: true,
      message: result.message || (result.alreadyStockedIn ? 'Phiếu trả đã nhập kho.' : 'Đã nhập kho phiếu trả hàng'),
      data: result.returnOrder,
      returnOrder: result.returnOrder,
      stockTransactions: result.stockTransactions || []
    });
  } catch (err) {
    res.status(err.status || 500).json({
      ok: false,
      success: false,
      message: err.message || 'Không nhập kho được phiếu trả hàng',
      code: err.code,
      error: process.env.NODE_ENV === 'production' ? undefined : err.message
    });
  }
}

async function confirmAccounting(req, res) {
  try {
    const result = await returnOrderService.confirmAccountingReturnOrder(
      req.params.id || req.params.code,
      {
        ...req.body,
        confirmedBy: req.user?.code || req.user?.username || req.user?.name || 'system'
      }
    );

    if (result.error) {
      return res.status(result.status || 400).json({
        ok: false,
        success: false,
        message: result.error,
        code: result.code
      });
    }

    res.json({
      ok: true,
      success: true,
      message: 'Đã xác nhận kế toán phiếu trả hàng',
      data: result.returnOrder,
      returnOrder: result.returnOrder
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      success: false,
      message: 'Không xác nhận được kế toán phiếu trả hàng',
      error: process.env.NODE_ENV === 'production' ? undefined : err.message
    });
  }
}

async function cancel(req, res) {
  try {
    const result = await returnOrderService.cancelReturnOrderById(req.params.id, req.body || {});
    if (result.error) return res.status(result.status || 400).json({ ok: false, message: result.error });
    res.json({ ok: true, source: 'mongo-route', message: 'Đã hủy phiếu trả hàng', returnOrder: result.returnOrder });
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message || 'Không hủy được phiếu trả hàng' });
  }
}

async function updateItems(req, res) {
  try {
    const result = await returnOrderService.updateReturnDraftItems(req.params.id, req.body || {});
    if (result.error) return res.status(result.status || 400).json({ ok: false, message: result.error });
    res.json({ ok: true, source: 'mongo-route', message: 'Đã cập nhật số lượng trả hàng', returnOrder: result.returnOrder });
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message || 'Không cập nhật được số lượng trả hàng' });
  }
}

module.exports = { list, create, getBySalesOrder, updateItemsBySalesOrder, updateItems, stockIn, confirmAccounting, cancel };
