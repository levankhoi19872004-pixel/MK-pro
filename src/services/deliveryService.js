const { num, roundMoney, nowIso, cleanCode, uid } = require('../utils/coreUtils');
const paymentService = require('./paymentService');
const debtLedger = require('./debtLedgerService');
const orderService = require('./orderService');

function ensureReturns(db){ db.returns = Array.isArray(db.returns) ? db.returns : []; }

function markDelivering(db, orderId, staff={}){
  const order = (db.orders || []).find(o => cleanCode(o.id) === cleanCode(orderId));
  if(!order) throw new Error('Không tìm thấy đơn giao');
  order.deliveryStatus = 'delivering';
  order.workflowStatus = 'DELIVERING';
  if(staff.code) order.deliveryStaffCode = staff.code;
  if(staff.name) order.deliveryStaffName = staff.name;
  return order;
}

function completeDelivery(db, input){
  ensureReturns(db);
  const order = (db.orders || []).find(o => cleanCode(o.id) === cleanCode(input.orderId));
  if(!order) throw new Error('Không tìm thấy đơn giao');
  order.deliveryStatus = 'delivered';
  order.delivered = true;
  order.deliveredAt = input.date || nowIso();
  if(input.deliveryStaffCode) order.deliveryStaffCode = input.deliveryStaffCode;
  if(input.deliveryStaffName) order.deliveryStaffName = input.deliveryStaffName;

  if(num(input.cash) + num(input.bank) + num(input.amount) > 0){
    paymentService.recordPayment(db, { orderId:order.id, cash:input.cash, bank:input.bank, amount:input.amount, date:input.date, staffCode:order.deliveryStaffCode, staffName:order.deliveryStaffName, note:'NV giao hàng thu tiền' });
  }

  const returnAmount = roundMoney(input.returnAmount || input.returnValue || 0);
  if(returnAmount > 0){
    const ret = { id: input.returnId || uid('RET_'), orderId:order.id, date:input.date || nowIso(), amount:returnAmount, customerCode:order.customerCode, customerName:order.customerName, staffCode:order.deliveryStaffCode || order.staffCode || '', staffName:order.deliveryStaffName || order.staffName || '', note:input.returnNote || 'Hàng trả về khi giao' };
    db.returns.push(ret);
    order.returnAmount = num(order.returnAmount) + returnAmount;
    debtLedger.postReturn(db, ret);
  }
  Object.assign(order, orderService.calcOrder(order));
  order.workflowStatus = order.debt > 0 ? 'DELIVERED_DEBT' : 'DELIVERED_PAID';
  return order;
}

module.exports = { markDelivering, completeDelivery };
