const dataService = require('../services/dataService');
const orderService = require('../services/orderService');
const inventoryService = require('../services/inventoryService');
const debtLedgerService = require('../services/debtLedgerService');
const paymentService = require('../services/paymentService');
const cashFundService = require('../services/cashFundService');
const deliveryService = require('../services/deliveryService');
const { num, roundMoney, cleanCode, nowIso, today, uid } = require('../utils/coreUtils');

async function loadDb(){ return dataService.getDb(); }
async function saveDb(db){ return dataService.saveDb(db); }
function ok(res, payload={}){ res.json({ success:true, ...payload }); }
function fail(res, error, status=400){ res.status(status).json({ success:false, error:error.message || String(error) }); }
function asArray(value){ return Array.isArray(value) ? value : []; }

function dmsStockQty(db, sku){
  const code = cleanCode(sku);
  return asArray(db.dmsStocks).filter(x => cleanCode(x.sku || x.productCode) === code).reduce((sum, x) => sum + num(x.qty || x.quantity), 0);
}

function stockView(db, stock){
  const sku = cleanCode(stock.sku || stock.productCode);
  const product = asArray(db.products).find(p => cleanCode(p.sku || p.productCode) === sku) || {};
  const realStock = num(stock.qty || stock.realStock);
  const dmsStock = dmsStockQty(db, sku);
  const openSaleStock = dmsStock > 0 ? Math.max(0, realStock - dmsStock) : realStock;
  return {
    sku,
    productCode: sku,
    productName: stock.name || product.name || product.productName || '',
    warehouseCode: stock.warehouseCode || stock.warehouse || product.warehouse || 'Kho chính',
    realStock,
    dmsStock,
    openSaleStock,
    avgCost: num(stock.avgCost),
    lastCost: num(stock.lastCost),
    updatedAt: stock.updatedAt || ''
  };
}

function normalizeOrderPayload(input){
  const body = input || {};
  return {
    id: body.id || body.orderId || body.orderCode,
    date: body.date || body.orderDate || today(),
    isoDate: body.isoDate || body.createdAt || nowIso(),
    source: body.source || 'NVBH',
    customerCode: body.customerCode,
    customerName: body.customerName,
    staffCode: body.staffCode || body.salesStaffCode,
    staffName: body.staffName || body.salesStaffName,
    deliveryStaffCode: body.deliveryStaffCode,
    deliveryStaffName: body.deliveryStaffName,
    note: body.note || '',
    items: asArray(body.items).map(item => ({
      sku: item.sku || item.productCode,
      name: item.name || item.productName,
      pack: item.pack,
      qty: item.qty !== undefined ? item.qty : item.quantity,
      sale: item.sale !== undefined ? item.sale : item.price,
      discount: item.discount || item.discountPercent || 0,
      displayReward: item.displayReward || 0,
      gsv: item.gsv || 0,
      niv: item.niv || 0,
      tax: item.tax || 0,
      invoiceType: item.invoiceType || ''
    }))
  };
}

exports.listOrders = async (req, res) => {
  try{
    const db = await loadDb();
    let orders = asArray(db.orders);
    const { fromDate, toDate, customerCode, staffCode, deliveryStaffCode, source, status } = req.query || {};
    if(fromDate) orders = orders.filter(o => String(o.date || '').slice(0,10) >= String(fromDate));
    if(toDate) orders = orders.filter(o => String(o.date || '').slice(0,10) <= String(toDate));
    if(customerCode) orders = orders.filter(o => cleanCode(o.customerCode) === cleanCode(customerCode));
    if(staffCode) orders = orders.filter(o => cleanCode(o.staffCode) === cleanCode(staffCode));
    if(deliveryStaffCode) orders = orders.filter(o => cleanCode(o.deliveryStaffCode) === cleanCode(deliveryStaffCode));
    if(source) orders = orders.filter(o => cleanCode(o.source) === cleanCode(source));
    if(status) orders = orders.filter(o => cleanCode(o.workflowStatus || o.status) === cleanCode(status));
    ok(res, { orders, count:orders.length });
  }catch(e){ fail(res, e); }
};

exports.getOrder = async (req, res) => {
  try{
    const db = await loadDb();
    const id = cleanCode(req.params.id);
    const order = asArray(db.orders).find(o => cleanCode(o.id || o.orderCode) === id);
    if(!order) return fail(res, new Error('Không tìm thấy đơn hàng'), 404);
    ok(res, { order });
  }catch(e){ fail(res, e); }
};

exports.createOrder = async (req, res) => {
  try{
    const db = await loadDb();
    const order = orderService.createOrder(db, normalizeOrderPayload(req.body));
    await saveDb(db);
    ok(res, { message:'Tạo đơn hàng thành công', order, data:db });
  }catch(e){ fail(res, e); }
};

exports.cancelOrder = async (req, res) => {
  try{
    const db = await loadDb();
    const order = orderService.cancelOrder(db, req.params.id, req.body?.reason || 'Huỷ đơn');
    await saveDb(db);
    ok(res, { message:'Đã huỷ đơn hàng', order, data:db });
  }catch(e){ fail(res, e); }
};

exports.listInventory = async (req, res) => {
  try{
    const db = await loadDb();
    let rows = asArray(db.stocks).map(s => stockView(db, s));
    const { sku, productCode, warehouseCode, lowStock } = req.query || {};
    const code = sku || productCode;
    if(code) rows = rows.filter(x => cleanCode(x.sku) === cleanCode(code));
    if(warehouseCode) rows = rows.filter(x => cleanCode(x.warehouseCode) === cleanCode(warehouseCode));
    if(lowStock !== undefined) rows = rows.filter(x => x.openSaleStock <= num(lowStock));
    ok(res, { inventory:rows, count:rows.length });
  }catch(e){ fail(res, e); }
};

exports.getInventoryItem = async (req, res) => {
  try{
    const db = await loadDb();
    const sku = cleanCode(req.params.sku);
    const stock = asArray(db.stocks).find(s => cleanCode(s.sku || s.productCode) === sku);
    if(!stock) return fail(res, new Error('Không tìm thấy tồn kho'), 404);
    ok(res, { inventory:stockView(db, stock) });
  }catch(e){ fail(res, e); }
};

exports.receiveInventory = async (req, res) => {
  try{
    const db = await loadDb();
    const body = req.body || {};
    const receipt = {
      id: body.id || body.receiptId || body.docCode || uid('PN_'),
      date: body.date || today(),
      supplier: body.supplier || 'Unilever',
      note: body.note || 'Nhập kho qua API',
      posted: true,
      postedAt: nowIso(),
      items: asArray(body.items).map(item => ({
        sku: item.sku || item.productCode,
        name: item.name || item.productName,
        pack: item.pack || 1,
        qty: item.qty !== undefined ? item.qty : item.quantity,
        cost: item.cost || item.price || 0
      })).filter(item => cleanCode(item.sku) && num(item.qty) > 0)
    };
    if(!receipt.items.length) throw new Error('Phiếu nhập chưa có sản phẩm hợp lệ');
    db.receipts = asArray(db.receipts);
    if(db.receipts.some(r => cleanCode(r.id) === cleanCode(receipt.id))) throw new Error('Mã phiếu nhập đã tồn tại: ' + receipt.id);
    receipt.total = roundMoney(receipt.items.reduce((sum, item) => sum + num(item.qty) * num(item.cost), 0));
    for(const item of receipt.items) inventoryService.receiveStock(db, item);
    db.receipts.push(receipt);
    await saveDb(db);
    ok(res, { message:'Nhập kho thành công', receipt, data:db });
  }catch(e){ fail(res, e); }
};

exports.listDebts = async (req, res) => {
  try{
    const db = await loadDb();
    const debts = debtLedgerService.rebuildDebtSummary(db);
    await saveDb(db);
    ok(res, { debts, debtLedger:asArray(db.debtLedger), count:debts.length });
  }catch(e){ fail(res, e); }
};

exports.getCustomerDebt = async (req, res) => {
  try{
    const db = await loadDb();
    debtLedgerService.rebuildDebtSummary(db);
    const customerCode = cleanCode(req.params.customerCode);
    const debts = asArray(db.debts).filter(d => cleanCode(d.customerCode) === customerCode);
    const ledger = asArray(db.debtLedger).filter(e => cleanCode(e.customerCode) === customerCode);
    const balance = debtLedgerService.balanceByCustomer(db, customerCode);
    ok(res, { customerCode, balance, debts, ledger });
  }catch(e){ fail(res, e); }
};

exports.collectDebt = async (req, res) => {
  try{
    const db = await loadDb();
    const body = req.body || {};
    let payment;
    if(body.orderId || body.orderCode){
      payment = paymentService.recordPayment(db, {
        ...body,
        orderId: body.orderId || body.orderCode,
        cash: body.cash || body.cashPaid || body.amount,
        bank: body.bank || body.bankPaid || 0
      });
    } else {
      const amount = roundMoney(body.amount || body.cash || 0);
      if(amount <= 0) throw new Error('Số tiền thu công nợ phải lớn hơn 0');
      payment = {
        id: body.id || uid('PAY_'),
        date: body.date || nowIso(),
        cash: amount,
        bank: roundMoney(body.bank || 0),
        amount: 0,
        customerCode: body.customerCode,
        customerName: body.customerName || '',
        staffCode: body.staffCode || body.collectedByCode || '',
        staffName: body.staffName || body.collectedBy || '',
        orderId: '',
        note: body.note || 'Thu công nợ theo khách hàng'
      };
      if(!payment.customerCode) throw new Error('Thiếu mã khách hàng');
      db.payments = asArray(db.payments);
      db.payments.push(payment);
      debtLedgerService.postPayment(db, payment);
      cashFundService.postPaymentToFund(db, payment);
    }
    await saveDb(db);
    ok(res, { message:'Ghi nhận thu công nợ thành công', payment, data:db });
  }catch(e){ fail(res, e); }
};

exports.completeDelivery = async (req, res) => {
  try{
    const db = await loadDb();
    const order = deliveryService.completeDelivery(db, req.body || {});
    await saveDb(db);
    ok(res, { message:'Cập nhật giao hàng thành công', order, data:db });
  }catch(e){ fail(res, e); }
};
