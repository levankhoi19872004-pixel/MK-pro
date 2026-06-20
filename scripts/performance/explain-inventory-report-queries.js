#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const Product = require('../../src/models/Product');
const StockTransaction = require('../../src/models/StockTransaction');
const { businessDateStages } = require('../../src/services/reports/ReportDomainUtils');

const outputPath = path.resolve(process.argv[2] || 'API_QUERY_EXPLAIN_LIVE.json');
const uri = process.env.MONGO_URI || '';
const dateFrom = process.env.PERF_DATE_FROM || '2026-06-01';
const dateTo = process.env.PERF_DATE_TO || '2026-06-20';
const productQuery = String(process.env.PERF_PRODUCT_CODE || '').trim();

const movementProjection = {
  _id: 1, date: 1, productId: 1, productCode: 1, productName: 1, name: 1,
  code: 1, sku: 1, unit: 1, type: 1, transactionType: 1, sourceType: 1,
  refType: 1, direction: 1, quantity: 1, qty: 1, inQty: 1, outQty: 1,
  reversedFrom: 1, _reportBusinessDate: 1
};
const stockCardProjection = {
  ...movementProjection,
  id: 1, createdAt: 1, refCode: 1, sourceCode: 1, note: 1
};

function baselinePipeline() {
  return [
    ...businessDateStages('0000-01-01', dateTo, ['date'], '_reportBusinessDate'),
    { $sort: { _reportBusinessDate: 1, createdAt: 1, _id: 1 } }
  ];
}

function movementPipeline() {
  return [
    ...businessDateStages('0000-01-01', dateTo, ['date'], '_reportBusinessDate'),
    { $project: movementProjection }
  ];
}

async function stockCardPipeline() {
  const product = productQuery
    ? await Product.findOne({
        $or: [
          { code: productQuery },
          { productCode: productQuery },
          { sku: productQuery },
          { id: productQuery }
        ]
      }).select('id code productCode sku').lean()
    : null;
  const aliases = product
    ? [...new Set([product.id, product._id, product.code, product.productCode, product.sku]
        .flatMap((value) => {
          const raw = String(value || '').trim();
          return raw ? [raw, raw.toUpperCase(), raw.toLowerCase()] : [];
        }))]
    : [];
  return [
    ...(aliases.length ? [{
      $match: {
        $or: [
          { productCode: { $in: aliases } },
          { productId: { $in: aliases } },
          { code: { $in: aliases } },
          { sku: { $in: aliases } }
        ]
      }
    }] : []),
    ...businessDateStages('0000-01-01', dateTo, ['date'], '_reportBusinessDate'),
    { $project: stockCardProjection },
    { $sort: { _reportBusinessDate: 1, createdAt: 1, _id: 1 } }
  ];
}

async function explain(name, pipeline) {
  const result = await StockTransaction.aggregate(pipeline).explain('executionStats');
  return { name, pipeline, result };
}

(async () => {
  if (!uri) {
    throw new Error('MONGO_URI is required. No production-like database was accessed.');
  }
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  const cardPipeline = await stockCardPipeline();
  const output = {
    generatedAt: new Date().toISOString(),
    database: mongoose.connection.name,
    inputs: { dateFrom, dateTo, productQuery },
    plans: [
      await explain('before_inventory_movement_and_stock_card', baselinePipeline()),
      await explain('after_inventory_movement', movementPipeline()),
      await explain('after_stock_card_exact_product', cardPipeline)
    ]
  };
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`Wrote ${outputPath}`);
})().finally(async () => {
  await mongoose.disconnect().catch(() => {});
}).catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
