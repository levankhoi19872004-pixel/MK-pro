'use strict';

const express = require('express');
const importOrderController = require('../controllers/importOrderController');
const { requireRole } = require('../middlewares/auth.middleware');

const router = express.Router();
const manageImportOrders = requireRole(['admin', 'accountant', 'warehouse']);
const viewImportOrders = requireRole(['admin', 'manager', 'accountant', 'warehouse']);

router.get('/', viewImportOrders, importOrderController.list);
router.post('/', manageImportOrders, importOrderController.create);
router.put('/:id', manageImportOrders, importOrderController.update);
router.post('/:id/post', manageImportOrders, importOrderController.post);
router.post('/:id/cancel', manageImportOrders, importOrderController.cancel);

module.exports = router;
