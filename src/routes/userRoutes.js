'use strict';

const express = require('express');
const userController = require('../controllers/userController');

const router = express.Router();

router.get('/users', userController.listUsers);
router.post('/users', userController.saveUser);
router.delete('/users/:id', userController.deleteUser);
router.get('/staffs', userController.listStaffs);
router.get('/roles', userController.listRoles);
router.get('/permissions', userController.listPermissions);

module.exports = router;
