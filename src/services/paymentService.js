const { num, roundMoney, nowIso, cleanCode, uid } = require('../utils/coreUtils');
const debtLedger = require('./debtLedgerService');
const cashFund = require('./cashFundService');
const orderService = require('./orderService');

function ensurePayments(db){ db.payments = Array.isArray(db.payments) ? db.payments : []; }

function recordPayment(db, input){
  ensurePayments(db);
  const order = (db.orders || []).find(o => cleanCode(o.id) === cleanCode(input.orderId));
  if(!order) throw new Error('Không tìm thấy đơn để thu tiền');
  const cash = roundMoney(input.cash || input.cashPaid || 0);
  const bank = roundMoney(input.bank || input.bankPaid || 0);
  const amount = roundMoney(input.amount || 0);
  if(cash + bank + amount <= 0) throw new Error('Số tiền thu phải lớn hơn 0');
  const payment = {
    id: input.id || uid('PAY_'), orderId: order.id, date: input.date || nowIso(), cash, bank, amount,
    customerCode: order.customerCode, customerName: order.customerName, staffCode: input.staffCode || order.deliveryStaffCode || order.staffCode || '', staffName: input.staffName || order.deliveryStaffName || order.staffName || '', note: input.note || 'Ghi nhận thanh toán'
  };
  db.payments.push(payment);
  order.cashPaid = num(order.cashPaid) + cash + amount;
  order.bankPaid = num(order.bankPaid) + bank;
  Object.assign(order, orderService.calcOrder(order));
  debtLedger.postPayment(db, payment);
  cashFund.postPaymentToFund(db, payment);
  order.workflowStatus = order.debt > 0 ? 'PARTIAL_PAID' : 'PAID';
  return payment;
}

module.exports = { recordPayment };
