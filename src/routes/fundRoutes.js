'use strict';

const express = require('express');
const fundController = require('../controllers/fundController');

const router = express.Router();

router.get('/ledger', fundController.listLedger);
router.get('/delivery-cash-submissions', fundController.listDeliverySubmissions);
router.get('/expenses', fundController.listExpenses);
router.get('/transfers', fundController.listTransfers);
router.post('/delivery-cash-submissions/preview', fundController.previewDeliverySubmission);
router.post('/delivery-cash-submissions', fundController.createDeliverySubmission);
router.post('/delivery-cash-submissions/:id/confirm', fundController.confirmDeliverySubmission);
router.post('/expenses', fundController.createExpense);
router.post('/transfers', fundController.createTransfer);

module.exports = router;
