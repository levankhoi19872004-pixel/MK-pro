'use strict';

/**
 * One-time migration for V45:
 * Copy legacy `staffs` documents into standard `users` collection.
 * Run: node scripts/migrate-staffs-to-users.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Staff = require('../src/models/Staff');
const User = require('../src/models/User');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || 10);

function normalizeRole(role = '') {
  const text = String(role || '').trim().toLowerCase();
  if (['sale', 'sales', 'nvbh', 'banhang', 'ban_hang', 'salesstaff', 'sales_staff'].includes(text)) return 'sales';
  if (['delivery', 'shipper', 'nvgh', 'giaohang', 'giao_hang', 'deliverystaff', 'delivery_staff'].includes(text)) return 'delivery';
  if (['accountant', 'ketoan', 'ke_toan'].includes(text)) return 'accountant';
  if (['warehouse', 'kho'].includes(text)) return 'warehouse';
  if (['manager', 'quanly', 'quan_ly'].includes(text)) return 'manager';
  if (['admin', 'administrator'].includes(text)) return 'admin';
  return ['admin', 'manager', 'sales', 'warehouse', 'accountant', 'delivery'].includes(text) ? text : 'sales';
}

function isBcryptHash(value) {
  return /^\$2[aby]\$\d{2}\$/.test(String(value || ''));
}

async function main() {
  if (!MONGO_URI) throw new Error('Thiếu MONGO_URI');
  await mongoose.connect(MONGO_URI);

  const staffs = await Staff.find({}).lean();
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const s of staffs) {
    const staffCode = String(s.code || s.staffCode || '').trim();
    const username = String(s.username || staffCode || '').trim();
    if (!username) { skipped += 1; continue; }

    const role = normalizeRole(s.role || (s.isDelivery ? 'delivery' : s.isSalesman ? 'sales' : 'sales'));
    const password = isBcryptHash(s.password)
      ? s.password
      : bcrypt.hashSync(String(s.password || '123456'), BCRYPT_ROUNDS);

    const payload = {
      username,
      password,
      fullName: String(s.fullName || s.name || username).trim(),
      name: String(s.name || s.fullName || username).trim(),
      phone: String(s.phone || '').trim(),
      role,
      staffCode,
      code: staffCode,
      isActive: s.isActive !== false,
      migratedFrom: 'staffs',
      migratedAt: new Date()
    };

    const existing = await User.findOne({ $or: [{ username }, ...(staffCode ? [{ staffCode }, { code: staffCode }] : [])] }).lean();
    if (existing) {
      await User.updateOne({ _id: existing._id }, { $set: payload });
      updated += 1;
    } else {
      await User.create(payload);
      created += 1;
    }
  }

  console.log(JSON.stringify({ ok: true, source: 'staffs->users', total: staffs.length, created, updated, skipped }, null, 2));
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});
