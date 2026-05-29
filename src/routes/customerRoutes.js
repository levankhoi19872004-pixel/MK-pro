'use strict';

const express = require('express');
const customerController = require('../controllers/customerController');

const router = express.Router();

router.get('/search', customerController.search);
router.get('/', customerController.list);
router.post('/', customerController.create);
router.put('/:id', customerController.update);
router.patch('/:id/status', customerController.setStatus);
router.delete('/:id', customerController.remove);
router.post('/bulk-delete', customerController.bulkDelete);

module.exports = router;
