const { num, roundMoney, today, nowIso, cleanCode, uid, sum } = require('../utils/coreUtils');
const inventory = require('./inventoryService');
const debtLedger = require('./debtLedgerService');

function ensureOrders(db){ db.orders = Array.isArray(db.orders) ? db.orders : []; }
function calcOrder(order){
  const items = Array.isArray(order.items) ? order.items : [];
  const goods = roundMoney(sum(items, it => num(it.qty) * num(it.sale)));
  const discount = roundMoney(sum(items, it => num(it.qty) * num(it.sale) * num(it.discount) / 100));
  const total = Math.max(0, goods - discount);
  const paid = num(order.cashPaid) + num(order.bankPaid) + num(order.returnAmount);
  const debt = Math.max(0, total - paid);
  return { ...order, goods, discount, total, debt, overPaid:Math.max(0, paid-total), paymentStatus: debt<=0 ? 'Đã thanh toán' : (paid>0 ? 'Thanh toán một phần' : 'Còn nợ') };
}

function normalizeItems(db, items){
  if(!Array.isArray(items) || !items.length) throw new Error('Đơn phải có ít nhất 1 sản phẩm');
  return items.map(it => {
    const p = inventory.ensureProduct(db, it.sku);
    const qty = num(it.qty);
    if(qty <= 0) throw new Error(`Số lượng bán không hợp lệ: ${it.sku}`);
    return {
      sku:cleanCode(it.sku), name:it.name || p.name || it.sku, pack:num(it.pack || p.pack) || 1, qty,
      // Cho phép giá 0 cho hàng khuyến mãi từ mẫu DMS; không fallback sang giá danh mục khi it.sale = 0.
      sale:roundMoney(it.sale !== undefined && it.sale !== null && it.sale !== '' ? it.sale : (p.saleRef || p.sale || 0)),
      discount:num(it.discount), displayReward:num(it.displayReward),
      gsv:num(it.gsv), niv:num(it.niv), tax:num(it.tax), invoiceType:it.invoiceType || ''
    };
  });
}

function createOrder(db, input, opts={}){
  ensureOrders(db);
  const id = cleanCode(input.id || input.orderId || uid(opts.source === 'DMS' ? 'DMS_' : 'DH_'));
  if(db.orders.some(o => cleanCode(o.id) === id)) throw new Error(`Mã đơn đã tồn tại: ${id}`);
  const items = normalizeItems(db, input.items);
  for(const it of items) inventory.issueStock(db, it);
  let order = calcOrder({
    id, date: input.date || today(), isoDate: input.isoDate || nowIso(), source: input.source || opts.source || 'NVBH',
    customerCode: cleanCode(input.customerCode), customerName: input.customerName || '', staffCode: input.staffCode || '', staffName: input.staffName || '',
    deliveryStaffCode: input.deliveryStaffCode || '', deliveryStaffName: input.deliveryStaffName || '',
    deliveryStatus: 'pending', workflowStatus: 'NEW', note: input.note || '', cashPaid:0, bankPaid:0, returnAmount:0, items
  });
  db.orders.push(order);
  debtLedger.postSale(db, order);
  return order;
}

function cancelOrder(db, orderId, reason='Huỷ đơn'){
  ensureOrders(db);
  const order = db.orders.find(o => cleanCode(o.id) === cleanCode(orderId));
  if(!order) throw new Error('Không tìm thấy đơn');
  if(order.cancelled) return order;
  for(const it of order.items || []) inventory.returnStock(db, it);
  order.cancelled = true;
  order.workflowStatus = 'CANCELLED';
  order.cancelReason = reason;
  order.cancelledAt = nowIso();
  debtLedger.removeLedgerByOrder(db, order.id);
  return order;
}

function rebuildOrderDebtsFromLedger(db){
  ensureOrders(db);
  for(const o of db.orders){
    const balance = debtLedger.balanceByOrder(db, o.id);
    o.debt = Math.max(0, balance);
    o.paymentStatus = o.debt <= 0 ? 'Đã thanh toán' : 'Còn nợ';
  }
  return db.orders;
}

module.exports = { createOrder, cancelOrder, calcOrder, rebuildOrderDebtsFromLedger };
