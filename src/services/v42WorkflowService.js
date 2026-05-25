const { getDb, saveDb } = require('./dataService');

function id(prefix){ return `${prefix}${Date.now()}${Math.floor(Math.random()*1000)}`; }
function today(){ return new Date().toISOString().slice(0,10); }
function num(v){ const n = Number(v); return Number.isFinite(n) ? n : 0; }
function norm(v){ return String(v || '').trim().toLowerCase(); }
function ensureArrays(db){
  const keys = ['products','stocks','receipts','orders','customers','staff','deliveryStaff','users','masterOrders','debts','debtLedger','payments','returns','cashFund','auditLogs','promotions','dmsOrders','dmsStocks','dmsAllocations','stockShortages','documents','stockJournal','stockAdjustments','transfers','cashVouchers'];
  keys.forEach(k => { if(!Array.isArray(db[k])) db[k] = []; });
  return db;
}
function addAudit(db, action, detail, user='system'){
  db.auditLogs.unshift({ id:id('LOG'), at:new Date().toISOString(), date:today(), user, action, detail });
}
function getProductCode(item){ return item.productCode || item.code || item.ma || item.sku || ''; }
function getProductName(item){ return item.productName || item.name || item.ten || ''; }
function findProduct(db, code){ return db.products.find(p => norm(p.code || p.productCode || p.ma) === norm(code)); }
function stockRow(db, productCode, warehouse='MAIN'){
  let row = db.stocks.find(s => norm(s.productCode || s.code) === norm(productCode) && norm(s.warehouse || 'MAIN') === norm(warehouse));
  if(!row){ row = { id:id('STK'), productCode, warehouse, actualQty:0, dmsQty:0, openQty:0 }; db.stocks.push(row); }
  return row;
}
function changeStock(db, { productCode, productName, warehouse='MAIN', qty, type, refType, refId, note }){
  const row = stockRow(db, productCode, warehouse);
  row.actualQty = num(row.actualQty) + num(qty);
  row.openQty = Math.max(0, num(row.openQty) + num(qty));
  row.updatedAt = new Date().toISOString();
  db.stockJournal.unshift({ id:id('SJ'), date:today(), at:new Date().toISOString(), type, refType, refId, productCode, productName, warehouse, qty:num(qty), actualAfter:row.actualQty, openAfter:row.openQty, note:note || '' });
}
function upsertDebt(db, customerCode, customerName, amount, refType, refId, note){
  if(!customerCode && !customerName) return;
  let debt = db.debts.find(d => norm(d.customerCode) === norm(customerCode) || (customerName && norm(d.customerName) === norm(customerName)));
  if(!debt){ debt = { id:id('DEBT'), customerCode, customerName, opening:0, increase:0, decrease:0, balance:0 }; db.debts.push(debt); }
  if(amount >= 0) debt.increase = num(debt.increase) + amount; else debt.decrease = num(debt.decrease) + Math.abs(amount);
  debt.balance = num(debt.opening) + num(debt.increase) - num(debt.decrease);
  debt.updatedAt = new Date().toISOString();
  db.debtLedger.unshift({ id:id('DL'), date:today(), at:new Date().toISOString(), customerCode, customerName, amount, refType, refId, balanceAfter:debt.balance, note: note || '' });
}
async function dashboard(date=today()){
  const db = ensureArrays(await getDb());
  const orders = db.orders.filter(o => (o.date || '').slice(0,10) === date);
  const receipts = db.receipts.filter(r => (r.date || '').slice(0,10) === date);
  const cash = db.cashFund.filter(c => (c.date || '').slice(0,10) === date);
  const sales = orders.reduce((s,o)=>s+num(o.totalAmount || o.total),0);
  const collected = cash.filter(c=>c.type==='thu').reduce((s,c)=>s+num(c.amount),0);
  const paid = cash.filter(c=>c.type==='chi').reduce((s,c)=>s+num(c.amount),0);
  const debtBalance = db.debts.reduce((s,d)=>s+num(d.balance),0);
  return { date, cards:{ sales, orderCount:orders.length, receiptCount:receipts.length, collected, paid, cashBalance:collected-paid, debtBalance, productCount:db.products.length, customerCount:db.customers.length }, alerts:{ negativeStocks:db.stocks.filter(s=>num(s.actualQty)<0), lowOpenStocks:db.stocks.filter(s=>num(s.openQty)<=0).slice(0,20), shortages:db.stockShortages.slice(0,20) } };
}
async function list(collection){ const db=ensureArrays(await getDb()); return db[collection] || []; }
async function saveItem(collection, item, user){
  const db=ensureArrays(await getDb()); const arr=db[collection] || (db[collection]=[]);
  const row={...item}; row.id=row.id || id(collection.slice(0,3).toUpperCase()); row.updatedAt=new Date().toISOString();
  const idx=arr.findIndex(x=>x.id===row.id || (row.code && x.code===row.code));
  if(idx>=0) arr[idx]={...arr[idx],...row}; else { row.createdAt=row.updatedAt; arr.unshift(row); }
  addAudit(db, `SAVE_${collection}`, row.id || row.code, user);
  await saveDb(db); return row;
}
async function createReceipt(payload, user){
  const db=ensureArrays(await getDb());
  const receipt={ id:id('PN'), code:payload.code||id('PN'), date:payload.date||today(), supplier:payload.supplier||'', warehouse:payload.warehouse||'MAIN', note:payload.note||'', items:Array.isArray(payload.items)?payload.items:[], status:'posted', createdAt:new Date().toISOString() };
  receipt.totalQty = receipt.items.reduce((s,i)=>s+num(i.qty),0);
  receipt.items.forEach(i=>changeStock(db,{ productCode:getProductCode(i), productName:getProductName(i), warehouse:receipt.warehouse, qty:num(i.qty), type:'IN', refType:'receipt', refId:receipt.code, note:'Nhập kho' }));
  db.receipts.unshift(receipt); db.documents.unshift({ id:id('DOC'), type:'PHIEU_NHAP', code:receipt.code, date:receipt.date, status:'posted', refId:receipt.id });
  addAudit(db,'CREATE_RECEIPT',receipt.code,user); await saveDb(db); return receipt;
}
async function createOrder(payload, user){
  const db=ensureArrays(await getDb());
  const order={ id:id('DH'), code:payload.code||id('DH'), date:payload.date||today(), customerCode:payload.customerCode||'', customerName:payload.customerName||'', staffCode:payload.staffCode||'', staffName:payload.staffName||'', warehouse:payload.warehouse||'MAIN', note:payload.note||'', items:Array.isArray(payload.items)?payload.items:[], status:'posted', createdAt:new Date().toISOString() };
  let total=0; const shortages=[];
  for(const i of order.items){
    const productCode=getProductCode(i); const productName=getProductName(i); const qty=num(i.qty); const price=num(i.price || i.unitPrice);
    const stock=stockRow(db, productCode, order.warehouse);
    if(num(stock.openQty) < qty){ shortages.push({ productCode, productName, requested:qty, available:num(stock.openQty) }); }
    changeStock(db,{ productCode, productName, warehouse:order.warehouse, qty:-qty, type:'OUT', refType:'order', refId:order.code, note:'Xuất bán' });
    total += qty * price;
  }
  order.totalAmount = num(payload.totalAmount) || total;
  order.shortages = shortages;
  if(shortages.length){ db.stockShortages.unshift({ id:id('THIEU'), date:today(), orderCode:order.code, items:shortages, status:'open' }); }
  db.orders.unshift(order); db.documents.unshift({ id:id('DOC'), type:'PHIEU_XUAT', code:order.code, date:order.date, status:'posted', refId:order.id });
  upsertDebt(db, order.customerCode, order.customerName, order.totalAmount, 'order', order.code, 'Phát sinh đơn hàng');
  addAudit(db,'CREATE_ORDER',order.code,user); await saveDb(db); return order;
}
async function createPayment(payload, user){
  const db=ensureArrays(await getDb()); const amount=num(payload.amount);
  const pay={ id:id('PT'), code:payload.code||id('PT'), date:payload.date||today(), customerCode:payload.customerCode||'', customerName:payload.customerName||'', staffCode:payload.staffCode||'', staffName:payload.staffName||'', amount, method:payload.method||'cash', note:payload.note||'', createdAt:new Date().toISOString() };
  db.payments.unshift(pay); db.cashFund.unshift({ id:id('CF'), date:pay.date, type:'thu', amount, source:'payment', refId:pay.code, staffName:pay.staffName, note:`Thu tiền ${pay.customerName}` });
  upsertDebt(db,pay.customerCode,pay.customerName,-amount,'payment',pay.code,'Thu tiền');
  db.documents.unshift({ id:id('DOC'), type:'PHIEU_THU', code:pay.code, date:pay.date, status:'posted', refId:pay.id });
  addAudit(db,'CREATE_PAYMENT',pay.code,user); await saveDb(db); return pay;
}
async function createCash(payload, user){
  const db=ensureArrays(await getDb()); const row={ id:id('CF'), date:payload.date||today(), type:payload.type==='chi'?'chi':'thu', amount:num(payload.amount), source:payload.source||'manual', staffName:payload.staffName||'', note:payload.note||'', createdAt:new Date().toISOString() };
  db.cashFund.unshift(row); db.documents.unshift({ id:id('DOC'), type:row.type==='thu'?'PHIEU_THU':'PHIEU_CHI', code:row.id, date:row.date, status:'posted', refId:row.id });
  addAudit(db,'CREATE_CASH',`${row.type} ${row.amount}`,user); await saveDb(db); return row;
}
async function adjustStock(payload, user){
  const db=ensureArrays(await getDb()); const productCode=payload.productCode; const productName=payload.productName || (findProduct(db,productCode)||{}).name || '';
  const warehouse=payload.warehouse||'MAIN'; const row=stockRow(db,productCode,warehouse); const before=num(row.actualQty); const after=num(payload.actualQty); const diff=after-before;
  row.actualQty=after; row.openQty = payload.openQty === undefined ? Math.max(0, after) : num(payload.openQty); row.updatedAt=new Date().toISOString();
  const adj={ id:id('DC'), date:payload.date||today(), productCode, productName, warehouse, beforeQty:before, afterQty:after, diffQty:diff, reason:payload.reason||'', createdAt:new Date().toISOString() };
  db.stockAdjustments.unshift(adj); db.stockJournal.unshift({ id:id('SJ'), date:adj.date, at:adj.createdAt, type:'ADJUST', refType:'adjustment', refId:adj.id, productCode, productName, warehouse, qty:diff, actualAfter:row.actualQty, openAfter:row.openQty, note:adj.reason });
  db.documents.unshift({ id:id('DOC'), type:'DIEU_CHINH_KHO', code:adj.id, date:adj.date, status:'posted', refId:adj.id }); addAudit(db,'ADJUST_STOCK',adj.id,user); await saveDb(db); return adj;
}
async function createBackup(){ const db=ensureArrays(await getDb()); return { id:id('BKP'), at:new Date().toISOString(), data:db }; }
module.exports={ dashboard, list, saveItem, createReceipt, createOrder, createPayment, createCash, adjustStock, createBackup, today };
