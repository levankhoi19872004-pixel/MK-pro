'use strict';

const express = require('express');
const fundController = require('../controllers/fundController');
const { requireRole } = require('../middlewares/auth.middleware');

const router = express.Router();
const viewFund = requireRole(['admin', 'accountant', 'manager']);
const manageFund = requireRole(['admin', 'accountant']);

router.get('/ledger', viewFund, fundController.listLedger);
router.get(
  '/delivery-cash-in-transit',
  requireRole(['admin', 'accountant', 'manager']),
  fundController.deliveryCashInTransit
);
router.get('/delivery-cash-submissions', viewFund, fundController.listDeliverySubmissions);
router.get('/expenses', viewFund, fundController.listExpenses);
router.get('/transfers', viewFund, fundController.listTransfers);
router.post('/delivery-cash-submissions/preview', manageFund, fundController.previewDeliverySubmission);
router.post('/delivery-cash-submissions', manageFund, fundController.createDeliverySubmission);
router.put('/delivery-cash-submissions/:id', manageFund, fundController.updateDeliverySubmission);
router.post('/delivery-cash-submissions/:id/confirm', manageFund, fundController.confirmDeliverySubmission);
router.post('/expenses', requireRole(['admin', 'accountant']), fundController.createExpense);
router.put('/expenses/:id', manageFund, fundController.updateExpense);
router.post('/expenses/:id/confirm', manageFund, fundController.confirmExpense);
router.post('/transfers', requireRole(['admin', 'accountant']), fundController.createTransfer);
router.put('/transfers/:id', manageFund, fundController.updateTransfer);
router.post('/transfers/:id/confirm', manageFund, fundController.confirmTransfer);

module.exports = router;
