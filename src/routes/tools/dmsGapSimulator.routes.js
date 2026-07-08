'use strict';

/**
 * OUT-OF-FLOW TOOL ONLY.
 * Routes under /api/tools/dms-gap-simulator only read uploaded customer Excel + MK-Pro DMS/promotion data,
 * run in-memory simulation and export Excel files. They must not create/update/delete ERP business data.
 */

const express = require('express');
const multer = require('multer');
const {
  buildDmsGapSimulationInputFromMkPro,
  runSimulation,
  createResultWorkbook
} = require('../../services/tools/dmsGapSimulator.service');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }
});

function timestamp() {
  return new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
}

function parseOptions(body = {}) {
  return {
    scenarioCount: body.scenarioCount,
    toleranceAmount: body.toleranceAmount,
    globalToleranceAmount: body.globalToleranceAmount,
    temperature: body.temperature,
    weightPromotion: body.weightPromotion,
    weightCustomerFit: body.weightCustomerFit,
    weightDmsGap: body.weightDmsGap,
    weightPriceFit: body.weightPriceFit,
    weightDuplicatePenalty: body.weightDuplicatePenalty,
    dmsComparisonType: body.dmsComparisonType || body.dmsGapType,
    promotionDate: body.promotionDate,
    forceRefresh: body.forceRefresh === true || body.forceRefresh === 'true'
  };
}

function sendWorkbook(res, buffer, filename) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(Buffer.from(buffer));
}

function sanitizeResultPayload(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('Thiếu dữ liệu mô phỏng. Hãy bấm Sinh đơn tham khảo trước.');
  return {
    summary: payload.summary || {},
    customerOrders: Array.isArray(payload.customerOrders) ? payload.customerOrders : [],
    orderItems: Array.isArray(payload.orderItems) ? payload.orderItems : [],
    groupSummary: Array.isArray(payload.groupSummary) ? payload.groupSummary : [],
    promotionOrderSummary: Array.isArray(payload.promotionOrderSummary) ? payload.promotionOrderSummary : [],
    productUsageSummary: Array.isArray(payload.productUsageSummary) ? payload.productUsageSummary : [],
    warnings: Array.isArray(payload.warnings) ? payload.warnings : []
  };
}

router.post('/preview', upload.single('file'), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) throw new Error('Chưa upload file Excel.');
    const parsed = await buildDmsGapSimulationInputFromMkPro(req.file.buffer, parseOptions(req.body));
    if (parsed.errors && parsed.errors.length) {
      return res.status(400).json({ ok: false, message: parsed.errors.map((err) => err.message).join(' '), errors: parsed.errors, warnings: parsed.warnings });
    }
    const result = runSimulation(parsed, parseOptions(req.body));
    res.json({ ok: true, result, warnings: result.warnings || [] });
  } catch (error) {
    res.status(400).json({
      ok: false,
      message: error.message || 'Không xử lý được file Sinh đơn chấm DMS.',
      errors: error.details || []
    });
  }
});

router.post('/export', express.json({ limit: '20mb' }), async (req, res) => {
  try {
    const result = sanitizeResultPayload(req.body.result || req.body);
    const buffer = await createResultWorkbook(result);
    sendWorkbook(res, buffer, `KET_QUA_SINH_DON_CHAM_DMS_${timestamp()}.xlsx`);
  } catch (error) {
    res.status(400).json({ ok: false, message: error.message || 'Không xuất được Excel kết quả Sinh đơn chấm DMS.' });
  }
});

module.exports = router;
