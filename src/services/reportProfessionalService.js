const { num, roundMoney, today, cleanCode } = require('../utils/coreUtils');
const debtProfessionalService = require('./debtProfessionalService');

function dayRange(query = {}){ const date = query.date || today(); return { fromDate: query.fromDate || date, toDate: query.toDate || date }; }
function salesToday(db, query = {}){
  const { fromDate, toDate } = dayRange(query);
  const orders = (db.orders || []).filter(o => String(o.date || o.createdAt || '').slice(0,10) >= fromDate && String(o.date || o.createdAt || '').slice(0,10) <= toDate && !o.deleted && o.status !== 'CANCELLED');
  const total = roundMoney(orders.reduce((s,o)=>s+num(o.total || o.totalAmount || (o.items||[]).reduce((a,i)=>a+num(i.qty||i.quantity)*num(i.sale||i.price),0)),0));
  return { fromDate, toDate, orderCount: orders.length, total, orders };
}
function inventorySummary(db){
  const rows = (db.stocks || []).map(s => ({ sku:s.sku || s.productCode, productName:s.name || s.productName || '', warehouseCode:s.warehouseCode || s.warehouse || 'KHO_CHINH', qty:num(s.qty || s.realStock), value:roundMoney(num(s.qty || s.realStock) * num(s.avgCost || s.cost || s.lastCost)) }));
  return { count: rows.length, totalQty: rows.reduce((s,x)=>s+x.qty,0), totalValue: roundMoney(rows.reduce((s,x)=>s+x.value,0)), rows };
}
function debtSummary(db, query = {}){ return { ...dayRange(query), rows: debtProfessionalService.summarizeDebt(db, query) }; }
function cashSummary(db, query = {}){
  const { fromDate, toDate } = dayRange(query);
  const rows = (db.cashFundEntries || db.cashFunds || []).filter(x => String(x.date || '').slice(0,10) >= fromDate && String(x.date || '').slice(0,10) <= toDate);
  const thu = roundMoney(rows.filter(x => cleanCode(x.type).includes('THU') || num(x.inAmount)>0).reduce((s,x)=>s+num(x.amount || x.inAmount),0));
  const chi = roundMoney(rows.filter(x => cleanCode(x.type).includes('CHI') || num(x.outAmount)>0).reduce((s,x)=>s+num(x.amount || x.outAmount),0));
  return { fromDate, toDate, thu, chi, balance: roundMoney(thu - chi), rows };
}
module.exports = { dayRange, salesToday, inventorySummary, debtSummary, cashSummary };
