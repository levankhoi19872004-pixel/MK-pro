'use strict';

const express = require('express');
const router = express.Router();

const auth = require('../middlewares/auth');
const { readKhoData, saveKhoData } = require('../config/db');
const { rebuildMasterOrders, rebuildDebts, getOrderPaid, getDebtStatus } = require('../services/orderDebtService');
const { getCollectorFromRequest } = require('../services/paymentService');

router.post('/api/pay-order', auth, async (req, res) => {
  try {
    const { orderId, cashPaid, bankPaid, amount, type, dueDate, note } = req.body || {};
    const data = await readKhoData();
    const order = (data.orders || []).find(o => String(o.id) === String(orderId));

    if (!order) return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });

    const oldCash = Number(order.cashPaid) || 0;
    const oldBank = Number(order.bankPaid) || 0;

    if (amount !== undefined && amount !== null && amount !== '') {
      const payAmount = Number(amount) || 0;
      if (type === 'bank' || type === 'Chuyển khoản') order.bankPaid = oldBank + payAmount;
      else order.cashPaid = oldCash + payAmount;
    } else {
      order.cashPaid = Number(cashPaid) || 0;
      order.bankPaid = Number(bankPaid) || 0;
    }

    if (dueDate !== undefined) order.dueDate = dueDate || '';

    const collector = getCollectorFromRequest(req);
    order.lastCollectedBy = collector.collectedBy;
    order.lastCollectedByRole = collector.collectedByRole;
    order.lastCollectedByCode = collector.collectedByCode;

    const total = Number(order.total) || 0;
    const paid = getOrderPaid(order);
    order.debt = total - paid;
    order.paymentStatus = getDebtStatus(total, paid, order.dueDate || '');

    const cashDelta = (Number(order.cashPaid) || 0) - oldCash;
    const bankDelta = (Number(order.bankPaid) || 0) - oldBank;
    data.payments = Array.isArray(data.payments) ? data.payments : [];

    if (cashDelta !== 0) {
      data.payments.push({ id: `PAY-${Date.now()}-CASH`, orderId: order.id || '', customerCode: order.customerCode || '', customerName: order.customer || order.customerName || '', amount: cashDelta, type: 'cash', method: 'Tiền mặt', date: new Date().toISOString(), note: note || 'Cập nhật thanh toán đơn hàng', collectedBy: collector.collectedBy, collectedByRole: collector.collectedByRole, collectedByCode: collector.collectedByCode });
    }
    if (bankDelta !== 0) {
      data.payments.push({ id: `PAY-${Date.now()}-BANK`, orderId: order.id || '', customerCode: order.customerCode || '', customerName: order.customer || order.customerName || '', amount: bankDelta, type: 'bank', method: 'Chuyển khoản', date: new Date().toISOString(), note: note || 'Cập nhật thanh toán đơn hàng', collectedBy: collector.collectedBy, collectedByRole: collector.collectedByRole, collectedByCode: collector.collectedByCode });
    }

    data.masterOrders = rebuildMasterOrders(data.orders, data.masterOrders);
    data.debts = rebuildDebts(data);
    await saveKhoData(data);

    res.json({ success: true, data, order, debts: data.debts, payments: data.payments });
  } catch (err) {
    console.error('POST /api/pay-order error:', err);
    res.status(500).json({ error: 'Không cập nhật được thanh toán', detail: err.message });
  }
});

module.exports = router;
