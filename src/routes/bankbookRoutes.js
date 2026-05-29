'use strict';

const express = require('express');
const bankbookController = require('../controllers/bankbookController');

const router = express.Router();

router.get('/', bankbookController.list);

module.exports = router;
