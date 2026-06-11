'use strict';

const multer = require('multer');

const IMPORT_MAX_FILE_SIZE = Number(process.env.IMPORT_MAX_FILE_SIZE || 10 * 1024 * 1024);
const IMPORT_MAX_FILES = Number(process.env.IMPORT_MAX_FILES || 2);
const IMPORT_MAX_TOTAL_SIZE = Number(
  process.env.IMPORT_MAX_TOTAL_SIZE || IMPORT_MAX_FILE_SIZE * IMPORT_MAX_FILES
);

const XLSX_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream',
  'application/zip'
]);

function isXlsxExtension(fileName = '') {
  return /\.xlsx$/i.test(String(fileName || '').trim());
}

function isZipMagic(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return false;

  // XLSX là ZIP container, file bình thường bắt đầu bằng PK\x03\x04.
  return (
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04
  );
}

function hasXlsxInternalSignature(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) return false;

  return (
    buffer.includes(Buffer.from('[Content_Types].xml')) &&
    buffer.includes(Buffer.from('xl/workbook.xml'))
  );
}

function normalizeUploadedFiles(req) {
  const files = [];

  if (req.file) files.push(req.file);

  if (Array.isArray(req.files)) {
    files.push(...req.files);
  } else if (req.files && typeof req.files === 'object') {
    Object.values(req.files).forEach((list) => {
      if (Array.isArray(list)) files.push(...list);
    });
  }

  return files.filter((file) => file && file.buffer);
}

function rejectLargeUploadByContentLength(req, res, next) {
  const contentLength = Number(req.headers['content-length'] || 0);

  if (contentLength > IMPORT_MAX_TOTAL_SIZE) {
    return res.status(413).json({
      ok: false,
      message: `File import quá lớn. Tổng dung lượng tối đa là ${Math.round(IMPORT_MAX_TOTAL_SIZE / 1024 / 1024)}MB`
    });
  }

  return next();
}

const uploadImportExcel = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: IMPORT_MAX_FILE_SIZE,
    files: IMPORT_MAX_FILES,
    fields: 20,
    parts: IMPORT_MAX_FILES + 20,
    fieldSize: 64 * 1024
  },
  fileFilter(req, file, cb) {
    if (!isXlsxExtension(file.originalname || '')) {
      return cb(new Error('Chỉ hỗ trợ file Excel .xlsx'));
    }

    if (file.mimetype && !XLSX_MIME_TYPES.has(file.mimetype)) {
      return cb(new Error('File Excel không đúng MIME type'));
    }

    return cb(null, true);
  }
});

function handleImportUpload(uploadMiddleware) {
  return function runImportUpload(req, res, next) {
    uploadMiddleware(req, res, (err) => {
      if (!err) return next();

      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({
            ok: false,
            message: `Mỗi file Excel không được vượt quá ${Math.round(IMPORT_MAX_FILE_SIZE / 1024 / 1024)}MB`
          });
        }

        if (err.code === 'LIMIT_FILE_COUNT') {
          return res.status(413).json({
            ok: false,
            message: `Mỗi lần import tối đa ${IMPORT_MAX_FILES} file`
          });
        }

        return res.status(400).json({
          ok: false,
          message: `Upload không hợp lệ: ${err.code}`
        });
      }

      return res.status(400).json({
        ok: false,
        message: err.message || 'File upload không hợp lệ'
      });
    });
  };
}

function validateUploadedExcelFiles(req, res, next) {
  const files = normalizeUploadedFiles(req);

  if (!files.length) {
    return res.status(400).json({
      ok: false,
      message: 'Chưa có file Excel để import'
    });
  }

  if (files.length > IMPORT_MAX_FILES) {
    return res.status(413).json({
      ok: false,
      message: `Mỗi lần import tối đa ${IMPORT_MAX_FILES} file`
    });
  }

  const totalSize = files.reduce((sum, file) => sum + Number(file.size || file.buffer?.length || 0), 0);

  if (totalSize > IMPORT_MAX_TOTAL_SIZE) {
    return res.status(413).json({
      ok: false,
      message: `Tổng dung lượng file import không được vượt quá ${Math.round(IMPORT_MAX_TOTAL_SIZE / 1024 / 1024)}MB`
    });
  }

  for (const file of files) {
    if (!isXlsxExtension(file.originalname || '')) {
      return res.status(400).json({
        ok: false,
        message: `File ${file.originalname || ''} không phải .xlsx`
      });
    }

    if (!isZipMagic(file.buffer)) {
      return res.status(400).json({
        ok: false,
        message: `File ${file.originalname || ''} không đúng định dạng XLSX`
      });
    }

    if (!hasXlsxInternalSignature(file.buffer)) {
      return res.status(400).json({
        ok: false,
        message: `File ${file.originalname || ''} không phải workbook XLSX hợp lệ`
      });
    }
  }

  req.importFiles = files;
  return next();
}

const multiExcelFields = [
  { name: 'file', maxCount: 1 },
  { name: 'files', maxCount: IMPORT_MAX_FILES }
];

module.exports = {
  IMPORT_MAX_FILE_SIZE,
  IMPORT_MAX_FILES,
  IMPORT_MAX_TOTAL_SIZE,
  uploadImportExcel,
  handleImportUpload,
  rejectLargeUploadByContentLength,
  validateUploadedExcelFiles,
  multiExcelFields,
  isXlsxExtension,
  isZipMagic,
  hasXlsxInternalSignature,
  normalizeUploadedFiles
};
