'use strict';

const promotionService = require('../services/promotionService');

function sendError(res, result, fallback = 'Không thực hiện được') {
  return res.status(result.status || 400).json({ ok: false, message: result.error || fallback });
}

async function list(req, res) { try { res.json({ ok: true, promotions: await promotionService.listPromotions(req.query) }); } catch (err) { res.status(500).json({ ok: false, message: 'Không tải được khuyến mại', error: err.message }); } }
async function save(req, res) { try { const result = await promotionService.savePromotion(req.body); if (result.error) return sendError(res, result); res.json({ ok: true, message: 'Đã lưu chương trình khuyến mại', promotion: result.promotion }); } catch (err) { res.status(500).json({ ok: false, message: 'Không lưu được khuyến mại', error: err.message }); } }
async function remove(req, res) { try { const result = await promotionService.deletePromotion(req.params.id); if (result.error) return sendError(res, result); res.json({ ok: true, message: 'Đã xóa chương trình khuyến mại' }); } catch (err) { res.status(500).json({ ok: false, message: 'Không xóa được khuyến mại', error: err.message }); } }


async function listPrograms(req, res) { try { res.json({ ok: true, programs: await promotionService.listPromotionPrograms(req.query) }); } catch (err) { res.status(500).json({ ok: false, message: 'Không tải được danh sách chương trình khuyến mại', error: err.message }); } }
async function getProgramDetail(req, res) { try { const result = await promotionService.getPromotionProgramDetail(req.params.programCode); if (result.error) return sendError(res, result); res.json({ ok: true, ...result }); } catch (err) { res.status(500).json({ ok: false, message: 'Không tải được chi tiết chương trình khuyến mại', error: err.message }); } }
async function updateProgram(req, res) { try { const result = await promotionService.updatePromotionProgram(req.params.programCode, req.body); if (result.error) return sendError(res, result); res.json({ ok: true, message: 'Đã cập nhật chương trình khuyến mại', ...result }); } catch (err) { res.status(500).json({ ok: false, message: 'Không cập nhật được chương trình khuyến mại', error: err.message }); } }
async function cancelProgram(req, res) { try { const result = await promotionService.cancelPromotionProgram(req.params.programCode); if (result.error) return sendError(res, result); res.json({ ok: true, message: 'Đã hủy chương trình khuyến mại' }); } catch (err) { res.status(500).json({ ok: false, message: 'Không hủy được chương trình khuyến mại', error: err.message }); } }

async function listProductRules(req, res) { try { res.json({ ok: true, rows: await promotionService.listProductRules(req.query) }); } catch (err) { res.status(500).json({ ok: false, message: 'Không tải được CK sản phẩm', error: err.message }); } }
async function saveProductRule(req, res) { try { const result = await promotionService.saveProductRule(req.body); if (result.error) return sendError(res, result); res.json({ ok: true, message: 'Đã lưu CK sản phẩm', row: result.rule }); } catch (err) { res.status(500).json({ ok: false, message: 'Không lưu được CK sản phẩm', error: err.message }); } }
async function deleteProductRule(req, res) { try { await promotionService.deleteProductRule(req.params.id); res.json({ ok: true, message: 'Đã xóa CK sản phẩm' }); } catch (err) { res.status(500).json({ ok: false, message: 'Không xóa được CK sản phẩm', error: err.message }); } }

async function listGroupItems(req, res) { try { res.json({ ok: true, rows: await promotionService.listGroupItems(req.query) }); } catch (err) { res.status(500).json({ ok: false, message: 'Không tải được nhóm sản phẩm KM', error: err.message }); } }
async function saveGroupItem(req, res) { try { const result = await promotionService.saveGroupItem(req.body); if (result.error) return sendError(res, result); res.json({ ok: true, message: 'Đã lưu sản phẩm vào nhóm KM', row: result.item }); } catch (err) { res.status(500).json({ ok: false, message: 'Không lưu được nhóm sản phẩm KM', error: err.message }); } }
async function deleteGroupItem(req, res) { try { await promotionService.deleteGroupItem(req.params.id); res.json({ ok: true, message: 'Đã xóa sản phẩm khỏi nhóm KM' }); } catch (err) { res.status(500).json({ ok: false, message: 'Không xóa được nhóm sản phẩm KM', error: err.message }); } }

async function listGroupRules(req, res) { try { res.json({ ok: true, rows: await promotionService.listGroupRules(req.query) }); } catch (err) { res.status(500).json({ ok: false, message: 'Không tải được điều kiện nhóm KM', error: err.message }); } }
async function saveGroupRule(req, res) { try { const result = await promotionService.saveGroupRule(req.body); if (result.error) return sendError(res, result); res.json({ ok: true, message: 'Đã lưu điều kiện nhóm KM', row: result.rule }); } catch (err) { res.status(500).json({ ok: false, message: 'Không lưu được điều kiện nhóm KM', error: err.message }); } }
async function deleteGroupRule(req, res) { try { await promotionService.deleteGroupRule(req.params.id); res.json({ ok: true, message: 'Đã xóa điều kiện nhóm KM' }); } catch (err) { res.status(500).json({ ok: false, message: 'Không xóa được điều kiện nhóm KM', error: err.message }); } }
async function calculate(req, res) { try { res.json({ ok: true, result: await promotionService.calculatePromotions(req.body?.items || [], { date: req.body?.date || req.body?.orderDate || req.body?.saleDate }) }); } catch (err) { res.status(500).json({ ok: false, message: 'Không tính được khuyến mại', error: err.message }); } }

module.exports = { list, save, remove, listPrograms, getProgramDetail, updateProgram, cancelProgram, listProductRules, saveProductRule, deleteProductRule, listGroupItems, saveGroupItem, deleteGroupItem, listGroupRules, saveGroupRule, deleteGroupRule, calculate };
