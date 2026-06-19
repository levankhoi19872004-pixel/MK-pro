'use strict';

const express = require('express');
const customerController = require('../controllers/customerController');
const { requireRole } = require('../middlewares/auth.middleware');

const router = express.Router();
const manageCustomers = requireRole(['admin', 'manager', 'accountant']);
const viewCustomers = requireRole(['admin', 'manager', 'accountant', 'warehouse']);

router.get('/search', viewCustomers, customerController.search);
router.get('/', viewCustomers, customerController.list);
router.post('/', manageCustomers, customerController.create);
router.put('/:id', manageCustomers, customerController.update);
router.patch('/:id/status', manageCustomers, customerController.setStatus);
router.delete('/:id', manageCustomers, customerController.remove);
router.post('/bulk-delete', manageCustomers, customerController.bulkDelete);

module.exports = router;
