#!/usr/bin/env node
'use strict';

try { require('dotenv').config(); } catch (_) {}

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const SalesOrder = require('../src/models/SalesOrder');
const ReturnOrder = require('../src/models/ReturnOrder');
const DeliveryCloseoutVersion = require('../src/models/DeliveryCloseoutVersion');
const OrderPaymentAllocation = require('../src/models/OrderPaymentAllocation');
const {
  resolveDeliveryAccountingLockState,
  resolveReturnWarehouseLockState
} = require('../src/domain/returns/ReturnMutationGuard');

const ROOT = path.resolve(__dirname, '..');

function clean(value = '') { return String(value ?? '').trim(); }
function lower(value = '') { return clean(value).toLowerCase(); }
function money(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? Math.round(n) : 0;
}
function unique(values = []) {
  return [...new Set(values.map(clean).filter(Boolean))];
}
function parsePhase(argv = process.argv.slice(2)) {
  const flag = argv.find((item) => /^--phase=/.test(item));
  return clean(flag ? flag.split('=')[1] : process.env.PHASE260B_AUDIT_PHASE) || 'Phase260B';
}
function artifactPrefix(phase = 'Phase260B') {
  return lower(phase) === 'phase260b-r1' ? 'PHASE260B_R1' : 'PHASE260B';
}
function artifactPaths(argv = process.argv.slice(2)) {
  const prefix = artifactPrefix(parsePhase(argv));
  return {
    json: path.join(ROOT, `${prefix}_POST_CLOSEOUT_RETURN_MUTATION_AUDIT.json`),
    csv: path.join(ROOT, `${prefix}_POST_CLOSEOUT_RETURN_MUTATION_AUDIT.csv`),
    writer: path.join(ROOT, `${prefix}_RETURN_MUTATION_WRITER_INVENTORY.json`)
  };
}
function parseLimit(argv = process.argv.slice(2)) {
  const flag = argv.find((item) => /^--limit=/.test(item));
  const parsed = Number(flag ? flag.split('=')[1] : process.env.PHASE260B_AUDIT_LIMIT);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(Math.floor(parsed), 50000)) : 5000;
}
function parseOrderCodes(argv = process.argv.slice(2)) {
  const values = [];
  for (const item of argv) {
    if (/^--order-code=/.test(item)) values.push(item.split('=')[1]);
    if (/^--order-codes=/.test(item)) values.push(...item.split('=')[1].split(','));
  }
  if (process.env.PHASE260B_AUDIT_ORDER_CODES) values.push(...process.env.PHASE260B_AUDIT_ORDER_CODES.split(','));
  return unique(values);
}
function allowDisconnected(argv = process.argv.slice(2)) {
  return argv.includes('--allow-disconnected') || ['1', 'true', 'yes'].includes(lower(process.env.PHASE260B_AUDIT_ALLOW_DISCONNECTED));
}
function identity(row = {}) {
  return {
    ids: unique([row.id, row._id, row.salesOrderId, row.orderId]),
    codes: unique([row.code, row.salesOrderCode, row.orderCode])
  };
}
function orderOrForReturn(returnOrder = {}) {
  const ids = unique([returnOrder.salesOrderId, returnOrder.orderId]);
  const codes = unique([returnOrder.salesOrderCode, returnOrder.orderCode]);
  const or = [];
  if (ids.length) or.push({ id: { $in: ids } }, { orderId: { $in: ids } }, { salesOrderId: { $in: ids } });
  if (codes.length) or.push({ code: { $in: codes } }, { orderCode: { $in: codes } }, { salesOrderCode: { $in: codes } });
  return or;
}
function versionOrForOrder(order = {}, returnOrder = {}) {
  const keys = identity({ ...returnOrder, ...order });
  const or = [];
  if (keys.ids.length) or.push({ salesOrderId: { $in: keys.ids } }, { orderId: { $in: keys.ids } });
  if (keys.codes.length) or.push({ salesOrderCode: { $in: keys.codes } }, { orderCode: { $in: keys.codes } });
  return or;
}
function allocationOrForOrder(order = {}, returnOrder = {}) {
  const keys = identity({ ...returnOrder, ...order });
  const or = [];
  if (keys.ids.length) or.push({ orderId: { $in: keys.ids } });
  if (keys.codes.length) or.push({ orderCode: { $in: keys.codes } });
  return or;
}
function returnAmount(row = {}) {
  if (Array.isArray(row.items) && row.items.length) {
    return money(row.items.reduce((sum, item) => sum + money(item.amount ?? (Number(item.returnQty || item.qtyReturn || item.quantity || 0) * Number(item.unitPrice || item.salePrice || item.price || 0))), 0));
  }
  return money(row.totalAmount ?? row.totalReturnAmount ?? row.amount ?? row.debtReduction);
}
function csvEscape(value) {
  const raw = clean(value);
  return /[",\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}
function writeCsv(rows = [], csvOut = artifactPaths().csv) {
  const headers = ['returnOrderId', 'returnOrderCode', 'orderId', 'orderCode', 'status', 'updatedAt', 'lockReason', 'lockAt', 'warehouseCheckStatus', 'stockInStatus', 'stockPosted', 'inventoryPosted', 'returnAmount', 'closeoutReturnAmount', 'issues'];
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((header) => csvEscape(Array.isArray(row[header]) ? row[header].join('|') : row[header])).join(','));
  }
  fs.writeFileSync(csvOut, `${lines.join('\n')}\n`);
}
function disconnectedReport(error, phase = 'Phase260B') {
  return {
    phase,
    mode: 'read_only',
    dryRun: true,
    status: 'AUDIT_NOT_EXECUTED',
    generatedAt: new Date().toISOString(),
    connection: {
      ok: false,
      code: error && error.name ? error.name : 'MONGO_CONNECTION_FAILED',
      message: clean(error && error.message)
    },
    totalReturnOrdersScanned: 0,
    issueRows: 0,
    mismatchRows: 0,
    rows: []
  };
}
function writerInventory(phase = 'Phase260B') {
  return {
    phase,
    generatedAt: new Date().toISOString(),
    mode: 'static_writer_inventory',
    mutationGraph: {
      beforeR1: [
        'delivery/mobile return save -> DeliveryEngine.saveReturn -> createPendingReturn',
        'returnOrderLegacy.updateReturnDraftItems -> returnOrderRepository.upsert',
        'desktop adjustment popup -> correction payload with returnAdjustment aliases',
        'delivery closeout correction -> applyReturnOrderAdjustment'
      ],
      afterR1: [
        'all direct writers resolve ReturnMutationGuard lock projection before returnOrderRepository write',
        'post-accounting desktop/mobile screens render return rows read-only and omit mutation payload',
        'material return adjustment items only enter controlled correction path',
        'approved correction creates superseding returnOrder version, reverses stock if needed, then waits warehouse/stock/accounting checkpoints'
      ]
    },
    writers: [
      { file: 'src/engines/delivery.legacy.engine.source/part-02.jsfrag', entry: 'DeliveryEngine.saveReturn', mutation: 'createPendingReturn', guard: 'assertReturnMutationAllowed' },
      { file: 'src/services/mobile/delivery.service.js', entry: 'createReturnFromDelivery', mutation: 'DeliveryEngine.saveReturn', guard: 'inherited_from_engine' },
      { file: 'src/routes/deliveryRoutes.js', entry: 'POST /api/delivery/return', mutation: 'DeliveryEngine.saveReturn', guard: 'inherited_from_engine' },
      { file: 'src/routes/mobile/delivery.routes.js', entry: 'POST /api/mobile/delivery/return', mutation: 'mobile delivery service', guard: 'inherited_from_engine' },
      { file: 'src/services/mobile/MobileSyncService.js', entry: 'delivery_return_save', mutation: 'DeliveryEngine.saveReturn', guard: 'offline disabled + inherited_from_engine + 409 conflict' },
      { file: 'src/services/returnOrderLegacy.service.source/part-02.jsfrag', entry: 'createReturnOrder/upsertDeliveryReturnOrder/createPendingReturnOrder', mutation: 'returnOrderRepository.upsert/clear', guard: 'guardLegacyReturnWrite -> assertReturnMutationAllowed' },
      { file: 'src/services/returnOrderLegacy.service.source/part-03.jsfrag', entry: 'ensure/cancel/restore/update/cancelById', mutation: 'returnOrderRepository.upsert/clear', guard: 'guardLegacyReturnWrite -> assertReturnMutationAllowed' },
      { file: 'src/services/returnOrderLegacy.service.source/part-04.jsfrag', entry: 'updateReturnDraftItems', mutation: 'returnOrderRepository.upsert', guard: 'guardLegacyReturnWrite -> assertReturnMutationAllowed' },
      { file: 'src/services/deliveryCloseoutCorrection.service.js', entry: 'createCorrection', mutation: 'applyReturnOrderAdjustment', guard: 'material return items only; post-closeout no-op aliases ignored' },
      { file: 'src/services/returns/ReturnCorrectionRequestService.js', entry: 'approve/apply/warehouseRecheck/stockRepost/accountingFinalize', mutation: 'controlled superseding returnOrder version + reversal/finalize services', guard: 'role + state machine + expectedVersion + canonical posting services' },
      { file: 'src/routes/newOperationsRoutes.js', entry: 'POST /api/new/delivery-today/return-correction-requests/:id/*', mutation: 'controlled workflow actions', guard: 'admin/accountant/warehouse route roles' },
      { file: 'public/js/app/new/91-delivery-today-new.js', entry: 'submitAdjustmentPopup', mutation: 'correction payload builder', guard: 'locked return fields omitted' },
      { file: 'public/mobile/js/delivery-mobile-view.source.js', entry: 'saveReturn/fullReturnOrder/renderReturns', mutation: 'mobile return save/full return UI', guard: 'returnMutationLocked read-only + client-side blocked action' }
    ]
  };
}

async function audit(argv = process.argv.slice(2)) {
  const phase = parsePhase(argv);
  const limit = parseLimit(argv);
  const orderCodes = parseOrderCodes(argv);
  const rows = [];
  const filter = orderCodes.length ? {
    $or: [
      { code: { $in: orderCodes } },
      { salesOrderCode: { $in: orderCodes } },
      { orderCode: { $in: orderCodes } }
    ]
  } : {};
  const returnOrders = await ReturnOrder.find(filter).sort({ updatedAt: -1, createdAt: -1 }).limit(limit).lean();
  for (const returnOrder of returnOrders) {
    const orderOr = orderOrForReturn(returnOrder);
    const order = orderOr.length ? await SalesOrder.findOne({ $or: orderOr }).lean() : null;
    const versionOr = versionOrForOrder(order || {}, returnOrder);
    const allocationOr = allocationOrForOrder(order || {}, returnOrder);
    const latestCloseoutVersion = versionOr.length ? await DeliveryCloseoutVersion.findOne({ $or: versionOr }).sort({ closeoutVersion: -1, createdAt: -1, updatedAt: -1 }).lean() : null;
    const allocation = allocationOr.length ? await OrderPaymentAllocation.findOne({ $or: allocationOr }).sort({ sourceVersion: -1, postedAt: -1, updatedAt: -1 }).lean() : null;
    const accountingLock = resolveDeliveryAccountingLockState({ order: order || returnOrder, latestCloseoutVersion, allocation });
    const warehouseLock = resolveReturnWarehouseLockState(returnOrder);
    const amount = returnAmount(returnOrder);
    const closeoutAmount = money(latestCloseoutVersion && (latestCloseoutVersion.returnAmount ?? latestCloseoutVersion.returnedAmount));
    const lockAt = clean(accountingLock.lockedAt || latestCloseoutVersion?.createdAt || allocation?.postedAt);
    const issues = [];
    if (accountingLock.locked && lockAt && clean(returnOrder.updatedAt) && clean(returnOrder.updatedAt) > lockAt) issues.push('POST_CLOSEOUT_RETURN_UPDATED_AT_AFTER_LOCK');
    if (accountingLock.locked && latestCloseoutVersion && amount !== closeoutAmount) issues.push('RETURN_CLOSEOUT_SNAPSHOT_MISMATCH');
    if (accountingLock.locked || warehouseLock.locked || issues.length) {
      rows.push({
        returnOrderId: clean(returnOrder.id || returnOrder._id),
        returnOrderCode: clean(returnOrder.code),
        orderId: clean(order?.id || returnOrder.salesOrderId || returnOrder.orderId),
        orderCode: clean(order?.code || returnOrder.salesOrderCode || returnOrder.orderCode),
        status: clean(returnOrder.status || returnOrder.returnState),
        updatedAt: clean(returnOrder.updatedAt),
        lockReason: accountingLock.reason,
        lockAt,
        warehouseCheckStatus: warehouseLock.warehouseCheckStatus,
        stockInStatus: warehouseLock.stockInStatus,
        stockPosted: warehouseLock.stockPosted,
        inventoryPosted: warehouseLock.inventoryPosted,
        returnAmount: amount,
        closeoutReturnAmount: closeoutAmount,
        issues
      });
    }
  }
  return {
    phase,
    mode: 'read_only',
    dryRun: true,
    generatedAt: new Date().toISOString(),
    limit,
    orderCodes,
    totalReturnOrdersScanned: returnOrders.length,
    issueRows: rows.length,
    mismatchRows: rows.filter((row) => row.issues.includes('RETURN_CLOSEOUT_SNAPSHOT_MISMATCH')).length,
    rows
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const phase = parsePhase(argv);
  const paths = artifactPaths(argv);
  fs.writeFileSync(paths.writer, `${JSON.stringify(writerInventory(phase), null, 2)}\n`);
  try {
    await connectDB();
  } catch (error) {
    if (!allowDisconnected(argv)) throw error;
    const report = disconnectedReport(error, phase);
    fs.writeFileSync(paths.json, `${JSON.stringify(report, null, 2)}\n`);
    writeCsv(report.rows, paths.csv);
    console.log(JSON.stringify({ ok: false, disconnected: true, status: report.status, json: path.basename(paths.json), csv: path.basename(paths.csv), writerInventory: path.basename(paths.writer), issueRows: 0 }, null, 2));
    return;
  }
  try {
    const report = await audit(argv);
    fs.writeFileSync(paths.json, `${JSON.stringify(report, null, 2)}\n`);
    writeCsv(report.rows, paths.csv);
    console.log(JSON.stringify({ ok: true, json: path.basename(paths.json), csv: path.basename(paths.csv), writerInventory: path.basename(paths.writer), issueRows: report.issueRows }, null, 2));
  } finally {
    await mongoose.connection.close().catch(() => {});
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  });
}

module.exports = { audit, writerInventory, disconnectedReport, artifactPaths, parseOrderCodes };
