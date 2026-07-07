'use strict';

/**
 * OUT-OF-FLOW TOOL ONLY.
 * Routes under /api/tools/order-split only read uploaded Excel data, run in-memory calculation,
 * and export Excel files. They must not create/update/delete ERP business data.
 */

const express = require('express');
const multer = require('multer');
const { parseWorkbookBuffer } = require('../../services/tools/orderSplitExcelParser.service');
const { splitOrders } = require('../../services/tools/orderSplitAlgorithm.service');
const { createTemplateWorkbook, createResultWorkbook } = require('../../services/tools/orderSplitExport.service');
const { createVatWorkbook } = require('../../services/tools/orderSplitVatExport.service');

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
    toleranceAmount: Number(body.toleranceAmount || 0),
    tolerancePercent: Number(body.tolerancePercent || 0),
    allowTargetOverTotal: body.allowTargetOverTotal === true || body.allowTargetOverTotal === 'true',
    vatRate: Number(body.vatRate || 10),
    priceIncludesVat: body.priceIncludesVat === true || body.priceIncludesVat === 'true',
    roundingMode: body.roundingMode || 'line',
    orderPrefix: body.orderPrefix || ''
  };
}

function sendWorkbook(res, buffer, filename) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(Buffer.from(buffer));
}

function sanitizeResultPayload(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('Thiếu dữ liệu kết quả chia đơn. Hãy bấm Kiểm tra & Preview trước.');
  return {
    summary: payload.summary || {},
    resultLines: Array.isArray(payload.resultLines) ? payload.resultLines : [],
    compareRows: Array.isArray(payload.compareRows) ? payload.compareRows : [],
    stockRows: Array.isArray(payload.stockRows) ? payload.stockRows : [],
    warnings: Array.isArray(payload.warnings) ? payload.warnings : [],
    invoiceInfo: Array.isArray(payload.invoiceInfo) ? payload.invoiceInfo : []
  };
}

router.get('/template', async (req, res, next) => {
  try {
    const buffer = await createTemplateWorkbook();
    sendWorkbook(res, buffer, 'MAU_CHIA_DON_THEO_GIA_TRI.xlsx');
  } catch (error) {
    next(error);
  }
});

router.post('/preview', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file || !req.file.buffer) throw new Error('Chưa upload file Excel.');
    const parsed = await parseWorkbookBuffer(req.file.buffer);
    const result = splitOrders(parsed.items, parsed.targets, parseOptions(req.body), parsed.warnings, parsed.invoiceInfo);
    res.json({ ok: true, result });
  } catch (error) {
    res.status(400).json({ ok: false, message: error.message || 'Không xử lý được file chia đơn.' });
  }
});

router.post('/export', express.json({ limit: '15mb' }), async (req, res, next) => {
  try {
    const result = sanitizeResultPayload(req.body.result || req.body);
    const buffer = await createResultWorkbook(result);
    sendWorkbook(res, buffer, `KET_QUA_CHIA_DON_${timestamp()}.xlsx`);
  } catch (error) {
    res.status(400).json({ ok: false, message: error.message || 'Không xuất được Excel kết quả chia đơn.' });
  }
});

router.post('/export-vat', express.json({ limit: '15mb' }), async (req, res, next) => {
  try {
    const result = sanitizeResultPayload(req.body.result || req.body);
    const buffer = await createVatWorkbook(result, parseOptions(req.body.options || req.body));
    sendWorkbook(res, buffer, `VAT_CHIA_DON_${timestamp()}.xlsx`);
  } catch (error) {
    res.status(400).json({ ok: false, message: error.message || 'Không xuất được Excel VAT.' });
  }
});

module.exports = router;
