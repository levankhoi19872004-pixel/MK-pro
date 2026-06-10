'use strict';

const express = require('express');
const productController = require('../controllers/productController');

const router = express.Router();

router.get('/search', productController.search);
router.get('/', productController.list);
router.post('/', productController.create);
router.put('/:id', productController.update);
router.patch('/:id/status', productController.setStatus);

module.exports = router;
