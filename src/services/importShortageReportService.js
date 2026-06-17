'use strict';

const ImportShortageReport = require('../models/ImportShortageReport');
const ImportSession = require('../models/ImportSession');
const { toNumber } = require('../utils/common.util');

function clean(value) {
  return String(value == null ? '' : value).trim();
}

function makeReportCode(sessionId, date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const suffix = clean(sessionId).replace(/[^a-zA-Z0-9]/g, '').slice(-10) || String(Date.now()).slice(-10);
  return `HTI-${y}${m}${d}-${suffix}`;
}

function normalizeItem(row = {}) {
  const missingQuantity = Math.max(0, toNumber(row.missingQuantity ?? row.shortageQuantity ?? row.missingQty));
  if (!missingQuantity) return null;
  return {
    documentCode: clean(row.documentCode || row.orderCode || row.code),
    customerCode: clean(row.customerCode),
    customerName: clean(row.customerName),
    productCode: clean(row.productCode || row.code || row.productId),
    productName: clean(row.productName || row.name),
    unit: clean(row.unit || row.baseUnit),
    conversionRate: Math.max(1, toNumber(row.conversionRate || 1)),
    requestedQuantity: Math.max(0, toNumber(row.requestedQuantity ?? row.orderedQuantity ?? row.orderQuantity ?? row.requiredQuantity ?? row.quantity)),
    availableQuantity: Math.max(0, toNumber(row.availableQuantity ?? row.available)),
    missingQuantity,
    unitPrice: Math.max(0, toNumber(row.unitPrice ?? row.price ?? row.salePrice)),
    cutAmount: Math.max(0, toNumber(row.cutAmount ?? row.shortageAmount ?? row.amount)),
    reconciliationStatus: 'open'
  };
}

function summarize(items = []) {
  const orders = new Set();
  const products = new Set();
  let totalMissingQuantity = 0;
  let totalCutAmount = 0;
  items.forEach((item) => {
    if (item.documentCode) orders.add(item.documentCode);
    if (item.productCode) products.add(item.productCode);
    totalMissingQuantity += toNumber(item.missingQuantity);
    totalCutAmount += toNumber(item.cutAmount);
  });
  return {
    itemCount: items.length,
    orderCount: orders.size,
    productCount: products.size,
    totalMissingQuantity,
    totalCutAmount
  };
}

async function saveFromImport({ importSessionId, shortageRows, userName = '' }) {
  const sessionId = clean(importSessionId);
  const items = (Array.isArray(shortageRows) ? shortageRows : []).map(normalizeItem).filter(Boolean);
  if (!sessionId || !items.length) return null;

  const session = await ImportSession.findOne({ $or: [{ id: sessionId }, { sessionId }] }).lean().catch(() => null);
  const summary = summarize(items);
  const now = new Date();
  const report = await ImportShortageReport.findOneAndUpdate(
    { importSessionId: sessionId },
    {
      $setOnInsert: {
        code: makeReportCode(sessionId, now),
        importSessionId: sessionId,
        importType: 'salesOrders',
        createdBy: clean(userName),
        createdAt: now
      },
      $set: {
        fileNames: Array.isArray(session?.fileNames) && session.fileNames.length ? session.fileNames : [session?.fileName].filter(Boolean),
        importDate: session?.finishedAt || now,
        status: 'open',
        ...summary,
        items,
        updatedBy: clean(userName),
        updatedAt: now,
        resolvedBy: '',
        resolvedAt: null
      }
    },
    { upsert: true, new: true, runValidators: true }
  ).lean();
  return report;
}

async function list({ status = '', search = '', limit = 100 } = {}) {
  const filter = {};
  if (['open', 'in_review', 'resolved'].includes(clean(status))) filter.status = clean(status);
  const term = clean(search);
  if (term) {
    const rx = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [
      { code: rx },
      { importSessionId: rx },
      { 'items.documentCode': rx },
      { 'items.customerCode': rx },
      { 'items.customerName': rx },
      { 'items.productCode': rx },
      { 'items.productName': rx }
    ];
  }
  return ImportShortageReport.find(filter)
    .select('-items')
    .sort({ importDate: -1, createdAt: -1 })
    .limit(Math.min(Math.max(Number(limit) || 100, 1), 500))
    .lean();
}

async function getById(id) {
  return ImportShortageReport.findById(id).lean();
}

async function updateReport(id, body = {}, actor = '') {
  const report = await ImportShortageReport.findById(id);
  if (!report) return { error: 'Không tìm thấy báo cáo hàng thiếu', status: 404 };

  if (body.note !== undefined) report.note = clean(body.note);
  const status = clean(body.status);
  if (status && ['open', 'in_review', 'resolved'].includes(status)) {
    report.status = status;
    if (status === 'resolved') {
      report.resolvedBy = clean(actor);
      report.resolvedAt = new Date();
    } else {
      report.resolvedBy = '';
      report.resolvedAt = null;
    }
  }

  if (Array.isArray(body.items)) {
    const byId = new Map(body.items.map((item) => [clean(item.id || item._id), item]));
    report.items.forEach((item) => {
      const patch = byId.get(String(item._id));
      if (!patch) return;
      const nextStatus = clean(patch.reconciliationStatus);
      if (['open', 'verified', 'resolved'].includes(nextStatus)) item.reconciliationStatus = nextStatus;
      if (patch.reconciliationNote !== undefined) item.reconciliationNote = clean(patch.reconciliationNote);
      if (item.reconciliationStatus !== 'open') {
        item.reconciledBy = clean(actor);
        item.reconciledAt = new Date();
      } else {
        item.reconciledBy = '';
        item.reconciledAt = null;
      }
    });
  }

  const allResolved = report.items.length > 0 && report.items.every((item) => item.reconciliationStatus === 'resolved');
  if (allResolved) {
    report.status = 'resolved';
    report.resolvedBy = clean(actor);
    report.resolvedAt = report.resolvedAt || new Date();
  } else if (report.status === 'resolved') {
    report.status = 'in_review';
    report.resolvedBy = '';
    report.resolvedAt = null;
  }

  report.updatedBy = clean(actor);
  await report.save();
  return { report: report.toObject() };
}

module.exports = { saveFromImport, list, getById, updateReport, summarize };
