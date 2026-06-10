'use strict';

/**
 * Repair vòng đời đơn con V45.
 * Chạy thủ công khi cần chuẩn hóa dữ liệu cũ:
 *   node scripts/repair-order-lifecycle.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const SalesOrder = require('../src/models/SalesOrder');
const { lifecyclePatch } = require('../src/utils/orderStatus.util');

async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI || process.env.DATABASE_URL;
  if (!uri) throw new Error('Thiếu MONGO_URI/MONGODB_URI/DATABASE_URL');
  await mongoose.connect(uri);
  const orders = await SalesOrder.find({}).lean();
  let changed = 0;
  for (const order of orders) {
    const patch = lifecyclePatch(order, { source: order.source || order.orderSource || 'manual' });
    const update = {};
    for (const [key, value] of Object.entries(patch)) {
      if (String(order[key] ?? '') !== String(value ?? '')) update[key] = value;
    }
    if (!order.orderDate) update.orderDate = patch.orderDate || order.date || String(order.createdAt || '').slice(0, 10);
    if (!order.mergeStatus) update.mergeStatus = patch.mergeStatus;
    if (!order.deliveryStatus) update.deliveryStatus = patch.deliveryStatus;
    if (!order.accountingStatus) update.accountingStatus = patch.accountingStatus;
    if (Object.keys(update).length) {
      update.updatedAt = new Date().toISOString();
      await SalesOrder.updateOne({ _id: order._id }, { $set: update });
      changed += 1;
    }
  }
  console.log(JSON.stringify({ ok: true, scanned: orders.length, changed }, null, 2));
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});
