'use strict';

const express = require('express');
const inventoryController = require('../controllers/inventoryController');
const { requireRole } = require('../middlewares/auth.middleware');

const router = express.Router();
const viewInventory = requireRole(['admin', 'manager', 'accountant', 'warehouse', 'sales', 'delivery']);

router.get('/current', requireRole(['admin', 'manager', 'accountant', 'warehouse']), inventoryController.current);
router.post('/check', viewInventory, inventoryController.check);

module.exports = router;
