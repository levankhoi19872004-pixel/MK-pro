const dataService = require('../services/dataService');
const orderService = require('../services/orderService');
const deliveryService = require('../services/deliveryService');
const paymentService = require('../services/paymentService');
const cashFundService = require('../services/cashFundService');
const debtLedgerService = require('../services/debtLedgerService');
const importEngine = require('../services/importEngine');

async function load(){ return dataService.getDb(); }
async function persist(db){ return dataService.saveDb(db); }
function ok(res, data){ res.json({ success:true, ...data }); }
function fail(res, err){ res.status(400).json({ success:false, error:err.message || String(err) }); }

exports.createOrder = async (req,res) => { try{ const db = await load(); const order = orderService.createOrder(db, req.body || {}); await persist(db); ok(res,{ order, data:db }); }catch(e){ fail(res,e); } };
exports.cancelOrder = async (req,res) => { try{ const db = await load(); const order = orderService.cancelOrder(db, req.params.id, req.body?.reason); await persist(db); ok(res,{ order, data:db }); }catch(e){ fail(res,e); } };
exports.completeDelivery = async (req,res) => { try{ const db = await load(); const order = deliveryService.completeDelivery(db, req.body || {}); await persist(db); ok(res,{ order, data:db }); }catch(e){ fail(res,e); } };
exports.recordPayment = async (req,res) => { try{ const db = await load(); const payment = paymentService.recordPayment(db, req.body || {}); await persist(db); ok(res,{ payment, data:db }); }catch(e){ fail(res,e); } };
exports.addCashFund = async (req,res) => { try{ const db = await load(); const fund = cashFundService.addCashFund(db, req.body || {}); await persist(db); ok(res,{ fund, data:db }); }catch(e){ fail(res,e); } };
exports.rebuildLedger = async (req,res) => { try{ const db = await load(); const result = importEngine.rebuildLedgersFromCurrentOrders(db); await persist(db); ok(res,{ result, data:db }); }catch(e){ fail(res,e); } };
exports.debtSummary = async (req,res) => { try{ const db = await load(); const debts = debtLedgerService.rebuildDebtSummary(db); await persist(db); ok(res,{ debts, debtLedger:db.debtLedger || [] }); }catch(e){ fail(res,e); } };
exports.importRows = async (req,res) => { try{ const db = await load(); const { type, rows, source } = req.body || {}; let result; if(type === 'products') result = importEngine.commitProducts(db, rows); else if(type === 'receipts' || type === 'receive') result = importEngine.commitReceipts(db, rows); else if(type === 'orders' || type === 'dmsOrders') result = importEngine.commitOrders(db, rows, source || (type === 'dmsOrders' ? 'DMS' : 'NVBH')); else throw new Error('Loại import chưa hỗ trợ qua core API'); await persist(db); ok(res,{ result, data:db }); }catch(e){ fail(res,e); } };
