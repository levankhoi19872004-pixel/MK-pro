const { num, roundMoney, nowIso, uid } = require('../utils/coreUtils');

function ensureCashFund(db){ db.cashFund = Array.isArray(db.cashFund) ? db.cashFund : []; }

function addCashFund(db, tx){
  ensureCashFund(db);
  const amount = roundMoney(tx.amount);
  if(amount <= 0) return null;
  const row = {
    id: tx.id || uid('FUND_'),
    date: tx.date || nowIso(),
    type: tx.type || 'thu',
    method: tx.method || '',
    amount,
    orderId: tx.orderId || '',
    staffCode: tx.staffCode || '',
    staffName: tx.staffName || '',
    note: tx.note || '',
    createdAt: nowIso()
  };
  db.cashFund.push(row);
  return row;
}

function postPaymentToFund(db, payment){
  const rows = [];
  if(num(payment.cash) > 0) rows.push(addCashFund(db, { id:`FUND_CASH_${payment.id}`, date:payment.date, type:'thu', method:'cash', amount:payment.cash, orderId:payment.orderId, staffCode:payment.staffCode, staffName:payment.staffName, note:`Thu tiền mặt đơn ${payment.orderId}` }));
  if(num(payment.bank) > 0) rows.push(addCashFund(db, { id:`FUND_BANK_${payment.id}`, date:payment.date, type:'chuyen_khoan', method:'bank', amount:payment.bank, orderId:payment.orderId, staffCode:payment.staffCode, staffName:payment.staffName, note:`Khách chuyển khoản đơn ${payment.orderId}` }));
  return rows.filter(Boolean);
}

module.exports = { ensureCashFund, addCashFund, postPaymentToFund };
