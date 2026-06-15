'use strict';

const express = require('express');
const dashboardController = require('../controllers/dashboardController');
const { requireRole } = require('../middlewares/auth.middleware');

const router = express.Router();
const viewDashboard = requireRole(['admin', 'manager', 'accountant']);
const manageTargets = requireRole(['admin', 'manager']);

router.get('/home', viewDashboard, dashboardController.home);
router.get('/targets', viewDashboard, dashboardController.listTargets);
router.put('/targets/:period', manageTargets, dashboardController.saveTargets);

module.exports = router;
