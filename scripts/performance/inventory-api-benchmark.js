#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');

const projectRoot = path.resolve(process.argv[2] || process.cwd());
const scale = Math.max(1, Number(process.argv[3] || 1));
const outputPath = process.argv[4] ? path.resolve(process.argv[4]) : '';
const req = (relativePath) => require(path.join(projectRoot, relativePath));

process.env.NODE_ENV = 'test';
process.env.INVENTORY_SUMMARY_CACHE_TTL_MS = '0';

const metrics = { endpoint: '', operations: [] };
const text = (value) => String(value ?? '').trim();
const jsonBytes = (value) => Buffer.byteLength(JSON.stringify(value));

function percentile(values, percent) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((percent / 100) * sorted.length) - 1));
  return sorted[index];
}

function getByPath(value, dottedPath) {
  return dottedPath.split('.').reduce((current, key) => current == null ? undefined : current[key], value);
}

function projectDocument(document, projection) {
  if (!projection) return structuredClone(document);
  const fields = typeof projection === 'string'
    ? projection.split(/\s+/).filter(Boolean)
    : Object.entries(projection).filter(([, enabled]) => enabled === 1 || enabled === true).map(([field]) => field);
  const output = {};
  for (const field of fields) {
    const value = getByPath(document, field);
    if (value !== undefined) output[field] = structuredClone(value);
  }
  if ((typeof projection === 'string' || projection._id !== 0) && document._id !== undefined) {
    output._id = structuredClone(document._id);
  }
  return output;
}

function record(operation) {
  metrics.operations.push({ endpoint: metrics.endpoint, ...operation });
}

function makeFind(collection, rows, filter = {}) {
  let projection = null;
  let sort = null;
  const chain = {
    select(value) { projection = value; return chain; },
    sort(value) { sort = value; return chain; },
    session() { return chain; },
    async lean() {
      let result = rows;
      if (filter.$or) {
        const allowed = new Set(filter.$or.flatMap((clause) => Object.values(clause)[0]?.$in || []).map(text));
        result = rows.filter((row) => Object.keys(row).some((key) => allowed.has(text(row[key]))));
      }
      result = result.map((row) => projectDocument(row, projection));
      if (sort) {
        const entries = Object.entries(sort);
        result.sort((left, right) => {
          for (const [field, direction] of entries) {
            if (left[field] < right[field]) return -direction;
            if (left[field] > right[field]) return direction;
          }
          return 0;
        });
      }
      result = JSON.parse(JSON.stringify(result));
      record({
        collection,
        operation: 'find',
        documentsExamined: rows.length,
        documentsReturned: result.length,
        responseBytes: jsonBytes(result),
        filter,
        projection
      });
      return result;
    }
  };
  chain.then = (resolve, reject) => chain.lean().then(resolve, reject);
  return chain;
}

function dateRangeFromPipeline(pipeline = []) {
  for (const stage of pipeline) {
    const range = stage.$match?._reportBusinessDate;
    if (range) return { from: range.$gte || '', to: range.$lte || '9999-12-31' };
  }
  return { from: '', to: '9999-12-31' };
}

function identityValuesFromPipeline(pipeline = []) {
  const values = new Set();
  for (const stage of pipeline) {
    if (!stage.$match?.$or) continue;
    for (const clause of stage.$match.$or) {
      const condition = Object.values(clause)[0];
      for (const value of condition?.$in || []) values.add(text(value));
    }
  }
  return values;
}

function stockAggregate(rows, pipeline = []) {
  const { from, to } = dateRangeFromPipeline(pipeline);
  const identities = identityValuesFromPipeline(pipeline);
  const projection = pipeline.find((stage) => stage.$project)?.$project || null;
  const hasSort = pipeline.some((stage) => stage.$sort);
  let result = rows.filter((row) => {
    const date = text(row.date).slice(0, 10);
    const identityMatches = !identities.size || [row.productCode, row.productId, row.code, row.sku]
      .some((value) => identities.has(text(value)));
    return identityMatches && (!from || date >= from) && (!to || date <= to);
  }).map((row) => ({ ...row, _reportBusinessDate: text(row.date).slice(0, 10) }));
  if (hasSort) {
    result.sort((left, right) => text(left._reportBusinessDate).localeCompare(text(right._reportBusinessDate))
      || text(left.createdAt).localeCompare(text(right.createdAt))
      || text(left._id).localeCompare(text(right._id)));
  }
  if (projection) result = result.map((row) => projectDocument(row, projection));
  result = JSON.parse(JSON.stringify(result));
  record({
    collection: 'stockTransactions',
    operation: 'aggregate',
    documentsExamined: identities.size ? result.length : rows.length,
    documentsReturned: result.length,
    responseBytes: jsonBytes(result),
    pipeline
  });
  return result;
}

function generateDataset(multiplier) {
  const productCount = 500 * Math.min(multiplier, 4);
  const transactionCount = 10_000 * multiplier;
  const products = [];
  const inventories = [];
  const stockTransactions = [];

  for (let index = 0; index < productCount; index += 1) {
    const code = `P${String(index).padStart(5, '0')}`;
    products.push({
      _id: `prod-${index}`, id: `prod-${index}`, code, productCode: code,
      name: `Sản phẩm ${index}`, baseUnit: 'chai', conversionRate: 24,
      packing: '24 chai', minStock: 10, maxStock: 1000,
      description: 'x'.repeat(120), metadata: { tags: Array(10).fill('tag') }
    });
    inventories.push({
      _id: `inv-${index}`, id: `inv-${index}`, productId: `prod-${index}`,
      productCode: code, productName: `Sản phẩm ${index}`, warehouseCode: 'MAIN',
      onHand: 100 + (index % 50), availableQty: 100 + (index % 50), reservedQty: index % 3,
      updatedAt: '2026-06-20T00:00:00.000Z',
      auditTrail: Array(5).fill({ note: 'n'.repeat(80) })
    });
  }

  for (let index = 0; index < transactionCount; index += 1) {
    const productIndex = index % productCount;
    const ordinal = 1 + (index % 60);
    const month = ordinal <= 30 ? '05' : '06';
    const day = ordinal <= 30 ? ordinal : ordinal - 30;
    const quantity = index % 3 === 0 ? 10 : -2;
    stockTransactions.push({
      _id: `st-${index}`, id: `ST${index}`,
      date: `2026-${month}-${String(day).padStart(2, '0')}`,
      createdAt: `2026-${month}-${String(day).padStart(2, '0')}T${String(index % 24).padStart(2, '0')}:00:00.000Z`,
      productId: `prod-${productIndex}`,
      productCode: `P${String(productIndex).padStart(5, '0')}`,
      productName: `Sản phẩm ${productIndex}`,
      quantity, direction: quantity > 0 ? 'in' : 'out', type: quantity > 0 ? 'IMPORT' : 'SALE',
      sourceType: 'ORDER', refType: 'ORDER', refCode: `O${index}`, note: 'benchmark',
      payload: { raw: 'z'.repeat(400), history: Array(6).fill({ value: 'x'.repeat(40) }) }
    });
  }

  return { products, inventories, stockTransactions, metadata: { productCount, transactionCount } };
}

const dataset = generateDataset(scale);
const Product = req('src/models/Product.js');
const Inventory = req('src/models/InventoryLegacy.js');
const StockTransaction = req('src/models/StockTransaction.js');

Product.find = (filter = {}) => makeFind('products', dataset.products, filter);
Inventory.find = (filter = {}) => makeFind('inventories', dataset.inventories, filter);
StockTransaction.aggregate = (pipeline = []) => ({
  allowDiskUse() { return this; },
  async exec() { return stockAggregate(dataset.stockTransactions, pipeline); }
});

const inventoryReportService = req('src/services/reports/InventoryReportService.js');

function summarizeOperations() {
  return metrics.operations.reduce((summary, operation) => {
    summary.queryCount += 1;
    summary.documentsExamined += operation.documentsExamined || 0;
    summary.documentsReturned += operation.documentsReturned || 0;
    summary.databaseResponseBytes += operation.responseBytes || 0;
    return summary;
  }, { queryCount: 0, documentsExamined: 0, documentsReturned: 0, databaseResponseBytes: 0 });
}

async function measure(endpoint, operation, iterations, warmups) {
  for (let index = 0; index < warmups; index += 1) {
    metrics.endpoint = endpoint;
    metrics.operations = [];
    await operation();
  }

  const latency = [];
  const cpu = [];
  const heap = [];
  const queryCount = [];
  const examined = [];
  const returned = [];
  const databaseBytes = [];
  const responseBytes = [];
  const startedAt = performance.now();

  for (let index = 0; index < iterations; index += 1) {
    if (global.gc) global.gc();
    metrics.endpoint = endpoint;
    metrics.operations = [];
    const heapBefore = process.memoryUsage().heapUsed;
    const cpuBefore = process.cpuUsage();
    const requestStartedAt = performance.now();
    const response = await operation();
    latency.push(performance.now() - requestStartedAt);
    const cpuUsed = process.cpuUsage(cpuBefore);
    cpu.push((cpuUsed.user + cpuUsed.system) / 1000);
    heap.push(Math.max(0, process.memoryUsage().heapUsed - heapBefore));
    const operationSummary = summarizeOperations();
    queryCount.push(operationSummary.queryCount);
    examined.push(operationSummary.documentsExamined);
    returned.push(operationSummary.documentsReturned);
    databaseBytes.push(operationSummary.databaseResponseBytes);
    responseBytes.push(jsonBytes(response));
  }

  const elapsed = performance.now() - startedAt;
  return {
    endpoint,
    iterations,
    p50Ms: percentile(latency, 50),
    p95Ms: percentile(latency, 95),
    p99Ms: percentile(latency, 99),
    throughputRps: iterations / (elapsed / 1000),
    queryCount: percentile(queryCount, 50),
    documentsExamined: percentile(examined, 50),
    documentsReturned: percentile(returned, 50),
    databaseResponseBytes: percentile(databaseBytes, 50),
    responseBytes: percentile(responseBytes, 50),
    heapDeltaBytesP95: percentile(heap, 95),
    cpuMsP95: percentile(cpu, 95),
    samplesMs: latency
  };
}

(async () => {
  const iterations = scale >= 10 ? 1 : scale >= 5 ? 3 : 8;
  const warmups = scale >= 10 ? 0 : scale >= 5 ? 1 : 2;
  const results = [
    await measure(
      'GET /api/reports/inventory-movement',
      () => inventoryReportService.inventoryMovementReport({
        dateFrom: '2026-06-01', dateTo: '2026-06-20', page: 1, limit: 50
      }),
      iterations,
      warmups
    ),
    await measure(
      'GET /api/reports/stock-card',
      () => inventoryReportService.stockCardReport({
        dateFrom: '2026-06-01', dateTo: '2026-06-20', q: 'P00001', page: 1, limit: 50
      }),
      iterations,
      warmups
    )
  ];

  const output = {
    projectRoot,
    scale,
    dataset: dataset.metadata,
    engine: 'controlled-model-adapter',
    limitations: [
      'This benchmark measures application logic and deterministic model serialization, not a live MongoDB server.',
      'Run scripts/performance/explain-inventory-report-queries.js with MONGO_URI for executionStats.'
    ],
    results
  };
  const serialized = JSON.stringify(output, null, 2);
  if (outputPath) fs.writeFileSync(outputPath, serialized);
  process.stdout.write(`${serialized}\n`);
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
