'use strict';

const express = require('express');
const multer = require('multer');
const excelImportController = require('../controllers/excelImportController');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.post('/preview', upload.fields([{ name: 'file', maxCount: 1 }, { name: 'files', maxCount: 20 }]), excelImportController.preview);
router.post('/commit', excelImportController.commit);
router.post('/direct', upload.fields([{ name: 'file', maxCount: 1 }, { name: 'files', maxCount: 20 }]), excelImportController.direct);
router.get('/logs', excelImportController.logs);

module.exports = router;
