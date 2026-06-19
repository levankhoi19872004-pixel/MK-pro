'use strict';

const express = require('express');
const printController = require('../controllers/printController');
const { requireRole } = require('../middlewares/auth.middleware');

const router = express.Router();
const viewPrintDocuments = requireRole(['admin', 'manager', 'accountant', 'warehouse']);

router.use(viewPrintDocuments);

router.get('/types', printController.listTypes);
router.post('/render', printController.render);

// Canonical Print Domain endpoints.
router.post('/orders/batch', printController.renderOrdersBatch);
router.post('/master-orders/batch', printController.renderMasterOrdersBatch);
router.post('/import-orders/aggregate', printController.renderImportOrdersAggregate);
router.post('/master-return-orders/batch', printController.renderMasterReturnOrdersBatch);

router.get('/orders/:id', printController.renderOrder);
router.get('/master-orders/:id', printController.renderMasterOrder);
router.get('/import-orders/:id', printController.renderImportOrder);
router.get('/master-return-orders/:id', printController.renderMasterReturnOrder);
router.get('/receipts/:id', printController.renderPaymentReceipt);

// Backward-compatible endpoint used by existing integrations.
router.get('/:type/:id', printController.renderById);

module.exports = router;
