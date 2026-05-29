'use strict';

const express = require('express');
const multer = require('multer');
const excelImportController = require('../controllers/excelImportController');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.post('/preview', upload.single('file'), excelImportController.preview);
router.post('/commit', excelImportController.commit);
router.get('/logs', excelImportController.logs);

module.exports = router;
