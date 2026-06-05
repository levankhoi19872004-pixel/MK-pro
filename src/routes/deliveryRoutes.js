'use strict';

const express = require('express');
const SalesOrder = require('../models/SalesOrder');
const MasterOrder = require('../models/MasterOrder');
const ReturnOrder = require('../models/ReturnOrder');
const { toNumber, makeId } = require('../utils/common.util');
const deliveryFinance = require('../utils/deliveryFinance.util');
const dateUtil = require('../utils/date.util');

const router = express.Router();

function text(value) { return String(value == null ? '' : value).trim(); }
function lower(value) { return text(value).toLowerCase(); }
function unique(values = []) { return [...new Set(values.map(text).filter(Boolean))]; }
function num(value) { const n = Number(value || 0); return Number.isFinite(n) ? n : 0; }
function today() { return dateUtil.todayVN ? dateUtil.todayVN() : new Date().toISOString().slice(0, 10); }

function orderIdOf(order = {}) { return text(order.id || order.orderId || order.salesOrderId || order._id); }
function orderCodeOf(order = {}) { return text(order.code || order.orderCode || order.salesOrderCode || order.displayOrderCode || order.id || order._id); }
function productCodeOf(item = {}) { return text(item.productCode || item.code || item.productId || item.sku || item.id || item._id); }
function productNameOf(item = {}) { return text(item.productName || item.name || item.product || ''); }
function qtyOf(item = {}) { return toNumber(item.deliveredQty ?? item.soldQty ?? item.quantitySold ?? item.orderQty ?? item.totalQty ?? item.qtySold ?? item.quantity ?? item.qty ?? 0); }
function returnQtyOf(item = {}) { return toNumber(item.returnQty ?? item.qtyReturn ?? item.returnQuantity ?? item.returnedQty ?? item.quantityReturn ?? 0); }
function priceOf(item = {}) { return toNumber(item.price ?? item.salePrice ?? item.unitPrice ?? item.finalPrice ?? item.giaBan ?? 0); }

function activeReturnFilter() {
  return { status: { $nin: ['cancelled', 'canceled', 'void', 'deleted'] } };
}

function returnMatchesOrder(ret = {}, order = {}) {
  const ids = unique([orderIdOf(order), order.salesOrderId, order.orderId]);
  const codes = unique([orderCodeOf(order), order.salesOrderCode, order.orderCode, order.code]);
  const retIds = unique([ret.salesOrderId, ret.orderId, ret.sourceOrderId, ret.deliveryOrderId]);
  const retCodes = unique([ret.salesOrderCode, ret.orderCode, ret.sourceOrderCode, ret.deliveryOrderCode, ret.code && String(ret.code).replace(/^RO[-_]?/i, '')]);
  return ids.some((id) => retIds.includes(id)) || codes.some((code) => retCodes.includes(code));
}

function normalizeReturnItemsFromOrders(returnOrders = []) {
  const byCode = new Map();
  for (const ret of returnOrders || []) {
    const status = lower(ret.status);
    if (['cancelled', 'canceled', 'void', 'deleted'].includes(status)) continue;
    for (const raw of Array.isArray(ret.items) ? ret.items : []) {
      const productCode = productCodeOf(raw);
      if (!productCode) continue;
      const prev = byCode.get(productCode) || {
        productCode,
        code: productCode,
        productName: productNameOf(raw),
        name: productNameOf(raw),
        returnQty: 0,
        qtyReturn: 0,
        returnQuantity: 0,
        returnedQty: 0,
        price: priceOf(raw),
        salePrice: priceOf(raw),
        unitPrice: priceOf(raw),
        returnAmount: 0,
        amount: 0
      };
      const qty = returnQtyOf(raw) || qtyOf(raw);
      const price = priceOf(raw) || prev.price || 0;
      prev.productName = prev.productName || productNameOf(raw);
      prev.name = prev.productName;
      prev.returnQty += qty;
      prev.qtyReturn = prev.returnQty;
      prev.returnQuantity = prev.returnQty;
      prev.returnedQty = prev.returnQty;
      prev.price = price;
      prev.salePrice = price;
      prev.unitPrice = price;
      prev.returnAmount = Math.round(prev.returnQty * price);
      prev.amount = prev.returnAmount;
      byCode.set(productCode, prev);
    }
  }
  return Array.from(byCode.values());
}

function buildCanonicalOrder(order = {}, relatedReturnOrders = []) {
  const returnItems = normalizeReturnItemsFromOrders(relatedReturnOrders);
  const canonical = deliveryFinance.buildCanonicalDeliveryOrder(order, {
    returnItems,
    returnAmountOverride: returnItems.reduce((sum, item) => sum + toNumber(item.returnAmount || item.amount), 0)
  });
  const amounts = canonical.amounts || {};
  return {
    ...canonical,
    orderId: orderIdOf(order),
    orderCode: orderCodeOf(order),
    salesOrderId: text(order.salesOrderId || order.id || order._id),
    salesOrderCode: text(order.salesOrderCode || order.orderCode || order.code || orderCodeOf(order)),
    customerCode: text(order.customerCode),
    customerName: text(order.customerName),
    deliveryDate: text(order.deliveryDate || order.date || order.documentDate),
    salesStaffCode: text(order.salesStaffCode || order.salesmanCode || order.staffCode),
    salesStaffName: text(order.salesStaffName || order.salesmanName || order.staffName),
    deliveryStaffCode: text(order.deliveryStaffCode),
    deliveryStaffName: text(order.deliveryStaffName),
    items: canonical.items,
    returnItems: canonical.items,
    amounts: {
      receivable: toNumber(amounts.receivable ?? amounts.totalReceivable),
      cash: toNumber(amounts.cash ?? amounts.cashAmount),
      bank: toNumber(amounts.bank ?? amounts.bankAmount),
      reward: toNumber(amounts.reward ?? amounts.rewardAmount),
      returnAmount: toNumber(amounts.returnAmount),
      processed: toNumber(amounts.processed),
      debt: toNumber(amounts.debt ?? amounts.debtAmount)
    },
    status: {
      deliveryStatus: text(order.deliveryStatus || order.status || 'pending'),
      paymentStatus: (amounts.debt || 0) <= 0 ? 'paid' : ((amounts.processed || 0) > 0 ? 'partial' : 'unpaid'),
      returnStatus: (amounts.returnAmount || 0) > 0 ? 'has_return' : 'none',
      accountingStatus: text(order.accountingStatus || '')
    }
  };
}

async function findOrders(query = {}) {
  const date = text(query.date || query.deliveryDate || today());
  const filter = {};
  if (date) filter.deliveryDate = date;
  if (text(query.deliveryStaffCode)) filter.deliveryStaffCode = text(query.deliveryStaffCode);
  if (text(query.salesStaffCode)) filter.$or = [{ salesStaffCode: text(query.salesStaffCode) }, { staffCode: text(query.salesStaffCode) }];
  if (text(query.status)) filter.deliveryStatus = text(query.status);

  let orders = await SalesOrder.find(filter).sort({ deliveryStaffCode: 1, customerName: 1, code: 1 }).limit(500).lean();

  if (!orders.length && date) {
    const masterFilter = { deliveryDate: date };
    if (text(query.deliveryStaffCode)) masterFilter.deliveryStaffCode = text(query.deliveryStaffCode);
    const masters = await MasterOrder.find(masterFilter).lean();
    const childIds = unique(masters.flatMap((m) => Array.isArray(m.childOrderIds) ? m.childOrderIds : []));
    if (childIds.length) {
      orders = await SalesOrder.find({ $or: [{ id: { $in: childIds } }, { code: { $in: childIds } }] }).limit(500).lean();
    }
  }

  const q = lower(query.q || query.keyword);
  if (q) {
    orders = orders.filter((o) => [o.code, o.orderCode, o.customerCode, o.customerName, o.salesStaffName, o.deliveryStaffName].some((v) => lower(v).includes(q)));
  }
  return orders;
}

async function findReturnOrdersFor(orders = []) {
  const ids = unique(orders.flatMap((o) => [orderIdOf(o), o.id, o._id, o.salesOrderId, o.orderId]));
  const codes = unique(orders.flatMap((o) => [orderCodeOf(o), o.code, o.orderCode, o.salesOrderCode]));
  const or = [];
  if (ids.length) or.push({ salesOrderId: { $in: ids } }, { orderId: { $in: ids } }, { sourceOrderId: { $in: ids } }, { deliveryOrderId: { $in: ids } });
  if (codes.length) or.push({ salesOrderCode: { $in: codes } }, { orderCode: { $in: codes } }, { sourceOrderCode: { $in: codes } }, { deliveryOrderCode: { $in: codes } });
  if (!or.length) return [];
  return ReturnOrder.find({ ...activeReturnFilter(), $or: or }).lean();
}

async function getCanonicalOrderByKey(key) {
  const value = text(key);
  if (!value) return null;
  const order = await SalesOrder.findOne({ $or: [{ id: value }, { code: value }, { orderCode: value }, { salesOrderId: value }, { salesOrderCode: value }, ...(value.match(/^[a-f\d]{24}$/i) ? [{ _id: value }] : [])] }).lean();
  if (!order) return null;
  const returns = await findReturnOrdersFor([order]);
  return buildCanonicalOrder(order, returns.filter((ret) => returnMatchesOrder(ret, order)));
}

router.get('/orders', async (req, res) => {
  try {
    const orders = await findOrders(req.query || {});
    const returns = await findReturnOrdersFor(orders);
    const rows = orders.map((order) => buildCanonicalOrder(order, returns.filter((ret) => returnMatchesOrder(ret, order))));
    return res.json({ ok: true, success: true, orders: rows, rows, items: rows, total: rows.length, source: 'canonical-delivery' });
  } catch (err) {
    return res.status(500).json({ ok: false, success: false, message: err.message || 'Không tải được đơn giao hàng' });
  }
});

router.post('/return', async (req, res) => {
  try {
    const body = req.body || {};
    const key = text(body.salesOrderId || body.orderId || body.salesOrderCode || body.orderCode);
    const order = await SalesOrder.findOne({ $or: [{ id: key }, { code: key }, { orderCode: key }, { salesOrderId: key }, { salesOrderCode: key }, ...(key.match(/^[a-f\d]{24}$/i) ? [{ _id: key }] : [])] }).lean();
    if (!order) return res.status(404).json({ ok: false, success: false, message: 'Không tìm thấy đơn giao hàng' });

    const sourceItems = Array.isArray(body.items) ? body.items : [];
    const items = sourceItems
      .map((item) => {
        const productCode = productCodeOf(item);
        const returnQty = returnQtyOf(item);
        const price = priceOf(item);
        return {
          productId: text(item.productId || productCode),
          productCode,
          code: productCode,
          productName: productNameOf(item),
          name: productNameOf(item),
          returnQty,
          qtyReturn: returnQty,
          returnQuantity: returnQty,
          returnedQty: returnQty,
          price,
          salePrice: price,
          unitPrice: price,
          returnAmount: Math.round(returnQty * price),
          amount: Math.round(returnQty * price)
        };
      })
      .filter((item) => item.productCode && item.returnQty > 0);

    const totalAmount = items.reduce((sum, item) => sum + toNumber(item.returnAmount || item.amount), 0);
    const stableId = `RO-${orderCodeOf(order).replace(/^RO[-_]?/i, '').replace(/[^a-zA-Z0-9_-]/g, '')}`;
    const patch = {
      id: stableId,
      code: stableId,
      salesOrderId: orderIdOf(order),
      salesOrderCode: orderCodeOf(order),
      orderId: orderIdOf(order),
      orderCode: orderCodeOf(order),
      customerId: text(order.customerId),
      customerCode: text(order.customerCode),
      customerName: text(order.customerName),
      deliveryDate: text(order.deliveryDate || body.deliveryDate || today()),
      date: text(body.date || order.deliveryDate || today()),
      documentDate: text(body.documentDate || body.date || order.deliveryDate || today()),
      deliveryStaffCode: text(body.deliveryStaffCode || order.deliveryStaffCode),
      deliveryStaffName: text(body.deliveryStaffName || order.deliveryStaffName),
      salesStaffCode: text(body.salesStaffCode || order.salesStaffCode || order.staffCode),
      salesStaffName: text(body.salesStaffName || order.salesStaffName || order.staffName),
      staffCode: text(body.deliveryStaffCode || order.deliveryStaffCode),
      staffName: text(body.deliveryStaffName || order.deliveryStaffName),
      source: 'canonical_delivery',
      refType: items.length ? 'canonicalDeliveryReturn' : 'canonicalDeliveryReturnClear',
      returnType: text(body.returnType || 'partial') || 'partial',
      returnStatus: items.length ? 'active' : 'cleared',
      status: items.length ? 'active' : 'cleared',
      accountingConfirmed: false,
      accountingStatus: items.length ? 'pending' : 'cleared',
      items,
      totalQuantity: items.reduce((sum, item) => sum + toNumber(item.returnQty), 0),
      totalAmount,
      totalReturnAmount: totalAmount,
      amount: totalAmount,
      debtReduction: totalAmount,
      note: text(body.note) || (items.length ? 'Cập nhật hàng trả từ lõi giao hàng chung' : 'Xóa hàng trả về 0 từ lõi giao hàng chung'),
      updatedAt: new Date().toISOString(),
      clearedAt: items.length ? '' : new Date().toISOString()
    };

    await ReturnOrder.findOneAndUpdate({ $or: [{ id: stableId }, { code: stableId }, { salesOrderId: orderIdOf(order), salesOrderCode: orderCodeOf(order) }, { orderId: orderIdOf(order), orderCode: orderCodeOf(order) }] }, { $set: patch, $setOnInsert: { createdAt: new Date().toISOString() } }, { upsert: true, new: true, lean: true });

    const canonical = await getCanonicalOrderByKey(orderIdOf(order));
    return res.json({ ok: true, success: true, message: items.length ? 'Đã lưu hàng trả' : 'Đã xóa hàng trả về 0', order: canonical, returnOrder: patch });
  } catch (err) {
    return res.status(500).json({ ok: false, success: false, message: err.message || 'Không lưu được hàng trả' });
  }
});

router.post('/payment', async (req, res) => {
  try {
    const body = req.body || {};
    const key = text(body.salesOrderId || body.orderId || body.salesOrderCode || body.orderCode);
    const cashAmount = Math.max(0, num(body.cashAmount ?? body.cashCollected));
    const bankAmount = Math.max(0, num(body.bankAmount ?? body.bankCollected ?? body.transferAmount));
    const rewardAmount = Math.max(0, num(body.rewardAmount ?? body.bonusAmount));
    const patch = {
      cashCollected: cashAmount,
      cashAmount,
      bankCollected: bankAmount,
      bankAmount,
      transferAmount: bankAmount,
      rewardAmount,
      displayRewardAmount: rewardAmount,
      paidAmount: cashAmount + bankAmount,
      collectedAmount: cashAmount + bankAmount,
      updatedAt: new Date().toISOString()
    };
    const updated = await SalesOrder.findOneAndUpdate({ $or: [{ id: key }, { code: key }, { orderCode: key }, { salesOrderId: key }, { salesOrderCode: key }, ...(key.match(/^[a-f\d]{24}$/i) ? [{ _id: key }] : [])] }, { $set: patch }, { new: true, lean: true });
    if (!updated) return res.status(404).json({ ok: false, success: false, message: 'Không tìm thấy đơn giao hàng' });
    const canonical = await getCanonicalOrderByKey(orderIdOf(updated));
    return res.json({ ok: true, success: true, message: 'Đã lưu tiền thu', order: canonical });
  } catch (err) {
    return res.status(500).json({ ok: false, success: false, message: err.message || 'Không lưu được tiền thu' });
  }
});

router.post('/confirm', async (req, res) => {
  try {
    const body = req.body || {};
    const key = text(body.salesOrderId || body.orderId || body.salesOrderCode || body.orderCode);
    const deliveryStatus = text(body.deliveryStatus || body.status || 'delivered');
    const isDelivered = ['delivered', 'success', 'done', 'completed'].includes(lower(deliveryStatus));
    const patch = {
      deliveryStatus: isDelivered ? 'delivered' : deliveryStatus,
      status: isDelivered ? 'delivered' : deliveryStatus,
      deliveryNote: text(body.note || body.deliveryNote),
      deliveredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const updated = await SalesOrder.findOneAndUpdate({ $or: [{ id: key }, { code: key }, { orderCode: key }, { salesOrderId: key }, { salesOrderCode: key }, ...(key.match(/^[a-f\d]{24}$/i) ? [{ _id: key }] : [])] }, { $set: patch }, { new: true, lean: true });
    if (!updated) return res.status(404).json({ ok: false, success: false, message: 'Không tìm thấy đơn giao hàng' });
    const canonical = await getCanonicalOrderByKey(orderIdOf(updated));
    return res.json({ ok: true, success: true, message: 'Đã xác nhận giao hàng', order: canonical });
  } catch (err) {
    return res.status(500).json({ ok: false, success: false, message: err.message || 'Không xác nhận được giao hàng' });
  }
});

module.exports = router;
