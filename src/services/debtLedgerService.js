const { num, roundMoney, nowIso, cleanCode, uid, sum } = require('../utils/coreUtils');

const TYPES = {
  SALE: 'SALE', PAYMENT: 'PAYMENT', RETURN: 'RETURN', ADJUSTMENT: 'ADJUSTMENT', CANCEL: 'CANCEL'
};

function ensureLedger(db){
  db.debtLedger = Array.isArray(db.debtLedger) ? db.debtLedger : [];
  db.debts = Array.isArray(db.debts) ? db.debts : [];
}

function signed(entry){
  const amount = num(entry.amount);
  return entry.direction === 'INCREASE' ? amount : -amount;
}

function addLedgerEntry(db, entry){
  ensureLedger(db);
  const amount = roundMoney(entry.amount);
  if(amount <= 0) return null;
  const row = {
    id: entry.id || uid('LEDGER_'),
    date: entry.date || nowIso(),
    customerCode: cleanCode(entry.customerCode),
    customerName: entry.customerName || '',
    staffCode: entry.staffCode || '',
    staffName: entry.staffName || '',
    orderId: cleanCode(entry.orderId),
    refId: entry.refId || '',
    type: entry.type || TYPES.ADJUSTMENT,
    amount,
    direction: entry.direction === 'INCREASE' ? 'INCREASE' : 'DECREASE',
    note: entry.note || '',
    createdAt: nowIso()
  };
  db.debtLedger.push(row);
  rebuildDebtSummary(db);
  return row;
}

function removeLedgerByOrder(db, orderId){
  ensureLedger(db);
  const id = cleanCode(orderId);
  db.debtLedger = db.debtLedger.filter(x => cleanCode(x.orderId) !== id);
  rebuildDebtSummary(db);
}

function rebuildDebtSummary(db){
  ensureLedger(db);
  const map = new Map();
  for(const e of db.debtLedger){
    const key = cleanCode(e.customerCode) || cleanCode(e.customerName) || 'UNKNOWN';
    if(!map.has(key)) map.set(key, { customerCode:e.customerCode || '', customerName:e.customerName || '', amount:0, lastDate:e.date || '' });
    const cur = map.get(key);
    cur.amount += signed(e);
    if(String(e.date || '') > String(cur.lastDate || '')) cur.lastDate = e.date;
    if(e.customerName) cur.customerName = e.customerName;
  }
  db.debts = [...map.values()].filter(x => roundMoney(x.amount) !== 0).map(x => ({
    id: `DEBT_${x.customerCode || x.customerName}`,
    date: x.lastDate,
    customerCode: x.customerCode,
    customerName: x.customerName,
    amount: roundMoney(Math.max(0, x.amount)),
    balance: roundMoney(x.amount),
    status: x.amount > 0 ? 'Còn nợ' : 'Dư có/đã trả thừa'
  }));
  return db.debts;
}

function orderTotal(order){
  return roundMoney(sum(order.items, it => num(it.qty) * num(it.sale) * (1 - num(it.discount)/100)));
}

function postSale(db, order){
  return addLedgerEntry(db, {
    id:`LEDGER_SALE_${order.id}`,
    date: order.date || nowIso(), customerCode: order.customerCode, customerName: order.customerName,
    staffCode: order.staffCode, staffName: order.staffName, orderId: order.id, type:TYPES.SALE,
    amount: order.total || orderTotal(order), direction:'INCREASE', note:'Phát sinh đơn bán'
  });
}

function postPayment(db, payment){
  return addLedgerEntry(db, {
    id:`LEDGER_PAY_${payment.id || uid('PAY_')}`,
    date: payment.date || nowIso(), customerCode: payment.customerCode, customerName: payment.customerName,
    staffCode: payment.staffCode, staffName: payment.staffName, orderId: payment.orderId, refId: payment.id,
    type:TYPES.PAYMENT, amount: num(payment.cash) + num(payment.bank) + num(payment.amount), direction:'DECREASE', note: payment.note || 'Khách thanh toán'
  });
}

function postReturn(db, ret){
  return addLedgerEntry(db, {
    id:`LEDGER_RETURN_${ret.id || uid('RET_')}`,
    date: ret.date || nowIso(), customerCode: ret.customerCode, customerName: ret.customerName,
    staffCode: ret.staffCode, staffName: ret.staffName, orderId: ret.orderId, refId: ret.id,
    type:TYPES.RETURN, amount: ret.amount, direction:'DECREASE', note: ret.note || 'Hàng trả về'
  });
}

function balanceByOrder(db, orderId){
  ensureLedger(db);
  const id = cleanCode(orderId);
  return roundMoney(sum(db.debtLedger.filter(x => cleanCode(x.orderId) === id), signed));
}

function balanceByCustomer(db, customerCode){
  ensureLedger(db);
  const code = cleanCode(customerCode);
  return roundMoney(sum(db.debtLedger.filter(x => cleanCode(x.customerCode) === code), signed));
}

module.exports = { TYPES, addLedgerEntry, removeLedgerByOrder, rebuildDebtSummary, postSale, postPayment, postReturn, balanceByOrder, balanceByCustomer, orderTotal };
