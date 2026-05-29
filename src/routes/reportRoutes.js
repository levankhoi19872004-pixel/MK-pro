'use strict';

const express = require('express');
const reportController = require('../controllers/reportController');

const router = express.Router();

router.get('/stock', reportController.stock);
router.get('/debts', reportController.debts);

module.exports = router;
