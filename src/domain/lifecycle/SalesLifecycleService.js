'use strict';

const InventoryPostingService = require('../posting/InventoryPostingService');
const ArPostingService = require('../posting/ArPostingService');

function getOrderService() {
  // Lazy require để tránh tạo vòng phụ thuộc khi các route/service mới dần chuyển sang lifecycle boundary.
  return require('../../services/orderService');
}

function getMasterOrderService() {
  // confirmDelivery hiện vẫn do master-order legacy/facade xử lý; giữ lazy require để giảm rủi ro startup.
  return require('../../services/masterOrderService');
}

function unwrapOrder(result = {}) {
  return (result && (result.order || result.salesOrder)) || result || null;
}

function isStockPosted(order = {}) {
  const stockStatus = String(order.stockStatus || order.inventoryStatus || '').toLowerCase();
  return Boolean(order.stockPosted) || ['posted', 'confirmed', 'locked'].includes(stockStatus);
}

function isArPosted(order = {}) {
  const postedStatus = ['confirmed', 'locked', 'posted'];
  return Boolean(order.arPosted || order.accountingConfirmed)
    || postedStatus.includes(String(order.accountingStatus || '').toLowerCase())
    || postedStatus.includes(String(order.arStatus || '').toLowerCase());
}

async function createOrder(body = {}, options = {}) {
  const result = await getOrderService().createOrder(body, options);
  if (result && result.error) return result;

  const order = unwrapOrder(result);
  // orderService.createOrder() hiện đã trừ tồn và set stockPosted=true.
  // Guard này chỉ bảo vệ các route mới sau này nếu tạo order chưa post tồn qua service cũ.
  if (order && !isStockPosted(order)) {
    await InventoryPostingService.postSaleOut(order, options);
  }

  return result;
}

async function updateOrder(idOrCode, body = {}, options = {}) {
  return getOrderService().updateOrder(idOrCode, body, options);
}

async function cancelOrder(idOrCode, body = {}, options = {}) {
  const result = await getOrderService().cancelOrder(idOrCode, body, options);
  if (result && result.error) return result;

  // Không đảo tồn/AR thêm ở đây: orderService.cancelOrder() hiện đã gọi
  // reverseSalesOrderPosting() và reverseSalesOrderArIfPosted() trong cùng transaction.
  // Nếu chuyển rollback ra lifecycle ở phase sau, cần migrate orderService trước rồi mới bật nhánh này.
  return result;
}

async function reverseCancelledOrderIfNeeded(order = {}, options = {}) {
  // Extension point cho phase sau, không được gọi mặc định để tránh double reverse.
  const reversed = [];
  if (order && isStockPosted(order)) {
    reversed.push(await InventoryPostingService.reverseMovement(order, {
      type: 'SALE',
      reverseType: 'SALE_REVERSAL',
      direction: 'OUT',
      refType: 'SALES_ORDER',
      refId: order.id || order.code,
      refCode: order.code || order.id,
      note: 'Đảo xuất kho do hủy đơn bán'
    }, options));
  }
  if (order && isArPosted(order)) {
    reversed.push(await ArPostingService.reverseSale(order, options));
  }
  return reversed.filter(Boolean);
}

async function confirmDelivery(orderOrId = {}, body = {}, options = {}) {
  if (typeof orderOrId === 'string' || typeof orderOrId === 'number') {
    return getMasterOrderService().updateDeliveryTodayOrder(orderOrId, {
      ...body,
      deliveryStatus: body.deliveryStatus || 'delivered',
      status: body.status || 'delivered'
    }, options);
  }

  return {
    ...orderOrId,
    ...body,
    deliveryStatus: body.deliveryStatus || orderOrId.deliveryStatus || 'delivered',
    status: body.status || orderOrId.status || 'delivered'
  };
}

module.exports = {
  createOrder,
  updateOrder,
  cancelOrder,
  confirmDelivery,
  reverseCancelledOrderIfNeeded
};
