const orderService = require('./orderService');
const inventoryService = require('./inventoryService');
const debtLedger = require('./debtLedgerService');
const { num, today, nowIso, cleanCode, uid } = require('../utils/coreUtils');

function cloneDb(db){ return JSON.parse(JSON.stringify(db || {})); }
function restoreDb(target, backup){ Object.keys(target).forEach(k => delete target[k]); Object.assign(target, backup); }

function validateRows(rows, required=[]){
  const errors = [];
  (rows || []).forEach((r,i)=>{
    required.forEach(k => { if(r[k] === undefined || r[k] === null || r[k] === '') errors.push({ row:i+1, field:k, error:`Thiếu ${k}` }); });
  });
  return errors;
}

function commitProducts(db, rows){
  db.products = Array.isArray(db.products) ? db.products : [];
  const result = { inserted:0, updated:0, errors:[] };
  for(const r of rows || []){
    const sku = cleanCode(r.sku);
    if(!sku || !r.name){ result.errors.push({ sku, error:'Thiếu SKU hoặc tên sản phẩm' }); continue; }
    const data = { sku, name:r.name, brand:r.brand||'', category:r.category||'', unit:r.unit||'cái', pack:num(r.pack)||1, costRef:num(r.costRef||r.cost), saleRef:num(r.saleRef||r.sale||r.price), warehouse:r.warehouse||'Kho chính', status:r.status||'active', note:r.note||'' };
    const old = db.products.find(p => cleanCode(p.sku) === sku);
    if(old){ Object.assign(old, data); result.updated++; } else { db.products.push(data); result.inserted++; }
  }
  return result;
}

function commitReceipts(db, rows){
  db.receipts = Array.isArray(db.receipts) ? db.receipts : [];
  const backup = cloneDb(db);
  try{
    const groups = {};
    for(const r of rows || []){
      if(!r.sku || num(r.qty) <= 0) throw new Error(`Dòng nhập kho lỗi: SKU=${r.sku}, SL=${r.qty}`);
      inventoryService.receiveStock(db, { sku:r.sku, qty:r.qty, cost:r.cost });
      const id = cleanCode(r.receiptId || r.id || uid('PN_'));
      groups[id] = groups[id] || { id, date:r.date || today(), supplier:r.supplier || 'Unilever', note:r.note || '', items:[] };
      groups[id].items.push({ sku:r.sku, name:r.name || r.sku, qty:num(r.qty), cost:num(r.cost), pack:num(r.pack)||1 });
    }
    for(const g of Object.values(groups)){
      g.total = g.items.reduce((a,x)=>a+num(x.qty)*num(x.cost),0);
      g.createdAt = nowIso();
      db.receipts.push(g);
    }
    return { inserted:Object.keys(groups).length, errors:[] };
  }catch(err){ restoreDb(db, backup); throw err; }
}

function commitOrders(db, rows, source='NVBH'){
  const backup = cloneDb(db);
  try{
    db.stockShortages = Array.isArray(db.stockShortages) ? db.stockShortages : [];
    const remaining = {};
    (db.stocks || []).forEach(s => { remaining[cleanCode(s.sku)] = num(s.qty); });
    const importRows = [];
    const shortages = [];
    for(const r of rows || []){
      const sku = cleanCode(r.sku);
      inventoryService.ensureProduct(db, sku);
      const requested = num(r.qty);
      const available = Math.max(0, num(remaining[sku]));
      const importedQty = Math.min(requested, available);
      const shortageQty = Math.max(0, requested - importedQty);
      if(importedQty > 0) importRows.push({ ...r, qty: importedQty, originalQty: requested });
      if(shortageQty > 0){
        shortages.push({
          id: uid('THIEU_'), date: nowIso(), source,
          orderId: cleanCode(r.orderId || r.id) || '(chưa có mã)', sku,
          name: r.name || sku, requestedQty: requested, importedQty, shortageQty,
          availableAtImport: available, customerCode:r.customerCode||'', customerName:r.customerName||'',
          staffCode:r.staffCode||'', staffName:r.staffName||'', note:'Tự loại phần thiếu tồn khi import đơn hàng'
        });
      }
      remaining[sku] = Math.max(0, available - importedQty);
    }

    const grouped = {};
    for(const r of importRows){
      const id = cleanCode(r.orderId || r.id || uid(source === 'DMS' ? 'DMS_' : 'DH_'));
      grouped[id] = grouped[id] || { id, date:r.date || today(), source, customerCode:r.customerCode||'', customerName:r.customerName||'', staffCode:r.staffCode||'', staffName:r.staffName||'', deliveryStaffCode:r.deliveryStaffCode||'', deliveryStaffName:r.deliveryStaffName||'', note:r.note || (source === 'DMS' ? 'Đơn từ DMS' : 'Đơn từ NVBH'), items:[] };
      grouped[id].items.push({ sku:r.sku, name:r.name, qty:r.qty, sale:r.sale, discount:r.discount, pack:r.pack, displayReward:r.displayReward, gsv:r.gsv, niv:r.niv, tax:r.tax, invoiceType:r.invoiceType });
    }
    const orders = [];
    for(const o of Object.values(grouped)) orders.push(orderService.createOrder(db, o, { source }));
    db.stockShortages.push(...shortages);
    return { inserted:orders.length, orders, shortages, shortageRows:shortages.length, errors:[] };
  }catch(err){ restoreDb(db, backup); throw err; }
}

function rebuildLedgersFromCurrentOrders(db){
  db.debtLedger = [];
  for(const order of db.orders || []){
    if(order.cancelled) continue;
    const totalOrder = orderService.calcOrder(order);
    Object.assign(order, totalOrder);
    debtLedger.postSale(db, order);
    const cash = num(order.cashPaid);
    const bank = num(order.bankPaid);
    if(cash + bank > 0){
      debtLedger.postPayment(db, { id:`MIG_PAY_${order.id}`, orderId:order.id, date:order.deliveredAt || order.isoDate || order.date, cash, bank, amount:0, customerCode:order.customerCode, customerName:order.customerName, staffCode:order.deliveryStaffCode || order.staffCode, staffName:order.deliveryStaffName || order.staffName, note:'Migration từ dữ liệu đơn cũ' });
    }
    if(num(order.returnAmount) > 0){
      debtLedger.postReturn(db, { id:`MIG_RET_${order.id}`, orderId:order.id, date:order.deliveredAt || order.isoDate || order.date, amount:order.returnAmount, customerCode:order.customerCode, customerName:order.customerName, staffCode:order.deliveryStaffCode || order.staffCode, staffName:order.deliveryStaffName || order.staffName, note:'Migration hàng trả về từ dữ liệu đơn cũ' });
    }
  }
  debtLedger.rebuildDebtSummary(db);
  orderService.rebuildOrderDebtsFromLedger(db);
  return { ledgerRows: db.debtLedger.length, debtRows: db.debts.length };
}

module.exports = { validateRows, commitProducts, commitReceipts, commitOrders, rebuildLedgersFromCurrentOrders };
