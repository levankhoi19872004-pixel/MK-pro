'use strict';

const express = require('express');
const importOrderController = require('../controllers/importOrderController');

const router = express.Router();

router.get('/', importOrderController.list);
router.post('/', importOrderController.create);
router.put('/:id', importOrderController.update);
router.post('/:id/post', importOrderController.post);

module.exports = router;
