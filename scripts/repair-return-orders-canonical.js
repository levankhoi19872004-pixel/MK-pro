'use strict';

/**
 * Chuẩn hóa phiếu trả hàng V45: 1 đơn bán = 1 mã trả hàng RO-{salesOrderCode}.
 * Chạy thủ công trước khi bật unique index:
 *   node scripts/repair-return-orders-canonical.js
 *
 * Script sẽ:
 * - Gom returnOrders theo salesOrderId/salesOrderCode/orderId/orderCode.
 * - Giữ 1 bản chính, ưu tiên bản có code RO-{salesOrderCode} hoặc bản còn giá trị trả.
 * - Đổi id/code bản chính về RO-{salesOrderCode}.
 * - Chuyển các bản trùng sang duplicate_cancelled và đưa amount/items về 0.
 * - Tạo unique index theo code sau khi dọn trùng.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const ReturnOrder = require('../src/models/ReturnOrder');

function clean(value) {
  return String(value || '').trim();
}

function canonicalCode(row = {}) {
  const code = clean(row.salesOrderCode || row.orderCode || row.sourceOrderCode || row.deliveryOrderCode || row.code).replace(/^RO[-_]?/i, '');
  if (!code) return '';
  return `RO-${code}`;
}

function groupKey(row = {}) {
  return clean(row.salesOrderId || row.orderId || row.sourceOrderId || row.deliveryOrderId || row.salesOrderCode || row.orderCode || row.sourceOrderCode || row.deliveryOrderCode || row.code);
}

function valueOf(row = {}) {
  return Number(row.totalAmount ?? row.amount ?? row.debtReduction ?? row.totalReturnAmount ?? 0) || 0;
}

function statusOf(row = {}) {
  return clean(row.status || row.returnStatus).toLowerCase();
}

function score(row = {}, code = '') {
  let score = 0;
  const status = statusOf(row);
  if (code && clean(row.code) === code) score += 1000;
  if (code && clean(row.id) === code) score += 800;
  if (clean(row.code).startsWith('RO-')) score += 200;
  if (clean(row.id).startsWith('RO-')) score += 100;
  if (valueOf(row) > 0) score += 80;
  if (['waiting_receive', 'pending', 'draft', 'active', 'has_return'].includes(status)) score += 60;
  if (status === 'cleared') score += 30;
  if (clean(row.id).startsWith('RO-DRAFT-')) score += 10;
  if (clean(row.id).startsWith('RO-MOBILE-')) score -= 20;
  if (clean(row.code).startsWith('THH')) score -= 50;
  if (['deleted', 'duplicate_cancelled'].includes(status)) score -= 1000;
  return score;
}

async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI || process.env.DATABASE_URL;
  if (!uri) throw new Error('Thiếu MONGO_URI/MONGODB_URI/DATABASE_URL');
  await mongoose.connect(uri);

  const rows = await ReturnOrder.find({}).lean();
  const groups = new Map();
  for (const row of rows) {
    const key = groupKey(row);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  let normalized = 0;
  let duplicatesCancelled = 0;
  const now = new Date().toISOString();

  for (const group of groups.values()) {
    if (!group.length) continue;
    const code = canonicalCode(group.find((row) => clean(row.salesOrderCode || row.orderCode)) || group[0]);
    if (!code) continue;
    const activeRows = group.filter((row) => !['deleted', 'duplicate_cancelled'].includes(statusOf(row)));
    if (!activeRows.length) continue;
    const keep = [...activeRows].sort((a, b) => score(b, code) - score(a, code))[0];

    const setKeep = {
      id: code,
      code,
      salesOrderId: clean(keep.salesOrderId || keep.orderId || keep.sourceOrderId || keep.deliveryOrderId),
      salesOrderCode: clean(keep.salesOrderCode || keep.orderCode || keep.sourceOrderCode || keep.deliveryOrderCode || code.replace(/^RO-/, '')),
      orderId: clean(keep.salesOrderId || keep.orderId || keep.sourceOrderId || keep.deliveryOrderId),
      orderCode: clean(keep.salesOrderCode || keep.orderCode || keep.sourceOrderCode || keep.deliveryOrderCode || code.replace(/^RO-/, '')),
      updatedAt: now
    };
    await ReturnOrder.updateOne({ _id: keep._id }, { $set: setKeep });
    normalized += 1;

    for (const row of activeRows) {
      if (String(row._id) === String(keep._id)) continue;
      const locked = clean(row.returnMergeStatus).toLowerCase() === 'merged' || row.masterReturnOrderId || row.masterReturnOrderCode || ['posted', 'received', 'warehouse_received', 'completed'].includes(statusOf(row));
      if (locked) continue;
      await ReturnOrder.updateOne({ _id: row._id }, {
        $set: {
          status: 'duplicate_cancelled',
          returnStatus: 'duplicate_cancelled',
          warehouseReceiveStatus: 'duplicate_cancelled',
          accountingStatus: 'duplicate_cancelled',
          items: [],
          amount: 0,
          totalAmount: 0,
          totalQuantity: 0,
          debtReduction: 0,
          totalReturnAmount: 0,
          duplicateReason: 'Chuẩn hóa 1 đơn bán = 1 phiếu trả RO-{salesOrderCode}',
          updatedAt: now
        }
      });
      duplicatesCancelled += 1;
    }
  }

  // Tạo unique index theo code sau khi đã dọn dữ liệu trùng.
  try {
    await ReturnOrder.collection.createIndex(
      { code: 1 },
      {
        unique: true,
        partialFilterExpression: { code: { $exists: true, $ne: '' } },
        name: 'uniq_return_orders_code'
      }
    );
  } catch (err) {
    console.warn('Không tạo được uniq_return_orders_code. Hãy kiểm tra còn trùng code hay không:', err.message);
  }

  console.log(JSON.stringify({ ok: true, scanned: rows.length, groups: groups.size, normalized, duplicatesCancelled }, null, 2));
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});
