'use strict';

const express = require('express');
const cashbookController = require('../controllers/cashbookController');

const router = express.Router();

router.get('/', cashbookController.list);
router.post('/', cashbookController.create);

module.exports = router;
