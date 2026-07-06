'use strict';

const express = require('express');
const controller = require('../controllers/notificationController');

const router = express.Router();

router.get('/summary', controller.summary);
router.get('/', controller.list);
router.post('/read-all', controller.markAllRead);
router.post('/:id/read', controller.markRead);
router.get('/:id', controller.detail);

module.exports = router;
