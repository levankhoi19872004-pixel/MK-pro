const express = require('express');
const router = express.Router();

const { readData, writeData } = require('../config/db');
const { buildReversePreview, reverseDocument } = require('../services/reverseService');

function sendError(res, error, status = 400) {
  return res.status(status).json({
    success: false,
    message: error.message,
    details: error.details || undefined
  });
}

router.get('/api/documents/:id/reverse-preview', async (req, res) => {
  try {
    const data = await readData();
    const preview = buildReversePreview(data, req.params.id);
    res.json({ success: true, data: preview });
  } catch (error) {
    sendError(res, error, error.message === 'Không tìm thấy chứng từ' ? 404 : 400);
  }
});

router.post('/api/documents/:id/reverse', async (req, res) => {
  try {
    const data = await readData();
    const result = reverseDocument(data, req.params.id, req.body || {});
    await writeData(data);
    res.json({
      success: true,
      message: 'Đã hủy chứng từ và sinh bút toán đảo chuẩn',
      data: result
    });
  } catch (error) {
    sendError(res, error, error.message === 'Không tìm thấy chứng từ' ? 404 : 400);
  }
});

module.exports = router;
