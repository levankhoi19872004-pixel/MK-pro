'use strict';

/**
 * Phase250A read-only audit.
 * This script only executes aggregate/read operations against inventories.
 * It never calls insert/update/delete/bulkWrite/createIndexes.
 */
let mongoose;
let Inventory;

function loadDatabaseDependencies() {
  if (!mongoose) mongoose = require('mongoose');
  if (!Inventory) Inventory = require('../src/models/InventoryLegacy');
}

function argValue(name, fallback = '') {
  const prefix = `--${name}=`;
  const item = process.argv.find((value) => value.startsWith(prefix));
  return item ? item.slice(prefix.length) : fallback;
}

function numericExpression(fields = []) {
  let input = 0;
  for (let index = fields.length - 1; index >= 0; index -= 1) {
    input = { $ifNull: [`$${fields[index]}`, input] };
  }
  return {
    $convert: {
      input,
      to: 'double',
      onError: 0,
      onNull: 0
    }
  };
}

function warehouseTextExpression() {
  return {
    $trim: {
      input: {
        $convert: { input: { $ifNull: ['$warehouseCode', ''] }, to: 'string', onError: '', onNull: '' }
      }
    }
  };
}

function warehouseExpression() {
  return {
    $let: {
      vars: { code: warehouseTextExpression() },
      in: { $cond: [{ $eq: ['$$code', ''] }, '<MISSING>', { $toUpper: '$$code' }] }
    }
  };
}

function productExpression() {
  return {
    $let: {
      vars: {
        code: {
          $trim: {
            input: {
              $convert: {
                input: { $ifNull: ['$productCode', { $ifNull: ['$code', { $ifNull: ['$sku', '$productId'] }] }] },
                to: 'string',
                onError: '',
                onNull: ''
              }
            }
          }
        }
      },
      in: { $toUpper: '$$code' }
    }
  };
}

async function aggregateReadOnly(pipeline, options = {}) {
  loadDatabaseDependencies();
  return Inventory.aggregate(pipeline)
    .option({ allowDiskUse: true, maxTimeMS: options.maxTimeMS || 120000 })
    .read('secondaryPreferred')
    .exec();
}

async function runAudit({ limit = 200 } = {}) {
  const onHand = numericExpression(['onHand', 'quantity', 'qty', 'stockQuantity', 'availableQty']);
  const available = numericExpression(['availableQty', 'onHand', 'quantity', 'qty', 'stockQuantity']);

  const [warehouseDistribution, duplicateCountRows, duplicateProducts, missingWarehouseRows] = await Promise.all([
    aggregateReadOnly([
      {
        $project: {
          warehouseCode: warehouseExpression(),
          onHandQty: onHand,
          availableQty: available
        }
      },
      {
        $group: {
          _id: '$warehouseCode',
          documentCount: { $sum: 1 },
          totalOnHandQty: { $sum: '$onHandQty' },
          totalAvailableQty: { $sum: '$availableQty' }
        }
      },
      { $sort: { _id: 1 } }
    ]),
    aggregateReadOnly([
      {
        $project: {
          productCode: productExpression(),
          warehouseCode: warehouseExpression()
        }
      },
      { $match: { productCode: { $nin: ['', null] } } },
      {
        $group: {
          _id: '$productCode',
          warehouses: { $addToSet: '$warehouseCode' }
        }
      },
      { $project: { warehouseCount: { $size: '$warehouses' } } },
      { $match: { warehouseCount: { $gt: 1 } } },
      { $count: 'count' }
    ]),
    aggregateReadOnly([
      {
        $project: {
          productCode: productExpression(),
          warehouseCode: warehouseExpression(),
          onHandQty: onHand,
          availableQty: available
        }
      },
      { $match: { productCode: { $nin: ['', null] } } },
      {
        $group: {
          _id: '$productCode',
          warehouses: { $addToSet: '$warehouseCode' },
          documentCount: { $sum: 1 },
          totalOnHandQty: { $sum: '$onHandQty' },
          totalAvailableQty: { $sum: '$availableQty' }
        }
      },
      { $project: { productCode: '$_id', _id: 0, warehouses: 1, warehouseCount: { $size: '$warehouses' }, documentCount: 1, totalOnHandQty: 1, totalAvailableQty: 1 } },
      { $match: { warehouseCount: { $gt: 1 } } },
      { $sort: { warehouseCount: -1, productCode: 1 } },
      { $limit: Math.max(1, Math.min(Number(limit) || 200, 1000)) }
    ]),
    aggregateReadOnly([
      { $match: { $expr: { $eq: [warehouseTextExpression(), ''] } } },
      {
        $project: {
          _id: 0,
          id: { $convert: { input: '$_id', to: 'string', onError: '', onNull: '' } },
          productCode: productExpression(),
          warehouseCode: { $ifNull: ['$warehouseCode', null] },
          onHandQty: onHand,
          availableQty: available
        }
      },
      { $sort: { productCode: 1 } },
      { $limit: Math.max(1, Math.min(Number(limit) || 200, 1000)) }
    ])
  ]);

  return {
    audit: 'Phase250A inventory warehouse distribution',
    collection: Inventory.collection.name,
    readOnly: true,
    readPreference: 'secondaryPreferred',
    generatedAt: new Date().toISOString(),
    warehouseDistribution: warehouseDistribution.map((row) => ({
      warehouseCode: row._id,
      documentCount: row.documentCount,
      totalOnHandQty: row.totalOnHandQty,
      totalAvailableQty: row.totalAvailableQty
    })),
    productsAcrossMultipleWarehouses: {
      totalCount: Number(duplicateCountRows[0]?.count || 0),
      returnedCount: duplicateProducts.length,
      limit,
      rows: duplicateProducts
    },
    missingWarehouseCode: {
      returnedCount: missingWarehouseRows.length,
      limit,
      rows: missingWarehouseRows
    }
  };
}

async function main() {
  const uri = process.env.PHASE250A_MONGODB_URI || process.env.MONGODB_URI || process.env.MONGO_URI || '';
  if (!uri) {
    console.log('INVENTORY_WAREHOUSE_AUDIT_SKIPPED_NO_URI');
    console.log('No database connection was attempted.');
    console.log('Set PHASE250A_MONGODB_URI to a read-only MongoDB URI, then run:');
    console.log('npm run audit:inventory-warehouse-distribution');
    return;
  }

  const limit = Number(argValue('limit', '200')) || 200;
  loadDatabaseDependencies();
  try {
    await mongoose.connect(uri, {
      autoIndex: false,
      maxPoolSize: 2,
      serverSelectionTimeoutMS: 10000,
      readPreference: 'secondaryPreferred',
      appName: 'mkpro-phase250a-read-only-audit'
    });
    const result = await runAudit({ limit });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`INVENTORY_WAREHOUSE_AUDIT_FAILED: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  runAudit,
  numericExpression,
  warehouseTextExpression,
  warehouseExpression,
  productExpression
};
