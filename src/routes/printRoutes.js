'use strict';

const express = require('express');
const printController = require('../controllers/printController');

const router = express.Router();

router.get('/types', printController.listTypes);
router.post('/render', printController.render);

// Friendly document-specific endpoints.
router.get('/orders/:id', printController.renderOrder);
router.get('/master-orders/:id', printController.renderMasterOrder);
router.get('/import-orders/:id', printController.renderImportOrder);
router.get('/receipts/:id', printController.renderPaymentReceipt);

// Backward-compatible endpoint used by the existing UI.
router.get('/:type/:id', printController.renderById);

module.exports = router;
