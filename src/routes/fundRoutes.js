'use strict';

const express = require('express');
const fundController = require('../controllers/fundController');
const { requireRole } = require('../middlewares/auth.middleware');

const router = express.Router();

router.get('/ledger', fundController.listLedger);
router.get('/delivery-cash-submissions', fundController.listDeliverySubmissions);
router.get('/expenses', fundController.listExpenses);
router.get('/transfers', fundController.listTransfers);
router.post('/delivery-cash-submissions/preview', fundController.previewDeliverySubmission);
router.post('/delivery-cash-submissions', requireRole(['admin', 'accountant']), fundController.createDeliverySubmission);
router.put('/delivery-cash-submissions/:id', requireRole(['admin', 'accountant']), fundController.updateDeliverySubmission);
router.post('/delivery-cash-submissions/:id/confirm', requireRole(['admin', 'accountant']), fundController.confirmDeliverySubmission);
router.post('/expenses', requireRole(['admin', 'accountant']), fundController.createExpense);
router.put('/expenses/:id', requireRole(['admin', 'accountant']), fundController.updateExpense);
router.post('/expenses/:id/confirm', requireRole(['admin', 'accountant']), fundController.confirmExpense);
router.post('/transfers', requireRole(['admin', 'accountant']), fundController.createTransfer);
router.put('/transfers/:id', requireRole(['admin', 'accountant']), fundController.updateTransfer);
router.post('/transfers/:id/confirm', requireRole(['admin', 'accountant']), fundController.confirmTransfer);

module.exports = router;
