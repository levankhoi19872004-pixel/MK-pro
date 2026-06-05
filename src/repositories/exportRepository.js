'use strict';

const models = require('../models');

const COLLECTION_MAP = {
  products: models.products,
  customers: models.customers,
  staffs: models.staffs,
  users: models.staffs,
  warehouses: models.warehouses,
  suppliers: models.suppliers,
  stock: models.stock,
  inventories: models.stock,
  importOrders: models.importOrders,
  imports: models.importOrders,
  salesOrders: models.salesOrders,
  orders: models.salesOrders,
  masterOrders: models.masterOrders,
  receipts: models.receipts,
  payments: models.payments,
  returnOrders: models.returnOrders,
  returns: models.returnOrders,
  cashbook: models.cashbooks,
  cashbooks: models.cashbooks,
  bankbook: models.bankbooks,
  bankbooks: models.bankbooks,
  promotions: models.promotions,
  importTemplates: models.importTemplates,
  importLogs: models.importLogs,
  auditLogs: models.auditLogs,
  mobileLogs: models.mobileLogs
};

function getExportTypes() {
  return Object.keys(COLLECTION_MAP).sort();
}

function getModel(type) {
  const key = String(type || '').trim();
  return COLLECTION_MAP[key] || null;
}

function buildDateFilter(query = {}) {
  const filter = {};
  const dateFrom = String(query.dateFrom || query.from || '').trim();
  const dateTo = String(query.dateTo || query.to || '').trim();
  if (dateFrom || dateTo) {
    filter.$or = [
      { date: { ...(dateFrom ? { $gte: dateFrom } : {}), ...(dateTo ? { $lte: dateTo } : {}) } },
      { createdAt: { ...(dateFrom ? { $gte: dateFrom } : {}), ...(dateTo ? { $lte: `${dateTo}T23:59:59.999Z` } : {}) } }
    ];
  }
  return filter;
}

async function findForExport(type, query = {}) {
  const Model = getModel(type);
  if (!Model) return null;
  const limit = Math.min(Math.max(Number(query.limit || 10000), 1), 50000);
  return Model.find(buildDateFilter(query)).sort({ createdAt: -1, code: 1, name: 1 }).limit(limit).lean();
}

module.exports = { getExportTypes, findForExport };
