const router = require('express').Router();
const c = require('../controllers/professionalController');

router.get('/professional/documents', c.listDocuments);
router.post('/professional/documents', c.createDocument);
router.post('/professional/documents/:id/post', c.postDocument);
router.post('/professional/documents/:id/cancel', c.cancelDocument);

router.get('/professional/stock-journals', c.listStockJournal);
router.post('/professional/stock-journals', c.addStockJournal);

router.get('/professional/debt-ledger', c.listDebtLedger);
router.post('/professional/debt-ledger', c.addDebtEntry);
router.get('/professional/reports/debt-summary', c.debtSummary);

router.get('/professional/reports/sales', c.salesReport);
router.get('/professional/reports/inventory', c.inventoryReport);
router.get('/professional/reports/cash', c.cashReport);

router.get('/professional/audit-logs', c.auditLogs);
router.get('/professional/backup', c.backup);

module.exports = router;
