'use strict';

const express = require('express');
const controller = require('../controllers/excelInteractionController');
const { requireRole } = require('../middlewares/auth.middleware');

const router = express.Router();
const exportExcel = requireRole(['admin', 'manager', 'accountant', 'warehouse', 'sales']);
const pasteImport = requireRole(['admin', 'accountant', 'warehouse']);
const resolveProducts = requireRole(['admin', 'manager', 'accountant', 'warehouse', 'sales', 'delivery']);

router.post('/export', exportExcel, controller.exportWorkbook);
router.post('/import/preview', pasteImport, controller.previewPastedImport);
router.post('/products/resolve', resolveProducts, controller.resolveProducts);

module.exports = router;
