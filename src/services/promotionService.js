'use strict';

const promotionRepository = require('../repositories/promotionRepository');
const { makeId } = require('../utils/common.util');

function normalizeProductCodes(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  return String(value || '')
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

async function listPromotions(query = {}) {
  return promotionRepository.findAll(query);
}

async function savePromotion(body = {}) {
  const now = new Date().toISOString();
  const payload = {
    ...body,
    id: String(body.id || makeId('PR')).trim(),
    code: String(body.code || '').trim(),
    name: String(body.name || '').trim(),
    type: String(body.type || 'discount').trim(),
    productCodes: normalizeProductCodes(body.productCodes),
    conditionText: String(body.conditionText || '').trim(),
    discountText: String(body.discountText || '').trim(),
    displayReward: String(body.displayReward || '').trim(),
    couponText: String(body.couponText || '').trim(),
    ontopText: String(body.ontopText || '').trim(),
    startDate: String(body.startDate || '').slice(0, 10),
    endDate: String(body.endDate || '').slice(0, 10),
    note: String(body.note || '').trim(),
    isActive: body.isActive !== false && body.isActive !== 'false',
    updatedAt: now
  };
  if (!payload.code) return { error: 'Thiếu mã CTKM', status: 400 };
  if (!payload.name) return { error: 'Thiếu tên/nội dung chương trình', status: 400 };
  if (!payload.createdAt) payload.createdAt = now;
  const promotion = await promotionRepository.upsert(payload);
  return { promotion };
}

async function deletePromotion(id) {
  const deleted = await promotionRepository.remove(id);
  if (!deleted) return { error: 'Không tìm thấy chương trình khuyến mại', status: 404 };
  return { deleted: true };
}

module.exports = { listPromotions, savePromotion, deletePromotion };
