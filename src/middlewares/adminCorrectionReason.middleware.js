'use strict';

function requireCorrectionReason(req, res, next) {
  const reason = String(req.body?.reason || req.body?.rejectReason || '').trim();
  if (reason.length >= 3) return next();
  return res.status(400).json({
    ok: false,
    success: false,
    message: 'Cần nhập lý do chỉnh sửa số liệu'
  });
}

module.exports = { requireCorrectionReason };
