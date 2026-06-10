'use strict';

const express = require('express');
const multer = require('multer');
const importRuntimeController = require('../controllers/importRuntimeController');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.post('/preview', upload.single('file'), importRuntimeController.preview);
router.post('/commit', importRuntimeController.commit);
router.get('/logs', importRuntimeController.logs);

module.exports = router;
