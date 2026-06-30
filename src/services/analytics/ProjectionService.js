'use strict';

const SalesOrder = require('../../models/SalesOrder');
const Inventory = require('../../models/InventoryLegacy');
const arLedgerReadService = require('../arLedgerRead.service');
const ReportingSnapshot = require('../../models/ReportingSnapshot');
const dateUtil = require('../../utils/date.util');
const { tenantIdOf } = require('../../utils/tenant.util');

function tenantMatch(tenantId) {
  if (String(process.env.TENANT_MODE || 'single').toLowerCase() !== 'multi') return {};
  return { tenantId };
}

function orderDateMatch(date) {
  return {
    $or: [
      { orderDate: date },
      { date },
      { documentDate: date },
      { deliveryDate: date }
    ]
  };
}

function amountExpression() {
  return {
    $ifNull: [
      '$actualConfirmedAmount',
      {
        $ifNull: [
          '$actualSalesAmount',
          { $ifNull: ['$totalAfterPromotion', { $ifNull: ['$totalAmount', { $ifNull: ['$amount', 0] }] }] }
        ]
      }
    ]
  };
}

function snapshotOperation(tenantId, projectionType, date, dimensionKey, dimensions, metrics, now) {
  const filter = { tenantId, projectionType, date, dimensionKey };
  return {
    updateOne: {
      filter,
      update: {
        $set: {
          id: `${projectionType}:${tenantId}:${date}:${dimensionKey}`,
          ...filter,
          dimensions,
          metrics,
          sourceWatermark: now,
          generatedAt: now,
          version: 1
        }
      },
      upsert: true
    }
  };
}

async function buildDailySales(tenantId, date) {
  const rows = await SalesOrder.aggregate([
    {
      $match: {
        ...tenantMatch(tenantId),
        ...orderDateMatch(date),
        $and: [
          { $or: [{ deleted: { $ne: true } }, { deleted: { $exists: false } }] },
          { $or: [{ isDeleted: { $ne: true } }, { isDeleted: { $exists: false } }] },
          { status: { $nin: ['cancelled', 'canceled', 'deleted'] } }
        ]
      }
    },
    {
      $group: {
        _id: {
          salesStaffCode: { $ifNull: ['$salesStaffCode', 'UNASSIGNED'] },
          salesStaffName: { $ifNull: ['$salesStaffName', 'Chưa gán'] }
        },
        orderCount: { $sum: 1 },
        revenue: { $sum: amountExpression() },
        customerCodes: { $addToSet: '$customerCode' }
      }
    }
  ]);
  return rows.map((row) => ({
    dimensionKey: String(row._id.salesStaffCode || 'UNASSIGNED'),
    dimensions: row._id,
    metrics: {
      orderCount: row.orderCount,
      revenue: row.revenue,
      activeCustomerCount: (row.customerCodes || []).filter(Boolean).length
    }
  }));
}

async function buildInventory(tenantId, date) {
  const rows = await Inventory.aggregate([
    { $match: tenantMatch(tenantId) },
    {
      $group: {
        _id: { warehouseCode: { $ifNull: ['$warehouseCode', 'MAIN'] } },
        skuCount: { $sum: 1 },
        onHandQty: { $sum: { $ifNull: ['$onHand', { $ifNull: ['$qty', { $ifNull: ['$quantity', 0] }] }] } },
        reservedQty: { $sum: { $ifNull: ['$reservedQty', 0] } },
        availableQty: { $sum: { $ifNull: ['$availableQty', 0] } },
        stockValue: {
          $sum: {
            $multiply: [
              { $ifNull: ['$onHand', { $ifNull: ['$qty', { $ifNull: ['$quantity', 0] }] }] },
              { $ifNull: ['$costPrice', 0] }
            ]
          }
        }
      }
    }
  ]);
  return rows.map((row) => ({
    dimensionKey: String(row._id.warehouseCode || 'MAIN'),
    dimensions: row._id,
    metrics: {
      skuCount: row.skuCount,
      onHandQty: row.onHandQty,
      reservedQty: row.reservedQty,
      availableQty: row.availableQty,
      stockValue: row.stockValue
    },
    date
  }));
}

async function buildCustomerDebt(tenantId, date) {
  const rows = await arLedgerReadService.aggregateDebtByCustomer({
    status: 'open',
    dateTo: date,
    tenantId
  });
  return rows.map((row) => ({
    dimensionKey: String(row.customerCode || 'UNKNOWN'),
    dimensions: { customerCode: row.customerCode, customerName: row.customerName || '' },
    metrics: { debit: row.debit, credit: row.credit, outstandingAmount: row.remainingDebt }
  }));
}

async function rebuildDaily(dateInput, context = {}) {
  const tenantId = tenantIdOf({ tenantId: context.tenantId });
  const date = dateUtil.toDateOnly(dateInput, dateUtil.todayVN());
  const now = dateUtil.nowIso();

  const [sales, inventory, debt] = await Promise.all([
    buildDailySales(tenantId, date),
    buildInventory(tenantId, date),
    buildCustomerDebt(tenantId, date)
  ]);

  const operations = [
    ...sales.map((row) => snapshotOperation(tenantId, 'daily_sales_staff', date, row.dimensionKey, row.dimensions, row.metrics, now)),
    ...inventory.map((row) => snapshotOperation(tenantId, 'daily_inventory', date, row.dimensionKey, row.dimensions, row.metrics, now)),
    ...debt.map((row) => snapshotOperation(tenantId, 'customer_debt', date, row.dimensionKey, row.dimensions, row.metrics, now))
  ];

  if (operations.length) await ReportingSnapshot.bulkWrite(operations, { ordered: false });
  return {
    tenantId,
    date,
    generatedAt: now,
    counts: { sales: sales.length, inventory: inventory.length, debt: debt.length, total: operations.length }
  };
}

async function querySnapshots(query = {}, context = {}) {
  const tenantId = tenantIdOf({ tenantId: context.tenantId });
  const filter = { tenantId };
  if (query.projectionType) filter.projectionType = String(query.projectionType).trim();
  if (query.date) filter.date = dateUtil.toDateOnly(query.date);
  if (query.dimensionKey) filter.dimensionKey = String(query.dimensionKey).trim();
  return ReportingSnapshot.find(filter)
    .sort({ date: -1, projectionType: 1, dimensionKey: 1 })
    .limit(Math.min(Math.max(Number(query.limit || 500), 1), 5000))
    .lean();
}

module.exports = {
  rebuildDaily,
  querySnapshots,
  buildDailySales,
  buildInventory,
  buildCustomerDebt
};
