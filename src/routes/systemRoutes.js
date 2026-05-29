'use strict';

const express = require('express');
const systemController = require('../controllers/systemController');

const router = express.Router();

router.get('/health', systemController.health);
router.get('/health/db', systemController.dbHealth);
router.get('/data', systemController.data);
router.get('/system/data-source', systemController.dataSource);

module.exports = router;
