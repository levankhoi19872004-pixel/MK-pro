'use strict';

const express = require('express');
const inventoryController = require('../controllers/inventoryController');

const router = express.Router();

router.get('/current', inventoryController.current);
router.post('/check', inventoryController.check);

module.exports = router;
