'use strict';

const express = require('express');
const receiptController = require('../controllers/receiptController');
const { requireRole } = require('../middlewares/auth.middleware');

const router = express.Router();
const manageReceipts = requireRole(['admin', 'accountant']);

router.get('/', requireRole(['admin', 'accountant', 'manager']), receiptController.list);
router.post('/', manageReceipts, receiptController.create);
router.delete('/:id', manageReceipts, receiptController.remove);

module.exports = router;
