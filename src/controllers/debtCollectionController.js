'use strict';

const DebtCollectionService = require('../services/DebtCollectionService');

function sendResult(res, result = {}, successStatus = 200) {
  if (result.error) {
    return res.status(result.status || 400).json({ ok: false, message: result.error, code: result.code });
  }
  const status = result.statusCode || result.status || successStatus;
  const body = result.body || result;
  return res.status(status).json({ ok: true, ...body });
}


async function submit(req, res) {
  try {
    const result = await DebtCollectionService.submitDebtCollection({
      body: req.body || {},
      mobileUser: req.user || req.body?.collector || {}
    });
    return sendResult(res, result, 201);
  } catch (err) {
    return res.status(err.status || 400).json({ ok: false, message: err.message || 'Không ghi nhận được phiếu thu nợ' });
  }
}

async function list(req, res) {
  try {
    const result = await DebtCollectionService.listDebtCollections(req.query || {});
    return res.json({ ok: true, source: 'DebtCollectionService', ...result });
  } catch (err) {
    return res.status(500).json({ ok: false, message: process.env.NODE_ENV === 'production' ? 'Không tải được danh sách thu nợ' : (err.message || 'Không tải được danh sách thu nợ') });
  }
}

async function confirm(req, res) {
  try {
    const result = await DebtCollectionService.confirmDebtCollection(req.params.id, {
      ...(req.body || {}),
      user: req.user || {},
      accountingUserName: req.user?.name || req.user?.fullName || req.user?.username || req.body?.accountingUserName || ''
    });
    return sendResult(res, result);
  } catch (err) {
    return res.status(err.status || 400).json({ ok: false, message: err.message || 'Không xác nhận được phiếu thu nợ' });
  }
}

async function reject(req, res) {
  try {
    const result = await DebtCollectionService.rejectDebtCollection(req.params.id, {
      ...(req.body || {}),
      user: req.user || {},
      accountingUserName: req.user?.name || req.user?.fullName || req.user?.username || req.body?.accountingUserName || ''
    });
    return sendResult(res, result);
  } catch (err) {
    return res.status(err.status || 400).json({ ok: false, message: err.message || 'Không từ chối được phiếu thu nợ' });
  }
}

module.exports = {
  submit,
  list,
  confirm,
  reject
};
