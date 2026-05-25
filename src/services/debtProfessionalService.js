const { num, roundMoney, today, nowIso, uid, cleanCode } = require('../utils/coreUtils');
const auditLogService = require('./auditLogService');

function ensure(db){ db.customerDebtLedger = Array.isArray(db.customerDebtLedger) ? db.customerDebtLedger : []; return db.customerDebtLedger; }
function addDebtEntry(db, input = {}, user = {}){
  const rows = ensure(db);
  const entry = {
    id: input.id || uid('DEBT_'),
    date: input.date || today(),
    time: nowIso(),
    customerCode: cleanCode(input.customerCode),
    customerName: input.customerName || '',
    staffCode: input.staffCode || '',
    deliveryStaffCode: input.deliveryStaffCode || '',
    type: input.type || 'AR_INCREASE',
    refId: input.refId || '',
    debit: roundMoney(input.debit || 0),
    credit: roundMoney(input.credit || 0),
    note: input.note || '',
    userCode: user.code || input.userCode || ''
  };
  rows.unshift(entry);
  auditLogService.addLog(db, 'DEBT_ENTRY', { module:'DEBT', refType:entry.type, refId:entry.refId || entry.id, after:entry, user });
  return entry;
}
function getCustomerBalance(db, customerCode){
  return roundMoney(ensure(db).filter(x => cleanCode(x.customerCode) === cleanCode(customerCode)).reduce((s,x)=>s+num(x.debit)-num(x.credit),0));
}
function summarizeDebt(db, filter = {}){
  let rows = ensure(db);
  if(filter.fromDate) rows = rows.filter(x => String(x.date) >= String(filter.fromDate));
  if(filter.toDate) rows = rows.filter(x => String(x.date) <= String(filter.toDate));
  if(filter.staffCode) rows = rows.filter(x => cleanCode(x.staffCode) === cleanCode(filter.staffCode));
  const map = new Map();
  rows.forEach(x => {
    const key = cleanCode(x.customerCode);
    if(!map.has(key)) map.set(key, { customerCode:key, customerName:x.customerName || '', debit:0, credit:0, balance:0 });
    const r = map.get(key); r.debit += num(x.debit); r.credit += num(x.credit); r.balance = roundMoney(r.debit - r.credit);
  });
  return Array.from(map.values()).sort((a,b)=>b.balance-a.balance);
}
module.exports = { ensure, addDebtEntry, getCustomerBalance, summarizeDebt };
