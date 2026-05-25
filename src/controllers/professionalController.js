const dataService = require('../services/dataService');
const documentService = require('../services/documentService');
const stockJournalService = require('../services/stockJournalService');
const debtProfessionalService = require('../services/debtProfessionalService');
const reportProfessionalService = require('../services/reportProfessionalService');
const auditLogService = require('../services/auditLogService');
const backupService = require('../services/backupService');

async function loadDb(){ return dataService.getDb(); }
async function saveDb(db){ return dataService.saveDb(db); }
function ok(res, payload = {}){ res.json({ success:true, ...payload }); }
function fail(res, error, status = 400){ res.status(status).json({ success:false, error:error.message || String(error), details:error.details || undefined }); }
function userFromReq(req){ return req.user || req.body?.user || {}; }

exports.listDocuments = async (req, res) => { try{ const db = await loadDb(); ok(res, { documents: documentService.listDocuments(db, req.query), count: documentService.listDocuments(db, req.query).length }); }catch(e){ fail(res,e); } };
exports.createDocument = async (req, res) => { try{ const db = await loadDb(); const doc = documentService.createDocument(db, req.body, userFromReq(req)); await saveDb(db); ok(res, { message:'Tạo chứng từ thành công', document:doc, data:db }); }catch(e){ fail(res,e); } };
exports.postDocument = async (req, res) => { try{ const db = await loadDb(); const doc = documentService.postDocument(db, req.params.id, userFromReq(req)); await saveDb(db); ok(res, { message:'Đã ghi sổ chứng từ', document:doc, data:db }); }catch(e){ fail(res,e); } };
exports.cancelDocument = async (req, res) => { try{ const db = await loadDb(); const doc = documentService.cancelDocument(db, req.params.id, req.body?.reason || '', userFromReq(req)); await saveDb(db); ok(res, { message:'Đã huỷ chứng từ', document:doc, data:db }); }catch(e){ fail(res,e); } };

exports.listStockJournal = async (req, res) => { try{ const db = await loadDb(); const rows = stockJournalService.listStockJournal(db, req.query); ok(res, { stockJournals:rows, count:rows.length }); }catch(e){ fail(res,e); } };
exports.addStockJournal = async (req, res) => { try{ const db = await loadDb(); const row = stockJournalService.addStockJournal(db, req.body, userFromReq(req)); await saveDb(db); ok(res, { message:'Đã thêm nhật ký kho', stockJournal:row, data:db }); }catch(e){ fail(res,e); } };

exports.listDebtLedger = async (req, res) => { try{ const db = await loadDb(); let rows = debtProfessionalService.ensure(db); if(req.query.customerCode) rows = rows.filter(x => String(x.customerCode) === String(req.query.customerCode)); ok(res, { debtLedger:rows, count:rows.length }); }catch(e){ fail(res,e); } };
exports.addDebtEntry = async (req, res) => { try{ const db = await loadDb(); const row = debtProfessionalService.addDebtEntry(db, req.body, userFromReq(req)); await saveDb(db); ok(res, { message:'Đã ghi công nợ', debtEntry:row, data:db }); }catch(e){ fail(res,e); } };
exports.debtSummary = async (req, res) => { try{ const db = await loadDb(); ok(res, reportProfessionalService.debtSummary(db, req.query)); }catch(e){ fail(res,e); } };

exports.salesReport = async (req, res) => { try{ const db = await loadDb(); ok(res, reportProfessionalService.salesToday(db, req.query)); }catch(e){ fail(res,e); } };
exports.inventoryReport = async (req, res) => { try{ const db = await loadDb(); ok(res, reportProfessionalService.inventorySummary(db)); }catch(e){ fail(res,e); } };
exports.cashReport = async (req, res) => { try{ const db = await loadDb(); ok(res, reportProfessionalService.cashSummary(db, req.query)); }catch(e){ fail(res,e); } };

exports.auditLogs = async (req, res) => { try{ const db = await loadDb(); const rows = auditLogService.listLogs(db, req.query); ok(res, { auditLogs:rows, count:rows.length }); }catch(e){ fail(res,e); } };
exports.backup = async (req, res) => { try{ const db = await loadDb(); ok(res, { backup: backupService.makeSnapshot(db) }); }catch(e){ fail(res,e); } };
