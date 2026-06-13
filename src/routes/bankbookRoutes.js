'use strict';

const express = require('express');
const bankbookController = require('../controllers/bankbookController');
const { requireRole } = require('../middlewares/auth.middleware');

const router = express.Router();
const viewBankbook = requireRole(['admin', 'manager', 'accountant']);

router.get('/', viewBankbook, bankbookController.list);

module.exports = router;
