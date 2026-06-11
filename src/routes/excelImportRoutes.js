'use strict';

const express = require('express');
const multer = require('multer');
const excelImportController = require('../controllers/excelImportController');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: Number(process.env.IMPORT_MAX_FILE_SIZE || 10 * 1024 * 1024),
    files: 20
  },
  fileFilter(req, file, cb) {
    if (!/\.xlsx$/i.test(file.originalname || '')) {
      return cb(new Error('Chỉ hỗ trợ file Excel .xlsx'));
    }
    cb(null, true);
  }
});

router.post('/preview', upload.fields([{ name: 'file', maxCount: 1 }, { name: 'files', maxCount: 20 }]), excelImportController.preview);
router.post('/commit', excelImportController.commit);
router.post('/direct', upload.fields([{ name: 'file', maxCount: 1 }, { name: 'files', maxCount: 20 }]), excelImportController.direct);
router.get('/logs', excelImportController.logs);

module.exports = router;
