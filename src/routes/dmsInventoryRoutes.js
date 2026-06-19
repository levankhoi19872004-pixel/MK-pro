'use strict';

const express = require('express');
const multer = require('multer');
const path = require('node:path');
const { requireRole } = require('../middlewares/auth.middleware');
const controller = require('../controllers/dmsInventoryController');

const router = express.Router();
const viewRoles = requireRole(['admin', 'manager', 'accountant', 'warehouse']);
const manageRoles = requireRole(['admin', 'accountant', 'warehouse']);
const maxBytes = Math.max(1024 * 1024, Number(process.env.DMS_INVENTORY_UPLOAD_MAX_BYTES || 10 * 1024 * 1024));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxBytes, files: 1 },
  fileFilter(req, file, callback) {
    const ext = path.extname(String(file.originalname || '')).toLowerCase();
    if (ext !== '.xlsx') {
      const err = new Error('File tồn DMS phải có định dạng .xlsx');
      err.status = 400;
      return callback(err);
    }
    return callback(null, true);
  }
});

function uploadSingle(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (!err) return next();
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : (err.status || 400);
    return res.status(status).json({
      ok: false,
      success: false,
      message: err.code === 'LIMIT_FILE_SIZE'
        ? `File vượt quá giới hạn ${Math.round(maxBytes / 1024 / 1024)} MB`
        : (err.message || 'Không nhận được file tồn DMS')
    });
  });
}

router.get('/latest', viewRoles, controller.latest);
router.get('/history', viewRoles, controller.history);
router.post('/preview', manageRoles, uploadSingle, controller.preview);
router.post('/:importId/commit', manageRoles, controller.commit);

module.exports = router;
