const router = require('express').Router();
const reportService = require('../services/s3imReportService');

function sendHtml(res, html){ res.setHeader('Content-Type','text/html; charset=utf-8'); res.send(html); }
function fail(res, e){ res.status(400).json({ success:false, error:e.message || String(e) }); }

router.get('/print/order/:id', async (req,res)=>{ try{ sendHtml(res, await reportService.orderPrint(req.params.id)); }catch(e){ fail(res,e); } });
router.get('/print/master/:id', async (req,res)=>{ try{ sendHtml(res, await reportService.masterPrint(req.params.id)); }catch(e){ fail(res,e); } });
router.get('/reports/sales', async (req,res)=>{ try{ res.json({ success:true, ...(await reportService.salesReport(req.query || {})) }); }catch(e){ fail(res,e); } });
router.get('/reports/sales/print', async (req,res)=>{ try{ sendHtml(res, await reportService.salesReportHtml(req.query || {})); }catch(e){ fail(res,e); } });
router.get('/reports/debt', async (req,res)=>{ try{ res.json({ success:true, ...(await reportService.debtReport(req.query || {})) }); }catch(e){ fail(res,e); } });
router.get('/reports/debt/print', async (req,res)=>{ try{ sendHtml(res, await reportService.debtReportHtml(req.query || {})); }catch(e){ fail(res,e); } });

module.exports = router;
