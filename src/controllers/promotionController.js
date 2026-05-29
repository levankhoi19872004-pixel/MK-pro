'use strict';

const promotionService = require('../services/promotionService');

async function list(req, res) {
  try {
    const promotions = await promotionService.listPromotions(req.query);
    res.json({ ok: true, promotions });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không tải được khuyến mại', error: err.message });
  }
}

async function save(req, res) {
  try {
    const result = await promotionService.savePromotion(req.body);
    if (result.error) return res.status(result.status || 400).json({ ok: false, message: result.error });
    res.json({ ok: true, message: 'Đã lưu chương trình khuyến mại', promotion: result.promotion });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không lưu được khuyến mại', error: err.message });
  }
}

async function remove(req, res) {
  try {
    const result = await promotionService.deletePromotion(req.params.id);
    if (result.error) return res.status(result.status || 404).json({ ok: false, message: result.error });
    res.json({ ok: true, message: 'Đã xóa chương trình khuyến mại' });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không xóa được khuyến mại', error: err.message });
  }
}

module.exports = { list, save, remove };
