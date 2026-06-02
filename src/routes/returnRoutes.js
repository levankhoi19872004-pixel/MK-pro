'use strict';

const express = require('express');
const returnOrderController = require('../controllers/returnOrderController');

const router = express.Router();

router.get('/', returnOrderController.list);
router.post('/', returnOrderController.create);
router.put('/:id/items', returnOrderController.updateItems);

module.exports = router;
