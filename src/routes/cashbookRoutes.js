'use strict';

const express = require('express');
const cashbookController = require('../controllers/cashbookController');
const { requireRole } = require('../middlewares/auth.middleware');

const router = express.Router();
const manageCashbook = requireRole(['admin', 'accountant']);

router.get('/', requireRole(['admin', 'accountant', 'manager']), cashbookController.list);
router.post('/', manageCashbook, cashbookController.create);

module.exports = router;
