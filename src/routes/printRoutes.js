const express = require('express');
const router = express.Router();

const { readData } = require('../config/db');
const {
  listPrintTemplates,
  renderWarehouseReceipt,
  renderSalesOrder,
  renderSalesInvoice,
  renderCashVoucher,
  findDocument,
  findCash
} = require('../services/printTemplateService');

function sendError(res, error, status = 400) {
  return res.status(status).json({ success: false, message: error.message });
}

function sendHtml(res, html) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.send(html);
}

router.get('/api/print/templates', async (req, res) => {
  try {
    res.json({ success: true, data: listPrintTemplates() });
  } catch (error) {
    sendError(res, error, 500);
  }
});

router.get('/api/print/warehouse-receipts/:id', async (req, res) => {
  try {
    const data = await readData();
    const receipt = findDocument(data, 'WAREHOUSE_RECEIPT', req.params.id);
    if (!receipt) return res.status(404).json({ success: false, message: 'Không tìm thấy phiếu nhập kho' });
    return sendHtml(res, renderWarehouseReceipt(data, receipt));
  } catch (error) {
    sendError(res, error, 500);
  }
});

router.get('/api/print/sales-orders/:id', async (req, res) => {
  try {
    const data = await readData();
    const order = findDocument(data, 'SALES_ORDER', req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Không tìm thấy đơn bán hàng' });
    return sendHtml(res, renderSalesOrder(data, order));
  } catch (error) {
    sendError(res, error, 500);
  }
});


router.get('/api/print/sales-invoices/:id', async (req, res) => {
  try {
    const data = await readData();
    const invoice = findDocument(data, 'SALES_INVOICE', req.params.id) || findDocument(data, 'SALES_ORDER', req.params.id);
    if (!invoice) return res.status(404).json({ success: false, message: 'Không tìm thấy hóa đơn bán hàng' });
    return sendHtml(res, renderSalesInvoice(data, invoice));
  } catch (error) {
    sendError(res, error, 500);
  }
});

router.get('/api/print/cash/:id', async (req, res) => {
  try {
    const data = await readData();
    const cash = findCash(data, req.params.id);
    if (!cash) return res.status(404).json({ success: false, message: 'Không tìm thấy phiếu thu/chi' });
    return sendHtml(res, renderCashVoucher(data, cash));
  } catch (error) {
    sendError(res, error, 500);
  }
});

module.exports = router;
