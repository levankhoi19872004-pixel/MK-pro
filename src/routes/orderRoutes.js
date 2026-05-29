'use strict';

const express = require('express');
const orderController = require('../controllers/orderController');

const router = express.Router();

router.get('/', orderController.list);
router.post('/', orderController.create);
router.put('/:id', orderController.update);
router.post('/:id/cancel', orderController.cancel);

module.exports = router;
