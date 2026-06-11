'use strict';

const express = require('express');
const multer = require('multer');
const importRuntimeController = require('../controllers/importRuntimeController');

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

router.post('/preview', upload.single('file'), importRuntimeController.preview);
router.post('/commit', importRuntimeController.commit);
router.get('/logs', importRuntimeController.logs);

module.exports = router;
