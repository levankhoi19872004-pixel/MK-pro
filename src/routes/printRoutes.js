'use strict';

const express = require('express');
const printController = require('../controllers/printController');

const router = express.Router();

router.post('/render', printController.render);
router.get('/:type/:id', printController.renderById);

module.exports = router;
