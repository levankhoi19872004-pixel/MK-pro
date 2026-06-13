'use strict';

const express = require('express');
const userController = require('../controllers/userController');
const { requireRole } = require('../middlewares/auth.middleware');

const router = express.Router();

router.get('/users', requireRole(['admin', 'manager']), userController.listUsers);
router.post('/users', requireRole(['admin']), userController.saveUser);
router.delete('/users/:id', requireRole(['admin']), userController.deleteUser);
router.get('/staffs', requireRole(['admin', 'manager', 'accountant', 'warehouse']), userController.listStaffs);
router.get('/roles', requireRole(['admin', 'manager']), userController.listRoles);
router.get('/permissions', requireRole(['admin']), userController.listPermissions);

module.exports = router;
