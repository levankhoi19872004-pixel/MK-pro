const router = require('express').Router();
const svc = require('../services/v42WorkflowService');
const allowed = new Set(['products','customers','staff','deliveryStaff','stocks','receipts','orders','masterOrders','debts','debtLedger','payments','cashFund','documents','stockJournal','stockShortages','auditLogs','stockAdjustments','promotions','dmsStocks']);
function user(req){ return (req.headers['x-user'] || 'system').toString(); }
router.get('/v42/health', (req,res)=>res.json({ ok:true, version:'v42-clean-rebuild' }));
router.get('/v42/dashboard', async (req,res,next)=>{ try{ res.json(await svc.dashboard(req.query.date)); }catch(e){ next(e); } });
router.get('/v42/:collection', async (req,res,next)=>{ try{ const c=req.params.collection; if(!allowed.has(c)) return res.status(404).json({error:'Unknown collection'}); res.json(await svc.list(c)); }catch(e){ next(e); } });
router.post('/v42/:collection', async (req,res,next)=>{ try{ const c=req.params.collection; if(!allowed.has(c)) return res.status(404).json({error:'Unknown collection'}); res.json(await svc.saveItem(c, req.body || {}, user(req))); }catch(e){ next(e); } });
router.post('/v42/receipts/create', async (req,res,next)=>{ try{ res.json(await svc.createReceipt(req.body || {}, user(req))); }catch(e){ next(e); } });
router.post('/v42/orders/create', async (req,res,next)=>{ try{ res.json(await svc.createOrder(req.body || {}, user(req))); }catch(e){ next(e); } });
router.post('/v42/payments/create', async (req,res,next)=>{ try{ res.json(await svc.createPayment(req.body || {}, user(req))); }catch(e){ next(e); } });
router.post('/v42/cash/create', async (req,res,next)=>{ try{ res.json(await svc.createCash(req.body || {}, user(req))); }catch(e){ next(e); } });
router.post('/v42/stock/adjust', async (req,res,next)=>{ try{ res.json(await svc.adjustStock(req.body || {}, user(req))); }catch(e){ next(e); } });
router.get('/v42/system/backup', async (req,res,next)=>{ try{ res.json(await svc.createBackup()); }catch(e){ next(e); } });
module.exports = router;
