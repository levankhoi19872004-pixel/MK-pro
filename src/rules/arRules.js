'use strict';

const Journal = require('../models/Journal');
const { AR_TYPES } = require('../constants/business.constants');
const orderRules = require('./orderRules');
const { makeBusinessError } = require('../utils/businessError.util');

async function validateArSalePosting(order = {}) {
  const orderCode = order.code || order.orderCode || order.salesOrderCode || '';
  const errors = [];
  if (!orderRules.canPostArSale(order)) errors.push(makeBusinessError({ code: 'ORDER_NOT_DELIVERED', message: 'Chỉ đơn đã giao / đã xác nhận kế toán mới được ghi công nợ', orderCode, field: 'status' }));
  const existed = orderCode ? await Journal.findOne({ type: AR_TYPES.SALE, $or: [{ orderCode }, { refCode: orderCode }] }).lean().catch(() => null) : null;
  if (existed) errors.push(makeBusinessError({ code: 'AR_SALE_ALREADY_POSTED', message: `Đơn ${orderCode} đã ghi AR-SALE, không được post lặp`, orderCode, field: 'orderCode' }));
  return { valid: errors.length === 0, errors };
}

function validateReceiptAllocation(receipt = {}) {
  const amount = Number(receipt.amount || 0);
  const allocations = Array.isArray(receipt.allocations) ? receipt.allocations : [];
  const allocated = allocations.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const errors = [];
  if (amount <= 0) errors.push(makeBusinessError({ code: 'INVALID_RECEIPT_AMOUNT', message: 'Số tiền phiếu thu phải lớn hơn 0', field: 'amount' }));
  if (allocated - amount > 1000) errors.push(makeBusinessError({ code: 'RECEIPT_OVER_ALLOCATED', message: 'Số tiền phân bổ vượt quá số tiền phiếu thu', field: 'allocations' }));
  return { valid: errors.length === 0, errors };
}

async function calculateCustomerDebt(customerCode) {
  if (!customerCode) return 0;
  const rows = await Journal.find({ customerCode }).select('amount debit credit type').lean().catch(() => []);
  return rows.reduce((sum, row) => sum + Number(row.debit ?? row.amount ?? 0) - Number(row.credit ?? 0), 0);
}

module.exports = { validateArSalePosting, validateReceiptAllocation, calculateCustomerDebt };
