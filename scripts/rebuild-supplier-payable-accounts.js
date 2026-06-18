'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const SupplierPayableLedger = require('../src/models/SupplierPayableLedger');
const SupplierPayableAccount = require('../src/models/SupplierPayableAccount');
const dateUtil = require('../src/utils/date.util');
const { makeId } = require('../src/utils/common.util');
const { DEFAULT_TENANT_ID, normalizeTenantId } = require('../src/utils/tenant.util');

const WRITE = process.argv.includes('--write');
const tenantId = normalizeTenantId(process.env.MIGRATION_TENANT_ID || DEFAULT_TENANT_ID);

async function main() {
  await connectDB();
  const rows = await SupplierPayableLedger.aggregate([
    { $match: { tenantId, status: 'posted' } },
    {
      $group: {
        _id: '$supplierCode',
        supplierId: { $last: '$supplierId' },
        supplierName: { $last: '$supplierName' },
        creditTotal: { $sum: { $cond: [{ $eq: ['$direction', 'credit'] }, '$amount', 0] } },
        debitTotal: { $sum: { $cond: [{ $eq: ['$direction', 'debit'] }, '$amount', 0] } }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  const preview = rows.map((row) => ({
    supplierCode: row._id,
    supplierName: row.supplierName || '',
    creditTotal: Number(row.creditTotal || 0),
    debitTotal: Number(row.debitTotal || 0),
    balanceAmount: Number(row.creditTotal || 0) - Number(row.debitTotal || 0)
  }));

  let written = 0;
  if (WRITE) {
    const now = dateUtil.nowIso();
    for (const row of rows) {
      await SupplierPayableAccount.updateOne({ tenantId, supplierCode: row._id }, {
        $set: {
          supplierId: row.supplierId || '',
          supplierName: row.supplierName || '',
          creditTotal: Number(row.creditTotal || 0),
          debitTotal: Number(row.debitTotal || 0),
          balanceAmount: Number(row.creditTotal || 0) - Number(row.debitTotal || 0),
          updatedAt: now
        },
        $setOnInsert: { id: makeId('SPA'), tenantId, supplierCode: row._id }
      }, { upsert: true });
      written += 1;
    }
  }

  console.log(JSON.stringify({ write: WRITE, tenantId, suppliers: rows.length, written, preview }, null, 2));
  if (!WRITE) console.log('DRY_RUN_ONLY: chạy lại với --write sau khi backup và đối chiếu tổng công nợ nhà cung cấp.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  if (mongoose.connection.readyState) await mongoose.disconnect();
});
