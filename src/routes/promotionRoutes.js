'use strict';

const express = require('express');
const promotionController = require('../controllers/promotionController');

const router = express.Router();

router.get('/', promotionController.list);
router.post('/', promotionController.save);
router.delete('/:id', promotionController.remove);

module.exports = router;
