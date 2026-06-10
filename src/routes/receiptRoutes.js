'use strict';

const express = require('express');
const receiptController = require('../controllers/receiptController');

const router = express.Router();

router.get('/', receiptController.list);
router.post('/', receiptController.create);
router.delete('/:id', receiptController.remove);

module.exports = router;
